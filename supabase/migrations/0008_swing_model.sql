-- Apply after 0007_scorecards.sql. Safe to re-run.
begin;

/*
  The 3D model of a swing: the skeleton the pose detector found in every
  sampled frame. It lives on the swing row, so it goes when the swing does and
  row-level security already covers it. The size check keeps a row from being
  used as file storage; a real model is about 40 KB.
*/
alter table public.swing_sessions add column if not exists pose_model jsonb;

alter table public.swing_sessions drop constraint if exists swing_sessions_pose_model_shape;
alter table public.swing_sessions add constraint swing_sessions_pose_model_shape check (
  pose_model is null or (
    jsonb_typeof(pose_model) = 'object'
    and jsonb_typeof(pose_model -> 'frames') = 'array'
    and pg_column_size(pose_model) < 262144
  )
);

commit;
