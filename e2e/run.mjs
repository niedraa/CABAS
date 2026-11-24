#!/usr/bin/env node
/**
 * Tests de bout en bout de Cabas sur le build web (Playwright, Chromium).
 *
 * Prérequis : `npm run build:web` (dossier `dist/`). Le script sert `dist/`
 * (repli SPA sur index.html), puis rejoue les parcours utilisateur :
 *   1. onboarding complet (allergie + consentement, 3 enseignes françaises) ;
 *   2. semaine générée (offre gratuite : 3 repas), fiche recette ;
 *   3. liste de courses : cocher, ajouter un article ;
 *   4. prix : panier, détail d'un article, livraison ;
 *   5. commande → confirmation → budget ;
 *   6. Premium (achat simulé) → « Compléter ma semaine », panier « le moins cher » ;
 *   7. Espagne : Mercadona, Carrefour Espagne, Dia → prix espagnols uniquement ;
 *   8. mode sombre, placard, suppression du compte (retour à l'accueil).
 * Captures dans `e2e/screenshots/`. Code de sortie 1 au premier échec.
 *
 * Usage : `npm run e2e` (variables : E2E_DIST, E2E_PORT, E2E_SCALE).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.env.E2E_DIST ?? path.join(ROOT, 'dist'));
const SHOTS = path.join(ROOT, 'e2e', 'screenshots');
const PORT = Number(process.env.E2E_PORT ?? 8099);
const SCALE = Number(process.env.E2E_SCALE ?? 1);

function loadPlaywright() {
  for (const base of [import.meta.url, path.join(process.cwd(), 'noop.js')]) {
    try {
      return createRequire(base)('playwright');
    } catch {
      // essai suivant
    }
  }
  console.error('Playwright introuvable : `npm i --no-save playwright && npx playwright install chromium`.');
  process.exit(1);
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`Build web absent (${DIST}) : lance d'abord \`npm run build:web\`.`);
  process.exit(1);
}

// ─── Serveur statique ────────────────────────────────────────────────────────

const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let file = path.join(DIST, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const URL = `http://localhost:${PORT}`;

// ─── Navigateur ──────────────────────────────────────────────────────────────

const { chromium } = loadPlaywright();
fs.rmSync(SHOTS, { recursive: true, force: true });
fs.mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.setDefaultTimeout(10_000);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

let shotIndex = 0;
async function shot(name) {
  await page.waitForTimeout(600);
  shotIndex++;
  await page.screenshot({ path: path.join(SHOTS, `${String(shotIndex).padStart(2, '0')}-${name}.png`) });
}
const byId = (id) => page.locator(`[data-testid="${id}"] >> visible=true`).first();
const byIdPrefix = (prefix) => page.locator(`[data-testid^="${prefix}"] >> visible=true`);
async function tap(id) {
  await byId(id).click();
  await page.waitForTimeout(350);
}
async function go(route) {
  await page.goto(`${URL}${route}`);
  await page.waitForTimeout(1800);
}
async function expectText(re, label = String(re)) {
  await page.getByText(re).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new Error(`Texte attendu introuvable : ${label}`);
  });
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const results = [];
async function scenario(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - started, error: err.message.split('\n')[0] });
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
    await shot(`ECHEC-${name.replace(/\W+/g, '-').slice(0, 40)}`).catch(() => undefined);
  }
}

// ─── Parcours ────────────────────────────────────────────────────────────────

console.log(`E2E Cabas — ${URL}`);

await scenario('onboarding complet', async () => {
  await go('/');
  await expectText(/de A à Z/);
  await shot('bienvenue');
  await tap('onboarding-start');
  await tap('onboarding-cta'); // foyer
  await tap('diet-allergy-allergens-fruits_a_coque');
  await tap('diet-allergy-consent');
  await tap('onboarding-cta'); // régime
  await tap('onboarding-cta'); // budget
  await tap('onboarding-cta'); // cuisine
  for (const id of ['leclerc', 'carrefour', 'lidl']) await tap(`stores-${id}`);
  await shot('magasins');
  await tap('onboarding-cta'); // magasins
  await tap('onboarding-cta'); // créneaux
  await expectText(/Fruits à coque/);
  await shot('recap');
  await tap('onboarding-cta'); // générer
  await page.waitForTimeout(5000);
  if (await byId('generation-continue').isVisible().catch(() => false)) await tap('generation-continue');
  await byId('week-screen').waitFor();
});

await scenario('semaine générée (gratuit : 3 repas) et fiche recette', async () => {
  await page.waitForTimeout(1200);
  const meals = await byIdPrefix('meal-').filter({ hasNot: page.locator('[data-testid]') }).count();
  const cards = await page.locator('[data-testid^="meal-"][data-testid$="-open"] >> visible=true').count();
  assert(cards >= 1, `aucun repas affiché (${meals})`);
  await shot('semaine');
  await page.locator('[data-testid^="meal-"][data-testid$="-open"] >> visible=true').first().click();
  await byId('recipe-screen').waitFor();
  await byId('recipe-ingredients').waitFor();
  await shot('recette');
  await tap('recipe-back');
  await byId('week-screen').waitFor();
});

await scenario('liste de courses : cocher et ajouter', async () => {
  await tap('tab-liste');
  await byId('list-summary').waitFor();
  const before = await byId('list-remaining').innerText();
  const checks = page.locator('[data-testid$="-check"] >> visible=true');
  assert((await checks.count()) > 3, 'liste trop courte');
  await checks.nth(0).click();
  await checks.nth(1).click();
  await byId('list-add').fill('Sacs poubelle');
  await page.keyboard.press('Enter');
  await expectText(/Sacs poubelle/);
  const after = await byId('list-remaining').innerText();
  assert(before !== after, `compteur inchangé (${before})`);
  assert(!(await page.getByText(/^Eau$/).first().isVisible().catch(() => false)), 'l’eau du robinet ne doit pas être listée');
  await shot('liste');
});

await scenario('prix : panier, détail article, livraison', async () => {
  await tap('tab-prix');
  await byId('basket-receipt').waitFor({ timeout: 15_000 });
  await expectText(/France/);
  await shot('prix');
  await expectText(/au prix relevé en magasin/);
  await byIdPrefix('price-item-').first().click();
  await byId('item-prices').waitFor();
  await expectText(/Prix par enseigne/);
  await expectText(/Relevé le|Prix estimé/);
  await shot('prix-article');
  // Toucher un prix ouvre la recherche du produit sur le site de l'enseigne.
  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 10_000 }),
    page.locator('[data-testid^="store-offer-"] >> visible=true').first().click(),
  ]);
  const opened = popup.url();
  await popup.close();
  assert(/^https:\/\/(www\.e\.leclerc|www\.carrefour\.fr|www\.lidl\.fr|www\.auchan\.fr|www\.intermarche\.com|www\.coursesu\.com|courses\.monoprix\.fr)\//.test(opened), `lien inattendu : ${opened}`);
  assert(/[?/](q|text|query)?=?[^&]*[a-z%]/i.test(opened), `recherche vide : ${opened}`);
  await page.keyboard.press('Escape');
  await go('/panier');
  await tap('basket-channel-delivery');
  await page.waitForTimeout(1500);
  const delivery = (await byId('basket-receipt').isVisible().catch(() => false)) || (await page.getByText(/livraison/i).first().isVisible());
  assert(delivery, 'ni panier ni message en livraison');
  await shot('prix-livraison');
  await tap('basket-channel-drive');
  await byId('basket-receipt').waitFor();
});

await scenario('commande → confirmation → budget', async () => {
  await byIdPrefix('order-').first().click();
  await byId('order-screen').waitFor();
  await byId('order-lines').waitFor();
  await shot('commande');
  await tap('order-confirm');
  await expectText(/notée/);
  await shot('commande-confirmee');
  await go('/budget');
  await expectText(/Courses /);
  await shot('budget');
});

await scenario('Premium : achat simulé, semaine complète, panier le moins cher', async () => {
  await go('/premium');
  await tap('premium-buy');
  await expectText(/Bienvenue dans Premium/);
  await go('/');
  await expectText(/Compléter ma semaine/);
  await page.getByText(/Compléter ma semaine/).filter({ visible: true }).first().click();
  await page.waitForTimeout(1200);
  const cards = await page.locator('[data-testid^="meal-"][data-testid$="-open"]').count();
  assert(cards > 3, `semaine non complétée (${cards} repas)`);
  await shot('semaine-premium');
  await go('/panier');
  await tap('basket-mode-cheapest');
  await page.waitForTimeout(1500);
  await expectText(/Panier le moins cher/i);
  await shot('prix-moins-cher');
});

await scenario('Espagne : prix espagnols uniquement', async () => {
  await go('/parametres/magasins');
  for (const id of ['leclerc', 'carrefour', 'lidl']) await tap(`stores-${id}`);
  await tap('stores-country-ES');
  await shot('magasins-espagne');
  for (const id of ['mercadona', 'carrefour_es', 'dia']) await tap(`stores-${id}`);
  await tap('edit-save');
  await go('/panier');
  await byId('basket-receipt').waitFor({ timeout: 15_000 });
  await expectText(/Espagne/);
  const parts = await page.locator('[data-testid^="basket-part-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
  assert(parts.length > 0, 'panier vide');
  assert(parts.every((p) => /mercadona|carrefour_es|dia$/.test(p)), `magasin hors Espagne : ${parts.join(', ')}`);
  await shot('prix-espagne');
});

await scenario('placard : ajout lié au catalogue', async () => {
  await go('/placard');
  await page.getByText('Ajouter un article').filter({ visible: true }).first().click();
  await byId('pantry-label').fill('riz');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Riz/ }).first().click();
  await byId('pantry-qty').fill('500');
  await tap('pantry-save');
  await expectText(/déduit de ta liste/);
  await shot('placard');
});

await scenario('mode sombre', async () => {
  await go('/profil');
  await tap('theme-switch-dark');
  await page.waitForTimeout(500);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="profile-screen"]') ?? document.body).backgroundColor);
  await shot('profil-sombre');
  await tap('theme-switch-light');
  assert(bg !== 'rgb(246, 241, 231)', `fond toujours clair (${bg})`);
});

await scenario('suppression du compte (RGPD)', async () => {
  await go('/parametres/compte');
  await tap('delete-account');
  await page.getByRole('button', { name: /Supprimer définitivement/ }).first().click();
  await page.waitForTimeout(2000);
  await expectText(/de A à Z/);
});

const failed = results.filter((r) => !r.ok);
if (pageErrors.length > 0) {
  console.log(`\nErreurs JavaScript (${pageErrors.length}) :`);
  for (const e of pageErrors.slice(0, 10)) console.log(`  • ${e}`);
}
console.log(`\n${results.length - failed.length}/${results.length} parcours réussis · captures : ${path.relative(process.cwd(), SHOTS)}`);
await browser.close();
server.close();
process.exit(failed.length > 0 || pageErrors.length > 0 ? 1 : 0);
