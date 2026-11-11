-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 10 · Catalogue réel : provenance des données ouvertes
--
-- Le catalogue fictif (EAN inventés, prix « démo ») laisse place à des données
-- RÉELLES : Open Food Facts (produits), Open Prices (prix relevés en magasin),
-- OpenStreetMap (enseignes) — licence ODbL (voir DATA_LICENSE.md). Là où aucun
-- relevé n'existe, le prix est une ESTIMATION transparente (source 'estimate').
--
--  • stores   : mode de retrait `pickup` (drive / click_collect / none) ;
--               `delivery_fee_cents` null = pas de livraison (déjà nullable).
--  • products : `ean` facultatif (vrac), GTIN-8/13 quand présent ;
--               `off_category_tag` (vrac) ; exactement un des deux ; vrac :
--               catégories, unité et facteur des relevés (off_category_tags,
--               off_price_per, off_pack_factor) ;
--               `store_chains[]` remplace `store_chain` (une MDD Mousquetaires
--               est vendue chez Intermarché ET Netto sous le même code-barres) —
--               `store_chain` est conservée une version (= store_chains[1]).
--  • prices   : provenance (nombre de relevés, premier relevé, méthode et base
--               d'une estimation) et contraintes de cohérence.
--  • catalog_meta : description de l'instantané (une ligne jsonb, lecture publique).
--  • RPC get_prices_for_ingredients : nouvelles colonnes (DROP + CREATE).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Magasins : mode de retrait ─────────────────────────────────────────────

alter table public.stores
  add column pickup text not null default 'drive'
    constraint stores_pickup_check check (pickup in ('drive', 'click_collect', 'none'));

comment on column public.stores.pickup is
  'Retrait proposé par l''enseigne : drive, click_collect, ou none (courses en magasin uniquement) — core › PickupMode.';
comment on column public.stores.delivery_fee_cents is
  'Frais de livraison indicatifs (centimes) ; null = pas de livraison à domicile.';

-- ─── Produits : code-barres facultatif, vrac, enseignes des MDD ─────────────

alter table public.products alter column ean drop not null;

-- GTIN-8 ou GTIN-13 (la clé de contrôle est vérifiée par le pipeline d'import,
-- core › isValidGtin) ; jamais un code « poids variable » (13 chiffres en 2…).
alter table public.products drop constraint if exists products_ean_check;
alter table public.products
  add constraint products_ean_gtin check (
    ean is null or (ean ~ '^([0-9]{8}|[0-9]{13})$' and not (length(ean) = 13 and left(ean, 1) = '2'))
  );

-- Unicité du code-barres vérifiée en fin de transaction : un seed peut ainsi
-- déplacer un EAN d'un produit à un autre (reclassement MDD ↔ marque nationale).
alter table public.products drop constraint if exists products_ean_key;
alter table public.products add constraint products_ean_key unique (ean) deferrable initially deferred;

alter table public.products
  add column off_category_tag text
    constraint products_off_category_tag_format
    check (off_category_tag is null or off_category_tag ~ '^[a-z]{2,3}:[a-z0-9]+(-[a-z0-9]+)*$');

-- Un produit est soit emballé (code-barres), soit vendu en vrac (catégorie).
alter table public.products
  add constraint products_ean_or_category check (num_nonnulls(ean, off_category_tag) = 1);

comment on column public.products.ean is
  'Code-barres réel (GTIN-8 / GTIN-13) de la fiche Open Food Facts ; null pour le vrac (voir off_category_tag).';
comment on column public.products.off_category_tag is
  'Vrac sans code-barres : catégorie Open Food Facts des relevés Open Prices « au kilo » / « à la pièce » (ex. en:tomatoes).';

create index products_off_category_idx on public.products (off_category_tag) where off_category_tag is not null;

-- Vrac : règles de l'instantané reprises telles quelles par la collecte
-- incrémentale (collect-prices) — catégories par ordre de préférence (la 1re =
-- off_category_tag), unité des relevés de la SOURCE (un ingrédient au poids
-- peut être relevé à la pièce : concombre, chou-fleur…) et facteur « prix
-- relevé → prix du conditionnement ».
alter table public.products
  add column off_category_tags text[] not null default '{}',
  add column off_price_per text
    constraint products_off_price_per_check check (off_price_per is null or off_price_per in ('KILOGRAM', 'UNIT')),
  add column off_pack_factor numeric
    constraint products_off_pack_factor_positive check (off_pack_factor is null or off_pack_factor > 0);

alter table public.products
  add constraint products_loose_fields check (
    case when off_category_tag is null
      then cardinality(off_category_tags) = 0 and off_price_per is null and off_pack_factor is null
      else cardinality(off_category_tags) = 0 or off_category_tags[1] = off_category_tag
    end
  ),
  add constraint products_off_category_tags_no_null check (array_position(off_category_tags, null) is null);

comment on column public.products.off_category_tags is
  'Vrac : catégories Open Food Facts des relevés, par ordre de préférence (1re = off_category_tag) ; une enseigne est chiffrée par la 1re catégorie qui y a des relevés.';
comment on column public.products.off_price_per is
  'Vrac : unité des relevés Open Prices de la source (KILOGRAM / UNIT) ; null = déduite de pack_unit (g → au kilo, pièce → à la pièce).';
comment on column public.products.off_pack_factor is
  'Vrac : prix du conditionnement = prix relevé (au kilo / à la pièce) × off_pack_factor.';

-- Enseignes d'une MDD (vide pour une marque nationale).
alter table public.products add column store_chains public.store_chain[] not null default '{}';
update public.products set store_chains = array[store_chain] where store_chain is not null;

alter table public.products drop constraint products_store_brand_chain;
alter table public.products
  add constraint products_store_brand_chains check (is_store_brand = (cardinality(store_chains) > 0)),
  add constraint products_store_chains_no_null check (array_position(store_chains, null) is null);

comment on column public.products.store_chains is
  'Enseignes qui vendent cette MDD (ordre significatif : la 1re donne l''id prd_<ingrédient>_mdd_<enseigne>). Vide = marque nationale.';
comment on column public.products.store_chain is
  'OBSOLÈTE (compatibilité une version) : = store_chains[1], maintenue par trigger. Lire store_chains.';

-- Synchronise store_chains (référence) et store_chain (compatibilité) :
--  • un ancien écrivain qui ne renseigne que store_chain alimente store_chains ;
--  • sinon store_chain := store_chains[1] ; doublons retirés, ordre conservé.
create or replace function public.sync_product_store_chains()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.store_chains is not distinct from old.store_chains
     and new.store_chain is distinct from old.store_chain then
    new.store_chains := case when new.store_chain is null then '{}'::public.store_chain[] else array[new.store_chain] end;
  elsif tg_op = 'INSERT' and cardinality(coalesce(new.store_chains, '{}')) = 0 and new.store_chain is not null then
    new.store_chains := array[new.store_chain];
  end if;
  new.store_chains := coalesce(
    array(
      select c from unnest(coalesce(new.store_chains, '{}')) with ordinality as t(c, i)
       group by c order by min(i)
    ),
    '{}'
  );
  new.store_chain := new.store_chains[1];
  return new;
end;
$$;

comment on function public.sync_product_store_chains() is
  'Trigger BEFORE INSERT/UPDATE de products : store_chain (obsolète) = store_chains[1].';

create trigger products_sync_store_chains before insert or update on public.products
  for each row execute function public.sync_product_store_chains();

revoke execute on function public.sync_product_store_chains() from public, anon, authenticated;

-- ─── Prix : provenance ──────────────────────────────────────────────────────

create type public.estimate_method as enum ('chain_index', 'mdd_ratio', 'category_median');

alter table public.prices
  add column observation_count    integer,
  add column observed_from        date,
  add column estimate_method      public.estimate_method,
  add column estimate_basis_count integer;

-- Prix « open_prices » écrits par l'ancienne collecte (un relevé à la fois).
update public.prices
   set observation_count = 1, observed_from = (updated_at at time zone 'UTC')::date
 where source = 'open_prices' and observation_count is null;

alter table public.prices
  add constraint prices_observation_count_positive
    check (observation_count is null or observation_count >= 1),
  -- Un prix relevé dit sur combien de relevés il repose.
  add constraint prices_open_prices_observed
    check (source <> 'open_prices' or (observation_count is not null and observation_count >= 1)),
  -- Une estimation dit TOUJOURS comment elle a été calculée (et seulement elle).
  add constraint prices_estimate_method
    check ((source = 'estimate') = (estimate_method is not null)),
  add constraint prices_estimate_basis
    check (estimate_basis_count is null or (source = 'estimate' and estimate_basis_count >= 1)),
  -- Jamais de promo sur une estimation (on n'invente pas une promotion).
  add constraint prices_estimate_no_promo
    check (source <> 'estimate' or (promo_price_cents is null and promo_label is null and promo_until is null)),
  add constraint prices_estimate_no_observation
    check (source <> 'estimate' or (observation_count is null and observed_from is null)),
  add constraint prices_promo_below_price
    check (promo_price_cents is null or promo_price_cents < price_cents);

comment on column public.prices.updated_at is
  'open_prices : date du relevé le plus récent pris en compte ; estimate : date de l''instantané ayant servi au calcul.';
comment on column public.prices.observation_count is
  'Nombre de relevés Open Prices agrégés (médiane du prix normal) — open_prices uniquement.';
comment on column public.prices.observed_from is
  'Date du plus ancien relevé pris en compte (fenêtre de 365 jours) — open_prices uniquement.';
comment on column public.prices.estimate_method is
  'Méthode d''une estimation : chain_index (prix relevé ailleurs × indice d''enseigne), mdd_ratio (MDD équivalente), category_median (vrac).';
comment on column public.prices.estimate_basis_count is
  'Nombre de prix réels sur lesquels repose l''estimation — estimate uniquement.';

-- ─── Description de l'instantané (core › CatalogMeta) ───────────────────────

create table public.catalog_meta (
  id         boolean primary key default true constraint catalog_meta_singleton check (id),
  -- CatalogMeta : snapshotAt, pricesFrom, pricesTo, observedPrices, estimatedPrices,
  -- chainIndex, coverage, sources[] (sources et licences à créditer).
  meta       jsonb not null constraint catalog_meta_shape check (
               jsonb_typeof(meta) = 'object'
               and meta ? 'snapshotAt' and meta ? 'pricesFrom' and meta ? 'pricesTo'
               and jsonb_typeof(meta -> 'chainIndex') = 'object'
               and jsonb_typeof(meta -> 'sources') = 'array'
             ),
  updated_at timestamptz not null default now()
);

comment on table public.catalog_meta is
  'Instantané de données ouvertes d''où vient le catalogue (une seule ligne) : dates, indices d''enseigne, couverture, sources ODbL à créditer.';

create trigger catalog_meta_set_updated_at before update on public.catalog_meta
  for each row execute function public.set_updated_at();

alter table public.catalog_meta enable row level security;

create policy "catalog_read_catalog_meta" on public.catalog_meta
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.catalog_meta from anon, authenticated;

-- ─── RPC du comparateur : nouvelles colonnes ────────────────────────────────

-- Le type de retour change : DROP + CREATE (puis droits rétablis).
drop function if exists public.get_prices_for_ingredients(text[], text[]);

create function public.get_prices_for_ingredients(
  ingredient_ids text[],
  store_ids text[] default null
)
returns table (
  product_id           text,
  ean                  text,
  product_name         text,
  brand                text,
  is_store_brand       boolean,
  store_chain          public.store_chain,
  store_chains         public.store_chain[],
  off_category_tag     text,
  ingredient_id        text,
  pack_size            numeric,
  pack_unit            public.base_unit,
  nutri_score          public.nutri_score,
  allergens            public.allergen[],
  organic              boolean,
  store_id             text,
  price_cents          integer,
  promo_price_cents    integer,
  promo_label          text,
  promo_until          date,
  source               public.price_source,
  price_updated_at     timestamptz,
  observation_count    integer,
  observed_from        date,
  estimate_method      public.estimate_method,
  estimate_basis_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.ean, p.name, p.brand, p.is_store_brand, p.store_chain, p.store_chains, p.off_category_tag,
         p.ingredient_id, p.pack_size, p.pack_unit, p.nutri_score, p.allergens, p.organic,
         pr.store_id, pr.price_cents, pr.promo_price_cents, pr.promo_label, pr.promo_until,
         pr.source, pr.updated_at, pr.observation_count, pr.observed_from, pr.estimate_method,
         pr.estimate_basis_count
    from public.products p
    join public.prices pr on pr.product_id = p.id
    join public.stores s on s.id = pr.store_id and s.is_active
   where p.ingredient_id = any (ingredient_ids)
     and (store_ids is null or cardinality(store_ids) = 0 or pr.store_id = any (store_ids))
     -- Une MDD n'est proposée que dans ses enseignes (défense en profondeur).
     and (not p.is_store_brand or s.chain = any (p.store_chains))
   order by p.ingredient_id, p.id, pr.store_id;
$$;

comment on function public.get_prices_for_ingredients(text[], text[]) is
  'Produits + prix courants (avec provenance : relevé / estimé) pour des ingrédients, optionnellement restreints à des magasins. Catalogue public.';

grant execute on function public.get_prices_for_ingredients(text[], text[]) to anon, authenticated, service_role;
