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
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUPABASE = resolve(HERE, '..');
const ROOT = resolve(SUPABASE, '..');
const MIGRATIONS = join(SUPABASE, 'migrations');

// ─── Catalogue attendu : DÉRIVÉ de src/data (jamais de comptes en dur) ───────
// Les fichiers de données n'importent que des types : Node les charge tels quels.

const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const [core, dIng, dRec, dSto, dPro, dPri] = await Promise.all(
  ['src/core/types.ts', 'src/data/ingredients.ts', 'src/data/recipes.ts', 'src/data/stores.ts', 'src/data/products.ts', 'src/data/prices.ts'].map(load),
);
const DATA = {
  ingredients: dIng.ingredients,
  recipes: dRec.recipes,
  stores: dSto.stores,
  products: dPro.products,
  prices: dPri.prices,
};
const N = {
  ingredients: DATA.ingredients.length,
  recipes: DATA.recipes.length,
  recipeLines: DATA.recipes.reduce((n, r) => n + r.ingredients.length, 0),
  stores: DATA.stores.length,
  products: DATA.products.length,
  prices: DATA.prices.length,
};
const PRODUCTS_BY_ID = new Map(DATA.products.map((p) => [p.id, p]));
/** Ingrédients achetables triés par nombre de magasins avec un prix (décroissant). */
const STORES_BY_INGREDIENT = (() => {
  const m = new Map();
  for (const pr of DATA.prices) {
    const ing = PRODUCTS_BY_ID.get(pr.productId)?.ingredientId;
    if (!ing) continue;
    if (!m.has(ing)) m.set(ing, new Set());
    m.get(ing).add(pr.storeId);
  }
  return [...m.entries()].sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1));
})();
/**
 * Produit et prix de TEST (hors catalogue, codes-barres fictifs « 39999… ») :
 * les tests de comportement ne dépendent pas du contenu de src/data, qui peut
 * être vide pendant un import.
 */
const FIXTURE = { productId: 'prd_test_fixture', storeId: 'leclerc', priceCents: 249 };
async function ensureFixture() {
  await db.query(
    `insert into public.products (id, ean, name, brand, ingredient_id, pack_size, pack_unit)
     values ($1, '3999999000011', 'Produit de test', 'Test', $2, 500, 'g') on conflict (id) do nothing`,
    [FIXTURE.productId, DATA.ingredients[0].id],
  );
  await db.query(
    `insert into public.prices (product_id, store_id, price_cents, source) values
       ($1, 'leclerc', $2, 'demo'), ($1, 'lidl', $2 + 10, 'demo'), ($1, 'carrefour', $2 + 20, 'demo')
     on conflict do nothing`,
    [FIXTURE.productId, FIXTURE.priceCents],
  );
}

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
  'ingredients', 'recipes', 'recipe_ingredients', 'stores', 'products', 'prices', 'price_history', 'catalog_meta',
  'profiles', 'meal_plans', 'planned_meals', 'shopping_lists', 'shopping_list_items', 'basket_plans',
  'order_handoffs', 'pantry_items', 'spending_entries', 'consents', 'subscriptions', 'revenuecat_events',
  'notification_preferences', 'push_tokens', 'price_watches', 'notification_queue',
  'open_prices_locations', 'price_observations', 'price_collection_state',
];

/** Tables système sans politique : service_role uniquement. */
const SERVICE_ONLY_TABLES = ['open_prices_locations', 'price_collection_state', 'price_observations', 'revenuecat_events'];

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

