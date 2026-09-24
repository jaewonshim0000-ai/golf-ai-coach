-- Apply after 0008_swing_model.sql. Safe to re-run.
begin;

/*
  Practice sessions become plans: several blocks (warm-up, technical, skill,
  pressure), each its own drill. The unique (session, drill) index stays, so a
  plan still cannot log the same drill twice.
*/
create or replace function public.create_practice(session_row jsonb, item_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare saved public.practice_sessions;
begin
  if auth.uid() is null or session_row->>'user_id' <> auth.uid()::text then
    raise exception 'Not authorized';
  end if;
  if jsonb_typeof(item_rows) <> 'array' or jsonb_array_length(item_rows) not between 1 and 8 then
    raise exception 'A practice has one to eight blocks';
  end if;
  insert into public.practice_sessions
    select * from jsonb_populate_record(null::public.practice_sessions, session_row)
    returning * into saved;
  if exists (select 1 from jsonb_array_elements(item_rows) item where item->>'session_id' <> saved.id) then
    raise exception 'Invalid practice block';
  end if;
  insert into public.practice_items select * from jsonb_populate_recordset(null::public.practice_items, item_rows);
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_practice(jsonb, jsonb) from public;
grant execute on function public.create_practice(jsonb, jsonb) to authenticated;

-- The band a block is scored against, in its goal's unit. It moves with the
-- player, so it is kept with the block to keep old results comparable.
alter table public.practice_items add column if not exists tolerance numeric(6, 2);
alter table public.practice_items drop constraint if exists practice_items_tolerance_check;
alter table public.practice_items add constraint practice_items_tolerance_check
  check (tolerance is null or tolerance > 0);

-- Where each ball finished, tapped on the target: [left/right, short/long].
alter table public.drill_attempts add column if not exists shot_points jsonb;
alter table public.drill_attempts drop constraint if exists drill_attempts_points_array;
alter table public.drill_attempts add constraint drill_attempts_points_array
  check (shot_points is null or (jsonb_typeof(shot_points) = 'array' and jsonb_array_length(shot_points) <= 40));
alter table public.drill_attempts drop constraint if exists drill_attempts_offsets_array;
alter table public.drill_attempts add constraint drill_attempts_offsets_array
  check (shot_offsets is null or (jsonb_typeof(shot_offsets) = 'array' and jsonb_array_length(shot_offsets) <= 40));

-- A live scorecard: one entry per hole, null until the hole is played.
alter table public.rounds add column if not exists hole_stats jsonb;
alter table public.rounds drop constraint if exists rounds_hole_stats_array;
alter table public.rounds add constraint rounds_hole_stats_array check (
  hole_stats is null or (
    jsonb_typeof(hole_stats) = 'array'
    and jsonb_array_length(hole_stats) in (9, 18)
  )
);

commit;
