-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 11 · Collecte incrémentale Open Prices (Edge Function collect-prices)
--
-- Le prix d'une enseigne est NATIONAL : médiane des relevés de ses magasins de
-- France métropolitaine sur 365 jours (formats hyper / super préférés). Pour
-- recalculer cette médiane au fil des relevés, la collecte garde :
--
--  • open_prices_locations : points de vente Open Prices des 10 enseignes en
--    France métropolitaine (rafraîchis chaque semaine depuis l'export
--    locations.jsonl.gz) — la collecte interroge `location_id__in` ;
--  • price_observations : relevés RATTACHÉS au catalogue (jamais le champ
--    `owner`, donnée personnelle) + « socles » de l'instantané (kind
--    'snapshot', écrits par le seed : la médiane de l'instantané pèse le
--    nombre de relevés qu'elle résume) ;
--  • price_collection_state : curseurs `created__gte` du prochain passage
--    (un par lot de lieux, et le plus en retard).
--
-- Tables système : RLS activée SANS politique (service_role uniquement),
-- droits retirés à anon / authenticated.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Points de vente ────────────────────────────────────────────────────────

create table public.open_prices_locations (
  -- Identifiant du lieu Open Prices (paramètre location_id__in de /api/v1/prices).
  id            bigint primary key check (id > 0),
  osm_id        bigint,
  osm_type      text check (osm_type is null or osm_type in ('NODE', 'WAY', 'RELATION')),
  chain         public.store_chain not null,
  -- Format de proximité (City, Express, Contact, Utile, Daily, Proxi, Monop').
  proximity     boolean not null default false,
  osm_name      text,
  osm_brand     text,
  osm_tag_value text,
  postcode      text,
  city          text,
  refreshed_at  timestamptz not null default now()
);

comment on table public.open_prices_locations is
  'Points de vente Open Prices (OpenStreetMap, ODbL) des 10 enseignes en France métropolitaine. Écrit par collect-prices.';

create index open_prices_locations_chain_idx on public.open_prices_locations (chain);

-- ─── Relevés rattachés au catalogue + socles de l'instantané ────────────────

create table public.price_observations (
  id                bigint generated always as identity primary key,
  product_id        text not null references public.products (id) on delete cascade,
  chain             public.store_chain not null,
  -- 'observation' : un relevé Open Prices ; 'snapshot' : médiane de l'instantané (seed).
  kind              text not null check (kind in ('observation', 'snapshot')),
  open_prices_id    bigint,
  location_id       bigint,
  -- Nombre de relevés représentés (1 pour un relevé ; observation_count pour un socle).
  weight            integer not null default 1 check (weight between 1 and 1000000),
  -- Prix NORMAL en millièmes d'euro, dans l'unité de la source : prix du
  -- conditionnement (code-barres, price_per null) ou prix au kilo / à la pièce (vrac).
  regular_milli     integer not null check (regular_milli > 0),
  promo_milli       integer check (promo_milli is null or (promo_milli > 0 and promo_milli < regular_milli)),
  price_per         text check (price_per is null or price_per in ('KILOGRAM', 'UNIT')),
  -- Vrac : catégorie Open Food Facts du relevé (une enseigne est chiffrée par la
  -- 1re catégorie du produit qui y a des relevés, comme l'instantané).
  category_tag      text check (category_tag is null or category_tag ~ '^[a-z]{2,3}:[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Format de proximité (socle : médiane de l'instantané sans aucun relevé hyper / super).
  proximity         boolean not null default false,
  -- Jour du relevé (socle : jour du relevé le plus récent de l'instantané).
  observed_on       date not null,
  -- Socle : jour du plus ancien relevé de l'instantané.
  observed_from     date check (observed_from is null or observed_from <= observed_on),
  -- `created` Open Prices du relevé (curseur, purge au changement d'instantané).
  source_created_at timestamptz,
  recorded_at       timestamptz not null default now(),
  constraint price_observations_kind_shape check (
    case kind
      when 'observation' then open_prices_id is not null and weight = 1 and observed_from is null
      else open_prices_id is null and promo_milli is null
    end
  ),
  constraint price_observations_source_unique unique (open_prices_id, product_id)
);

comment on table public.price_observations is
  'Relevés Open Prices (ODbL) rattachés aux produits du catalogue, et socles de l''instantané. Sans aucune donnée personnelle (owner jamais stocké).';

create unique index price_observations_snapshot_idx on public.price_observations (product_id, chain)
  where kind = 'snapshot';
create index price_observations_product_chain_idx on public.price_observations (product_id, chain, observed_on desc);

-- ─── État de la collecte ────────────────────────────────────────────────────

create table public.price_collection_state (
  id                     boolean primary key default true check (id),
  -- Curseur le plus en retard (min de batch_cursors) : statistiques, compatibilité.
  created_cursor         timestamptz,
  -- Curseur PAR LOT de lieux (clé « premier id-dernier id » → created__gte ISO) :
  -- un lot en retard (gros import, panne) ne bloque jamais les autres.
  batch_cursors          jsonb not null default '{}'::jsonb check (jsonb_typeof(batch_cursors) = 'object'),
  locations_refreshed_at timestamptz,
  last_run_at            timestamptz,
  last_stats             jsonb not null default '{}'::jsonb check (jsonb_typeof(last_stats) = 'object'),
  updated_at             timestamptz not null default now()
);

comment on table public.price_collection_state is
  'Curseurs de la collecte incrémentale Open Prices (une seule ligne, un curseur par lot de lieux). Le seed les pousse au dernier relevé de l''instantané.';

create trigger price_collection_state_set_updated_at before update on public.price_collection_state
  for each row execute function public.set_updated_at();

-- ─── Sécurité : service_role uniquement ─────────────────────────────────────

alter table public.open_prices_locations enable row level security;
alter table public.price_observations enable row level security;
alter table public.price_collection_state enable row level security;

revoke all on public.open_prices_locations, public.price_observations, public.price_collection_state
  from anon, authenticated;

-- ─── Maintenance : purge des relevés sortis de la fenêtre ───────────────────

create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notif integer;
  v_hist  integer;
  v_obs   integer;
begin
  delete from public.notification_queue
   where status <> 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_notif = row_count;

  -- Historique des prix : 3 ans glissants (le garde-fou append-only est levé localement).
  perform set_config('cabas.allow_history_prune', 'on', true);
  delete from public.price_history where observed_at < now() - interval '3 years';
  get diagnostics v_hist = row_count;
  perform set_config('cabas.allow_history_prune', 'off', true);

  -- Relevés hors de la fenêtre de 365 jours (marge de 35 jours).
  delete from public.price_observations
   where kind = 'observation' and observed_on < current_date - 400;
  get diagnostics v_obs = row_count;

  return jsonb_build_object('notification_queue', v_notif, 'price_history', v_hist, 'price_observations', v_obs);
end;
$$;

comment on function public.run_maintenance() is
  'Purge périodique (notifications traitées > 30 j, historique des prix > 3 ans, relevés Open Prices > 400 j). service_role / cron uniquement.';

revoke execute on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;
