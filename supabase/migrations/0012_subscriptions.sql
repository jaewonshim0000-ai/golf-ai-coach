-- Apply after 0011_practice_tests.sql. Safe to re-run.
begin;

/*
  Premium plans and monthly allowances.

  Stripe decides who pays. The webhook copies each player's current
  subscription into public.subscriptions with the service-role key; a player
  can read their own row and never write it.

  Allowances are enforced here rather than in the app, because a signed-in
  player can insert rows through the REST API directly. Each new round and
  swing recording is counted in a ledger only this trigger writes, so deleting
  a recording never gives an analysis back. Writes with no signed-in player
  (service role, SQL editor, seed files) are not metered.

  The numbers must match lib/billing/plans.ts; lib/db/migrations.test.ts runs
  both against each other.
*/
create table if not exists public.subscriptions (
  user_id uuid primary key references public.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('round', 'swing')),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_kind_time on public.usage_events (user_id, kind, created_at);

alter table public.subscriptions enable row level security;
alter table public.usage_events enable row level security;
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select using (auth.uid() = user_id);
drop policy if exists usage_events_read on public.usage_events;
create policy usage_events_read on public.usage_events for select using (auth.uid() = user_id);

create or replace function public.meter_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  what text := tg_argv[0];
  premium boolean;
  quota integer;
  used integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- One count at a time per player, so two quick saves cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtext('usage:' || new.user_id::text));
  premium := exists (
    select 1 from subscriptions where user_id = new.user_id and status in ('active', 'trialing')
  );
  quota := case what
    when 'swing' then case when premium then 100 else 3 end
    when 'round' then case when premium then null else 4 end
  end;
  if quota is not null then
    select count(*) into used from usage_events
      where user_id = new.user_id and kind = what
        and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
    if used >= quota then
      raise exception using errcode = 'GC402', message = case
        when what = 'round' then format('You have used your %s free rounds this month. Upgrade to Premium for unlimited rounds.', quota)
        when premium then format('You have used all %s swing analyses this month. More arrive on the 1st.', quota)
        else format('You have used your %s free swing analyses this month. Upgrade to Premium for 100 a month.', quota)
      end;
    end if;
  end if;
  insert into usage_events (user_id, kind) values (new.user_id, what);
  return new;
end;
$$;

drop trigger if exists rounds_meter on public.rounds;
create trigger rounds_meter before insert on public.rounds
  for each row execute function public.meter_usage('round');
drop trigger if exists swing_sessions_meter on public.swing_sessions;
create trigger swing_sessions_meter before insert on public.swing_sessions
  for each row execute function public.meter_usage('swing');

commit;
