-- Ordered makes/misses for the spiral challenge may exceed ten attempts.
-- Existing miss estimates and carry samples use the same numeric array.
begin;
alter table public.drill_attempts drop constraint if exists drill_attempts_offsets_array;
alter table public.drill_attempts add constraint drill_attempts_offsets_array
  check (shot_offsets is null or (jsonb_typeof(shot_offsets) = 'array' and jsonb_array_length(shot_offsets) <= 500));
commit;
