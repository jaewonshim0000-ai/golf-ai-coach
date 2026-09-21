-- Apply after 0002_live_practice.sql. Safe to re-run.
begin;

-- Where a measurement came from. A value a model estimated from video frames
-- and a value a coach measured are both useful and must never be confused, so
-- the origin is stored beside the number rather than inferred from confidence.
alter table public.swing_measurements
  add column if not exists source text not null default 'manual';
alter table public.swing_measurements
  drop constraint if exists swing_measurements_source_check;
alter table public.swing_measurements
  add constraint swing_measurements_source_check check (source in ('manual', 'vision'));

-- A model estimating a body angle from a phone video is never certain. The
-- ceiling is enforced in the database as well as in the code that writes it,
-- so no future caller can quietly promote an estimate to a measurement.
alter table public.swing_measurements
  drop constraint if exists swing_measurements_vision_confidence;
alter table public.swing_measurements
  add constraint swing_measurements_vision_confidence
  check (source <> 'vision' or confidence <= 0.6);

commit;
