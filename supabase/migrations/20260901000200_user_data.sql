-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 03 · Données utilisateur (profil, planning, liste, panier, commande,
-- placard, budget)
--
-- Toutes ces tables sont PRIVÉES (RLS : propriétaire uniquement).
-- Identifiants : l'app est « offline-first » et crée ses ids localement
-- (core/ids.ts → `plan_…`, `meal_…`, `order_<uuid>`). Les ids sont donc du
-- texte et la clé primaire est composite (user_id, id) : deux utilisateurs ne
-- peuvent pas entrer en collision, et les clés étrangères composites
-- garantissent qu'un enregistrement ne peut référencer que des lignes du MÊME
-- utilisateur.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Profil (1-1 avec auth.users) ───────────────────────────────────────────

create table public.profiles (
  id                         uuid primary key references auth.users (id) on delete cascade,
  display_name               text not null default '' check (length(display_name) <= 80),
  adults                     smallint not null default 2 check (adults between 1 and 12),
  children                   smallint not null default 0 check (children between 0 and 12),
  diets                      public.diet[] not null default '{}',
  allergens                  public.allergen[] not null default '{}',
  disliked_ingredient_ids    text[] not null default '{}',
  favorite_cuisines          public.cuisine[] not null default '{}',
  weekly_budget_cents        integer not null default 8000 check (weekly_budget_cents between 0 and 1000000),
  max_cook_time_weekday_min  smallint not null default 30 check (max_cook_time_weekday_min between 5 and 600),
  max_cook_time_weekend_min  smallint not null default 60 check (max_cook_time_weekend_min between 5 and 600),
  equipment                  public.equipment[] not null default '{plaques,four}',
  preferred_store_ids        text[] not null default '{}',
  -- Créneaux : [{ "weekday": 0-6, "type": "dejeuner"|"diner" }] (core › MealSlotPreference).
  meal_slots                 jsonb not null default '[]'::jsonb check (jsonb_typeof(meal_slots) = 'array'),
  -- RGPD art. 9 : consentement EXPLICITE au traitement des données de santé.
  health_data_consent_at     timestamptz,
  onboarding_completed_at    timestamptz,
  timezone                   text not null default 'Europe/Paris',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  -- Aucune donnée de santé / conviction sans consentement explicite.
  constraint profiles_health_data_requires_consent check (
    (cardinality(allergens) = 0 and cardinality(diets) = 0) or health_data_consent_at is not null
  )
);

comment on table public.profiles is 'Profil du foyer (1-1 avec auth.users). Créé par le trigger handle_new_user.';
comment on column public.profiles.allergens is
  'DONNÉE DE SANTÉ (RGPD art. 9) — allergies déclarées. Nécessite health_data_consent_at. Ne jamais transmettre à un tiers (y compris au LLM).';
comment on column public.profiles.diets is
  'DONNÉE SENSIBLE (RGPD art. 9 : santé / convictions religieuses — halal, casher). Nécessite health_data_consent_at.';
comment on column public.profiles.health_data_consent_at is
  'Horodatage du consentement explicite aux données de santé. Retrait : remettre à null ET vider allergens/diets (contrainte). Tracé dans consents.';
comment on column public.profiles.disliked_ingredient_ids is 'Ingrédients exclus (« je n''aime pas ») — préférence de confort, non sensible.';

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ─── Planning ───────────────────────────────────────────────────────────────

create table public.meal_plans (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  week_start   date not null check (extract(isodow from week_start) = 1),
  source       public.plan_source not null default 'rules',
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, week_start)
);

comment on column public.meal_plans.week_start is 'Lundi de la semaine planifiée.';

create trigger meal_plans_set_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();

create table public.planned_meals (
  user_id    uuid not null,
  id         text not null default gen_random_uuid()::text check (length(id) between 1 and 160),
  plan_id    text not null,
  date       date not null,
  meal_type  public.meal_type not null,
  recipe_id  text not null references public.recipes (id) on delete restrict,
  servings   smallint not null check (servings between 1 and 50),
  locked     boolean not null default false,
  reason     text check (reason is null or length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, plan_id, date, meal_type),
  foreign key (user_id, plan_id) references public.meal_plans (user_id, id) on delete cascade
);

create index planned_meals_plan_idx on public.planned_meals (user_id, plan_id, date);
create index planned_meals_recipe_idx on public.planned_meals (recipe_id);

-- ─── Liste de courses ───────────────────────────────────────────────────────

create table public.shopping_lists (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  meal_plan_id text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  -- Si le planning est supprimé, la liste reste (articles manuels) : seul meal_plan_id passe à null.
  foreign key (user_id, meal_plan_id) references public.meal_plans (user_id, id) on delete set null (meal_plan_id)
);

