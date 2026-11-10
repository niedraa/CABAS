#!/usr/bin/env node
/**
 * Génère supabase/seed.sql à partir du catalogue de démonstration (src/data).
 *
 * Contenu : CATALOGUE UNIQUEMENT (ingrédients, recettes + lignes d'ingrédients,
 * magasins, produits, prix). Aucune donnée utilisateur.
 *
 * Les fichiers de données n'importent que des TYPES : Node ≥ 22.18 les charge
 * directement (type stripping natif). Sur une version plus ancienne :
 * `node --experimental-strip-types scripts/generate-seed.mjs`.
 *
 * Le SQL produit est idempotent (upserts) : `supabase db reset` le rejoue, et
 * on peut aussi l'appliquer sur une base existante pour mettre le catalogue à
 * jour.
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

/** INSERT multi-lignes par paquets, avec clause ON CONFLICT. */
function insertStatements(table, columns, rows, conflict) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    out.push(
      `insert into public.${table} (${columns.join(', ')}) values\n` +
        chunk.map((r) => `  (${r.join(', ')})`).join(',\n') +
        `\n${conflict};\n`,
    );
  }
  return out.join('\n');
}

/** `on conflict (keys) do update set col = excluded.col, …` */
function upsertClause(keys, columns) {
  const updates = columns.filter((c) => !keys.includes(c)).map((c) => `${c} = excluded.${c}`);
  return `on conflict (${keys.join(', ')}) do update set\n  ${updates.join(',\n  ')}`;
}

// ─── Chargement des données ──────────────────────────────────────────────────

async function loadData() {
  const load = (name) => import(pathToFileURL(join(ROOT, 'src', 'data', `${name}.ts`)).href);
  const [ing, rec, sto, pro, pri] = await Promise.all(
    ['ingredients', 'recipes', 'stores', 'products', 'prices'].map(load),
  );
  return {
    ingredients: ing.ingredients,
    recipes: rec.recipes,
    stores: sto.stores,
    products: pro.products,
    prices: pri.prices,
  };
}

// ─── Génération ──────────────────────────────────────────────────────────────

export function buildSeedSql(data) {
  const parts = [];
  parts.push(
    [
      '-- GENERATED — do not edit.',
      '-- Catalogue de démonstration Cabas, généré depuis src/data par scripts/generate-seed.mjs',
      '-- (npm run seed:generate). Idempotent : upserts uniquement, aucune donnée utilisateur.',
      `-- ${data.ingredients.length} ingrédients · ${data.recipes.length} recettes · ${data.stores.length} magasins · ` +
        `${data.products.length} produits · ${data.prices.length} prix`,
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
      'ingredients',
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
      'recipes',
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

  // Lignes d'ingrédients : on remplace intégralement celles des recettes du seed.
  const riCols = ['recipe_id', 'position', 'ingredient_id', 'quantity', 'unit', 'optional', 'note'];
  parts.push('-- ─── Ingrédients des recettes ───\n');
  parts.push(
    `delete from public.recipe_ingredients where recipe_id in (${data.recipes.map((r) => sqlValue(r.id)).join(', ')});\n`,
  );
  parts.push(
    insertStatements(
      'recipe_ingredients',
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
    'id', 'chain', 'name', 'city', 'drive_fee_cents', 'delivery_fee_cents', 'min_order_cents', 'search_url_template', 'drive_url',
  ];
  parts.push('-- ─── Magasins ───\n');
  parts.push(
    insertStatements(
      'stores',
      stoCols,
      data.stores.map((s) => [
        sqlValue(s.id), `${sqlValue(s.chain)}::public.store_chain`, sqlValue(s.name), sqlValue(s.city),
        sqlValue(s.driveFeeCents), sqlValue(s.deliveryFeeCents), sqlValue(s.minOrderCents),
        sqlValue(s.searchUrlTemplate), sqlValue(s.driveUrl),
      ]),
      upsertClause(['id'], stoCols),
    ),
  );

  // Produits
  const proCols = [
    'id', 'ean', 'name', 'brand', 'is_store_brand', 'store_chain', 'ingredient_id', 'pack_size', 'pack_unit',
    'nutri_score', 'allergens', 'organic',
  ];
  parts.push('-- ─── Produits ───\n');
  parts.push(
    insertStatements(
      'products',
      proCols,
      data.products.map((p) => [
        sqlValue(p.id), sqlValue(p.ean), sqlValue(p.name), sqlValue(p.brand ?? ''), sqlValue(!!p.isStoreBrand),
        p.storeChain ? `${sqlValue(p.storeChain)}::public.store_chain` : 'null', sqlValue(p.ingredientId),
        sqlValue(p.packSize), `${sqlValue(p.packUnit)}::public.base_unit`,
        p.nutriScore ? `${sqlValue(p.nutriScore)}::public.nutri_score` : 'null',
        sqlArray(p.allergens, 'public.allergen'), sqlValue(!!p.organic),
      ]),
      upsertClause(['id'], proCols),
    ),
  );

  // Prix courants (le trigger alimente price_history).
  const priCols = [
    'product_id', 'store_id', 'price_cents', 'promo_price_cents', 'promo_label', 'promo_until', 'source', 'updated_at',
  ];
  parts.push('-- ─── Prix (source « demo ») ───\n');
  parts.push(
    insertStatements(
      'prices',
      priCols,
      data.prices.map((p) => [
        sqlValue(p.productId), sqlValue(p.storeId), sqlValue(p.priceCents), sqlValue(p.promoPriceCents),
        sqlValue(p.promoLabel), p.promoUntil ? `${sqlValue(p.promoUntil.slice(0, 10))}::date` : 'null',
        `${sqlValue(p.source)}::public.price_source`, `${sqlValue(p.updatedAt)}::timestamptz`,
      ]),
      upsertClause(['product_id', 'store_id'], priCols),
    ),
  );

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
      `${data.products.length} produits, ${data.prices.length} prix (${(sql.length / 1024).toFixed(0)} Ko)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