test('chaque table a au moins une politique (sauf les tables système, service_role only)', async () => {
  const res = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
      order by c.relname`,
  );
  assert.deepEqual(res.rows.map((r) => r.relname), SERVICE_ONLY_TABLES);
});

test('énumérations Postgres = référentiels de src/core/types.ts (valeurs ET ordre)', async () => {
  const enumValues = async (type) =>
    (await db.query(`select unnest(enum_range(null::public.${type}))::text as v`)).rows.map((r) => r.v);
  assert.deepEqual(await enumValues('store_chain'), [...core.STORE_CHAINS]);
  assert.deepEqual(await enumValues('allergen'), [...core.ALLERGENS]);
  assert.deepEqual(await enumValues('diet'), [...core.DIETS]);
  assert.deepEqual(await enumValues('equipment'), [...core.EQUIPMENT]);
  assert.deepEqual(await enumValues('aisle'), [...core.AISLES]);
  assert.deepEqual(await enumValues('cuisine'), [...core.CUISINES]);
  assert.deepEqual(await enumValues('unit'), [...core.UNITS]);
  assert.deepEqual(await enumValues('price_source'), ['open_prices', 'partner', 'collect', 'estimate', 'demo']);
  assert.deepEqual(await enumValues('estimate_method'), ['chain_index', 'mdd_ratio', 'category_median']);
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

test('seed : catalogue complet chargé (comptes dérivés de src/data)', async () => {
  assert.equal(await count('select count(*) from public.ingredients'), N.ingredients);
  assert.equal(await count('select count(*) from public.recipes'), N.recipes);
  assert.equal(await count('select count(*) from public.stores'), N.stores);
  assert.equal(await count('select count(*) from public.products'), N.products);
  assert.equal(await count('select count(*) from public.prices'), N.prices);
  assert.equal(await count('select count(*) from public.recipe_ingredients'), N.recipeLines);
  const steps = await one(`select steps from public.recipes where id = 'rec_curry_pois_chiches'`);
  assert.ok(Array.isArray(steps.steps) && typeof steps.steps[0].text === 'string');
});

test('seed : magasins, produits et prix restitués à l\'identique (provenance comprise)', async () => {
  for (const s of DATA.stores) {
    const r = await one('select chain::text, pickup, delivery_fee_cents, is_active from public.stores where id = $1', [s.id]);
    assert.equal(s.id, s.chain, 'Store.id === chain (ids persistés des utilisateurs)');
    assert.deepEqual(r, { chain: s.chain, pickup: s.pickup, delivery_fee_cents: s.deliveryFeeCents, is_active: true });
  }
  const products = new Map(
    (await db.query('select id, ean, off_category_tag, store_chains::text[] as chains, store_chain::text as chain from public.products')).rows.map(
      (r) => [r.id, r],
    ),
  );
  for (const p of DATA.products) {
    const r = products.get(p.id);
    const chains = p.storeChains ?? (p.storeChain ? [p.storeChain] : []);
    assert.equal(r.ean, p.ean ?? null, `${p.id} : ean`);
    assert.equal(r.off_category_tag, p.offCategoryTag ?? null, `${p.id} : catégorie vrac`);
    assert.deepEqual(r.chains, chains, `${p.id} : enseignes`);
    assert.equal(r.chain, chains[0] ?? null, `${p.id} : store_chain (compatibilité) = 1re enseigne`);
  }
  const prices = new Map(
    (
      await db.query(
        `select product_id || '|' || store_id as k, price_cents, promo_price_cents, source::text, observation_count,
                observed_from::text, estimate_method::text, estimate_basis_count from public.prices`,
      )
    ).rows.map((r) => [r.k, r]),
  );
  for (const p of DATA.prices) {
    const r = prices.get(`${p.productId}|${p.storeId}`);
    assert.ok(r, `prix manquant ${p.productId}|${p.storeId}`);
    assert.deepEqual(
      r,
      {
        k: `${p.productId}|${p.storeId}`,
        price_cents: p.priceCents,
        promo_price_cents: p.promoPriceCents ?? null,
        source: p.source,
        observation_count: p.observationCount ?? null,
        observed_from: p.observedFrom ? p.observedFrom.slice(0, 10) : null,
        estimate_method: p.estimateMethod ?? null,
        estimate_basis_count: p.estimateBasisCount ?? null,
      },
    );
  }
});

test('seed : socles de collecte = prix relevés de l\'instantané', async () => {
  const observed = DATA.prices.filter((p) => p.source === 'open_prices').length;
  assert.equal(await count(`select count(*) from public.price_observations where kind = 'snapshot'`), observed);
  assert.equal(await count(`select count(*) from public.price_observations where kind = 'observation'`), 0);
});

test('seed : vrac (catégories, unité et facteur de la source) et provenance des socles (proximité, catégorie)', async () => {
  const snapshot = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'openData', 'snapshot.json'), 'utf8'));
  const loose = new Map(
    (await db.query(
      `select id, off_category_tags, off_price_per, off_pack_factor::float8 as f from public.products where off_category_tag is not null`,
    )).rows.map((r) => [r.id, r]),
  );
  for (const p of DATA.products.filter((x) => x.offCategoryTag)) {
    assert.deepEqual(loose.get(p.id), { id: p.id, off_category_tags: p.offCategoryTags, off_price_per: p.offPricePer, f: p.offPackFactor }, p.id);
  }
  // Concombre : ingrédient au poids, relevé À LA PIÈCE (unité de la source).
  const concombre = await one(
    `select price_per, category_tag from public.price_observations where kind = 'snapshot' and product_id = 'prd_concombre_vrac' limit 1`,
  );
  assert.deepEqual(concombre, { price_per: 'UNIT', category_tag: 'en:cucumbers' });
  // Ail chez Super U : prix de l'instantané issu de la catégorie SECONDAIRE en:garlics.
  assert.deepEqual(
    await one(`select category_tag from public.price_observations where kind = 'snapshot' and product_id = 'prd_ail_vrac' and chain = 'superu'`),
    { category_tag: 'en:garlics' },
  );
  // Socles « proximité seulement » : exactement les médianes de l'instantané sans relevé hyper / super.
  const proximityBases = new Set(
    (await db.query(`select product_id || '|' || chain::text as k from public.price_observations where kind = 'snapshot' and proximity`)).rows.map((r) => r.k),
  );
  const storesById = new Map(DATA.stores.map((st) => [st.id, st]));
  const expected = new Set();
  for (const pr of DATA.prices.filter((x) => x.source === 'open_prices')) {
    const prod = PRODUCTS_BY_ID.get(pr.productId);
    const chain = storesById.get(pr.storeId).chain;
    let agg;
    if (prod.ean) agg = snapshot.aggregates[`ean:${prod.ean}`]?.[chain];
    else for (const tag of prod.offCategoryTags) if (!agg) agg = snapshot.aggregates[`cat:${tag}:${prod.offPricePer}${prod.organic ? ':organic' : ''}`]?.[chain];
    if (agg?.proximityOnly) expected.add(`${pr.productId}|${chain}`);
  }
  assert.ok(expected.size > 100, `${expected.size} socles de proximité attendus`);
  assert.deepEqual([...proximityBases].sort(), [...expected].sort());
  assert.ok(proximityBases.has('prd_semoule_mdd_intermarche|intermarche'));
  // Curseur : juste après le dernier relevé de l'export (pas minuit de la date de l'instantané).
  assert.equal(
    (await one(`select created_cursor from public.price_collection_state`)).created_cursor.toISOString(),
    '2026-11-10T22:52:46.304Z',
  );
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
  assert.equal(hist, N.prices, 'une ligne d\'historique par prix inséré');
  const snapshots = await count(`select count(*) from public.price_observations`);
  await db.exec(seedSql);
  assert.equal(await count('select count(*) from public.prices'), N.prices);
  assert.equal(await count('select count(*) from public.products'), N.products);
  assert.equal(await count('select count(*) from public.price_history'), hist);
  assert.equal(await count(`select count(*) from public.price_observations`), snapshots);
});

test('couverture : part des ingrédients comparables dans ≥ 3 enseignes identique à src/data', async () => {
  const expected = STORES_BY_INGREDIENT.length === 0
    ? null
    : STORES_BY_INGREDIENT.filter(([, s]) => s.size >= 3).length / STORES_BY_INGREDIENT.length;
  const ratio = await one(`
    with per_ing as (
      select p.ingredient_id, count(distinct pr.store_id) as n
        from public.products p join public.prices pr on pr.product_id = p.id
       group by p.ingredient_id)
    select avg((n >= 3)::int)::float as r from per_ing`);
  if (expected === null) assert.equal(ratio.r, null);
  else assert.ok(Math.abs(ratio.r - expected) < 1e-9, `${ratio.r} ≠ ${expected}`);
});

// ═══ Accès anonyme ══════════════════════════════════════════════════════════

test('anon lit le catalogue', async () => {
  const metaRows = await count('select count(*) from public.catalog_meta');
  await asAnon(async () => {
    assert.equal(await count('select count(*) from public.recipes'), N.recipes);
    assert.equal(await count('select count(*) from public.prices'), N.prices);
    assert.equal(await count('select count(*) from public.recipe_ingredients'), N.recipeLines);
    assert.equal(await count('select count(*) from public.stores'), N.stores);
    assert.equal(await count('select count(*) from public.catalog_meta'), metaRows);
  });
});

test('anon et authenticated n\'accèdent pas aux tables système de collecte', async () => {
  for (const t of ['open_prices_locations', 'price_observations', 'price_collection_state']) {
    await asAnon(() => expectSqlError(db.query(`select * from public.${t} limit 1`), /permission denied/, `[anon ${t}] `));
    await asUser(userA, () => expectSqlError(db.query(`select * from public.${t} limit 1`), /permission denied/, `[user ${t}] `));
  }
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
    assert.equal(await count('select count(*) from public.ingredients'), N.ingredients);
    await expectSqlError(
      db.query(`insert into public.catalog_meta (id, meta) values (true, '{}')`),
      /permission denied|row-level security/,
    );
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
  await ensureFixture();
  const watch = [FIXTURE.productId, FIXTURE.storeId, FIXTURE.priceCents];
  await asUser(userB, () =>
    expectSqlError(
      db.query(`insert into public.price_watches (user_id, product_id, store_id, reference_cents) values ($1, $2, $3, $4)`, [
        userB,
        ...watch,
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
      `insert into public.price_watches (user_id, product_id, store_id, reference_cents) values ($1, $2, $3, $4)`,
      [userA, ...watch],
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
  await ensureFixture();
  const key = [FIXTURE.productId, FIXTURE.storeId];
  const newCents = FIXTURE.priceCents + 7;
  const before = await count('select count(*) from public.price_history where product_id = $1 and store_id = $2', key);
  await asService(async () => {
    await db.query(
      `update public.prices set price_cents = $3, source = 'open_prices', observation_count = 3, observed_from = '2026-10-01',
              estimate_method = null, estimate_basis_count = null, promo_price_cents = null, promo_label = null, promo_until = null,
              updated_at = now()
        where product_id = $1 and store_id = $2`,
      [...key, newCents],
    );
    // Même prix, simple rafraîchissement de la date : pas de nouvelle ligne.
    await db.query(`update public.prices set updated_at = now(), observation_count = 4 where product_id = $1 and store_id = $2`, key);
    // Nouvelle promo : nouvelle ligne.
    await db.query(`update public.prices set promo_price_cents = $3 where product_id = $1 and store_id = $2`, [...key, newCents - 30]);
  });
  const rows = await db.query(
    'select price_cents, promo_price_cents, source from public.price_history where product_id = $1 and store_id = $2 order by id',
    key,
  );
  assert.equal(rows.rows.length, before + 2);
  assert.deepEqual(rows.rows.at(-2), { price_cents: newCents, promo_price_cents: null, source: 'open_prices' });
  assert.deepEqual(rows.rows.at(-1), { price_cents: newCents, promo_price_cents: newCents - 30, source: 'open_prices' });
});

test('price_history : append-only (même pour le propriétaire de la base)', async () => {
  await expectSqlError(db.query(`update public.price_history set price_cents = 1`), /append-only/);
  await expectSqlError(db.query(`delete from public.price_history`), /append-only/);
});

test('prices : prix nul ou négatif refusé', async () => {
  await ensureFixture();
  await asService(() =>
    expectSqlError(db.query(`update public.prices set price_cents = 0 where product_id = $1`, [FIXTURE.productId]), /check constraint/),
  );
});

/** Produits et prix de test (hors catalogue), nettoyés après chaque test. */
const TEST_INGREDIENT = DATA.ingredients[0].id;
async function withTestRows(fn) {
  try {
    await fn();
  } finally {
    await db.query(`select set_config('cabas.allow_history_prune', 'on', false)`);
    await db.query(`delete from public.products where id like 'prd_zz_%'`);
    await db.query(`select set_config('cabas.allow_history_prune', 'off', false)`);
  }
}
const insertProduct = (cols, values) =>
  db.query(
    `insert into public.products (id, name, ingredient_id, pack_size, pack_unit, ${cols.join(', ')})
     values ($1, 'Test', '${TEST_INGREDIENT}', 1000, 'g', ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
    values,
  );

test('products : code-barres GTIN-8 / GTIN-13 (hors poids variable), ou catégorie vrac — exactement un', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean'], ['prd_zz_ean13', '3999999000028']);
    await insertProduct(['ean'], ['prd_zz_ean8', '49999995']);
    await insertProduct(['off_category_tag'], ['prd_zz_vrac', 'en:tomatoes']);
    await insertProduct(['off_category_tag'], ['prd_zz_vrac_fr', 'fr:raisins-blancs-frais']);
    const bad = [
      [['ean'], ['prd_zz_b1', '301762042503'], /products_ean_gtin/, '12 chiffres'],
      [['ean'], ['prd_zz_b2', '03017620425035'], /products_ean_gtin/, '14 chiffres'],
      [['ean'], ['prd_zz_b3', '2012345000017'], /products_ean_gtin/, 'poids variable'],
      [['ean'], ['prd_zz_b4', '30176204250AB'], /products_ean_gtin/, 'lettres'],
      [['off_category_tag'], ['prd_zz_b5', 'Tomates'], /products_off_category_tag_format/, 'tag sans langue'],
      [['off_category_tag'], ['prd_zz_b6', 'en:Tomates fraîches'], /products_off_category_tag_format/, 'tag non normalisé'],
      [['ean', 'off_category_tag'], ['prd_zz_b7', '3999999000035', 'en:tomatoes'], /products_ean_or_category/, 'les deux'],
      [[], ['prd_zz_b8'], /products_ean_or_category/, 'aucun'],
    ];
    for (const [cols, values, pattern, label] of bad) {
      await expectSqlError(
        cols.length > 0
          ? insertProduct(cols, values)
          : db.query(`insert into public.products (id, name, ingredient_id, pack_size, pack_unit) values ($1, 'Test', $2, 1, 'g')`, [
              values[0],
              TEST_INGREDIENT,
            ]),
        pattern,
        `(${label}) `,
      );
    }
  });
});

