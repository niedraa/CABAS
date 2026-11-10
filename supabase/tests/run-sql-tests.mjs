#!/usr/bin/env node
/**
 * Tests SQL du back-end Cabas, exécutés sur PGlite (Postgres compilé en WASM,
 * sans Docker ni CLI Supabase).
 *
 * 1. Bouchon de l'environnement Supabase (rôles, auth.users, auth.uid()…) ;
 * 2. toutes les migrations de supabase/migrations, dans l'ordre ;
 * 3. supabase/seed.sql ;
 * 4. assertions : schéma, RLS sur TOUTES les tables, isolation entre
 *    utilisateurs, lecture anonyme du catalogue, triggers, RPC, RGPD.
 *
 * Usage : `node supabase/tests/run-sql-tests.mjs` (code de sortie 1 en cas d'échec).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUPABASE = resolve(HERE, '..');
const MIGRATIONS = join(SUPABASE, 'migrations');

// ─── Mini-framework de test ──────────────────────────────────────────────────

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

/** Attend une erreur SQL dont le message (ou le code) correspond. */
async function expectSqlError(promise, pattern, label = '') {
  let error;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  assert.ok(error, `Erreur SQL attendue ${label}(${pattern}) mais la requête a réussi`);
  const text = `${error.code ?? ''} ${error.message ?? error}`;
  assert.match(text, pattern, `Message d'erreur inattendu ${label}: ${text}`);
}

// ─── Base de test ────────────────────────────────────────────────────────────

const db = await PGlite.create({ extensions: { pgcrypto } });

/** Exécute `fn` sous un rôle donné, avec (optionnellement) un utilisateur JWT. */
async function as(role, userId, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)`, [
    userId ?? '',
    role,
  ]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', '', false)`);
  }
}
const asUser = (uid, fn) => as('authenticated', uid, fn);
const asAnon = (fn) => as('anon', null, fn);
const asService = (fn) => as('service_role', null, fn);

async function one(sql, params = []) {
  const res = await db.query(sql, params);
  return res.rows[0];
}
async function count(sql, params = []) {
  const res = await db.query(sql, params);
  return Number(Object.values(res.rows[0])[0]);
}

/** Crée un utilisateur auth (déclenche handle_new_user) et renvoie son id. */
async function createUser(email, meta = {}) {
  const row = await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    email,
    JSON.stringify(meta),
  ]);
  return row.id;
}

// Lundi de la semaine de référence des tests.
const WEEK = '2026-11-16';

// ─── Chargement ──────────────────────────────────────────────────────────────

const t0 = Date.now();
await db.exec(readFileSync(join(HERE, 'supabase-stub.sql'), 'utf8'));
const migrationFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();
for (const file of migrationFiles) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  } catch (e) {
    console.error(`✗ Échec de la migration ${file} : ${e.message}`);
    process.exit(1);
  }
}
const seedSql = readFileSync(join(SUPABASE, 'seed.sql'), 'utf8');
try {
  await db.exec(seedSql);
} catch (e) {
  console.error(`✗ Échec du seed : ${e.message}`);
  process.exit(1);
}
console.log(`Migrations (${migrationFiles.length}) + seed appliqués en ${Date.now() - t0} ms\n`);

const userA = await createUser('alice@example.com', { display_name: 'Alice' });
const userB = await createUser('bob@example.com', { full_name: 'Bob Martin' });

// ═══ Schéma ═════════════════════════════════════════════════════════════════

const EXPECTED_TABLES = [
  'ingredients', 'recipes', 'recipe_ingredients', 'stores', 'products', 'prices', 'price_history',
  'profiles', 'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans',
  'order_handoffs', 'pantry_items', 'spending_entries', 'consents', 'subscriptions', 'revenuecat_events',
  'notification_preferences', 'push_tokens', 'price_watches', 'notification_queue',
];

test('toutes les tables attendues existent', async () => {
  const res = await db.query(`select tablename from pg_tables where schemaname = 'public'`);
  const names = new Set(res.rows.map((r) => r.tablename));
  for (const t of EXPECTED_TABLES) assert.ok(names.has(t), `table manquante : ${t}`);
});

test('RLS activée sur TOUTES les tables du schéma public', async () => {
  const res = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
  );
  assert.deepEqual(res.rows.map((r) => r.relname), [], 'tables sans RLS');
  const total = await count(
    `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'`,
  );
  assert.ok(total >= EXPECTED_TABLES.length);
});

