#!/usr/bin/env node
/**
 * Génère supabase/seed.sql à partir du catalogue (src/data).
 *
 * Contenu : CATALOGUE UNIQUEMENT (ingrédients, recettes + lignes d'ingrédients,
 * magasins, produits, prix, description de l'instantané `catalog_meta`).
 * Aucune donnée utilisateur.
 *
 * Les fichiers de données n'importent que des TYPES : Node ≥ 22.18 les charge
 * directement (type stripping natif). Sur une version plus ancienne :
 * `node --experimental-strip-types scripts/generate-seed.mjs`.
 *
 * Le SQL produit est idempotent et s'applique aussi sur une base EXISTANTE
 * (mise à jour du catalogue), en une seule transaction :
 *  - upserts (ingrédients, recettes, magasins, produits) ;
 *  - recettes absentes → dépubliées, magasins absents → désactivés (jamais
 *    supprimés : plannings et commandes les référencent) ;
 *  - produits absents → SUPPRIMÉS avec leurs prix, leurs relevés et leur
 *    historique (garde-fou append-only levé dans la transaction) ; les alertes
 *    `price_watches` qui les visent partent en cascade. Un produit dont l'id est
 *    conservé mais dont l'identité change (autre code-barres / catégorie vrac)
 *    perd aussi ses prix, relevés et alertes (prix de référence d'un autre produit) ;
 *  - prix : upsert NON RÉGRESSIF — une ligne existante n'est écrasée que si
 *    elle est 'demo' / 'estimate', ou si le prix entrant est un relevé au moins
 *    aussi récent ; une estimation ne remplace un relevé réel que s'il est sorti
 *    de la fenêtre de l'instantané ; les prix 'demo' / 'estimate' absents du
 *    seed sont supprimés, les relevés réels absents conservés ;
 *  - instantané (`meta`) : `catalog_meta`, socles de la collecte
 *    (`price_observations` kind 'snapshot'), relevés déjà inclus dans
 *    l'instantané purgés, curseur de collecte avancé à la date de l'instantané.
 *    Sans `meta` (catalogue fictif), `catalog_meta` est vidée.
 *
 * Usage : `node scripts/generate-seed.mjs` (ou `npm run seed:generate`)
 *         `node scripts/generate-seed.mjs --check` : code 1 si seed.sql est périmé.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'supabase', 'seed.sql');
const CHECK_ONLY = process.argv.includes('--check');
const CHUNK = 200;

// ─── Échappement SQL ─────────────────────────────────────────────────────────

/** Littéral texte SQL (apostrophes doublées, NUL interdit). */
export function sqlString(value) {
  const s = String(value);
  if (s.includes('\u0000')) throw new Error(`Caractère NUL interdit dans une chaîne SQL : ${JSON.stringify(s)}`);
  return `'${s.replace(/'/g, "''")}'`;
}