test('products : unicité du code-barres vérifiée en fin de transaction (échange d\'EAN possible)', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean'], ['prd_zz_a', '3999999000028']);
    await insertProduct(['ean'], ['prd_zz_b', '49999995']);
    await db.exec(`begin;
      update public.products set ean = '49999995' where id = 'prd_zz_a';
      update public.products set ean = '3999999000028' where id = 'prd_zz_b';
      commit;`);
    assert.equal((await one(`select ean from public.products where id = 'prd_zz_a'`)).ean, '49999995');
    await expectSqlError(insertProduct(['ean'], ['prd_zz_c', '49999995']), /duplicate key|products_ean_key/);
  });
});

test('products : MDD ⇔ au moins une enseigne ; store_chain (compatibilité) = 1re enseigne', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean', 'is_store_brand', 'store_chains'], ['prd_zz_mdd', '3999999000042', true, '{intermarche,netto,intermarche}']);
    assert.deepEqual(await one(`select store_chains::text[] as c, store_chain::text as s from public.products where id = 'prd_zz_mdd'`), {
      c: ['intermarche', 'netto'],
      s: 'intermarche',
    });
    // Ancien écrivain : seule la colonne store_chain est renseignée.
    await insertProduct(['ean', 'is_store_brand', 'store_chain'], ['prd_zz_legacy', '3999999000059', true, 'carrefour']);
    assert.deepEqual(await one(`select store_chains::text[] as c from public.products where id = 'prd_zz_legacy'`), { c: ['carrefour'] });
    await db.query(`update public.products set store_chain = 'auchan' where id = 'prd_zz_legacy'`);
    assert.deepEqual(await one(`select store_chains::text[] as c from public.products where id = 'prd_zz_legacy'`), { c: ['auchan'] });
    await db.query(`update public.products set store_chains = '{superu,leclerc}' where id = 'prd_zz_legacy'`);
    assert.equal((await one(`select store_chain::text as s from public.products where id = 'prd_zz_legacy'`)).s, 'superu');
    await expectSqlError(
      insertProduct(['ean', 'is_store_brand'], ['prd_zz_mdd_sans', '3999999000066', true]),
      /products_store_brand_chains/,
      '(MDD sans enseigne) ',
    );
    await expectSqlError(
      insertProduct(['ean', 'is_store_brand', 'store_chains'], ['prd_zz_mn', '3999999000066', false, '{lidl}']),
      /products_store_brand_chains/,
      '(marque nationale avec enseigne) ',
    );
  });
});

