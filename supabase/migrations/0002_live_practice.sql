-- Apply after 0001_init.sql, then run supabase/seed/seed.sql.
begin;

alter table public.drill_attempts add column if not exists shot_offsets jsonb;
alter table public.drill_attempts add constraint drill_attempts_offsets_array
  check (shot_offsets is null or (jsonb_typeof(shot_offsets) = 'array' and jsonb_array_length(shot_offsets) <= 10));

-- Older versions could insert duplicates. Keep the most recent result.
delete from public.drill_attempts a using public.drill_attempts b
where a.session_id = b.session_id and a.drill_id = b.drill_id
and (a.completed_at, a.id) < (b.completed_at, b.id);
create unique index if not exists drill_attempts_session_drill_unique on public.drill_attempts(session_id, drill_id);
delete from public.swing_measurements a using public.swing_measurements b
where a.swing_session_id = b.swing_session_id and a.metric = b.metric and a.id < b.id;
create unique index if not exists swing_measurements_session_metric_unique on public.swing_measurements(swing_session_id, metric);

-- Session and its block must either both save or neither save. Uses the caller's RLS.
create or replace function public.create_practice(session_row jsonb, item_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved public.practice_sessions;
begin
  if auth.uid() is null or session_row->>'user_id' <> auth.uid()::text then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(item_rows) <> 'array' or jsonb_array_length(item_rows) <> 1 then
    raise exception 'Choose one practice goal';
  end if;
  insert into public.practice_sessions
    select * from jsonb_populate_record(null::public.practice_sessions, session_row)
    returning * into saved;
  if item_rows->0->>'session_id' <> saved.id then raise exception 'Invalid practice block'; end if;
  insert into public.practice_items select * from jsonb_populate_recordset(null::public.practice_items, item_rows);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_practice(jsonb, jsonb) from public;
grant execute on function public.create_practice(jsonb, jsonb) to authenticated;

-- Ownership includes the parent, not just a client-supplied user_id.
drop policy if exists shots_owner on public.shots;
create policy shots_owner on public.shots for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.rounds r where r.id = round_id and r.user_id = auth.uid()));

drop policy if exists drill_attempts_owner on public.drill_attempts;
create policy drill_attempts_owner on public.drill_attempts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.practice_sessions s join public.practice_items i on i.session_id = s.id
    where s.id = drill_attempts.session_id and s.user_id = auth.uid()
      and s.status <> 'complete' and i.id = practice_item_id and i.drill_id = drill_attempts.drill_id
  ));

drop policy if exists swing_findings_owner on public.swing_findings;
create policy swing_findings_owner on public.swing_findings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.swing_sessions s where s.id = swing_session_id and s.user_id = auth.uid()));

update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm']
where id = 'swing-videos';

commit;
