-- Ask Coach: a daily number of model answers per player (UTC day).
-- Free 5, Premium 50; lib/billing/plans.ts holds the same numbers and
-- migrations.test.ts checks they agree. Past the cap the app answers from
-- the player's data without the model, so nothing is refused.
begin;

alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('round', 'swing', 'ask'));

-- Takes one of today's model answers for the caller; false once they are used.
-- Only the server calls the model, so a player calling this directly just
-- spends their own allowance.
create or replace function public.claim_ai_answer()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  premium boolean;
  quota integer;
  used integer;
begin
  if me is null then
    return false;
  end if;
  -- The same per-player lock as meter_usage, so two quick questions cannot both take the last answer.
  perform pg_advisory_xact_lock(hashtext('usage:' || me::text));
  premium := exists (
    select 1 from subscriptions where user_id = me and status in ('active', 'trialing')
  );
  quota := case when premium then 50 else 5 end;
  select count(*) into used from usage_events
    where user_id = me and kind = 'ask'
      and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if used >= quota then
    return false;
  end if;
  insert into usage_events (user_id, kind) values (me, 'ask');
  return true;
end;
$$;

revoke all on function public.claim_ai_answer() from public;
grant execute on function public.claim_ai_answer() to authenticated;

commit;
