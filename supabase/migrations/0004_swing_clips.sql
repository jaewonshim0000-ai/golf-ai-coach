-- Apply after 0003_swing_vision.sql. Safe to re-run.
begin;

-- Trim, in seconds from the start of the file. It lived in the recording
-- device's IndexedDB, which meant a clip trimmed on a phone played untrimmed
-- on a laptop. It belongs to the swing, not to the browser that recorded it.
alter table public.swing_sessions add column if not exists clip_start numeric(7, 2);
alter table public.swing_sessions add column if not exists clip_end numeric(7, 2);

alter table public.swing_sessions drop constraint if exists swing_sessions_clip_range;
alter table public.swing_sessions add constraint swing_sessions_clip_range check (
  (clip_start is null and clip_end is null)
  or (clip_start >= 0 and clip_end > clip_start and clip_end - clip_start >= 0.2)
);

commit;
