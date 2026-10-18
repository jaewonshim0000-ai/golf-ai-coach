-- A round played in a storm or as a scramble stays on the card but can be left
-- out of every analysis. Existing rounds stay counted.
alter table public.rounds
  add column if not exists excluded_from_analysis boolean not null default false;
