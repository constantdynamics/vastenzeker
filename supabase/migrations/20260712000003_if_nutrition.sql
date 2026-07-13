-- Voedingsmodule: ingrediënten, maaltijden, voorkeuren, dagplannen en log.
-- Contenttabellen (if_ingredients, if_meals) zijn gedeeld: iedereen leest,
-- alleen de maker mag eigen toevoegingen wijzigen. Seed-rijen hebben created_by null.

-- Eindtijd van de training: nodig om maaltijdslots rond de sessie te leggen.
alter table public.if_schedule add column if not exists sport_end_time time;
-- Waarom een dag bewust is overgeslagen (bv. 'bad_night') — stuurt het eetplan.
alter table public.if_fasts add column if not exists skip_reason text;

-- Voedingsprofiel: doelen en banden per gebruiker (§1 van de spec)
create table public.if_nutrition_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weight_kg numeric(5,2) not null default 95,
  goal text not null default 'recomp',
  protein_target_g int not null default 190,
  protein_floor_g int not null default 170,
  kcal_min int not null default 2200,
  kcal_max int not null default 2400,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger if_nutrition_profiles_updated_at
  before update on public.if_nutrition_profiles
  for each row execute function public.if_set_updated_at();

-- Ingrediënten: macro's per 100 g; noten en pindakaas apart gemarkeerd
-- omdat daar dagbudgetten op zitten (§2 regels 3 en 4).
create table public.if_ingredients (
  id integer generated always as identity primary key,
  slug text not null unique,
  name text not null,
  kcal_100g numeric(7,2) not null,
  protein_100g numeric(6,2) not null,
  carb_100g numeric(6,2) not null,
  fat_100g numeric(6,2) not null,
  fiber_100g numeric(6,2) not null default 0,
  category text not null check (category in ('dairy','nut','grain','protein','fruit','veg','fat','drink','other')),
  is_nut boolean not null default false,
  nut_type text,
  piece_grams numeric(6,2),
  is_peanut_butter boolean not null default false,
  rationale text,
  source text not null default 'seed' check (source in ('seed','openfoodfacts','custom')),
  external_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Maaltijden: macro's worden ALTIJD berekend uit de compositie (§9),
-- daarom staan hier geen kcal/eiwit-kolommen.
create table public.if_meals (
  id integer generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text,
  eligible_slots text[] not null,
  temperature text not null check (temperature in ('cold','warm','either')),
  portability text not null check (portability in ('home_only','portable','on_the_go')),
  digestion_speed text not null check (digestion_speed in ('fast','medium','slow')),
  casein_dominant boolean not null default false,
  prep_minutes int not null default 5,
  family text not null,
  rationale text not null,
  rationale_short text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Compositie: koppeltabel maaltijd × ingrediënt met grammen en rol
create table public.if_meal_ingredients (
  meal_id integer not null references public.if_meals(id) on delete cascade,
  ingredient_id integer not null references public.if_ingredients(id) on delete cascade,
  grams numeric(7,2) not null,
  role text not null check (role in ('primary','supporting','optional')),
  primary key (meal_id, ingredient_id)
);

-- Maaltijdvoorkeuren per slot: dezelfde maaltijd kan als lunch super zijn
-- maar als diner tegenvallen
create table public.if_meal_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id integer not null references public.if_meals(id) on delete cascade,
  slot text not null check (slot in ('BREAK_FAST','SNACK','DINNER','CLOSE')),
  state text not null check (state in ('superlike','like','dislike')),
  updated_at timestamptz not null default now(),
  primary key (user_id, meal_id, slot)
);

create trigger if_meal_preferences_updated_at
  before update on public.if_meal_preferences
  for each row execute function public.if_set_updated_at();

-- Ingrediëntvoorkeuren: dislike verwijdert optional-ingrediënten stil
create table public.if_ingredient_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id integer not null references public.if_ingredients(id) on delete cascade,
  state text not null check (state in ('like','dislike')),
  updated_at timestamptz not null default now(),
  primary key (user_id, ingredient_id)
);

