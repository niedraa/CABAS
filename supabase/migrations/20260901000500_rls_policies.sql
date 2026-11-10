-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 06 · Row Level Security
--
-- RLS ACTIVÉE SUR TOUTES LES TABLES du schéma public (vérifié par
-- supabase/tests/run-sql-tests.mjs).
--
--  • Catalogue (ingredients, recipes, recipe_ingredients, stores, products,
--    prices, price_history) : lecture anon + authenticated ; aucune politique
--    d'écriture ⇒ seul service_role (BYPASSRLS) écrit.
--  • Données utilisateur : propriétaire uniquement ((select auth.uid()) = user_id)
--    pour SELECT / INSERT / UPDATE / DELETE.
--  • subscriptions : SELECT de sa propre ligne ; écriture service_role (webhook).
--  • revenuecat_events : aucune politique ⇒ service_role uniquement.
--  • consents : journal append-only (SELECT + INSERT de ses lignes).
--  • notification_queue : SELECT de ses lignes ; écriture service_role.
--
-- `(select auth.uid())` plutôt que `auth.uid()` : évalué une seule fois par
-- requête (recommandation de performance Supabase).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Activation de la RLS partout ───────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'ingredients', 'recipes', 'recipe_ingredients', 'stores', 'products', 'prices', 'price_history',
    'profiles', 'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans',
    'order_handoffs', 'pantry_items', 'spending_entries', 'consents',
    'subscriptions', 'revenuecat_events', 'notification_preferences', 'push_tokens', 'price_watches',
    'notification_queue'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ─── Catalogue : lecture publique, écriture service_role ────────────────────

create policy "catalog_read_ingredients" on public.ingredients
  for select to anon, authenticated using (true);

create policy "catalog_read_recipes" on public.recipes
  for select to anon, authenticated using (is_published);

create policy "catalog_read_recipe_ingredients" on public.recipe_ingredients
  for select to anon, authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.is_published));

create policy "catalog_read_stores" on public.stores
  for select to anon, authenticated using (is_active);

create policy "catalog_read_products" on public.products
  for select to anon, authenticated using (true);

create policy "catalog_read_prices" on public.prices
  for select to anon, authenticated using (true);

create policy "catalog_read_price_history" on public.price_history
  for select to anon, authenticated using (true);

-- Défense en profondeur : même sans politique, on retire les droits d'écriture.
revoke insert, update, delete, truncate on
  public.ingredients, public.recipes, public.recipe_ingredients, public.stores,
  public.products, public.prices, public.price_history
from anon, authenticated;

-- ─── Profil (clé = id) ──────────────────────────────────────────────────────

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

-- ─── Tables utilisateur génériques (clé = user_id) : CRUD propriétaire ──────

do $$
declare
  t text;
begin
  foreach t in array array[
    'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans',
    'order_handoffs', 'pantry_items', 'spending_entries', 'notification_preferences', 'push_tokens'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- ─── Alertes prix : propriétaire, et création réservée au Premium ───────────

create policy "price_watches_select_own" on public.price_watches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "price_watches_insert_own_premium" on public.price_watches
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.effective_entitlement((select auth.uid())) = 'premium');
create policy "price_watches_update_own" on public.price_watches
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "price_watches_delete_own" on public.price_watches
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ─── Consentements : journal append-only ────────────────────────────────────

create policy "consents_select_own" on public.consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "consents_insert_own" on public.consents
  for insert to authenticated with check ((select auth.uid()) = user_id and source = 'app');
revoke update, delete, truncate on public.consents from anon, authenticated;

-- ─── Abonnement : lecture seule de sa ligne ─────────────────────────────────

create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.subscriptions from anon, authenticated;

-- ─── File de notifications : lecture de ses notifications ───────────────────

create policy "notification_queue_select_own" on public.notification_queue
  for select to authenticated using ((select auth.uid()) = user_id);
revoke insert, update, delete, truncate on public.notification_queue from anon, authenticated;

-- ─── revenuecat_events : aucune politique (service_role uniquement) ─────────

revoke all on public.revenuecat_events from anon, authenticated;

-- ─── anon n'a aucun droit sur les données personnelles ──────────────────────

revoke all on
  public.profiles, public.meal_plans, public.planned_meals, public.shopping_lists,
  public.shopping_list_items, public.basket_plans, public.order_handoffs, public.pantry_items,
  public.spending_entries, public.consents, public.subscriptions, public.notification_preferences,
  public.push_tokens, public.price_watches, public.notification_queue
from anon;
