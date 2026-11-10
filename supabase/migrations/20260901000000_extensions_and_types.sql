-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 01 · Extensions et types énumérés
--
-- Les énumérations reprennent EXACTEMENT les référentiels de src/core/types.ts
-- (source de vérité). Ajouter une valeur : `alter type … add value '…'` dans
-- une nouvelle migration, puis mettre à jour src/core/types.ts.
-- ════════════════════════════════════════════════════════════════════════════

-- Supabase installe les extensions dans le schéma `extensions`.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ─── Référentiels alimentaires ──────────────────────────────────────────────

-- Les 14 allergènes majeurs (règlement UE INCO 1169/2011).
create type public.allergen as enum (
  'gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait',
  'fruits_a_coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques'
);

create type public.diet as enum (
  'vegetarien', 'vegan', 'pescetarien', 'halal', 'casher', 'sans_porc', 'sans_gluten', 'sans_lactose'
);

create type public.equipment as enum (
  'four', 'plaques', 'micro_ondes', 'mixeur', 'robot', 'cocotte_minute', 'friteuse_air', 'barbecue'
);

-- Rayons, dans l'ordre de parcours conseillé (l'ordre de l'enum sert au tri).
create type public.aisle as enum (
  'fruits_legumes', 'boulangerie', 'boucherie', 'poissonnerie', 'cremerie', 'epicerie_salee',
  'condiments', 'epicerie_sucree', 'surgeles', 'boissons', 'hygiene_maison', 'autre'
);

create type public.cuisine as enum (
  'francaise', 'italienne', 'mediterraneenne', 'asiatique', 'orientale', 'mexicaine',
  'indienne', 'americaine', 'monde'
);

-- Unités de recette (core/types.ts › UNITS).
create type public.unit as enum (
  'g', 'kg', 'ml', 'cl', 'l', 'piece', 'cs', 'cc', 'pincee', 'botte', 'gousse', 'tranche', 'sachet', 'boite'
);

-- Unités de base de la liste de courses et des conditionnements.
create type public.base_unit as enum ('g', 'ml', 'piece');

create type public.meal_type as enum ('dejeuner', 'diner');

create type public.nutri_score as enum ('A', 'B', 'C', 'D', 'E');

-- ─── Commerce ───────────────────────────────────────────────────────────────

create type public.store_chain as enum ('leclerc', 'carrefour', 'auchan', 'intermarche', 'lidl', 'monoprix');

create type public.price_source as enum ('open_prices', 'partner', 'collect', 'demo');

create type public.basket_mode as enum ('cheapest', 'single_store');

create type public.order_channel as enum ('drive', 'delivery');

create type public.order_status as enum ('prepared', 'opened', 'confirmed');

-- ─── Planning, liste, budget ────────────────────────────────────────────────

create type public.plan_source as enum ('ai', 'rules');

create type public.list_item_source as enum ('plan', 'manual');

create type public.spending_source as enum ('order', 'manual');

-- ─── Abonnement ─────────────────────────────────────────────────────────────

create type public.entitlement as enum ('free', 'premium');

-- Boutique d'origine de l'achat (champ `store` des webhooks RevenueCat, en minuscules).
create type public.subscription_store as enum (
  'app_store', 'mac_app_store', 'play_store', 'amazon', 'stripe', 'rc_billing', 'paddle', 'promotional', 'test_store', 'unknown'
);

-- ─── Notifications & RGPD ───────────────────────────────────────────────────

create type public.notification_kind as enum ('planning_reminder', 'order_reminder', 'price_drop');

create type public.notification_status as enum ('pending', 'sent', 'failed', 'skipped');

create type public.push_platform as enum ('ios', 'android', 'web');

-- Finalités de consentement tracées (journal append-only `consents`).
create type public.consent_kind as enum ('health_data', 'terms', 'marketing', 'analytics', 'push');