create index shopping_lists_plan_idx on public.shopping_lists (user_id, meal_plan_id);

create trigger shopping_lists_set_updated_at before update on public.shopping_lists
  for each row execute function public.set_updated_at();

create table public.shopping_list_items (
  user_id       uuid not null,
  list_id       text not null,
  -- Id d'article : déterministe pour un ingrédient (core › planItemId), unique dans la liste.
  id            text not null check (length(id) between 1 and 160),
  ingredient_id text references public.ingredients (id) on delete set null,
  label         text not null check (length(label) between 1 and 200),
  quantity      numeric(12, 3) not null default 0 check (quantity >= 0),
  unit          public.base_unit not null default 'piece',
  aisle         public.aisle not null default 'autre',
  checked       boolean not null default false,
  source        public.list_item_source not null default 'manual',
  recipe_ids    text[] not null default '{}',
  -- { "packSize": 500, "packUnit": "g", "packs": 2 } (core › PackagingSuggestion).
  packaging     jsonb check (packaging is null or jsonb_typeof(packaging) = 'object'),
  pantry_staple boolean not null default false,
  note          text check (note is null or length(note) <= 500),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, list_id, id),
  foreign key (user_id, list_id) references public.shopping_lists (user_id, id) on delete cascade
);

create index shopping_list_items_list_idx on public.shopping_list_items (user_id, list_id, aisle, position);

create trigger shopping_list_items_set_updated_at before update on public.shopping_list_items
  for each row execute function public.set_updated_at();

-- ─── Panier optimisé (instantané) ───────────────────────────────────────────

create table public.basket_plans (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  list_id       text,
  mode          public.basket_mode not null,
  total_cents   integer not null check (total_cents >= 0),
  savings_cents integer not null default 0 check (savings_cents >= 0),
  -- Instantané complet du BasketPlan (core/types.ts) au moment du calcul.
  snapshot      jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  computed_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, list_id) references public.shopping_lists (user_id, id) on delete set null (list_id)
);

create index basket_plans_user_idx on public.basket_plans (user_id, computed_at desc);

-- ─── Transmission de commande (V1 : panier pré-rempli + redirection drive) ──

create table public.order_handoffs (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  store_id    text not null references public.stores (id) on delete restrict,
  channel     public.order_channel not null default 'drive',
  url         text not null default '',
  -- Lignes du panier : [{ itemId, label, productId, packs, totalCents }] (core › BasketLine).
  lines       jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  total_cents integer not null check (total_cents >= 0),
  status      public.order_status not null default 'prepared',
  meal_plan_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index order_handoffs_user_idx on public.order_handoffs (user_id, created_at desc);

create trigger order_handoffs_set_updated_at before update on public.order_handoffs
  for each row execute function public.set_updated_at();

-- ─── Placard (V2 — anti-gaspi) ──────────────────────────────────────────────

create table public.pantry_items (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  ingredient_id text references public.ingredients (id) on delete set null,
  label         text not null check (length(label) between 1 and 200),
  quantity      numeric(12, 3) not null check (quantity >= 0),
  unit          public.base_unit not null,
  added_at      timestamptz not null default now(),
  expires_at    date,
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create index pantry_items_expiry_idx on public.pantry_items (user_id, expires_at);

create trigger pantry_items_set_updated_at before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- ─── Dépenses (V2 — suivi du budget) ────────────────────────────────────────

create table public.spending_entries (
  user_id       uuid not null references auth.users (id) on delete cascade,
  id            text not null default gen_random_uuid()::text check (length(id) between 1 and 128),
  date          date not null,
  store_id      text not null,
  total_cents   integer not null check (total_cents >= 0),
  savings_cents integer not null default 0 check (savings_cents >= 0),
  source        public.spending_source not null default 'manual',
  label         text check (label is null or length(label) <= 200),
  created_at    timestamptz not null default now(),
  primary key (user_id, id)
);

create index spending_entries_user_date_idx on public.spending_entries (user_id, date desc);

-- ─── Journal des consentements (RGPD — append-only) ─────────────────────────

create table public.consents (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       public.consent_kind not null,
  granted    boolean not null,
  -- Version du texte d'information présenté (ex. « 2026-09 »).
  version    text not null default 'v1',
  source     text not null default 'app' check (source in ('app', 'trigger', 'support')),
  created_at timestamptz not null default now()
);

comment on table public.consents is
  'Journal append-only des consentements (preuve RGPD art. 7). Une ligne par octroi / retrait.';

create index consents_user_idx on public.consents (user_id, kind, created_at desc);
