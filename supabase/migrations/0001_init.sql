-- Golf AI Coach - initial schema.
--
-- Entity ids are text because the application mints readable ids
-- (round_x, practice_y). user_id is uuid so it can be compared to auth.uid()
-- directly in every row-level security policy.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mirror new auth users into the application table.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------- player profile

create table if not exists public.player_profiles (
  id text primary key,
  user_id uuid not null unique references public.users (id) on delete cascade,
  display_name text not null,
  handicap_index numeric(4, 1),
  experience_level text not null default 'intermediate',
  dominant_hand text not null default 'right',
  typical_score integer,
  average_driver_distance integer,
  swing_pattern text not null default 'unknown',
  common_miss text,
  primary_goal text not null default 'lower_handicap',
  secondary_goals text[] not null default '{}',
  practice_days_per_week integer not null default 3,
  typical_practice_duration integer not null default 45,
  facilities text[] not null default '{}',
  bag text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_profiles_handicap_range
    check (handicap_index is null or handicap_index between -10 and 54),
  constraint player_profiles_days_range check (practice_days_per_week between 0 and 7),
  constraint player_profiles_duration_range check (typical_practice_duration between 10 and 240)
);

create table if not exists public.handicap_entries (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  recorded_on date not null,
  handicap_index numeric(4, 1) not null
);

create index if not exists handicap_entries_user_date_idx
  on public.handicap_entries (user_id, recorded_on);

-- ---------------------------------------------------------------- golf

