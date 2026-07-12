-- Vast en Zeker: intermittent fasting PWA. Alle tabellen met if_-prefix.
-- Toegepast op Supabase-project eten-avontuur (wmdopfocqufsquzvemka) op 2026-07-12.

create or replace function public.if_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiel + intake
create table public.if_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  experience text check (experience in ('none','some','experienced')),
  goal text check (goal in ('weight','energy','health','habit','other')),
  family text check (family in ('young_kids','older_kids','partner','single','other')),
  work_rhythm text check (work_rhythm in ('office','home','shifts','irregular','other')),
  medical_flags text[] not null default '{}',
  medical_ack boolean not null default false,
  disclaimer_accepted_at timestamptz,
  onboarded_at timestamptz,
  protocol text not null default '16:8',
  window_start time not null default '12:00',
  window_end time not null default '20:00',
  buildup_weeks int not null default 0 check (buildup_weeks between 0 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger if_profiles_updated_at
  before update on public.if_profiles
  for each row execute function public.if_set_updated_at();

-- Weekschema: per weekdag (0 = maandag .. 6 = zondag)
create table public.if_schedule (
  user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  fasting boolean not null default true,
  window_start time,
  window_end time,
  sport_type text check (sport_type in ('strength','endurance','intense','easy')),
  primary key (user_id, weekday)
);

-- Dag-log: één rij per gebruiker per dag
create table public.if_fasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  status text not null default 'planned' check (status in ('planned','active','completed','broken','skipped')),
  window_start time,
  window_end time,
  started_at timestamptz,
  ended_at timestamptz,
  energy smallint check (energy between 1 and 3),
  hunger smallint check (hunger between 1 and 3),
  focus smallint check (focus between 1 and 3),
  heavy_presses int not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create index if_fasts_user_day on public.if_fasts (user_id, day desc);

create trigger if_fasts_updated_at
  before update on public.if_fasts
  for each row execute function public.if_set_updated_at();

-- Gewichtsmetingen
create table public.if_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2) not null check (weight_kg between 30 and 300),
  created_at timestamptz not null default now(),
  unique (user_id, measured_on)
);

create index if_measurements_user_date on public.if_measurements (user_id, measured_on desc);

-- Tips (gedeelde content, alleen-lezen voor gebruikers)
create table public.if_tips (
  id integer generated always as identity primary key,
  slug text not null unique,
  category text not null check (category in ('fysiologie','gezin','praktisch','mindset','sport','valkuilen','perspectief')),
  title text not null,
  body text not null,
  phases text[] not null default '{any}',
  sport_day boolean,
  heavy boolean not null default false,
  action text,
  evidence text,
  created_at timestamptz not null default now()
);

-- Rotatiestatus: wat heeft deze gebruiker al gezien, per context (tip / heavy)
create table public.if_tip_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  tip_id integer not null references public.if_tips(id) on delete cascade,
  context text not null default 'tip' check (context in ('tip','heavy')),
  times_shown int not null default 1,
  last_shown_at timestamptz not null default now(),
  primary key (user_id, tip_id, context)
);

create index if_tip_reads_tip on public.if_tip_reads (tip_id);

-- Favorieten (hartjes)
create table public.if_tip_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  tip_id integer not null references public.if_tips(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tip_id)
);

create index if_tip_favorites_tip on public.if_tip_favorites (tip_id);

-- Row Level Security
alter table public.if_profiles enable row level security;
alter table public.if_schedule enable row level security;
alter table public.if_fasts enable row level security;
alter table public.if_measurements enable row level security;
alter table public.if_tips enable row level security;
alter table public.if_tip_reads enable row level security;
alter table public.if_tip_favorites enable row level security;

create policy "if_profiles_own" on public.if_profiles
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_schedule_own" on public.if_schedule
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_fasts_own" on public.if_fasts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_measurements_own" on public.if_measurements
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_tips_read" on public.if_tips
  for select to authenticated
  using (true);

create policy "if_tip_reads_own" on public.if_tip_reads
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_tip_favorites_own" on public.if_tip_favorites
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
