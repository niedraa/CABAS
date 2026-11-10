-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 04 · Abonnement (RevenueCat) et notifications
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Abonnement (1 ligne par utilisateur, écrite UNIQUEMENT par le webhook) ─

create table public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  entitlement              public.entitlement not null default 'free',
  is_trial                 boolean not null default false,
  -- null : pas d'échéance connue (gratuit, ou achat non renouvelable à vie).
  expires_at               timestamptz,
  product_id               text,
  will_renew               boolean not null default false,
  store                    public.subscription_store,
  original_transaction_id  text,
  period_type              text,
  environment              text check (environment is null or environment in ('SANDBOX', 'PRODUCTION')),
  billing_issue_at         timestamptz,
  -- Horodatage (event_timestamp_ms) du dernier événement appliqué : les
  -- événements plus anciens reçus en retard sont ignorés.
  updated_from_event_at    timestamptz,
  last_event_id            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.subscriptions is
  'État d''abonnement (source : webhooks RevenueCat). Lecture par le propriétaire, écriture service_role uniquement.';

create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Droit effectif (premium non expiré) — utilisé par les Edge Functions et l'app.
-- SECURITY INVOKER : la RLS de subscriptions limite un utilisateur à sa propre
-- ligne (un autre user_id renvoie donc « free ») ; service_role voit tout.
create or replace function public.effective_entitlement(p_user_id uuid)
returns public.entitlement
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select case
              when s.entitlement = 'premium' and (s.expires_at is null or s.expires_at > now())
              then 'premium'::public.entitlement
              else 'free'::public.entitlement
            end
       from public.subscriptions s
      where s.user_id = p_user_id),
    'free'::public.entitlement
  );
$$;

-- ─── Événements RevenueCat (idempotence) ────────────────────────────────────

create table public.revenuecat_events (
  -- event.id fourni par RevenueCat : clé d'idempotence.
  id             text primary key,
  type           text not null,
  app_user_id    text,
  user_id        uuid,
  event_at       timestamptz,
  environment    text,
  payload        jsonb not null default '{}'::jsonb,
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  -- Résultat du traitement : 'applied', 'ignored:<raison>', 'error:<message>'.
  outcome        text
);

comment on table public.revenuecat_events is
  'Journal des webhooks RevenueCat (idempotence par event.id). Accès service_role uniquement.';

create index revenuecat_events_user_idx on public.revenuecat_events (user_id, event_at desc);

-- ─── Préférences de notification ────────────────────────────────────────────

create table public.notification_preferences (
  user_id                   uuid primary key references auth.users (id) on delete cascade,
  planning_reminder         boolean not null default true,
  -- 0 = lundi … 6 = dimanche (core › NotificationPreferences).
  planning_reminder_weekday smallint not null default 6 check (planning_reminder_weekday between 0 and 6),
  planning_reminder_hour    smallint not null default 18 check (planning_reminder_hour between 0 and 23),
  order_reminder            boolean not null default true,
  price_drops               boolean not null default true,
  timezone                  text not null default 'Europe/Paris',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ─── Jetons Expo Push ───────────────────────────────────────────────────────

create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token        text not null unique check (token ~ '^(Expo|Exponent)PushToken\[.+\]$'),
  platform     public.push_platform not null,
  device_name  text check (device_name is null or length(device_name) <= 120),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

-- ─── Produits surveillés (alertes baisse de prix — Premium) ─────────────────

create table public.price_watches (
  user_id         uuid not null references auth.users (id) on delete cascade,
  product_id      text not null references public.products (id) on delete cascade,
  store_id        text not null references public.stores (id) on delete cascade,
  -- Prix de référence (dernier prix payé / vu), centimes.
  reference_cents integer not null check (reference_cents > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, product_id, store_id)
);

create index price_watches_product_idx on public.price_watches (product_id, store_id);

create trigger price_watches_set_updated_at before update on public.price_watches
  for each row execute function public.set_updated_at();

-- ─── File d'attente des notifications ───────────────────────────────────────

create table public.notification_queue (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          public.notification_kind not null,
  title         text not null check (length(title) between 1 and 120),
  body          text not null check (length(body) between 1 and 400),
  data          jsonb not null default '{}'::jsonb,
  -- Clé de déduplication (ex. « planning:<user>:2026-11-15 ») : un rappel n'est
  -- jamais mis en file deux fois, même si le cron tourne plusieurs fois.
  dedupe_key    text unique,
  status        public.notification_status not null default 'pending',
  scheduled_for timestamptz not null default now(),
  attempts      smallint not null default 0,
  last_error    text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index notification_queue_pending_idx on public.notification_queue (scheduled_for)
  where status = 'pending';
create index notification_queue_user_idx on public.notification_queue (user_id, created_at desc);