create table if not exists public.courses (
  id text primary key,
  -- null means a shared course visible to everyone.
  user_id uuid references public.users (id) on delete cascade,
  name text not null,
  city text,
  par integer not null default 72,
  holes jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index if not exists courses_user_idx on public.courses (user_id);

create table if not exists public.rounds (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  course_id text not null references public.courses (id) on delete restrict,
  course_name text not null,
  played_on date not null,
  tees text,
  holes_played integer not null default 0,
  score integer,
  conditions text[] not null default '{}',
  notes text,
  status text not null default 'in_progress',
  created_at timestamptz not null default now(),
  constraint rounds_status_check check (status in ('in_progress', 'complete'))
);

create index if not exists rounds_user_played_idx on public.rounds (user_id, played_on desc);

create table if not exists public.shots (
  id text primary key,
  round_id text not null references public.rounds (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  hole_number integer not null,
  hole_par integer not null,
  shot_number integer not null,
  starting_location text not null,
  starting_distance numeric(6, 1) not null,
  starting_unit text not null default 'yards',
  lie text not null,
  club text,
  shot_type text not null,
  intended_target text,
  ending_location text not null,
  ending_distance numeric(6, 1) not null default 0,
  ending_unit text not null default 'yards',
  penalty_strokes integer not null default 0,
  penalty_type text not null default 'none',
  miss_direction text,
  notes text,
  created_at timestamptz not null default now(),
  constraint shots_hole_range check (hole_number between 1 and 18),
  constraint shots_shot_range check (shot_number between 1 and 20),
  constraint shots_penalty_range check (penalty_strokes between 0 and 3),
  constraint shots_unit_check
    check (starting_unit in ('yards', 'feet') and ending_unit in ('yards', 'feet')),
  unique (round_id, hole_number, shot_number)
);

-- The analytics engine scans a whole shot history for one user, then groups.
create index if not exists shots_user_idx on public.shots (user_id);
create index if not exists shots_round_idx on public.shots (round_id, hole_number, shot_number);
create index if not exists shots_user_club_idx on public.shots (user_id, club);
create index if not exists shots_user_lie_idx on public.shots (user_id, starting_location);

-- ------------------------------------------------------------- practice

create table if not exists public.drills (
  id text primary key,
  name text not null,
  category text not null,
  sub_category text,
  description text not null default '',
  instructions text[] not null default '{}',
  skill_trained text not null,
  difficulty text not null default 'intermediate',
  recommended_duration integer not null default 15,
  recommended_reps integer not null default 20,
  equipment_required text[] not null default '{}',
  clubs text[] not null default '{}',
  metric_to_track text not null,
  metric_unit text not null default '%',
  scoring_method text not null default 'ratio',
  success_threshold numeric(4, 3) not null default 0.7,
  progression_level text,
  regression_level text
);

create index if not exists drills_category_idx on public.drills (category);
create index if not exists drills_skill_idx on public.drills (skill_trained);

create table if not exists public.practice_sessions (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  plan_session_id text,
  title text not null,
  location text,
  focus text not null default '',
  planned_duration integer not null default 45,
  actual_duration integer,
  energy_level integer,
  status text not null default 'planned',
  scheduled_for date not null,
  completed_at timestamptz,
  reflection text,
  created_at timestamptz not null default now(),
  constraint practice_sessions_status_check
    check (status in ('planned', 'in_progress', 'complete'))
);

create index if not exists practice_sessions_user_idx
  on public.practice_sessions (user_id, scheduled_for desc);

create table if not exists public.practice_items (
  id text primary key,
  session_id text not null references public.practice_sessions (id) on delete cascade,
  drill_id text not null references public.drills (id) on delete restrict,
  block text not null default 'skill',
  order_index integer not null default 0,
  duration integer not null default 15,
  target_reps integer not null default 20,
  target_value numeric(4, 3) not null default 0.7,
  objective text not null default ''
);

create index if not exists practice_items_session_idx
  on public.practice_items (session_id, order_index);

create table if not exists public.drill_attempts (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  session_id text not null references public.practice_sessions (id) on delete cascade,
  practice_item_id text references public.practice_items (id) on delete set null,
  drill_id text not null references public.drills (id) on delete restrict,
  attempts integer not null,
  successes integer not null,
  score numeric(4, 3) not null,
  raw_value numeric(10, 3),
  notes text,
  completed_at timestamptz not null default now(),
  constraint drill_attempts_successes_check check (successes >= 0 and successes <= attempts),
  constraint drill_attempts_attempts_check check (attempts > 0)
);

create index if not exists drill_attempts_user_drill_idx
  on public.drill_attempts (user_id, drill_id, completed_at);
create index if not exists drill_attempts_session_idx on public.drill_attempts (session_id);

-- ----------------------------------------------------------------- plans

create table if not exists public.training_plans (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  primary_goal text not null default '',
  rationale text not null default '',
  weeks integer not null default 2,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active',
  targets jsonb not null default '[]',
  generated_by text not null default 'rules',
  source_snapshot text,
  created_at timestamptz not null default now(),
  constraint training_plans_status_check check (status in ('active', 'complete', 'archived'))
);

create index if not exists training_plans_user_idx
  on public.training_plans (user_id, status, created_at desc);

create table if not exists public.plan_sessions (
  id text primary key,
  plan_id text not null references public.training_plans (id) on delete cascade,
  week integer not null,
  day integer not null,
  title text not null,
  objective text not null default '',
  block_emphasis text not null default 'skill',
  duration integer not null default 45,
  drill_ids text[] not null default '{}',
  is_rest boolean not null default false,
  session_id text references public.practice_sessions (id) on delete set null,
  status text not null default 'scheduled',
  constraint plan_sessions_day_check check (day between 1 and 7),
  constraint plan_sessions_status_check check (status in ('scheduled', 'complete', 'skipped'))
);

create index if not exists plan_sessions_plan_idx on public.plan_sessions (plan_id, week, day);

create table if not exists public.plan_adaptations (
  id text primary key,
  plan_id text not null references public.training_plans (id) on delete cascade,
  created_at timestamptz not null default now(),
  trigger text not null default '',
  verdict text not null,
  summary text not null default '',
  changes text[] not null default '{}',
  constraint plan_adaptations_verdict_check
    check (verdict in ('on_track', 'ahead', 'stalled', 'regressing'))
);

create index if not exists plan_adaptations_plan_idx
  on public.plan_adaptations (plan_id, created_at desc);

-- ----------------------------------------------------------------- swing

create table if not exists public.reference_swings (
  id text primary key,
  name text not null,
  year integer,
  pattern text not null,
  summary text not null default '',
  useful_similarities text[] not null default '{}',
  potential_differences text[] not null default '{}',
  features jsonb not null default '{}'
);

create table if not exists public.swing_sessions (
  id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  video_url text,
  camera_angle text not null default 'down_the_line',
  club text not null,
  shot_type text not null default 'full swing',
  swing_pattern text not null default 'unknown',
  notes text,
  analysis_status text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint swing_sessions_status_check
    check (analysis_status in ('manual', 'queued', 'processed', 'failed'))
);

create index if not exists swing_sessions_user_idx
  on public.swing_sessions (user_id, created_at desc);

create table if not exists public.swing_findings (
  id text primary key,
  swing_session_id text not null references public.swing_sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  category text not null,
  issue text not null,
  severity text not null default 'medium',
  confidence numeric(4, 3) not null default 0.5,
  certainty text not null default 'possible',
  description text not null default '',
  why_it_matters text not null default '',
  recommended_drill_id text references public.drills (id) on delete set null,
  related_skill text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint swing_findings_confidence_range check (confidence between 0 and 1),
  constraint swing_findings_certainty_check
    check (certainty in ('observed', 'likely', 'possible', 'uncertain')),
  constraint swing_findings_source_check check (source in ('manual', 'ai', 'vision'))
);

create index if not exists swing_findings_user_idx
  on public.swing_findings (user_id, created_at desc);
create index if not exists swing_findings_session_idx
  on public.swing_findings (swing_session_id);

-- Structured measurements a future vision pipeline will write. Nothing
-- populates this in V1; it exists so the pipeline can be added without
-- touching the coaching layer.
create table if not exists public.swing_measurements (
  id text primary key,
  swing_session_id text not null references public.swing_sessions (id) on delete cascade,
  phase text not null,
  metric text not null,
  value numeric(10, 3) not null,
  unit text not null default '',
  confidence numeric(4, 3) not null default 1
);

create index if not exists swing_measurements_session_idx
  on public.swing_measurements (swing_session_id);

-- --------------------------------------------------- row level security

alter table public.users enable row level security;
alter table public.player_profiles enable row level security;
alter table public.handicap_entries enable row level security;
alter table public.courses enable row level security;
alter table public.rounds enable row level security;
alter table public.shots enable row level security;
alter table public.drills enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.practice_items enable row level security;
alter table public.drill_attempts enable row level security;
alter table public.training_plans enable row level security;
alter table public.plan_sessions enable row level security;
alter table public.plan_adaptations enable row level security;
alter table public.reference_swings enable row level security;
alter table public.swing_sessions enable row level security;
alter table public.swing_findings enable row level security;
alter table public.swing_measurements enable row level security;

drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Every user-owned table gets the same policy: a user sees and changes only
-- their own rows. Written once as a loop so a new table cannot be added with
-- a subtly different policy.
do $$
declare
  t text;
begin
  foreach t in array array[
    'player_profiles', 'handicap_entries', 'rounds', 'shots',
    'practice_sessions', 'drill_attempts', 'training_plans',
    'swing_sessions', 'swing_findings'
  ]
  loop
    execute format('drop policy if exists %I_owner on public.%I', t, t);
    execute format(
      'create policy %I_owner on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end;
$$;

-- Shared courses are readable by everyone; only your own rows are writable.
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses
  for select using (user_id is null or auth.uid() = user_id);

drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Reference data: readable by any signed-in user, never writable from the app.
drop policy if exists drills_read on public.drills;
create policy drills_read on public.drills for select using (auth.role() = 'authenticated');

drop policy if exists reference_swings_read on public.reference_swings;
create policy reference_swings_read on public.reference_swings
  for select using (auth.role() = 'authenticated');

-- Child rows inherit ownership from their parent.
drop policy if exists practice_items_owner on public.practice_items;
create policy practice_items_owner on public.practice_items
  for all
  using (exists (
    select 1 from public.practice_sessions s
    where s.id = practice_items.session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.practice_sessions s
    where s.id = practice_items.session_id and s.user_id = auth.uid()
  ));

drop policy if exists plan_sessions_owner on public.plan_sessions;
create policy plan_sessions_owner on public.plan_sessions
  for all
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_sessions.plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.training_plans p
    where p.id = plan_sessions.plan_id and p.user_id = auth.uid()
  ));

drop policy if exists plan_adaptations_owner on public.plan_adaptations;
create policy plan_adaptations_owner on public.plan_adaptations
  for all
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_adaptations.plan_id and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.training_plans p
    where p.id = plan_adaptations.plan_id and p.user_id = auth.uid()
  ));

drop policy if exists swing_measurements_owner on public.swing_measurements;
create policy swing_measurements_owner on public.swing_measurements
  for all
  using (exists (
    select 1 from public.swing_sessions s
    where s.id = swing_measurements.swing_session_id and s.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.swing_sessions s
    where s.id = swing_measurements.swing_session_id and s.user_id = auth.uid()
  ));

-- --------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('swing-videos', 'swing-videos', false)
on conflict (id) do nothing;

drop policy if exists swing_videos_owner on storage.objects;
create policy swing_videos_owner on storage.objects
  for all
  using (bucket_id = 'swing-videos' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'swing-videos' and auth.uid()::text = (storage.foldername(name))[1]);
