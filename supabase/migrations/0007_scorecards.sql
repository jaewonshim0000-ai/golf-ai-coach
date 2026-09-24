-- Apply after 0006_pose_source.sql. Safe to re-run.
begin;

alter table public.rounds add column if not exists hole_scores jsonb;

alter table public.rounds drop constraint if exists rounds_hole_scores_array;
alter table public.rounds add constraint rounds_hole_scores_array check (
  hole_scores is null or (
    jsonb_typeof(hole_scores) = 'array'
    and jsonb_array_length(hole_scores) in (9, 18)
  )
);

commit;
