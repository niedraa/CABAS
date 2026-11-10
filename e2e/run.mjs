#!/usr/bin/env node
/**
 * Tests de bout en bout de Cabas sur le build web (Playwright, Chromium).
 *
 * Usage :
 *   npm run build:web && npm run e2e
 *   E2E_BASE_URL=http://localhost:8081 npm run e2e   (contre le serveur de dev)
 *   E2E_ONLY=dark-390 npm run e2e                    (une seule configuration)
 *
 * Chaque configuration (thème × largeur d'écran) rejoue le parcours complet
 * dans un navigateur vierge : onboarding → planning → recette → liste → prix →
 * commande → Premium → profil → suppression du compte. Les captures sont
 * écrites dans `e2e/screenshots/<configuration>/`. Toute erreur JavaScript
 * (exception ou `console.error`) fait échouer la configuration.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { FLOWS } from './flows.mjs';
import { createHarness } from './harness.mjs';
import { serveStatic } from './serve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = join(here, 'screenshots');

const CONFIGS = [
  { name: 'light-390', colorScheme: 'light', viewport: { width: 390, height: 844 } },
  { name: 'dark-390', colorScheme: 'dark', viewport: { width: 390, height: 844 } },
  { name: 'light-360', colorScheme: 'light', viewport: { width: 360, height: 780 } },
  { name: 'dark-360', colorScheme: 'dark', viewport: { width: 360, height: 780 } },
];

async function main() {
  const only = process.env.E2E_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const configs = only?.length ? CONFIGS.filter((c) => only.includes(c.name)) : CONFIGS;
  if (configs.length === 0) throw new Error(`Aucune configuration ne correspond à E2E_ONLY=${process.env.E2E_ONLY}`);

  const server = process.env.E2E_BASE_URL ? null : await serveStatic(join(here, '..', 'dist'));
  const baseUrl = (process.env.E2E_BASE_URL ?? server.url).replace(/\/+$/, '');
  console.log(`▶ Cabas e2e sur ${baseUrl}`);

  rmSync(SCREENSHOTS, { recursive: true, force: true });
  const browser = await chromium.launch();
  const failures = [];
  const started = Date.now();

  try {
    for (const config of configs) {
      const dir = join(SCREENSHOTS, config.name);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({
        viewport: config.viewport,
        colorScheme: config.colorScheme,
        deviceScaleFactor: 2,
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        reducedMotion: 'no-preference',
      });
      // Presse-papiers (copie de la liste) autorisé.
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl });
      const page = await context.newPage();
      const h = createHarness({ page, baseUrl, dir, config });
      console.log(`\n■ ${config.name}`);
      try {
        for (const flow of FLOWS) {
          await h.step(flow.name, () => flow.run(h));
        }
        h.assertNoErrors();
        console.log(`  ✔ ${config.name} : ${h.stepsPassed} étapes`);
      } catch (err) {
        await page.screenshot({ path: join(dir, 'zz-echec.png') }).catch(() => undefined);
        failures.push({ config: config.name, step: h.currentStep, message: err instanceof Error ? err.message : String(err) });
        console.error(`  ✘ ${config.name} — étape « ${h.currentStep} » : ${err instanceof Error ? err.message : err}`);
        for (const e of h.errors) console.error(`    · ${e}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server?.close();
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (failures.length > 0) {
    console.error(`\n✘ ${failures.length} configuration(s) en échec sur ${configs.length} (${seconds} s).`);
    process.exit(1);
  }
  console.log(`\n✔ ${configs.length} configuration(s) OK en ${seconds} s. Captures : e2e/screenshots/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
