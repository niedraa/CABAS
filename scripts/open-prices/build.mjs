/**
 * collected.json (Open Prices) → src/data/openPrices.ts (produits réels + prix relevés).
 * Usage : node build.mjs <collected.json> <repo>
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [inFile, repo] = process.argv.slice(2);
const imp = (p) => import(pathToFileURL(`${repo}/${p}`).href);
const { ingredients } = await imp('src/data/ingredients.ts');
const { stores } = await imp('src/data/stores.ts');
const { products: demoProducts } = await imp('src/data/products.ts');
const { prices: demoPrices } = await imp('src/data/prices.ts');
const data = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const fold = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ALLERGENS = ['gluten','crustaces','oeufs','poissons','arachides','soja','lait','fruits_a_coque','celeri','moutarde','sesame','sulfites','lupin','mollusques'];

const CHAINS = [
  [/\bleclerc\b/, 'leclerc'], [/\bcarrefour\b/, 'carrefour'], [/\bauchan\b/, 'auchan'], [/\bintermarche\b/, 'intermarche'],
  [/\blidl\b/, 'lidl'], [/\bmonoprix\b|\bmonop\b/, 'monoprix'], [/\bsuper u\b|\bhyper u\b|\bu express\b|\bmagasins u\b|\bsysteme u\b/, 'superu'],
  [/\bmercadona\b/, 'mercadona'], [/\bdia\b/, 'dia'], [/\balcampo\b/, 'alcampo'], [/\beroski\b/, 'eroski'], [/\bconsum\b/, 'consum'],
];
function chainOf(p) {
  for (const f of [p.osm_brand, p.osm_name]) {
    const t = ` ${fold(f).replace(/[^a-z0-9]+/g, ' ')} `;
    for (const [re, c] of CHAINS) if (re.test(t)) return c;
  }
  return null;
}
// Marques distributeur (MDD) par enseigne.
const MDD = {
  leclerc: ['marque repere', 'eco+', '€co+', 'bio village', 'nos regions ont du talent', 'pole sud', 'chabrior leclerc', 'tables du monde', 'e.leclerc', 'leclerc'],
  carrefour: ['carrefour'],
  auchan: ['auchan', 'pouce', 'mmm!'],
  intermarche: ['intermarche', 'paturages', 'chabrior', 'top budget', 'saint eloi', 'monique ranou', 'jean roze', 'capitaine cook', 'fiorini', 'paquito', 'claude leger', 'adelie', 'elodie', 'look', 'regain', 'ranou'],
  lidl: ['lidl', 'milbona', 'combino', 'baresa', 'freshona', 'golden sun', 'vitasia', 'kania', 'primadonna', 'belbake', 'alesto', 'nixe', 'vemondo', 'chef select', 'deluxe', 'pilos', 'solevita', 'crownfield', 'envia', 'oaklands', 'sondey', 'snack day', 'italiamo', 'trattoria alfredo', 'el tequito', 'fin carre', 'cien', 'perlenbacher', 'ocean sea', 'rivercote', 'eridanous', 'bellarom', 'favorina'],
  superu: ['u', 'u bio', 'bien vu', 'u saveurs', 'u tout petits', 'systeme u'],
  monoprix: ['monoprix', 'monop', 'monoprix gourmet', 'monoprix bio'],
  mercadona: ['hacendado'],
  dia: ['dia', 'dia%'],
  alcampo: ['alcampo', 'auchan'],
  eroski: ['eroski', 'eroski basic'],
  consum: ['consum'],
};
function mddChain(brands) {
  const list = (brands ?? '').split(',').map((b) => fold(b).trim()).filter(Boolean);
  for (const [chain, names] of Object.entries(MDD)) if (list.some((b) => names.includes(b))) return chain;
  return null;
}
const ingById = Object.fromEntries(ingredients.map((i) => [i.id, i]));
// Filtre strict : le nom du produit commence par l'ingrédient (≤ 2 mots avant) et n'est pas un plat préparé.
const KW = JSON.parse(fs.readFileSync(new URL('./keywords.json', import.meta.url), 'utf8'));
const DISH = /\b(cuisine|cuisinee?s?|prepare|poelee|gratin|soupe|veloute|compote|jus|chips|yaourt au|au yaourt|au skyr|dessert|pizza|tarte|quiche|boisson|kombucha|houmous|plat|recette|bebe|smoothie|nectar|confiture|sorbet|glace|biscuit|cake|sandwich|salade de|taboule|coleslaw|gazpacho|tartinable|aperitif|vegetal(e|es)?|facon|saveur|gout|parfum|arome|sauce (?!soja)|puree|rissole(e|es)?|rapees?|parmentier|papillote|tarama|tramezzino|sables?|toast|madeleines?|onigiri|coffret|persillade|melange|caramel|falafels?|panes?|nuggets?|cordon|milanaise|normande|provencale|bourguignon et|et ses|aux? (pommes|legumes|herbes|ail|fromage|tomates?|champignons|epices|curry)|senza glutine|sans gluten|lyophilise|curry|catalane|oseille|ancienne|a la creme|ecrase|avec morceaux|sans sucres?|mangues?|poires?|hibiscus|sushi|compotees?|epices|marine|marinee?s?|grille|grilles|roties?|farcie?s?|gratine|en sauce| et | & |\+)\b/;
const OTHER_FOOD = /\b(pommes?|poires?|mangues?|peches?|framboises?|fraises?|abricots?|legumes|carottes?|courgettes?|fromages?|vache qui rit|jambon|riz|pates|quinoa|boulgour|lentilles|poulet|boeuf|thon|saumon|coupees|au piment|chataigne|tomates?|mexicaine|grecque|olives)\b/;
const PREFIX = /^((le|la|les|l'|l|mes|mon|ma|nos|de|du|des|lot|pack|gros|grosse|petits?|petites?|extra|maxi|bio|frais|fraiches?|jeunes|filet|barquette|sachet|boite|pot|brique|\d+[a-z]*|x\d+|x|tres|vrai|pur|pure|veritable|authentique|nouveau|nouvelle)\s+){0,3}/;
function isGoodName(ingId, name) {
  const n = fold(name).replace(/[^a-z0-9%'.+ -]+/g, ' ').replace(/\s+/g, ' ').trim();
  const head = KW[ingId]?.head;
  const rest = n.replace(PREFIX, '');
  const m = head ? new RegExp(`^(${head})`).exec(rest) : null;
  if (head && !m) return false;
  // Plat préparé / mélange : on regarde ce qui suit le nom de l'ingrédient.
  const tail = ` ${m ? rest.slice(m[0].length) : rest} `;
  if (DISH.test(tail)) return false;
  // Mélange avec un autre aliment (« Courgettes et La Vache qui rit », « Banane, Pomme »).
  if (/\s(et|&)\s|\+/.test(tail) || OTHER_FOOD.test(tail)) return false;
  return true;
}
// Prix de référence (démo) par unité de base : garde-fou contre les saisies aberrantes.
const refUnit = {};
for (const p of demoProducts) {
  if (p.isStoreBrand || p.organic) continue;
  const pr = demoPrices.filter((x) => x.productId === p.id);
  if (!pr.length) continue;
  refUnit[p.ingredientId] = pr.reduce((s, x) => s + x.priceCents, 0) / pr.length / p.packSize;
}
function packSizeOf(prod, ing) {
  const q = Number(prod.qty); const u = fold(prod.unit);
  const name = fold(prod.name);
  if (ing.baseUnit === 'piece') {
    const m = name.match(/(?:x|par|lot de|boite de|boîte de)\s?(\d{1,2})\b|\b(\d{1,2})\s?(?:oeufs|pieces|pcs|tortillas|wraps|pains|citrons|avocats)\b/);
    if (m) return Number(m[1] ?? m[2]);
    if (Number.isFinite(q) && q > 0 && (u === 'g' || u === 'kg') && ing.gramsPerPiece) return Math.max(1, Math.round((u === 'kg' ? q * 1000 : q) / ing.gramsPerPiece));
    return null;
  }
  if (!Number.isFinite(q) || q <= 0) return null;
  const toBase = { g: 1, kg: 1000, mg: 0.001, ml: 1, cl: 10, dl: 100, l: 1000 }[u];
  if (!toBase) return null;
  const isMass = ['g', 'kg', 'mg'].includes(u);
  if ((ing.baseUnit === 'g') === isMass) return q * toBase;
  return q * toBase * (isMass ? 1 / (ing.density ?? 1) : (ing.density ?? 1)); // conversion g↔ml
}
const storeFor = (chain, cc) => stores.find((s) => s.chain === chain && s.country === cc);
const products = []; const prices = []; const seen = new Set();
const stats = { ingredients: 0, products: 0, prices: 0, rejected: 0 };
for (const [ingId, { products: prods, prices: obs }] of Object.entries(data)) {
  const ing = ingById[ingId]; if (!ing) continue;
  const byCode = new Map(prods.filter((p) => isGoodName(ingId, p.name)).map((p) => [p.code, p]));
  const perProductStore = new Map(); // `${code}|${storeId}` → meilleur relevé (le plus récent)
  for (const o of obs) {
    const prod = byCode.get(o.code); if (!prod) continue;
    const chain = chainOf(o); if (!chain) continue;
    const store = storeFor(chain, o.cc); if (!store) continue;
    const mdd = mddChain(prod.brands);
    if (mdd && mdd !== chain && !(mdd === 'auchan' && chain === 'alcampo')) continue; // MDD vendue chez une autre enseigne : saisie douteuse
    const pack = packSizeOf(prod, ing); if (!pack) { stats.rejected++; continue; }
    let price = Number(o.price); if (!(price > 0)) continue;
    const per = (o.per ?? 'UNIT').toUpperCase();
    let factor = 1;
    if (per === 'KILOGRAM' || per === 'LITER') { if (ing.baseUnit === 'piece') { stats.rejected++; continue; } factor = pack / 1000; }
    const paid = Math.round(price * factor * 100);
    let regular = paid; let promo;
    const without = Number(o.without);
    if (o.disc && without > price) { regular = Math.round(without * factor * 100); promo = paid; }
    const unit = regular / pack; const ref = refUnit[ingId];
    if (ref && (unit < ref * 0.25 || unit > ref * 4)) { stats.rejected++; continue; }
    if (regular < 5 || regular > 30000) { stats.rejected++; continue; }
    const key = `${o.code}|${store.id}`;
    const prev = perProductStore.get(key);
    if (!prev || o.date > prev.date) perProductStore.set(key, { code: o.code, storeId: store.id, date: o.date, regular, promo, pack, mdd: mdd ?? null });
  }
  // Max 3 produits par (ingrédient, magasin) : les moins chers à l'unité.
  const byStore = new Map();
  for (const v of perProductStore.values()) { const l = byStore.get(v.storeId) ?? []; l.push(v); byStore.set(v.storeId, l); }
  let used = false;
  for (const [storeId, list] of byStore) {
    list.sort((a, b) => a.regular / a.pack - b.regular / b.pack);
    for (const v of list.slice(0, 3)) {
      const prod = byCode.get(v.code); const id = `prd_off_${v.code}`;
      if (!seen.has(id)) {
        if (products.some((p) => p.ean === v.code)) continue;
        seen.add(id);
        const brand = (prod.brands ?? '').split(',').map((b) => b.trim()).filter(Boolean)[0] ?? 'Sans marque';
        const p = { id, ean: v.code, name: prod.name.trim().replace(/\s+/g, ' ').slice(0, 90), brand: brand.slice(0, 40), isStoreBrand: !!v.mdd };
        if (v.mdd) p.storeChain = v.mdd === 'auchan' && storeId === 'alcampo' ? 'alcampo' : v.mdd;
        Object.assign(p, { ingredientId: ingId, packSize: Math.round(v.pack * 100) / 100, packUnit: ing.baseUnit });
        if (/^[a-e]$/i.test(prod.nutri ?? '')) p.nutriScore = prod.nutri.toUpperCase();
        p.allergens = [...ing.allergens].sort((a, b) => ALLERGENS.indexOf(a) - ALLERGENS.indexOf(b));
        if (/\bbio\b/.test(fold(prod.name))) p.organic = true;
        p.verified = true;
        products.push(p);
      }
      const product = products.find((p) => p.id === id);
      // Même produit rattaché à un autre ingrédient : un seul prix par (produit, magasin).
      if (product.ingredientId !== ingId || prices.some((x) => x.productId === id && x.storeId === storeId)) continue;
      if (product.isStoreBrand && storesById(product.storeChain).every((s) => s.id !== storeId)) continue;
      const price = { productId: id, storeId, priceCents: v.regular, updatedAt: `${v.date}T12:00:00.000Z`, source: 'open_prices' };
      if (v.promo && v.promo < v.regular) { price.promoPriceCents = v.promo; price.promoLabel = 'Promo relevée'; price.promoUntil = v.date; }
      prices.push(price); used = true;
    }
  }
  if (used) stats.ingredients++;
}
function storesById(chain) { return stores.filter((s) => s.chain === chain); }
stats.products = products.length; stats.prices = prices.length;
const header = `/**
 * Produits RÉELS et prix RELEVÉS en magasin — Open Prices (Open Food Facts).
 * Données ouvertes sous licence ODbL : https://prices.openfoodfacts.org
 *
 * ⚠️ FICHIER GÉNÉRÉ (npm run prices:refresh) — ne pas modifier à la main.
 * Un prix relevé remplace l'estimation de démonstration pour le même
 * ingrédient dans le même magasin (voir mergeCatalog.ts).
 */
import type { Price, Product } from '../core/types';
`;
const body = `${header}
/** Date de la collecte. */
export const OPEN_PRICES_COLLECTED_AT = '${new Date().toISOString().slice(0, 10)}';

export const openPricesProducts: Product[] = [
${products.map((p) => `  ${JSON.stringify(p)},`).join('\n')}
];

export const openPricesPrices: Price[] = [
${prices.map((p) => `  ${JSON.stringify(p)},`).join('\n')}
];
`;
fs.writeFileSync(`${repo}/src/data/openPrices.ts`, body);
const cover = {};
for (const p of prices) { const s = stores.find((x) => x.id === p.storeId); cover[s.id] = (cover[s.id] ?? 0) + 1; }
console.log(JSON.stringify(stats), JSON.stringify(cover));
