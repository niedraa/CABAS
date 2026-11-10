-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 02 · Catalogue (ingrédients, recettes, magasins, produits, prix)
--
-- Données publiques : lecture anon + authenticated, écriture service_role
-- uniquement (voir 20260901000500_rls_policies.sql). Les identifiants sont des
-- chaînes lisibles (`rec_curry_pois_chiches`, `prd_oignon_jaune`, `leclerc`)
-- identiques à ceux de src/data, ce qui permet au mode démo hors-ligne et au
-- mode connecté de partager les mêmes ids.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Fonction utilitaire : horodatage updated_at ────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Trigger BEFORE UPDATE : met updated_at à now().';

-- ─── Ingrédients ────────────────────────────────────────────────────────────

create table public.ingredients (
  id                text primary key check (id ~ '^[a-z0-9_]+$'),
  name              text not null check (length(name) between 1 and 120),
  name_plural       text,
  aisle             public.aisle not null,
  allergens         public.allergen[] not null default '{}',
  is_meat           boolean not null default false,
  is_pork           boolean not null default false,
  is_fish           boolean not null default false,
  is_seafood        boolean not null default false,
  is_animal_product boolean not null default false,
  is_alcohol        boolean not null default false,
  grams_per_piece   numeric(10, 3) check (grams_per_piece is null or grams_per_piece > 0),
  density           numeric(10, 4) check (density is null or density > 0),
  base_unit         public.base_unit not null,
  is_pantry_staple  boolean not null default false,
  season_months     smallint[] not null default '{}'
                    check (season_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.ingredients is
  'Référentiel des ingrédients : SOURCE DE VÉRITÉ des allergènes et drapeaux de régime utilisés par le filtrage de sécurité (core/constraints.ts).';
comment on column public.ingredients.allergens is
  'Allergènes réglementaires (INCO). Étiquetage PRUDENT : en cas de doute, l''allergène est déclaré.';

create trigger ingredients_set_updated_at before update on public.ingredients
  for each row execute function public.set_updated_at();

-- ─── Recettes ───────────────────────────────────────────────────────────────

create table public.recipes (
  id               text primary key check (id ~ '^[a-z0-9_]+$'),
  title            text not null check (length(title) between 1 and 160),
  description      text not null default '',
  emoji            text not null default '🍽️',
  color            text not null default '#F6F1E7' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  image_url        text,
  cuisine          public.cuisine not null,
  tags             text[] not null default '{}',
  meal_types       public.meal_type[] not null check (cardinality(meal_types) > 0),
  servings         smallint not null check (servings between 1 and 50),
  prep_time_min    smallint not null default 0 check (prep_time_min >= 0),
  cook_time_min    smallint not null default 0 check (cook_time_min >= 0),
  difficulty       smallint not null default 1 check (difficulty between 1 and 3),
  equipment        public.equipment[] not null default '{}',
  -- Étapes : [{ "text": "…", "timerMin": 10 }, …] (core/types.ts › RecipeStep).
  steps            jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  kcal_per_serving integer check (kcal_per_serving is null or kcal_per_serving > 0),
  cost_level       smallint not null default 2 check (cost_level between 1 and 3),
  -- Une recette retirée est dépubliée (jamais supprimée : des plannings la référencent).
  is_published     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.recipes is
  'Base de recettes. Les régimes ne sont PAS déclarés ici : ils sont toujours déduits des ingrédients.';

create trigger recipes_set_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  recipe_id     text not null references public.recipes (id) on delete cascade,
  position      smallint not null check (position >= 0),
  ingredient_id text not null references public.ingredients (id) on delete restrict,
  quantity      numeric(12, 3) not null check (quantity > 0),
  unit          public.unit not null,
  optional      boolean not null default false,
  note          text,
  primary key (recipe_id, position)
);

comment on table public.recipe_ingredients is
  'Lignes d''ingrédients d''une recette, dans l''ordre d''affichage. Les ingrédients OPTIONNELS comptent aussi pour les allergènes.';

create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

-- ─── Magasins ───────────────────────────────────────────────────────────────

create table public.stores (
  id                       text primary key check (id ~ '^[a-z0-9_]+$'),
  chain                    public.store_chain not null,
  name                     text not null,
  city                     text not null default '',
  drive_fee_cents          integer not null default 0 check (drive_fee_cents >= 0),
  -- null : la livraison n'est pas proposée.
  delivery_fee_cents       integer check (delivery_fee_cents is null or delivery_fee_cents >= 0),
  min_order_cents          integer not null default 0 check (min_order_cents >= 0),
  search_url_template      text not null default '',
  drive_url                text not null default '',
  -- Identifiants OpenStreetMap des points de vente rattachés (collecte Open Prices).
  osm_location_ids         bigint[] not null default '{}',
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index stores_chain_idx on public.stores (chain);

create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();

-- ─── Produits ───────────────────────────────────────────────────────────────

create table public.products (
  id                   text primary key check (id ~ '^[a-z0-9_]+$'),
  ean                  text not null unique check (ean ~ '^[0-9]{8,14}$'),
  name                 text not null,
  brand                text not null default '',
  is_store_brand       boolean not null default false,
  -- Enseigne propriétaire d'une MDD (le produit n'existe que chez elle).
  store_chain          public.store_chain,
  ingredient_id        text not null references public.ingredients (id) on delete restrict,
  pack_size            numeric(12, 3) not null check (pack_size > 0),
  pack_unit            public.base_unit not null,
  nutri_score          public.nutri_score,
  allergens            public.allergen[] not null default '{}',
  organic              boolean not null default false,
  -- Dernière tentative de collecte de prix (collect-prices traite les plus anciens d'abord).
  last_price_check_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint products_store_brand_chain check (is_store_brand = (store_chain is not null))
);

create index products_ingredient_idx on public.products (ingredient_id);
create index products_price_check_idx on public.products (last_price_check_at asc nulls first);

create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- ─── Prix courants (un prix par produit × magasin) ──────────────────────────

create table public.prices (
  product_id        text not null references public.products (id) on delete cascade,
  store_id          text not null references public.stores (id) on delete cascade,
  price_cents       integer not null check (price_cents > 0),
  promo_price_cents integer check (promo_price_cents is null or promo_price_cents > 0),
  promo_label       text,
  promo_until       date,
  source            public.price_source not null,
  -- Date du relevé (et non de l'écriture en base).
  updated_at        timestamptz not null default now(),
  primary key (product_id, store_id)
);

comment on table public.prices is 'Prix courant par produit × magasin (centimes). Historisé dans price_history par trigger.';

create index prices_store_idx on public.prices (store_id);

-- ─── Historique des prix (append-only) ──────────────────────────────────────

create table public.price_history (
  id                bigint generated always as identity primary key,
  product_id        text not null references public.products (id) on delete cascade,
  store_id          text not null references public.stores (id) on delete cascade,
  price_cents       integer not null check (price_cents > 0),
  promo_price_cents integer,
  source            public.price_source not null,
  observed_at       timestamptz not null,
  recorded_at       timestamptz not null default now()
);

comment on table public.price_history is
  'Historique append-only des prix (alimenté par trigger sur prices). Aucune mise à jour ni suppression autorisée.';

create index price_history_product_store_idx on public.price_history (product_id, store_id, observed_at desc);

-- Historisation : à l'insertion et à chaque changement effectif de prix.
create or replace function public.record_price_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.price_cents is distinct from old.price_cents
     or new.promo_price_cents is distinct from old.promo_price_cents
     or new.source is distinct from old.source then
    insert into public.price_history (product_id, store_id, price_cents, promo_price_cents, source, observed_at)
    values (new.product_id, new.store_id, new.price_cents, new.promo_price_cents, new.source, new.updated_at);
  end if;
  return new;
end;
$$;

create trigger prices_record_history after insert or update on public.prices
  for each row execute function public.record_price_history();

-- Append-only : toute modification de l'historique est refusée (même service_role ;
-- la purge se fait via public.run_maintenance(), qui lève ce garde-fou localement).
create or replace function public.forbid_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('cabas.allow_history_prune', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception 'price_history est append-only (% interdit)', tg_op using errcode = '42501';
end;
$$;

create trigger price_history_append_only before update or delete on public.price_history
  for each row execute function public.forbid_history_mutation();
