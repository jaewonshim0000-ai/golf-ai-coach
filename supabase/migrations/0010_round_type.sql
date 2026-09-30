-- Apply after 0009_plans_plots_scorecards.sql. Safe to re-run.
begin;

-- What kind of round it was: practice, casual, league or tournament.
alter table public.rounds add column if not exists round_type text;
alter table public.rounds drop constraint if exists rounds_round_type_check;
alter table public.rounds add constraint rounds_round_type_check
  check (round_type is null or round_type in ('practice', 'casual', 'league', 'tournament'));

commit;
