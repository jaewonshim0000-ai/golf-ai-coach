-- Apply after 0005_delete_account.sql. Safe to re-run.
begin;

/*
  A third origin for a number: read off a pose skeleton the detector found in
  the video, rather than typed in by a person or guessed at by a model looking
  at stills.

  It sits between the two on confidence. It is a real measurement of the
  skeleton the detector returned, which is why it outranks an eyeball estimate;
  but one camera infers the axis pointing away from it, so it is not the
  measurement a capture rig would make, which is why it stays under a person.
*/
alter table public.swing_measurements
  drop constraint if exists swing_measurements_source_check;
alter table public.swing_measurements
  add constraint swing_measurements_source_check check (source in ('manual', 'vision', 'pose'));

alter table public.swing_measurements
  drop constraint if exists swing_measurements_vision_confidence;
alter table public.swing_measurements
  add constraint swing_measurements_estimate_confidence check (
    case source
      when 'vision' then confidence <= 0.6
      when 'pose' then confidence <= 0.8
      else true
    end
  );

commit;
