-- ════════════════════════════════════════════════════════════════════════════
-- Nouvelles enseignes (France : Super U ; Espagne : Mercadona, Dia, Alcampo,
-- Eroski, Consum — Carrefour et Lidl existent dans les deux pays) et pays du
-- magasin. Le minimum de commande ne s'applique qu'aux commandes en ligne :
-- `has_drive = false` → le canal « drive » signifie « courses en magasin ».
-- ════════════════════════════════════════════════════════════════════════════

alter type public.store_chain add value if not exists 'superu';
alter type public.store_chain add value if not exists 'mercadona';
alter type public.store_chain add value if not exists 'dia';
alter type public.store_chain add value if not exists 'alcampo';
alter type public.store_chain add value if not exists 'eroski';
alter type public.store_chain add value if not exists 'consum';

create type public.country_code as enum ('FR', 'ES');

alter table public.stores
  add column country   public.country_code not null default 'FR',
  add column has_drive boolean not null default true;

comment on column public.stores.country is 'Pays du magasin (prix en euros dans les deux cas).';
comment on column public.stores.has_drive is
  'Retrait drive / click & collect proposé. Sinon : courses en magasin (et livraison si delivery_fee_cents non nul).';

create index stores_country_idx on public.stores (country);
