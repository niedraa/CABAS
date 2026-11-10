-- ════════════════════════════════════════════════════════════════════════════
-- Cabas — 05 · Fonctions, triggers et RPC
--
-- Conventions Supabase : `set search_path = ''` et noms entièrement qualifiés
-- (pas de détournement de search_path), SECURITY DEFINER uniquement quand
-- c'est indispensable, EXECUTE révoqué de PUBLIC puis accordé explicitement.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Création de compte : profil + préférences + abonnement gratuit ─────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  );
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 80))
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id, entitlement)
  values (new.id, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Trigger AFTER INSERT sur auth.users : crée le profil, les préférences de notification et la ligne d''abonnement gratuit.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Journal automatique du consentement « données de santé » ───────────────

create or replace function public.log_health_data_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.health_data_consent_at is not null)
     or (tg_op = 'UPDATE' and new.health_data_consent_at is distinct from old.health_data_consent_at) then
    insert into public.consents (user_id, kind, granted, source)
    values (new.id, 'health_data', new.health_data_consent_at is not null, 'trigger');
  end if;
  return new;
end;
$$;

create trigger profiles_log_health_consent
  after insert or update of health_data_consent_at on public.profiles
  for each row execute function public.log_health_data_consent();

-- ─── Prix d'une liste d'ingrédients (comparateur) ───────────────────────────