test('chaque table a au moins une politique (sauf revenuecat_events, service_role only)', async () => {
  const res = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)`,
  );
  assert.deepEqual(res.rows.map((r) => r.relname), ['revenuecat_events']);
});

test('les colonnes sensibles portent un commentaire RGPD', async () => {
  const res = await db.query(
    `select a.attname, col_description(a.attrelid, a.attnum) as c from pg_attribute a
      where a.attrelid = 'public.profiles'::regclass and a.attname in ('allergens', 'diets', 'health_data_consent_at')`,
  );
  assert.equal(res.rows.length, 3);
  for (const r of res.rows) assert.match(r.c ?? '', /RGPD|consentement/i, `commentaire manquant : ${r.attname}`);
});

test('index des chemins chauds présents', async () => {
  const res = await db.query(`select indexname from pg_indexes where schemaname = 'public'`);
  const names = new Set(res.rows.map((r) => r.indexname));
  for (const i of [
    'products_ingredient_idx', 'prices_store_idx', 'planned_meals_plan_idx', 'shopping_list_items_list_idx',
    'price_history_product_store_idx', 'notification_queue_pending_idx', 'push_tokens_user_idx',
  ]) {
    assert.ok(names.has(i), `index manquant : ${i}`);
  }
});

// ═══ Seed ═══════════════════════════════════════════════════════════════════

test('seed : catalogue complet chargé', async () => {
  assert.equal(await count('select count(*) from public.ingredients'), 146);
  assert.equal(await count('select count(*) from public.recipes'), 70);
  assert.equal(await count('select count(*) from public.stores'), 5);
  assert.equal(await count('select count(*) from public.products'), 780);
  assert.equal(await count('select count(*) from public.prices'), 1383);
  assert.ok((await count('select count(*) from public.recipe_ingredients')) > 300);
  const steps = await one(`select steps from public.recipes where id = 'rec_curry_pois_chiches'`);
  assert.ok(Array.isArray(steps.steps) && typeof steps.steps[0].text === 'string');
});

test('seed : chaque recette a des ingrédients et des étapes', async () => {
  assert.equal(
    await count(`select count(*) from public.recipes r where not exists (select 1 from public.recipe_ingredients ri where ri.recipe_id = r.id)`),
    0,
  );
  assert.equal(await count(`select count(*) from public.recipes where jsonb_array_length(steps) = 0`), 0);
});

test('seed : idempotent (rejouer ne duplique rien et n\'historise pas de faux changements)', async () => {
  const hist = await count('select count(*) from public.price_history');
  assert.equal(hist, 1383, 'une ligne d\'historique par prix inséré');
  await db.exec(seedSql);
  assert.equal(await count('select count(*) from public.prices'), 1383);
  assert.equal(await count('select count(*) from public.price_history'), hist);
});

test('au moins 3 enseignes comparables pour la majorité des ingrédients achetables', async () => {
  const ratio = await one(`
    with per_ing as (
      select p.ingredient_id, count(distinct pr.store_id) as n
        from public.products p join public.prices pr on pr.product_id = p.id
       group by p.ingredient_id)
    select avg((n >= 3)::int)::float as r from per_ing`);
  assert.ok(ratio.r >= 0.9, `seulement ${(ratio.r * 100).toFixed(0)} % des ingrédients ont ≥ 3 enseignes`);
});

// ═══ Accès anonyme ══════════════════════════════════════════════════════════

test('anon lit le catalogue', async () => {
  await asAnon(async () => {
    assert.equal(await count('select count(*) from public.recipes'), 70);
    assert.equal(await count('select count(*) from public.prices'), 1383);
    assert.ok((await count('select count(*) from public.recipe_ingredients')) > 300);
    assert.equal(await count('select count(*) from public.stores'), 5);
  });
});

test('anon ne peut pas écrire dans le catalogue', async () => {
  await asAnon(async () => {
    await expectSqlError(
      db.query(`insert into public.stores (id, chain, name) values ('pirate', 'lidl', 'X')`),
      /permission denied|row-level security/,
    );
    await expectSqlError(db.query(`update public.prices set price_cents = 1`), /permission denied/);
    await expectSqlError(db.query(`delete from public.recipes`), /permission denied/);
  });
});

test('anon n\'accède à AUCUNE table utilisateur', async () => {
  for (const t of [
    'profiles', 'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans', 'order_handoffs',
    'pantry_items', 'spending_entries', 'consents', 'subscriptions', 'revenuecat_events', 'notification_preferences',
    'push_tokens', 'price_watches', 'notification_queue',
  ]) {
    await asAnon(() => expectSqlError(db.query(`select * from public.${t} limit 1`), /permission denied/, `[${t}] `));
  }
});

test('anon ne peut pas appeler les RPC privées', async () => {
  await asAnon(async () => {
    await expectSqlError(db.query('select public.delete_my_account()'), /permission denied/);
    await expectSqlError(db.query('select public.export_my_data()'), /permission denied/);
    await expectSqlError(db.query(`select public.save_meal_plan('{}'::jsonb)`), /permission denied/);
  });
});

// ═══ Utilisateurs authentifiés : catalogue ══════════════════════════════════

test('authenticated lit le catalogue mais ne l\'écrit pas', async () => {
  await asUser(userA, async () => {
    assert.equal(await count('select count(*) from public.ingredients'), 146);
    await expectSqlError(
      db.query(`insert into public.recipes (id, title, cuisine, meal_types, servings) values ('x', 'X', 'monde', '{diner}', 2)`),
      /permission denied|row-level security/,
    );
    await expectSqlError(db.query(`update public.ingredients set allergens = '{}'`), /permission denied/);
  });
});

test('service_role écrit le catalogue (BYPASSRLS)', async () => {
  await asService(async () => {
    await db.query(`insert into public.stores (id, chain, name) values ('monoprix_test', 'monoprix', 'Monoprix Test')`);
    await db.query(`update public.stores set is_active = false where id = 'monoprix_test'`);
  });
  await asAnon(async () => {
    assert.equal(await count(`select count(*) from public.stores where id = 'monoprix_test'`), 0, 'magasin inactif masqué');
  });
});

test('recette dépubliée invisible (et ses lignes aussi)', async () => {
  await db.query(`update public.recipes set is_published = false where id = 'rec_curry_pois_chiches'`);
  try {
    await asAnon(async () => {
      assert.equal(await count(`select count(*) from public.recipes where id = 'rec_curry_pois_chiches'`), 0);
      assert.equal(await count(`select count(*) from public.recipe_ingredients where recipe_id = 'rec_curry_pois_chiches'`), 0);
    });
  } finally {
    await db.query(`update public.recipes set is_published = true where id = 'rec_curry_pois_chiches'`);
  }
});

// ═══ handle_new_user ════════════════════════════════════════════════════════

test('handle_new_user crée profil, préférences et abonnement gratuit', async () => {
  const p = await one('select * from public.profiles where id = $1', [userA]);
  assert.equal(p.display_name, 'Alice');
  assert.equal(p.adults, 2);
  assert.equal(p.timezone, 'Europe/Paris');
  const pb = await one('select display_name from public.profiles where id = $1', [userB]);
  assert.equal(pb.display_name, 'Bob Martin');
  const n = await one('select * from public.notification_preferences where user_id = $1', [userA]);
  assert.equal(n.planning_reminder, true);
  assert.equal(n.planning_reminder_weekday, 6);
  const s = await one('select * from public.subscriptions where user_id = $1', [userA]);
  assert.equal(s.entitlement, 'free');
  // Sans métadonnées : préfixe de l'e-mail.
  const c = await createUser('charlie.durand@example.com');
  assert.equal((await one('select display_name from public.profiles where id = $1', [c])).display_name, 'charlie.durand');
});

// ═══ Profil & consentement santé ════════════════════════════════════════════

test('profil : données de santé refusées sans consentement explicite', async () => {
  await asUser(userA, async () => {
    await expectSqlError(
      db.query(`update public.profiles set allergens = '{arachides}' where id = $1`, [userA]),
      /profiles_health_data_requires_consent/,
    );
    await expectSqlError(
      db.query(`update public.profiles set diets = '{halal}' where id = $1`, [userA]),
      /profiles_health_data_requires_consent/,
    );
  });
});

test('profil : consentement → allergies enregistrées et consentement journalisé', async () => {
  await asUser(userA, async () => {
    const r = await db.query(
      `update public.profiles set health_data_consent_at = now(), allergens = '{arachides,lait}', diets = '{vegetarien}',
              adults = 2, children = 1 where id = $1 returning updated_at, created_at`,
      [userA],
    );
    assert.equal(r.rows.length, 1);
    assert.ok(r.rows[0].updated_at >= r.rows[0].created_at);
    const c = await one(`select kind, granted, source from public.consents where user_id = $1 order by id desc limit 1`, [userA]);
    assert.deepEqual(c, { kind: 'health_data', granted: true, source: 'trigger' });
  });
});

test('profil : retrait du consentement impose d\'effacer les données de santé', async () => {
  await asUser(userB, async () => {
    await db.query(`update public.profiles set health_data_consent_at = now(), allergens = '{gluten}' where id = $1`, [userB]);
    await expectSqlError(
      db.query(`update public.profiles set health_data_consent_at = null where id = $1`, [userB]),
      /profiles_health_data_requires_consent/,
    );
    await db.query(`update public.profiles set health_data_consent_at = null, allergens = '{}', diets = '{}' where id = $1`, [userB]);
    const rows = await db.query(`select granted from public.consents where user_id = $1 and kind = 'health_data' order by id`, [userB]);
    assert.deepEqual(rows.rows.map((r) => r.granted), [true, false]);
  });
});

test('profil : contraintes de validité (foyer, budget)', async () => {
  await asUser(userA, async () => {
    await expectSqlError(db.query(`update public.profiles set adults = 0 where id = $1`, [userA]), /check constraint/);
    await expectSqlError(db.query(`update public.profiles set weekly_budget_cents = -1 where id = $1`, [userA]), /check constraint/);
  });
});

// ═══ Isolation entre utilisateurs (RLS) ═════════════════════════════════════

test('RLS : A ne voit pas le profil de B', async () => {
  await asUser(userA, async () => {
    assert.equal(await count('select count(*) from public.profiles'), 1);
    assert.equal(await count('select count(*) from public.profiles where id = $1', [userB]), 0);
    assert.equal(await count('select count(*) from public.notification_preferences'), 1);
  });
});

test('RLS : A ne peut ni modifier ni supprimer le profil de B', async () => {
  await asUser(userA, async () => {
    const upd = await db.query(`update public.profiles set display_name = 'pwned' where id = $1`, [userB]);
    assert.equal(upd.affectedRows ?? 0, 0);
    const del = await db.query(`delete from public.profiles where id = $1`, [userB]);
    assert.equal(del.affectedRows ?? 0, 0);
  });
  assert.equal((await one('select display_name from public.profiles where id = $1', [userB])).display_name, 'Bob Martin');
});

test('RLS : A ne peut pas insérer de lignes au nom de B', async () => {
  await asUser(userA, async () => {
    await expectSqlError(
      db.query(`insert into public.meal_plans (user_id, id, week_start) values ($1, 'plan_b', $2)`, [userB, WEEK]),
      /row-level security/,
    );
    await expectSqlError(
      db.query(`insert into public.pantry_items (user_id, label, quantity, unit) values ($1, 'riz', 1, 'g')`, [userB]),
      /row-level security/,
    );
    await expectSqlError(
      db.query(`insert into public.consents (user_id, kind, granted) values ($1, 'marketing', true)`, [userB]),
      /row-level security/,
    );
  });
});

test('RLS : CRUD complet sur ses propres données (liste de courses)', async () => {
  await asUser(userA, async () => {
    await db.query(`insert into public.shopping_lists (user_id, id) values ($1, 'list_a')`, [userA]);
    await db.query(
      `insert into public.shopping_list_items (user_id, list_id, id, ingredient_id, label, quantity, unit, aisle, source, packaging)
       values ($1, 'list_a', 'oignon_jaune', 'oignon_jaune', 'Oignon jaune', 330, 'g', 'fruits_legumes', 'plan',
               '{"packSize":1000,"packUnit":"g","packs":1}'),
              ($1, 'list_a', 'manual_1', null, 'Sacs poubelle', 1, 'piece', 'hygiene_maison', 'manual', null)`,
      [userA],
    );
    const upd = await db.query(`update public.shopping_list_items set checked = true where user_id = $1 and id = 'manual_1'`, [userA]);
    assert.equal(upd.affectedRows, 1);
    assert.equal(await count('select count(*) from public.shopping_list_items'), 2);
  });
  await asUser(userB, async () => {
    assert.equal(await count('select count(*) from public.shopping_list_items'), 0);
    assert.equal(await count('select count(*) from public.shopping_lists'), 0);
    const del = await db.query(`delete from public.shopping_list_items`);
    assert.equal(del.affectedRows ?? 0, 0);
  });
  assert.equal(await count(`select count(*) from public.shopping_list_items where user_id = $1`, [userA]), 2);
});

test('FK composites : impossible de rattacher une ligne au planning d\'un autre', async () => {
  await asUser(userB, async () => {
    await db.query(`insert into public.meal_plans (user_id, id, week_start) values ($1, 'plan_b', $2)`, [userB, WEEK]);
  });
  await asUser(userA, async () => {
    // A connaît l'id du planning de B, mais (A, plan_b) n'existe pas.
    await expectSqlError(
      db.query(
        `insert into public.planned_meals (user_id, id, plan_id, date, meal_type, recipe_id, servings)
         values ($1, 'meal_x', 'plan_b', $2, 'diner', 'rec_curry_pois_chiches', 2)`,
        [userA, WEEK],
      ),
      /foreign key|violates/,
    );
  });
});

test('meal_plans : week_start doit être un lundi', async () => {
  await asUser(userA, async () => {
    await expectSqlError(
      db.query(`insert into public.meal_plans (user_id, id, week_start) values ($1, 'p', '2026-11-18')`, [userA]),
      /check constraint/,
    );
  });
});

// ═══ save_meal_plan ═════════════════════════════════════════════════════════

function planJson(id, meals, source = 'ai') {
  return JSON.stringify({ id, weekStart: WEEK, generatedAt: '2026-11-10T08:00:00.000Z', source, meals });
}

test('save_meal_plan : enregistre le planning et ses repas (RLS appliquée)', async () => {
  await asUser(userA, async () => {
    const meals = [
      { id: 'meal_1', date: WEEK, type: 'diner', recipeId: 'rec_curry_pois_chiches', servings: 3, reason: 'Rapide' },
      { id: 'meal_2', date: '2026-11-17', type: 'diner', recipeId: 'rec_curry_pois_chiches', servings: 3, locked: true },
    ];
    const r = await one('select public.save_meal_plan($1::jsonb) as id', [planJson('plan_a1', meals)]);
    assert.equal(r.id, 'plan_a1');
    assert.equal(await count(`select count(*) from public.planned_meals where plan_id = 'plan_a1'`), 2);
    const locked = await one(`select locked, reason from public.planned_meals where id = 'meal_2'`);
    assert.deepEqual(locked, { locked: true, reason: null });
  });
});

test('save_meal_plan : même semaine → id conservé, repas remplacés', async () => {
  await asUser(userA, async () => {
    const meals = [{ id: 'meal_3', date: WEEK, type: 'dejeuner', recipeId: 'rec_curry_pois_chiches', servings: 2 }];
    const r = await one('select public.save_meal_plan($1::jsonb) as id', [planJson('plan_other', meals, 'rules')]);
    assert.equal(r.id, 'plan_a1');
    assert.equal(await count(`select count(*) from public.planned_meals where plan_id = 'plan_a1'`), 1);
    assert.equal((await one(`select source from public.meal_plans where id = 'plan_a1'`)).source, 'rules');
    assert.equal(await count('select count(*) from public.meal_plans'), 1);
  });
  await asUser(userB, async () => {
    assert.equal(await count(`select count(*) from public.planned_meals`), 0);
  });
});

test('save_meal_plan : recette inconnue refusée (FK)', async () => {
  await asUser(userA, async () => {
    const meals = [{ id: 'meal_9', date: WEEK, type: 'diner', recipeId: 'rec_inexistante', servings: 2 }];
    await expectSqlError(db.query('select public.save_meal_plan($1::jsonb)', [planJson('plan_a1', meals)]), /foreign key/);
    // La transaction de la fonction est annulée : les repas précédents sont intacts.
    assert.equal(await count(`select count(*) from public.planned_meals where plan_id = 'plan_a1'`), 1);
  });
});

test('save_meal_plan : sans utilisateur → erreur', async () => {
  await as('authenticated', null, () =>
    expectSqlError(db.query('select public.save_meal_plan($1::jsonb)', [planJson('p', [])]), /authentification requise/),
  );
});

// ═══ Abonnement ═════════════════════════════════════════════════════════════

test('subscriptions : lecture de sa ligne uniquement, aucune écriture utilisateur', async () => {
  await asUser(userA, async () => {
    assert.equal(await count('select count(*) from public.subscriptions'), 1);
    await expectSqlError(
      db.query(`update public.subscriptions set entitlement = 'premium' where user_id = $1`, [userA]),
      /permission denied/,
    );
    await expectSqlError(
      db.query(`insert into public.subscriptions (user_id, entitlement) values ($1, 'premium')`, [userA]),
      /permission denied/,
    );
  });
  assert.equal((await one('select entitlement from public.subscriptions where user_id = $1', [userA])).entitlement, 'free');
});

test('revenuecat_events : inaccessible aux utilisateurs, écrit par service_role', async () => {
  await asService(async () => {
    await db.query(
      `insert into public.revenuecat_events (id, type, app_user_id, user_id, payload) values ('evt_1', 'INITIAL_PURCHASE', $1::text, $1::uuid, '{"x":1}')`,
      [userA],
    );
  });
  await asUser(userA, () => expectSqlError(db.query('select * from public.revenuecat_events'), /permission denied/));
  await asService(async () => {
    await expectSqlError(
      db.query(`insert into public.revenuecat_events (id, type) values ('evt_1', 'RENEWAL')`),
      /duplicate key|unique/,
      '(idempotence) ',
    );
  });
});

test('effective_entitlement : premium actif / expiré / autre utilisateur', async () => {
  await asService(() =>
    db.query(`update public.subscriptions set entitlement = 'premium', expires_at = now() + interval '30 days' where user_id = $1`, [
      userA,
    ]),
  );
  await asUser(userA, async () => {
    assert.equal((await one('select public.effective_entitlement($1) as e', [userA])).e, 'premium');
    assert.equal((await one('select public.effective_entitlement($1) as e', [userB])).e, 'free', 'RLS : pas de fuite');
  });
  await asService(() =>
    db.query(`update public.subscriptions set expires_at = now() - interval '1 day' where user_id = $1`, [userA]),
  );
  await asUser(userA, async () => {
    assert.equal((await one('select public.effective_entitlement($1) as e', [userA])).e, 'free');
  });
});

test('price_watches : création réservée au Premium', async () => {
  await asUser(userB, () =>
    expectSqlError(
      db.query(`insert into public.price_watches (user_id, product_id, store_id, reference_cents) values ($1, 'prd_oignon_jaune', 'lidl', 199)`, [
        userB,
      ]),
      /row-level security/,
    ),
  );
  await asService(() =>
    db.query(`update public.subscriptions set entitlement = 'premium', expires_at = now() + interval '7 days', is_trial = true where user_id = $1`, [
      userA,
    ]),
  );
  await asUser(userA, async () => {
    await db.query(
      `insert into public.price_watches (user_id, product_id, store_id, reference_cents) values ($1, 'prd_oignon_jaune', 'lidl', 199)`,
      [userA],
    );
    assert.equal(await count('select count(*) from public.price_watches'), 1);
  });
});

// ═══ Notifications ══════════════════════════════════════════════════════════

test('notification_queue : lecture de ses notifications, écriture service_role, déduplication', async () => {
  await asService(async () => {
    await db.query(
      `insert into public.notification_queue (user_id, kind, title, body, dedupe_key) values ($1, 'price_drop', 'Baisse', 'Oignons -10 %', 'k1')`,
      [userA],
    );
    const dup = await db.query(
      `insert into public.notification_queue (user_id, kind, title, body, dedupe_key) values ($1, 'price_drop', 'Baisse', 'x', 'k1')
       on conflict (dedupe_key) do nothing`,
      [userA],
    );
    assert.equal(dup.affectedRows ?? 0, 0);
  });
  await asUser(userA, async () => {
    assert.equal(await count('select count(*) from public.notification_queue'), 1);
    await expectSqlError(
      db.query(`insert into public.notification_queue (user_id, kind, title, body) values ($1, 'price_drop', 't', 'b')`, [userA]),
      /permission denied/,
    );
  });
  await asUser(userB, async () => assert.equal(await count('select count(*) from public.notification_queue'), 0));
});

test('push_tokens : format Expo validé, propriétaire uniquement', async () => {
  await asUser(userA, async () => {
    await db.query(`insert into public.push_tokens (user_id, token, platform) values ($1, 'ExponentPushToken[abc123]', 'ios')`, [userA]);
    await expectSqlError(
      db.query(`insert into public.push_tokens (user_id, token, platform) values ($1, 'not-a-token', 'ios')`, [userA]),
      /check constraint/,
    );
  });
  await asUser(userB, async () => assert.equal(await count('select count(*) from public.push_tokens'), 0));
});

// ═══ Consentements (append-only) ════════════════════════════════════════════

test('consents : insertion par l\'app, ni modification ni suppression', async () => {
  await asUser(userA, async () => {
    await db.query(`insert into public.consents (user_id, kind, granted, version) values ($1, 'terms', true, '2026-09')`, [userA]);
    await expectSqlError(
      db.query(`insert into public.consents (user_id, kind, granted, source) values ($1, 'terms', true, 'trigger')`, [userA]),
      /row-level security/,
      '(source falsifiée) ',
    );
    await expectSqlError(db.query(`update public.consents set granted = false`), /permission denied/);
    await expectSqlError(db.query(`delete from public.consents`), /permission denied/);
  });
});

// ═══ Prix & historique ══════════════════════════════════════════════════════

test('price_history : trigger à l\'insertion et à chaque changement de prix', async () => {
  const key = ['prd_oignon_jaune', 'leclerc'];
  const before = await count('select count(*) from public.price_history where product_id = $1 and store_id = $2', key);
  await asService(async () => {
    await db.query(
      `update public.prices set price_cents = 189, source = 'open_prices', updated_at = now() where product_id = $1 and store_id = $2`,
      key,
    );
    // Même prix, simple rafraîchissement de la date : pas de nouvelle ligne.
    await db.query(`update public.prices set updated_at = now() where product_id = $1 and store_id = $2`, key);
    // Nouvelle promo : nouvelle ligne.
    await db.query(`update public.prices set promo_price_cents = 159 where product_id = $1 and store_id = $2`, key);
  });
  const rows = await db.query(
    'select price_cents, promo_price_cents, source from public.price_history where product_id = $1 and store_id = $2 order by id',
    key,
  );
  assert.equal(rows.rows.length, before + 2);
  assert.deepEqual(rows.rows.at(-2), { price_cents: 189, promo_price_cents: null, source: 'open_prices' });
  assert.deepEqual(rows.rows.at(-1), { price_cents: 189, promo_price_cents: 159, source: 'open_prices' });
});

test('price_history : append-only (même pour le propriétaire de la base)', async () => {
  await expectSqlError(db.query(`update public.price_history set price_cents = 1`), /append-only/);
  await expectSqlError(db.query(`delete from public.price_history`), /append-only/);
});

test('prices : prix nul ou négatif refusé', async () => {
  await asService(() =>
    expectSqlError(db.query(`update public.prices set price_cents = 0 where product_id = 'prd_oignon_jaune'`), /check constraint/),
  );
});

test('get_prices_for_ingredients : produits × magasins, filtre magasins, accessible à anon', async () => {
  await asAnon(async () => {
    const all = await db.query(`select * from public.get_prices_for_ingredients(array['oignon_jaune', 'riz'])`);
    assert.ok(all.rows.length > 10);
    const stores = new Set(all.rows.filter((r) => r.ingredient_id === 'oignon_jaune').map((r) => r.store_id));
    assert.ok(stores.size >= 3, `≥ 3 enseignes attendues, ${stores.size} trouvées`);
    const r0 = all.rows[0];
    for (const col of ['product_id', 'ean', 'pack_size', 'pack_unit', 'store_id', 'price_cents', 'source', 'price_updated_at']) {
      assert.ok(col in r0, `colonne ${col}`);
    }
    const filtered = await db.query(
      `select distinct store_id from public.get_prices_for_ingredients(array['oignon_jaune'], array['lidl', 'auchan'])`,
    );
    assert.deepEqual(filtered.rows.map((r) => r.store_id).sort(), ['auchan', 'lidl']);
    const none = await db.query(`select * from public.get_prices_for_ingredients(array['inconnu'])`);
    assert.equal(none.rows.length, 0);
  });
});

// ═══ RGPD : export & suppression ════════════════════════════════════════════

test('export_my_data : toutes les données de l\'utilisateur, rien d\'un autre', async () => {
  await asUser(userB, async () => {
    await db.query(`insert into public.pantry_items (user_id, id, label, quantity, unit) values ($1, 'pb', 'Pâtes', 500, 'g')`, [userB]);
  });
  await asUser(userA, async () => {
    const { data } = await one('select public.export_my_data() as data');
    assert.equal(data.userId, userA);
    assert.equal(data.profile.id, userA);
    assert.deepEqual(data.profile.allergens, ['arachides', 'lait']);
    assert.equal(data.mealPlans.length, 1);
    assert.equal(data.mealPlans[0].meals.length, 1);
    assert.equal(data.shoppingLists[0].items.length, 2);
    assert.equal(data.pantryItems.length, 0, 'pas de fuite des données de B');
    assert.ok(data.consents.length >= 2);
    assert.equal(data.pushTokens.length, 1);
    assert.equal(data.pushTokens[0].token, undefined, 'le jeton brut n\'est pas exporté');
  });
});

test('delete_my_account : efface toutes les données de A, anonymise RevenueCat, épargne B', async () => {
  await asUser(userA, async () => {
    await db.query(`insert into public.order_handoffs (user_id, id, store_id, total_cents) values ($1, 'o1', 'lidl', 1234)`, [userA]);
    await db.query(`insert into public.spending_entries (user_id, id, date, store_id, total_cents) values ($1, 's1', '2026-11-10', 'lidl', 1234)`, [
      userA,
    ]);
    await db.query(`insert into public.pantry_items (user_id, id, label, quantity, unit) values ($1, 'pa', 'Riz', 1000, 'g')`, [userA]);
    await db.query(
      `insert into public.basket_plans (user_id, id, list_id, mode, total_cents, snapshot) values ($1, 'b1', 'list_a', 'single_store', 1000, '{}')`,
      [userA],
    );
  });
  const bBefore = await count('select count(*) from public.pantry_items where user_id = $1', [userB]);
  const result = await asUser(userA, () => one('select public.delete_my_account() as r'));
  assert.equal(result.r.userId, userA);
  assert.equal(result.r.deleted.profiles, 1);
  assert.equal(result.r.deleted.planned_meals, 1);
  assert.equal(result.r.deleted.shopping_list_items, 2);

  for (const t of [
    'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans', 'order_handoffs', 'pantry_items',
    'spending_entries', 'price_watches', 'push_tokens', 'notification_queue', 'notification_preferences', 'consents', 'subscriptions',
  ]) {
    assert.equal(await count(`select count(*) from public.${t} where user_id = $1`, [userA]), 0, `reste dans ${t}`);
  }
  assert.equal(await count('select count(*) from public.profiles where id = $1', [userA]), 0);
  const evt = await one(`select user_id, app_user_id, payload from public.revenuecat_events where id = 'evt_1'`);
  assert.deepEqual(evt, { user_id: null, app_user_id: null, payload: { anonymized: true } });
  // B intact.
  assert.equal(await count('select count(*) from public.profiles where id = $1', [userB]), 1);
  assert.equal(await count('select count(*) from public.pantry_items where user_id = $1', [userB]), bBefore);
  assert.equal(await count('select count(*) from public.meal_plans where user_id = $1', [userB]), 1);
});

test('suppression du compte auth : cascade sur toute donnée restante', async () => {
  await asUser(userB, async () => {
    await db.query(`insert into public.spending_entries (user_id, id, date, store_id, total_cents) values ($1, 'sb', '2026-11-10', 'lidl', 500)`, [
      userB,
    ]);
  });
  await db.query('delete from auth.users where id = $1', [userB]);
  for (const t of ['meal_plans', 'pantry_items', 'spending_entries', 'subscriptions', 'notification_preferences', 'consents']) {
    assert.equal(await count(`select count(*) from public.${t} where user_id = $1`, [userB]), 0, `reste dans ${t}`);
  }
  assert.equal(await count('select count(*) from public.profiles where id = $1', [userB]), 0);
});

// ═══ Maintenance & cron ═════════════════════════════════════════════════════

test('run_maintenance : réservé à service_role, purge les notifications traitées anciennes', async () => {
  const u = await createUser('dana@example.com');
  await db.query(
    `insert into public.notification_queue (user_id, kind, title, body, status, created_at)
     values ($1, 'order_reminder', 't', 'b', 'sent', now() - interval '40 days'),
            ($1, 'order_reminder', 't', 'b', 'pending', now() - interval '40 days')`,
    [u],
  );
  await asUser(u, () => expectSqlError(db.query('select public.run_maintenance()'), /permission denied/));
  const r = await asService(() => one('select public.run_maintenance() as r'));
  assert.equal(r.r.notification_queue, 1);
  assert.equal(await count(`select count(*) from public.notification_queue where user_id = $1`, [u]), 1);
});

test('cron : schedule_cabas_jobs sans effet hors Supabase, et interdit aux utilisateurs', async () => {
  const r = await one('select public.schedule_cabas_jobs() as r');
  assert.match(r.r, /non installés/);
  const u = await createUser('eve@example.com');
  await asUser(u, () => expectSqlError(db.query('select public.schedule_cabas_jobs()'), /permission denied/));
});

// ─── Exécution ───────────────────────────────────────────────────────────────

let passed = 0;
const failures = [];
for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log(`  ✓ ${t.name}`);
  } catch (e) {
    failures.push({ name: t.name, error: e });
    console.log(`  ✗ ${t.name}\n      ${String(e.message ?? e).split('\n').join('\n      ')}`);
  }
}
await db.close();
console.log(`\n${passed} réussi(s), ${failures.length} échoué(s) sur ${tests.length} tests SQL (${Date.now() - t0} ms)`);
process.exit(failures.length > 0 ? 1 : 0);