test('prices : provenance cohérente (relevé, estimation, promo)', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean'], ['prd_zz_p', '3999999000028']);
    const ins = (cols, values) =>
      db.query(
        `insert into public.prices (product_id, store_id, price_cents, ${cols.join(', ')})
         values ('prd_zz_p', 'leclerc', 250, ${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        values,
      );
    const bad = [
      [['source'], ['open_prices'], /prices_open_prices_observed/, 'relevé sans nombre de relevés'],
      [['source', 'observation_count'], ['open_prices', 0], /prices_observation_count_positive|prices_open_prices_observed/, 'zéro relevé'],
      [['source'], ['estimate'], /prices_estimate_method/, 'estimation sans méthode'],
      [['source', 'estimate_method'], ['demo', 'chain_index'], /prices_estimate_method/, 'méthode hors estimation'],
      [['source', 'estimate_method', 'promo_price_cents'], ['estimate', 'chain_index', 199], /prices_estimate_no_promo/, 'promo estimée'],
      [['source', 'estimate_method', 'promo_label'], ['estimate', 'mdd_ratio', 'Promo'], /prices_estimate_no_promo/, 'libellé promo estimé'],
      [['source', 'estimate_method', 'estimate_basis_count'], ['estimate', 'category_median', 0], /prices_estimate_basis/, 'base vide'],
      [['source', 'estimate_basis_count'], ['demo', 3], /prices_estimate_basis/, 'base hors estimation'],
      [['source', 'estimate_method', 'observation_count'], ['estimate', 'chain_index', 2], /prices_estimate_no_observation|prices_estimate/, 'relevés sur une estimation'],
      [['source', 'promo_price_cents'], ['demo', 250], /prices_promo_below_price/, 'promo ≥ prix'],
    ];
    for (const [cols, values, pattern, label] of bad) {
      await expectSqlError(ins(cols, values), pattern, `(${label}) `);
    }
    await ins(['source', 'estimate_method', 'estimate_basis_count', 'updated_at'], ['estimate', 'chain_index', 12, '2026-11-10']);
    await db.query(
      `update public.prices set source = 'open_prices', estimate_method = null, estimate_basis_count = null,
              observation_count = 5, observed_from = '2026-01-04', promo_price_cents = 199, promo_label = 'Promo', promo_until = '2026-11-17'
        where product_id = 'prd_zz_p'`,
    );
  });
});

test('stores : mode de retrait contrôlé', async () => {
  await asService(async () => {
    await expectSqlError(db.query(`update public.stores set pickup = 'teleport' where id = 'leclerc'`), /stores_pickup_check/);
  });
});

test('catalog_meta : une seule ligne, forme contrôlée, lecture publique', async () => {
  const before = await db.query('select meta from public.catalog_meta');
  try {
    const meta = { snapshotAt: '2026-11-11T00:00:00.000Z', pricesFrom: '2025-11-11', pricesTo: '2026-11-10', chainIndex: {}, sources: [] };
    await asService(() =>
      db.query(`insert into public.catalog_meta (id, meta) values (true, $1) on conflict (id) do update set meta = excluded.meta`, [
        JSON.stringify(meta),
      ]),
    );
    await asAnon(async () => {
      assert.deepEqual((await one('select meta from public.catalog_meta')).meta, meta);
      await expectSqlError(db.query(`update public.catalog_meta set meta = '{}'`), /permission denied/);
    });
    await expectSqlError(db.query(`insert into public.catalog_meta (id, meta) values (false, $1)`, [JSON.stringify(meta)]), /catalog_meta_singleton/);
    await expectSqlError(db.query(`update public.catalog_meta set meta = '{"snapshotAt":"x"}'`), /catalog_meta_shape/);
  } finally {
    await db.query('delete from public.catalog_meta');
    for (const r of before.rows) await db.query('insert into public.catalog_meta (id, meta) values (true, $1)', [JSON.stringify(r.meta)]);
  }
});

test('get_prices_for_ingredients : produits × magasins, provenance, filtre magasins, accessible à anon', async () => {
  await ensureFixture();
  const fixtureIngredient = DATA.ingredients[0].id;
  await asAnon(async () => {
    const rows = (await db.query(`select * from public.get_prices_for_ingredients(array[$1])`, [fixtureIngredient])).rows;
    const mine = rows.filter((r) => r.product_id === FIXTURE.productId);
    assert.deepEqual(mine.map((r) => r.store_id), ['carrefour', 'leclerc', 'lidl']);
    for (const col of [
      'product_id', 'ean', 'off_category_tag', 'store_chains', 'pack_size', 'pack_unit', 'store_id', 'price_cents', 'source',
      'price_updated_at', 'observation_count', 'observed_from', 'estimate_method', 'estimate_basis_count',
    ]) {
      assert.ok(col in mine[0], `colonne ${col}`);
    }
    // PGlite renvoie les tableaux d'enum sous forme littérale (« {} ») ; PostgREST en JSON.
    const chains = mine[0].store_chains;
    assert.ok(Array.isArray(chains) ? chains.length === 0 : chains === '{}', `store_chains : ${chains}`);
    const filtered = await db.query(
      `select distinct store_id from public.get_prices_for_ingredients(array[$1], array['lidl', 'leclerc']) where product_id = $2`,
      [fixtureIngredient, FIXTURE.productId],
    );
    assert.deepEqual(filtered.rows.map((r) => r.store_id).sort(), ['leclerc', 'lidl']);
    const none = await db.query(`select * from public.get_prices_for_ingredients(array['inconnu'])`);
    assert.equal(none.rows.length, 0);
  });
});

test('get_prices_for_ingredients : restitue le catalogue de src/data', async () => {
  // Catalogue vide (import en cours) : rien à comparer.
  if (STORES_BY_INGREDIENT.length === 0) return;
  const [[ing1, stores1], [ing2]] = [STORES_BY_INGREDIENT[0], STORES_BY_INGREDIENT[1] ?? STORES_BY_INGREDIENT[0]];
  const expected = DATA.prices.filter((p) => [ing1, ing2].includes(PRODUCTS_BY_ID.get(p.productId)?.ingredientId)).length;
  await asAnon(async () => {
    const all = await db.query(
      `select * from public.get_prices_for_ingredients(array[$1, $2]) where product_id not like 'prd_test_%'`,
      [ing1, ing2],
    );
    assert.equal(all.rows.length, expected);
    const stores = new Set(all.rows.filter((r) => r.ingredient_id === ing1).map((r) => r.store_id));
    assert.equal(stores.size, stores1.size);
  });
});

test('get_prices_for_ingredients : une MDD n\'est jamais proposée hors de ses enseignes', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean', 'is_store_brand', 'store_chains'], ['prd_zz_mdd_rpc', '3999999000042', true, '{intermarche,netto}']);
    await db.query(
      `insert into public.prices (product_id, store_id, price_cents, source) values
         ('prd_zz_mdd_rpc', 'intermarche', 199, 'demo'), ('prd_zz_mdd_rpc', 'netto', 189, 'demo'), ('prd_zz_mdd_rpc', 'lidl', 99, 'demo')`,
    );
    const rows = await asAnon(() =>
      db.query(`select store_id from public.get_prices_for_ingredients(array[$1]) where product_id = 'prd_zz_mdd_rpc' order by store_id`, [
        TEST_INGREDIENT,
      ]),
    );
    assert.deepEqual(rows.rows.map((r) => r.store_id), ['intermarche', 'netto']);
  });
});

test('price_observations : forme contrôlée, un relevé n\'est stocké qu\'une fois par produit', async () => {
  await withTestRows(async () => {
    await insertProduct(['ean'], ['prd_zz_obs', '3999999000028']);
    const ins = (extra = {}) => {
      const row = {
        product_id: 'prd_zz_obs', chain: 'leclerc', kind: 'observation', open_prices_id: 42, weight: 1,
        regular_milli: 2490, observed_on: '2026-11-03', ...extra,
      };
      const cols = Object.keys(row);
      return asService(() =>
        db.query(`insert into public.price_observations (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(row)),
      );
    };
    await ins();
    await expectSqlError(ins(), /price_observations_source_unique|duplicate/, '(doublon) ');
    await expectSqlError(ins({ open_prices_id: null }), /price_observations_kind_shape/, '(relevé sans id) ');
    await expectSqlError(ins({ open_prices_id: 43, weight: 5 }), /price_observations_kind_shape/, '(relevé pondéré) ');
    await expectSqlError(ins({ open_prices_id: 44, promo_milli: 2490 }), /check constraint/, '(promo ≥ prix) ');
    await ins({ kind: 'snapshot', open_prices_id: null, weight: 37, observed_from: '2026-01-02' });
    await expectSqlError(
      ins({ kind: 'snapshot', open_prices_id: null, weight: 2 }),
      /price_observations_snapshot_idx|duplicate/,
      '(deux socles) ',
    );
    // Purge du produit : relevés supprimés en cascade.
    await db.query(`delete from public.products where id = 'prd_zz_obs'`);
    assert.equal(await count(`select count(*) from public.price_observations where product_id = 'prd_zz_obs'`), 0);
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
  await ensureFixture();
  const u = await createUser('dana@example.com');
  await db.query(
    `insert into public.notification_queue (user_id, kind, title, body, status, created_at)
     values ($1, 'order_reminder', 't', 'b', 'sent', now() - interval '40 days'),
            ($1, 'order_reminder', 't', 'b', 'pending', now() - interval '40 days')`,
    [u],
  );
  await db.query(
    `insert into public.price_observations (product_id, chain, kind, open_prices_id, regular_milli, observed_on)
     values ($1, 'leclerc', 'observation', 900001, 1990, current_date - 420),
            ($1, 'leclerc', 'observation', 900002, 1990, current_date - 30)`,
    [FIXTURE.productId],
  );
  await asUser(u, () => expectSqlError(db.query('select public.run_maintenance()'), /permission denied/));
  const r = await asService(() => one('select public.run_maintenance() as r'));
  assert.equal(r.r.notification_queue, 1);
  assert.equal(r.r.price_observations, 1, 'relevé de plus de 400 jours purgé');
  assert.equal(await count(`select count(*) from public.notification_queue where user_id = $1`, [u]), 1);
  assert.equal(await count(`select count(*) from public.price_observations where open_prices_id = 900002`), 1);
  await db.query(`delete from public.price_observations where open_prices_id = 900002`);
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