create or replace function public.get_prices_for_ingredients(
  ingredient_ids text[],
  store_ids text[] default null
)
returns table (
  product_id        text,
  ean               text,
  product_name      text,
  brand             text,
  is_store_brand    boolean,
  store_chain       public.store_chain,
  ingredient_id     text,
  pack_size         numeric,
  pack_unit         public.base_unit,
  nutri_score       public.nutri_score,
  allergens         public.allergen[],
  organic           boolean,
  store_id          text,
  price_cents       integer,
  promo_price_cents integer,
  promo_label       text,
  promo_until       date,
  source            public.price_source,
  price_updated_at  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.ean, p.name, p.brand, p.is_store_brand, p.store_chain, p.ingredient_id,
         p.pack_size, p.pack_unit, p.nutri_score, p.allergens, p.organic,
         pr.store_id, pr.price_cents, pr.promo_price_cents, pr.promo_label, pr.promo_until,
         pr.source, pr.updated_at
    from public.products p
    join public.prices pr on pr.product_id = p.id
    join public.stores s on s.id = pr.store_id and s.is_active
   where p.ingredient_id = any (ingredient_ids)
     and (store_ids is null or cardinality(store_ids) = 0 or pr.store_id = any (store_ids))
   order by p.ingredient_id, p.id, pr.store_id;
$$;

comment on function public.get_prices_for_ingredients(text[], text[]) is
  'Produits + prix courants pour des ingrédients (optionnellement restreints à des magasins). Catalogue public.';

-- ─── Enregistrement atomique d'un planning (Edge Function generate-meal-plan) ─

create or replace function public.save_meal_plan(p_plan jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_week date;
  v_id   text;
begin
  if v_uid is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'meals') <> 'array' then
    raise exception 'planning invalide' using errcode = '22023';
  end if;
  v_week := (p_plan ->> 'weekStart')::date;

  -- Un seul planning par semaine : on réutilise l'id existant s'il y en a un.
  select mp.id into v_id from public.meal_plans mp where mp.user_id = v_uid and mp.week_start = v_week;
  if v_id is null then
    v_id := coalesce(nullif(p_plan ->> 'id', ''), gen_random_uuid()::text);
    insert into public.meal_plans (user_id, id, week_start, source, generated_at)
    values (v_uid, v_id, v_week, (p_plan ->> 'source')::public.plan_source,
            coalesce((p_plan ->> 'generatedAt')::timestamptz, now()));
  else
    update public.meal_plans
       set source = (p_plan ->> 'source')::public.plan_source,
           generated_at = coalesce((p_plan ->> 'generatedAt')::timestamptz, now())
     where user_id = v_uid and id = v_id;
  end if;

  delete from public.planned_meals where user_id = v_uid and plan_id = v_id;

  insert into public.planned_meals (user_id, id, plan_id, date, meal_type, recipe_id, servings, locked, reason)
  select v_uid, m.id, v_id, m.date, m.type, m."recipeId", m.servings, coalesce(m.locked, false), m.reason
    from jsonb_to_recordset(p_plan -> 'meals')
         as m(id text, date date, type public.meal_type, "recipeId" text, servings smallint, locked boolean, reason text)
  on conflict (user_id, id) do update
     set plan_id = excluded.plan_id, date = excluded.date, meal_type = excluded.meal_type,
         recipe_id = excluded.recipe_id, servings = excluded.servings, locked = excluded.locked,
         reason = excluded.reason;

  return v_id;
end;
$$;

comment on function public.save_meal_plan(jsonb) is
  'Enregistre (transaction unique) un MealPlan core : upsert du planning de la semaine et remplacement de ses repas. RLS appliquée.';

-- ─── RGPD : export (portabilité, art. 20) ───────────────────────────────────

create or replace function public.export_my_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;
  -- SECURITY INVOKER : chaque sous-requête est en plus filtrée par la RLS.
  return jsonb_build_object(
    'exportedAt', now(),
    'userId', v_uid,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'notificationPreferences', (select to_jsonb(n) from public.notification_preferences n where n.user_id = v_uid),
    'subscription', (select to_jsonb(s) from public.subscriptions s where s.user_id = v_uid),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.consents c where c.user_id = v_uid), '[]'::jsonb),
    'mealPlans', coalesce((
      select jsonb_agg(to_jsonb(mp) || jsonb_build_object('meals', coalesce((
               select jsonb_agg(to_jsonb(pm) order by pm.date, pm.meal_type)
                 from public.planned_meals pm where pm.user_id = v_uid and pm.plan_id = mp.id), '[]'::jsonb))
             order by mp.week_start)
        from public.meal_plans mp where mp.user_id = v_uid), '[]'::jsonb),
    'shoppingLists', coalesce((
      select jsonb_agg(to_jsonb(sl) || jsonb_build_object('items', coalesce((
               select jsonb_agg(to_jsonb(it) order by it.position)
                 from public.shopping_list_items it where it.user_id = v_uid and it.list_id = sl.id), '[]'::jsonb))
             order by sl.created_at)
        from public.shopping_lists sl where sl.user_id = v_uid), '[]'::jsonb),
    'basketPlans', coalesce((select jsonb_agg(to_jsonb(b) order by b.computed_at) from public.basket_plans b where b.user_id = v_uid), '[]'::jsonb),
    'orderHandoffs', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.order_handoffs o where o.user_id = v_uid), '[]'::jsonb),
    'pantryItems', coalesce((select jsonb_agg(to_jsonb(pi) order by pi.added_at) from public.pantry_items pi where pi.user_id = v_uid), '[]'::jsonb),
    'spendingEntries', coalesce((select jsonb_agg(to_jsonb(se) order by se.date) from public.spending_entries se where se.user_id = v_uid), '[]'::jsonb),
    'priceWatches', coalesce((select jsonb_agg(to_jsonb(pw)) from public.price_watches pw where pw.user_id = v_uid), '[]'::jsonb),
    'pushTokens', coalesce((select jsonb_agg(jsonb_build_object('platform', t.platform, 'deviceName', t.device_name, 'createdAt', t.created_at, 'lastSeenAt', t.last_seen_at)) from public.push_tokens t where t.user_id = v_uid), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object('kind', q.kind, 'title', q.title, 'body', q.body, 'status', q.status, 'createdAt', q.created_at) order by q.created_at) from public.notification_queue q where q.user_id = v_uid), '[]'::jsonb)
  );
end;
$$;

comment on function public.export_my_data() is 'RGPD art. 20 : toutes les données de l''utilisateur courant, en JSON.';

