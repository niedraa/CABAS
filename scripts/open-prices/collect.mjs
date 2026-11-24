/**
 * Collecte de vrais produits et de vrais prix (Open Prices, ODbL) pour chaque
 * ingrédient Cabas. Sortie : collected.json
 * Usage : NODE_USE_ENV_PROXY=1 node collect.mjs <ingredients.json> <out.json>
 */
import fs from 'node:fs';
const [ingFile, outFile] = process.argv.slice(2);
const ingredients = JSON.parse(fs.readFileSync(ingFile, 'utf8'));
const UA = 'Cabas-catalog-builder/1.0 (prix ouverts)';
const API = 'https://prices.openfoodfacts.org/api/v1';
const SINCE = '2025-11-01';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path, params) {
  const url = `${API}${path}?${new URLSearchParams(params)}`;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return r.json();
      await sleep(3000 * (i + 1));
    } catch { await sleep(3000 * (i + 1)); }
  }
  return { items: [] };
}
// Mots-clés de recherche (nom de produit) et exclusions par ingrédient.
const KW = JSON.parse(fs.readFileSync(new URL('./keywords.json', import.meta.url), 'utf8'));
const fold = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
for (const ing of ingredients) {
  if (out[ing.id] || ing.id === 'eau') continue;
  const spec = KW[ing.id] ?? { q: [fold(ing.name)] };
  const products = new Map();
  for (const q of spec.q) {
    const d = await get('/products', { product_name__like: q, price_count__gte: '2', order_by: '-price_count', size: '40' });
    for (const p of d.items ?? []) {
      const name = fold(p.product_name);
      if (!name || !p.code || !/^\d{8,14}$/.test(p.code)) continue;
      if (!(spec.must ?? [fold(q).split(' ')[0]]).every((m) => name.includes(m))) continue;
      if ((spec.not ?? []).some((n) => name.includes(n))) continue;
      products.set(p.code, { code: p.code, name: p.product_name, brands: p.brands, qty: p.product_quantity, unit: p.product_quantity_unit, nutri: p.nutriscore_grade, priceCount: p.price_count });
    }
    await sleep(400);
  }
  const codes = [...products.keys()].slice(0, 30);
  const prices = [];
  for (let k = 0; k < codes.length; k += 15) {
    for (const cc of ['FR', 'ES']) {
      const d = await get('/prices', { product_code__in: codes.slice(k, k + 15).join(','), location__osm_address_country_code: cc, date__gte: SINCE, currency: 'EUR', order_by: '-date', size: '100' });
      for (const x of d.items ?? []) prices.push({ code: x.product_code, price: x.price, per: x.price_per, disc: x.price_is_discounted, without: x.price_without_discount, date: x.date, cc, osm_name: x.location?.osm_name, osm_brand: x.location?.osm_brand, city: x.location?.osm_address_city });
      await sleep(400);
    }
  }
  out[ing.id] = { products: [...products.values()], prices };
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(ing.id, products.size, 'produits', prices.length, 'prix');
}