create trigger if_ingredient_preferences_updated_at
  before update on public.if_ingredient_preferences
  for each row execute function public.if_set_updated_at();

-- Maaltijdlog: wat is per dag/slot voorgesteld en wat is ermee gebeurd.
-- actual_grams: afwijkende porties als jsonb { ingredient_id: grams }.
create table public.if_meal_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('BREAK_FAST','SNACK','DINNER','CLOSE')),
  meal_id integer not null references public.if_meals(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested','eaten','skipped','swapped')),
  actual_grams jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, slot)
);

create index if_meal_log_user_day on public.if_meal_log (user_id, day desc);

create trigger if_meal_log_updated_at
  before update on public.if_meal_log
  for each row execute function public.if_set_updated_at();

-- Dagplannen: het gegenereerde plan per dag; slots als jsonb zodat het plan
-- atomair vervangen kan worden zonder koppeltabel
create table public.if_day_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  day_type text not null check (day_type in ('FASTED_STRENGTH','FED_STRENGTH','CARDIO','REST')),
  slots jsonb not null,
  generated_at timestamptz not null default now(),
  locked boolean not null default false,
  primary key (user_id, day)
);

-- Row Level Security
alter table public.if_nutrition_profiles enable row level security;
alter table public.if_ingredients enable row level security;
alter table public.if_meals enable row level security;
alter table public.if_meal_ingredients enable row level security;
alter table public.if_meal_preferences enable row level security;
alter table public.if_ingredient_preferences enable row level security;
alter table public.if_meal_log enable row level security;
alter table public.if_day_plans enable row level security;

create policy "if_nutrition_profiles_own" on public.if_nutrition_profiles
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Content: iedereen leest; schrijven alleen aan eigen toevoegingen
-- (seed-rijen hebben created_by null en blijven zo onaantastbaar voor clients)
create policy "if_ingredients_read" on public.if_ingredients
  for select to authenticated
  using (true);

create policy "if_ingredients_insert_own" on public.if_ingredients
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "if_ingredients_update_own" on public.if_ingredients
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "if_ingredients_delete_own" on public.if_ingredients
  for delete to authenticated
  using (created_by = auth.uid());

create policy "if_meals_read" on public.if_meals
  for select to authenticated
  using (true);

create policy "if_meals_insert_own" on public.if_meals
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "if_meals_update_own" on public.if_meals
  for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "if_meals_delete_own" on public.if_meals
  for delete to authenticated
  using (created_by = auth.uid());

create policy "if_meal_ingredients_read" on public.if_meal_ingredients
  for select to authenticated
  using (true);

-- Compositie mag je alleen wijzigen als de maaltijd van jou is
create policy "if_meal_ingredients_insert_own" on public.if_meal_ingredients
  for insert to authenticated
  with check (exists (
    select 1 from public.if_meals m
    where m.id = meal_id and m.created_by = auth.uid()
  ));

create policy "if_meal_ingredients_update_own" on public.if_meal_ingredients
  for update to authenticated
  using (exists (
    select 1 from public.if_meals m
    where m.id = meal_id and m.created_by = auth.uid()
  ))
  with check (exists (
    select 1 from public.if_meals m
    where m.id = meal_id and m.created_by = auth.uid()
  ));

create policy "if_meal_ingredients_delete_own" on public.if_meal_ingredients
  for delete to authenticated
  using (exists (
    select 1 from public.if_meals m
    where m.id = meal_id and m.created_by = auth.uid()
  ));

create policy "if_meal_preferences_own" on public.if_meal_preferences
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_ingredient_preferences_own" on public.if_ingredient_preferences
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_meal_log_own" on public.if_meal_log
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "if_day_plans_own" on public.if_day_plans
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