-- ─── RGPD : suppression (droit à l'effacement, art. 17) ─────────────────────

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n      integer;
begin
  if v_uid is null then
    raise exception 'authentification requise' using errcode = '28000';
  end if;

  -- Ordre : enfants d'abord (les FK composites sont en cascade, mais on compte).
  delete from public.planned_meals where user_id = v_uid;          get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('planned_meals', v_n);
  delete from public.meal_plans where user_id = v_uid;             get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('meal_plans', v_n);
  delete from public.shopping_list_items where user_id = v_uid;    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('shopping_list_items', v_n);
  delete from public.basket_plans where user_id = v_uid;           get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('basket_plans', v_n);
  delete from public.shopping_lists where user_id = v_uid;         get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('shopping_lists', v_n);
  delete from public.order_handoffs where user_id = v_uid;         get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('order_handoffs', v_n);
  delete from public.pantry_items where user_id = v_uid;           get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('pantry_items', v_n);
  delete from public.spending_entries where user_id = v_uid;       get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('spending_entries', v_n);
  delete from public.price_watches where user_id = v_uid;          get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('price_watches', v_n);
  delete from public.push_tokens where user_id = v_uid;            get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('push_tokens', v_n);
  delete from public.notification_queue where user_id = v_uid;     get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('notification_queue', v_n);
  delete from public.notification_preferences where user_id = v_uid; get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('notification_preferences', v_n);
  delete from public.consents where user_id = v_uid;               get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('consents', v_n);
  delete from public.subscriptions where user_id = v_uid;          get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('subscriptions', v_n);
  delete from public.profiles where id = v_uid;                    get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('profiles', v_n);

  -- Journal RevenueCat : conservé pour l'idempotence et la comptabilité, mais
  -- anonymisé (plus aucun lien avec la personne).
  update public.revenuecat_events
     set user_id = null, app_user_id = null, payload = jsonb_build_object('anonymized', true)
   where user_id = v_uid;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('revenuecat_events_anonymized', v_n);

  -- Le compte auth.users est supprimé ensuite par l'Edge Function `account`
  -- (service_role → auth.admin.deleteUser), ce qui purge aussi les sessions.
  return jsonb_build_object('userId', v_uid, 'deleted', v_counts);
end;
$$;

comment on function public.delete_my_account() is
  'RGPD art. 17 : supprime toutes les données applicatives de l''utilisateur courant (auth.uid()). Le compte auth est supprimé par l''Edge Function account.';

-- ─── Maintenance (cron) ─────────────────────────────────────────────────────

create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notif integer;
  v_hist  integer;
begin
  delete from public.notification_queue
   where status <> 'pending' and created_at < now() - interval '30 days';
  get diagnostics v_notif = row_count;

  -- Historique des prix : 3 ans glissants (le garde-fou append-only est levé localement).
  perform set_config('cabas.allow_history_prune', 'on', true);
  delete from public.price_history where observed_at < now() - interval '3 years';
  get diagnostics v_hist = row_count;
  perform set_config('cabas.allow_history_prune', 'off', true);

  return jsonb_build_object('notification_queue', v_notif, 'price_history', v_hist);
end;
$$;

comment on function public.run_maintenance() is 'Purge périodique (notifications traitées > 30 j, historique des prix > 3 ans). service_role / cron uniquement.';

-- ─── Droits d'exécution ─────────────────────────────────────────────────────

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_health_data_consent() from public, anon, authenticated;
revoke execute on function public.record_price_history() from public, anon, authenticated;
revoke execute on function public.run_maintenance() from public, anon, authenticated;

revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.export_my_data() from public, anon;
revoke execute on function public.save_meal_plan(jsonb) from public, anon;
revoke execute on function public.effective_entitlement(uuid) from public, anon;

grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.save_meal_plan(jsonb) to authenticated;
grant execute on function public.effective_entitlement(uuid) to authenticated, service_role;
grant execute on function public.get_prices_for_ingredients(text[], text[]) to anon, authenticated, service_role;
grant execute on function public.run_maintenance() to service_role;
