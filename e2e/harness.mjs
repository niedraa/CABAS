/**
 * Petit harnais e2e : étapes nommées, captures numérotées, sélecteurs par
 * `testID` (rendu `data-testid` sur le web) et collecte des erreurs JS.
 */
import { join } from 'node:path';

/** Erreurs console sans rapport avec l'app (réseau coupé volontairement, etc.). */
const IGNORED_ERRORS = [/Failed to load resource/i, /favicon/i];

export function createHarness({ page, baseUrl, dir, config, now = new Date() }) {
  const errors = [];
  let shotIndex = 0;

  page.on('pageerror', (err) => errors.push(`exception : ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_ERRORS.some((re) => re.test(text))) return;
    errors.push(`console.error : ${text.slice(0, 400)}`);
  });
  page.setDefaultTimeout(20_000);

  const sel = (id) => `[data-testid="${id}"]`;

  const h = {
    page,
    baseUrl,
    config,
    /** Date simulée au démarrage (horloge du navigateur). */
    now,
    errors,
    currentStep: '',
    stepsPassed: 0,

    sel,
    /** Localisateur visible d'un testID (le dernier rendu : écran au premier plan). */
    get: (id) => page.locator(`${sel(id)} >> visible=true`).last(),

    async step(name, fn) {
      h.currentStep = name;
      const t0 = Date.now();
      await fn();
      h.stepsPassed += 1;
      console.log(`  · ${name} (${Date.now() - t0} ms)`);
    },

    async goto(path) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
    },

    /** Attend qu'un testID soit visible. */
    async see(id, timeout) {
      await page.waitForSelector(`${sel(id)} >> visible=true`, { timeout });
    },

    /** Attend qu'un texte soit visible. */
    async seeText(text, timeout) {
      await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
    },

    async tap(id) {
      const target = h.get(id);
      await target.scrollIntoViewIfNeeded();
      await target.click();
    },

    async count(id) {
      return page.locator(`${sel(id)} >> visible=true`).count();
    },

    /** Laisse les ressorts se poser puis capture l'écran. */
    async shot(name, settleMs = 650) {
      await page.waitForTimeout(settleMs);
      shotIndex += 1;
      const file = `${String(shotIndex).padStart(2, '0')}-${name}.png`;
      await page.screenshot({ path: join(dir, file) });
    },

    /** Fait défiler le contenu sous le pointeur (molette au centre de l'écran). */
    async scroll(dy) {
      const { width, height } = config.viewport;
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(400);
    },

    /** Attend (au plus `timeout` ms) qu'un sélecteur CSS compte `n` éléments visibles ; renvoie le compte final. */
    async waitForCount(css, n, timeout = 8000) {
      const loc = page.locator(`${css} >> visible=true`);
      const end = Date.now() + timeout;
      let c = await loc.count();
      while (c !== n && Date.now() < end) {
        await page.waitForTimeout(150);
        c = await loc.count();
      }
      return c;
    },

    async wait(ms) {
      await page.waitForTimeout(ms);
    },

    assertNoErrors() {
      if (errors.length > 0) throw new Error(`${errors.length} erreur(s) JavaScript :\n${errors.join('\n')}`);
    },

    expect(condition, message) {
      if (!condition) throw new Error(message);
    },
  };
  return h;
}