/** Valeur SQL générique : null, booléen, nombre fini, texte. */
export function sqlValue(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Nombre non fini : ${value}`);
    return String(value);
  }
  return sqlString(value);
}

/** Valeur typée (`'x'::public.aisle`) ou `null`. */
export function sqlTyped(value, type) {
  return value === null || value === undefined || value === '' ? 'null' : `${sqlValue(value)}::${type}`;
}

/** Tableau SQL typé : `array['a','b']::public.allergen[]` ou `'{}'::type[]`. */
export function sqlArray(values, type) {
  const list = values ?? [];
  if (list.length === 0) return `'{}'::${type}[]`;
  return `array[${list.map(sqlValue).join(', ')}]::${type}[]`;
}

/** JSON → jsonb. */
export function sqlJson(value) {
  return `${sqlString(JSON.stringify(value ?? null))}::jsonb`;
}

/** INSERT multi-lignes par paquets, avec clause ON CONFLICT (facultative). */
function insertStatements(table, columns, rows, conflict = '') {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    out.push(
      `insert into ${table} (${columns.join(', ')}) values\n` +
        chunk.map((r) => `  (${r.join(', ')})`).join(',\n') +
        (conflict ? `\n${conflict}` : '') +
        ';\n',
    );
  }
  return out.join('\n');
}

/** `on conflict (keys) do update set col = excluded.col, …` */
function upsertClause(keys, columns) {
  const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  return `on conflict (${keys.join(', ')}) do update set\n  ${updates.join(',\n  ')}`;
}

/** Liste d'ids → `array[...]::text[]` (jamais vide : un tableau vide ne garde rien). */
function idArray(ids) {
  return sqlArray(ids, 'text');
}

// ─── Validation du catalogue (erreurs lisibles plutôt qu'une erreur SQL) ─────

const PRICE_SOURCES = new Set(['open_prices', 'partner', 'collect', 'estimate', 'demo']);
const REAL_SOURCES = new Set(['open_prices', 'partner', 'collect']);

/** Enseignes d'une MDD : `storeChains` (référence) ou l'ancien `storeChain`. */
export function productChains(p) {
  if (Array.isArray(p.storeChains) && p.storeChains.length > 0) return [...new Set(p.storeChains)];
  return p.storeChain ? [p.storeChain] : [];
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) throw new Error(`${label} en double : ${k}`);
    seen.add(k);
  }
}

/** Vérifie la cohérence du catalogue ; lève une erreur explicite sinon. */
export function validateCatalog(data) {
  assertUnique(data.ingredients, (i) => i.id, 'Ingrédient');
  assertUnique(data.recipes, (r) => r.id, 'Recette');
  assertUnique(data.stores, (s) => s.id, 'Magasin');
  assertUnique(data.products, (p) => p.id, 'Produit');
  assertUnique(data.products.filter((p) => p.ean), (p) => p.ean, 'Code-barres');
  assertUnique(data.prices, (p) => `${p.productId}|${p.storeId}`, 'Prix');
  const ingredientIds = new Set(data.ingredients.map((i) => i.id));
  const storesById = new Map(data.stores.map((s) => [s.id, s]));
  const productsById = new Map(data.products.map((p) => [p.id, p]));
  for (const p of data.products) {
    if (!ingredientIds.has(p.ingredientId)) throw new Error(`Produit ${p.id} : ingrédient inconnu ${p.ingredientId}`);
    if (!p.ean === !p.offCategoryTag) {
      throw new Error(`Produit ${p.id} : il faut un code-barres OU une catégorie vrac (exactement un des deux)`);
    }
    if (!!p.isStoreBrand !== productChains(p).length > 0) {
      throw new Error(`Produit ${p.id} : une MDD a au moins une enseigne, une marque nationale aucune`);
    }
  }
  for (const pr of data.prices) {
    const product = productsById.get(pr.productId);
    const store = storesById.get(pr.storeId);
    if (!product) throw new Error(`Prix ${pr.productId}|${pr.storeId} : produit inconnu`);
    if (!store) throw new Error(`Prix ${pr.productId}|${pr.storeId} : magasin inconnu`);
    if (!PRICE_SOURCES.has(pr.source)) throw new Error(`Prix ${pr.productId}|${pr.storeId} : source inconnue ${pr.source}`);
    if (product.isStoreBrand && !productChains(product).includes(store.chain)) {
      throw new Error(`Prix ${pr.productId}|${pr.storeId} : MDD hors de ses enseignes (${productChains(product).join(', ')})`);
    }
  }
  if (data.meta) {
    for (const k of ['snapshotAt', 'pricesFrom', 'pricesTo', 'chainIndex', 'sources']) {
      if (data.meta[k] === undefined) throw new Error(`catalogMeta : champ ${k} manquant`);
    }
  }
}

// ─── Chargement des données ──────────────────────────────────────────────────

async function loadData() {
  const load = (name) => import(pathToFileURL(join(ROOT, 'src', 'data', `${name}.ts`)).href);
  const [ing, rec, sto, pro, pri] = await Promise.all(
    ['ingredients', 'recipes', 'stores', 'products', 'prices'].map(load),
  );
  // Description de l'instantané (générée en phase d'import) : facultative.
  let meta = null;
  if (existsSync(join(ROOT, 'src', 'data', 'meta.ts'))) {
    const m = await load('meta');
    meta = m.catalogMeta ?? m.meta ?? null;
  }
  return {
    ingredients: ing.ingredients,
    recipes: rec.recipes,
    stores: sto.stores,
    products: pro.products,
    prices: pri.prices,
    meta,
  };
}

// ─── Génération ──────────────────────────────────────────────────────────────

/** Jour `YYYY-MM-DD` d'une date ISO (ou d'un jour). */
function day(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function buildSeedSql(data) {
  validateCatalog(data);
  const meta = data.meta ?? null;
  const parts = [];
  const observed = data.prices.filter((p) => p.source === 'open_prices').length;
  const estimated = data.prices.filter((p) => p.source === 'estimate').length;
  parts.push(
    [
      '-- GENERATED — do not edit.',
      '-- Catalogue Cabas, généré depuis src/data par scripts/generate-seed.mjs (npm run seed:generate).',
      '-- Idempotent, en une transaction, applicable sur une base existante ; aucune donnée utilisateur.',
      `-- ${data.ingredients.length} ingrédients · ${data.recipes.length} recettes · ${data.stores.length} magasins · ` +
        `${data.products.length} produits · ${data.prices.length} prix (${observed} relevés, ${estimated} estimés)`,
      meta
        ? `-- Instantané de données ouvertes du ${meta.snapshotAt} (relevés du ${meta.pricesFrom} au ${meta.pricesTo}) — ODbL.`
        : '-- Sans instantané de données ouvertes (catalogue de démonstration).',
      '',
      'begin;',
      '',
    ].join('\n'),
  );

  // Ingrédients
  const ingCols = [
    'id', 'name', 'name_plural', 'aisle', 'allergens', 'is_meat', 'is_pork', 'is_fish', 'is_seafood',
    'is_animal_product', 'is_alcohol', 'grams_per_piece', 'density', 'base_unit', 'is_pantry_staple', 'season_months',
  ];
  parts.push('-- ─── Ingrédients ───\n');
  parts.push(
    insertStatements(
      'public.ingredients',
      ingCols,
      data.ingredients.map((i) => [
        sqlValue(i.id), sqlValue(i.name), sqlValue(i.namePlural), `${sqlValue(i.aisle)}::public.aisle`,
        sqlArray(i.allergens, 'public.allergen'), sqlValue(!!i.isMeat), sqlValue(!!i.isPork), sqlValue(!!i.isFish),
        sqlValue(!!i.isSeafood), sqlValue(!!i.isAnimalProduct), sqlValue(!!i.isAlcohol), sqlValue(i.gramsPerPiece),
        sqlValue(i.density), `${sqlValue(i.baseUnit)}::public.base_unit`, sqlValue(!!i.isPantryStaple),
        sqlArray(i.seasonMonths, 'smallint'),
      ]),
      upsertClause(['id'], ingCols),
    ),
  );

  // Recettes
  const recCols = [
    'id', 'title', 'description', 'emoji', 'color', 'image_url', 'cuisine', 'tags', 'meal_types', 'servings',
    'prep_time_min', 'cook_time_min', 'difficulty', 'equipment', 'steps', 'kcal_per_serving', 'cost_level', 'is_published',
  ];
  parts.push('-- ─── Recettes ───\n');
  parts.push(
    insertStatements(
      'public.recipes',
      recCols,
      data.recipes.map((r) => [
        sqlValue(r.id), sqlValue(r.title), sqlValue(r.description ?? ''), sqlValue(r.emoji), sqlValue(r.color),
        sqlValue(r.imageUrl), `${sqlValue(r.cuisine)}::public.cuisine`, sqlArray(r.tags, 'text'),
        sqlArray(r.mealTypes, 'public.meal_type'), sqlValue(r.servings), sqlValue(r.prepTimeMin), sqlValue(r.cookTimeMin),
        sqlValue(r.difficulty), sqlArray(r.equipment, 'public.equipment'),
        sqlJson(r.steps.map((s) => (s.timerMin === undefined ? { text: s.text } : { text: s.text, timerMin: s.timerMin }))),
        sqlValue(r.kcalPerServing), sqlValue(r.costLevel), 'true',
      ]),
      upsertClause(['id'], recCols),
    ),
  );
  // Recette retirée du catalogue : dépubliée (des plannings la référencent).
  parts.push(
    `update public.recipes set is_published = false\n where is_published and not (id = any (${idArray(data.recipes.map((r) => r.id))}));\n`,
  );

  // Lignes d'ingrédients : on remplace intégralement celles des recettes du seed.
  const riCols = ['recipe_id', 'position', 'ingredient_id', 'quantity', 'unit', 'optional', 'note'];
  parts.push('-- ─── Ingrédients des recettes ───\n');
  parts.push(`delete from public.recipe_ingredients where recipe_id = any (${idArray(data.recipes.map((r) => r.id))});\n`);
  parts.push(
    insertStatements(
      'public.recipe_ingredients',
      riCols,
      data.recipes.flatMap((r) =>
        r.ingredients.map((ri, position) => [
          sqlValue(r.id), sqlValue(position), sqlValue(ri.ingredientId), sqlValue(ri.quantity),
          `${sqlValue(ri.unit)}::public.unit`, sqlValue(!!ri.optional), sqlValue(ri.note),
        ]),
      ),
      upsertClause(['recipe_id', 'position'], riCols),
    ),
  );

  // Magasins
  const stoCols = [
    'id', 'chain', 'name', 'city', 'pickup', 'drive_fee_cents', 'delivery_fee_cents', 'min_order_cents',
    'search_url_template', 'drive_url', 'is_active',
  ];
  parts.push('-- ─── Magasins ───\n');
  parts.push(
    insertStatements(
      'public.stores',
      stoCols,
      data.stores.map((s) => [
        sqlValue(s.id), `${sqlValue(s.chain)}::public.store_chain`, sqlValue(s.name), sqlValue(s.city),
        sqlValue(s.pickup ?? 'drive'), sqlValue(s.driveFeeCents), sqlValue(s.deliveryFeeCents ?? null),
        sqlValue(s.minOrderCents), sqlValue(s.searchUrlTemplate), sqlValue(s.driveUrl), 'true',
      ]),
      upsertClause(['id'], stoCols),
    ),
  );
  // Magasin retiré : désactivé (order_handoffs.store_id le référence, on delete restrict).
  parts.push(
    `update public.stores set is_active = false\n where is_active and not (id = any (${idArray(data.stores.map((s) => s.id))}));\n`,
  );

  // Produits
  parts.push('-- ─── Produits ───\n');
  parts.push(
    'create temporary table _seed_products (id text primary key, ean text, off_category_tag text) on commit drop;\n',
  );
  parts.push(
    insertStatements(
      '_seed_products',
      ['id', 'ean', 'off_category_tag'],
      data.products.map((p) => [sqlValue(p.id), sqlValue(p.ean || null), sqlValue(p.offCategoryTag || null)]),
    ),
  );
  parts.push(
    [
      '-- Produits retirés, ou dont l\'identité change (autre code-barres / catégorie) :',
      '-- prix, relevés, alertes et historique supprimés (historique : garde-fou levé',
      '-- localement, comme dans run_maintenance).',
      "select set_config('cabas.allow_history_prune', 'on', true);",
      'delete from public.products p',
      ' where not exists (select 1 from _seed_products s where s.id = p.id);',
      'delete from public.prices pr',
      '  using public.products p, _seed_products s',
      ' where pr.product_id = p.id and s.id = p.id',
      '   and (s.ean is distinct from p.ean or s.off_category_tag is distinct from p.off_category_tag);',
      'delete from public.price_observations o',
      '  using public.products p, _seed_products s',
      ' where o.product_id = p.id and s.id = p.id',
      '   and (s.ean is distinct from p.ean or s.off_category_tag is distinct from p.off_category_tag);',
      'delete from public.price_watches w',
      '  using public.products p, _seed_products s',
      ' where w.product_id = p.id and s.id = p.id',
      '   and (s.ean is distinct from p.ean or s.off_category_tag is distinct from p.off_category_tag);',
      "select set_config('cabas.allow_history_prune', 'off', true);",
      '',
    ].join('\n'),
  );
  const proCols = [
    'id', 'ean', 'off_category_tag', 'name', 'brand', 'is_store_brand', 'store_chains', 'ingredient_id', 'pack_size',
    'pack_unit', 'nutri_score', 'allergens', 'organic',
  ];
  parts.push(
    insertStatements(
      'public.products',
      proCols,
      data.products.map((p) => [
        sqlValue(p.id), sqlValue(p.ean || null), sqlValue(p.offCategoryTag || null), sqlValue(p.name),
        sqlValue(p.brand ?? ''), sqlValue(!!p.isStoreBrand), sqlArray(productChains(p), 'public.store_chain'),
        sqlValue(p.ingredientId), sqlValue(p.packSize), `${sqlValue(p.packUnit)}::public.base_unit`,
        sqlTyped(p.nutriScore, 'public.nutri_score'), sqlArray(p.allergens, 'public.allergen'), sqlValue(!!p.organic),
      ]),
      upsertClause(['id'], proCols),
    ),
  );

  // Prix courants (le trigger alimente price_history).
  const priCols = [
    'product_id', 'store_id', 'price_cents', 'promo_price_cents', 'promo_label', 'promo_until', 'source', 'updated_at',
    'observation_count', 'observed_from', 'estimate_method', 'estimate_basis_count',
  ];
  parts.push('-- ─── Prix ───\n');
  parts.push(
    [
      'create temporary table _seed_prices (',
      '  product_id text not null, store_id text not null, price_cents integer not null,',
      '  promo_price_cents integer, promo_label text, promo_until date, source public.price_source not null,',
      '  updated_at timestamptz not null, observation_count integer, observed_from date,',
      '  estimate_method public.estimate_method, estimate_basis_count integer,',
      '  primary key (product_id, store_id)',
      ') on commit drop;',
      '',
    ].join('\n'),
  );
  parts.push(
    insertStatements(
      '_seed_prices',
      priCols,
      data.prices.map((p) => [
        sqlValue(p.productId), sqlValue(p.storeId), sqlValue(p.priceCents), sqlValue(p.promoPriceCents),
        sqlValue(p.promoLabel), sqlTyped(day(p.promoUntil), 'date'), `${sqlValue(p.source)}::public.price_source`,
        `${sqlValue(p.updatedAt)}::timestamptz`, sqlValue(p.observationCount), sqlTyped(day(p.observedFrom), 'date'),
        sqlTyped(p.estimateMethod, 'public.estimate_method'), sqlValue(p.estimateBasisCount),
      ]),
    ),
  );
  const real = [...REAL_SOURCES].map((s) => `'${s}'`).join(', ');
  // Quand la ligne existante peut-elle être écrasée ?
  const overwrite = [
    // prix fictif ou estimation : toujours ;
    "public.prices.source in ('demo', 'estimate')",
    // relevé réel : seulement par un relevé au moins aussi récent ;
    `(excluded.source in (${real}) and excluded.updated_at >= public.prices.updated_at)`,
  ];
  // relevé sorti de la fenêtre de l'instantané : une estimation à jour peut le remplacer.
  if (meta && day(meta.pricesFrom)) {
    overwrite.push(`(excluded.source = 'estimate' and public.prices.updated_at < ${sqlValue(day(meta.pricesFrom))}::date)`);
  }
  parts.push(
    [
      '-- Prix fictifs ou estimés que le nouveau catalogue ne contient plus.',
      'delete from public.prices pr',
      " where pr.source in ('demo', 'estimate')",
      '   and not exists (select 1 from _seed_prices s where s.product_id = pr.product_id and s.store_id = pr.store_id);',
      '',
      '-- Upsert NON RÉGRESSIF : un relevé réel plus récent (collect-prices) est conservé.',
      `insert into public.prices (${priCols.join(', ')})`,
      `select ${priCols.join(', ')} from _seed_prices`,
      'on conflict (product_id, store_id) do update set',
      `  ${priCols.slice(2).map((c) => `${c} = excluded.${c}`).join(',\n  ')}`,
      ` where ${overwrite.join('\n    or ')};`,
      '',
    ].join('\n'),
  );

  // Instantané : description, socles de la collecte, curseur.
  parts.push('-- ─── Instantané de données ouvertes ───\n');
  parts.push(
    [
      "delete from public.price_observations where kind = 'snapshot';",
      '-- Socle : la médiane de l\'instantané, pesant le nombre de relevés qu\'elle résume,',
      '-- dans l\'unité des relevés (prix du conditionnement, ou au kilo / à la pièce pour le vrac).',
      'insert into public.price_observations',
      '  (product_id, chain, kind, weight, regular_milli, price_per, proximity, observed_on, observed_from)',
      "select s.product_id, st.chain, 'snapshot', s.observation_count,",
      '       greatest(1, round(s.price_cents * 10.0 / case',
      "         when p.off_category_tag is null then 1",
      "         when p.pack_unit = 'g' then p.pack_size / 1000.0",
      "         when p.pack_unit = 'piece' then p.pack_size",
      '         else 1 end))::integer,',
      "       case when p.off_category_tag is null then null when p.pack_unit = 'g' then 'KILOGRAM'",
      "            when p.pack_unit = 'piece' then 'UNIT' end,",
      "       false, (s.updated_at at time zone 'UTC')::date,",
      "       least(coalesce(s.observed_from, (s.updated_at at time zone 'UTC')::date), (s.updated_at at time zone 'UTC')::date)",
      '  from _seed_prices s',
      '  join public.stores st on st.id = s.store_id',
      '  join public.products p on p.id = s.product_id',
      " where s.source = 'open_prices' and s.observation_count >= 1",
      "   and (p.off_category_tag is null or p.pack_unit in ('g', 'piece'))",
      ' order by s.product_id, s.store_id',
      'on conflict do nothing;',
      '',
    ].join('\n'),
  );
  if (meta) {
    const snapshotAt = `${sqlValue(meta.snapshotAt)}::timestamptz`;
    parts.push(
      [
        `insert into public.catalog_meta (id, meta) values (true, ${sqlJson(meta)})`,
        'on conflict (id) do update set meta = excluded.meta;',
        '-- Relevés collectés AVANT l\'instantané : déjà inclus dans ses médianes.',
        `delete from public.price_observations where kind = 'observation' and source_created_at < ${snapshotAt};`,
        `insert into public.price_collection_state (id, created_cursor) values (true, ${snapshotAt})`,
        'on conflict (id) do update set created_cursor =',
        '  greatest(public.price_collection_state.created_cursor, excluded.created_cursor);',
        '',
      ].join('\n'),
    );
  } else {
    parts.push('delete from public.catalog_meta;\n');
  }

  parts.push('commit;\n');
  return parts.join('\n');
}

async function main() {
  const data = await loadData();
  const sql = buildSeedSql(data);
  if (CHECK_ONLY) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current !== sql) {
      console.error('✗ supabase/seed.sql est périmé. Lance : npm run seed:generate');
      process.exit(1);
    }
    console.log('✓ supabase/seed.sql à jour.');
    return;
  }
  writeFileSync(OUT, sql);
  console.log(
    `seed.sql : ${data.ingredients.length} ingrédients, ${data.recipes.length} recettes, ${data.stores.length} magasins, ` +
      `${data.products.length} produits, ${data.prices.length} prix${data.meta ? ` (instantané du ${data.meta.snapshotAt})` : ''} ` +
      `(${(sql.length / 1024).toFixed(0)} Ko)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
