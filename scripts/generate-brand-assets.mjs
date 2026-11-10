#!/usr/bin/env node
/**
 * Génère les visuels de marque de Cabas (« Marché frais ») à partir de SVG :
 *
 *   assets/images/icon.png                     1024×1024  icône iOS / stores (opaque)
 *   assets/images/android-icon-foreground.png  1024×1024  avant-plan adaptatif (transparent, zone sûre 66 %)
 *   assets/images/android-icon-background.png  1024×1024  arrière-plan adaptatif (forêt uni)
 *   assets/images/android-icon-monochrome.png  1024×1024  icône thématique Android 13+ (silhouette blanche)
 *   assets/images/splash-icon.png              1024×1024  panier ≈ 400 px sur transparent (fond forêt via app.json)
 *   assets/images/favicon.png                    48×48    favicon web
 *   assets/images/notification-icon.png          96×96    icône de notification Android (silhouette blanche)
 *   docs/brand/logo.svg, docs/brand/icon.svg, docs/brand/logo-mono.svg
 *
 * Rendu via Playwright/Chromium (deviceScaleFactor 1, découpe exacte).
 * Usage : node scripts/generate-brand-assets.mjs
 *
 * La géométrie du panier est la même que src/components/brand/basket.ts
 * (viewBox 0 0 120 120) — toute modification doit être faite aux deux endroits.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = path.join(ROOT, 'assets/images');
const DOCS = path.join(ROOT, 'docs/brand');

// ─── Palette (src/theme/tokens.ts) ──────────────────────────────────────────
const C = {
  foret900: '#0E241B',
  foret800: '#173A2C',
  foret700: '#1F4A38',
  foret600: '#2F6E50',
  moutarde500: '#E8A33D',
  moutarde300: '#F3C982',
  creme: '#F6F1E7',
  lin: '#F3EEE3',
  white: '#FFFFFF',
};

// ─── Géométrie du panier (src/components/brand/basket.ts) ───────────────────
const G = {
  handle: 'M33 60 V52 A27 27 0 0 1 87 52 V60',
  handleStroke: 10,
  body: 'M15 58 Q14 58 14.3 59.2 L24.6 103.2 Q25.3 106 28.2 106 H91.8 Q94.7 106 95.4 103.2 L105.7 59.2 Q106 58 105 58 Z',
  slots: [
    { x: 45, y: 70, width: 6, height: 26, rx: 3 },
    { x: 57, y: 70, width: 6, height: 26, rx: 3 },
    { x: 69, y: 70, width: 6, height: 26, rx: 3 },
  ],
};
/** Boîte englobante visuelle du panier (anse comprise, trait inclus). */
const BBOX = { x: 14, y: 20, w: 92, h: 86 };

const slotPath = (s) =>
  `M${s.x + s.rx} ${s.y} H${s.x + s.width - s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.width} ${s.y + s.rx} V${s.y + s.height - s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.width - s.rx} ${s.y + s.height} H${s.x + s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x} ${s.y + s.height - s.rx} V${s.y + s.rx} A${s.rx} ${s.rx} 0 0 1 ${s.x + s.rx} ${s.y} Z`;

/** Panier en <g>, placé pour que sa boîte englobante tienne dans `size` px centrée en (cx, cy). */
function basket({ cx, cy, size, variant = 'reversed', color = C.white }) {
  const scale = size / Math.max(BBOX.w, BBOX.h);
  const tx = cx - (BBOX.x + BBOX.w / 2) * scale;
  const ty = cy - (BBOX.y + BBOX.h / 2) * scale;
  const open = `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">`;
  if (variant === 'mono') {
    return `${open}
    <path d="${G.handle}" stroke="${color}" stroke-width="${G.handleStroke}" stroke-linecap="round" fill="none"/>
    <path d="${G.body} ${G.slots.map(slotPath).join(' ')}" fill="${color}" fill-rule="evenodd"/>
  </g>`;
  }
  const handle = variant === 'reversed' ? C.creme : C.foret800;
  return `${open}
    <path d="${G.handle}" stroke="${handle}" stroke-width="${G.handleStroke}" stroke-linecap="round" fill="none"/>
    <path d="${G.body}" fill="${C.moutarde500}"/>
    ${G.slots.map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx}" fill="${C.foret800}"/>`).join('\n    ')}
  </g>`;
}

const svg = (w, h, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>\n${body}\n</svg>\n`;

/** Grands cercles doux qui se chevauchent (motif signature, cf. dossier). */
const heroCircles = (S) => `
  <circle cx="${S * 0.86}" cy="${S * 0.12}" r="${S * 0.36}" fill="${C.foret600}" opacity="0.55"/>
  <circle cx="${S * 0.12}" cy="${S * 0.96}" r="${S * 0.3}" fill="${C.foret700}" opacity="0.9"/>`;

// ─── Compositions ───────────────────────────────────────────────────────────
const S = 1024;
const assets = [
  {
    file: 'icon.png',
    size: S,
    transparent: false,
    svg: svg(S, S, `  <rect width="${S}" height="${S}" fill="${C.foret800}"/>${heroCircles(S)}
  ${basket({ cx: S / 2, cy: S / 2 + 8, size: 600, variant: 'reversed' })}`),
  },
  {
    // Zone sûre adaptative : cercle de 66 % (≈ 676 px) → panier ≈ 440 px.
    file: 'android-icon-foreground.png',
    size: S,
    transparent: true,
    svg: svg(S, S, basket({ cx: S / 2, cy: S / 2 + 6, size: 440, variant: 'reversed' })),
  },
  {
    file: 'android-icon-background.png',
    size: S,
    transparent: false,
    svg: svg(S, S, `  <rect width="${S}" height="${S}" fill="${C.foret800}"/>`),
  },
  {
    file: 'android-icon-monochrome.png',
    size: S,
    transparent: true,
    svg: svg(S, S, basket({ cx: S / 2, cy: S / 2 + 6, size: 440, variant: 'mono', color: C.white })),
  },
  {
    // Le fond forêt de l'écran de lancement vient d'app.json (expo-splash-screen).
    file: 'splash-icon.png',
    size: S,
    transparent: true,
    svg: svg(S, S, basket({ cx: S / 2, cy: S / 2, size: 400, variant: 'reversed' })),
  },
  {
    file: 'favicon.png',
    size: 48,
    transparent: true,
    svg: svg(48, 48, `  <rect width="48" height="48" rx="12" fill="${C.foret800}"/>
  ${basket({ cx: 24, cy: 24.5, size: 34, variant: 'reversed' })}`),
  },
  {
    file: 'notification-icon.png',
    size: 96,
    transparent: true,
    svg: svg(96, 96, basket({ cx: 48, cy: 49, size: 72, variant: 'mono', color: C.white })),
  },
];

// ─── SVG de référence (docs/brand) ──────────────────────────────────────────
const FONT = `font-family="'Bricolage Grotesque', 'Poppins', 'DM Sans', system-ui, sans-serif"`;
const docs = {
  'icon.svg': assets[0].svg,
  'logo.svg': svg(
    560,
    160,
    `  <title>Cabas — Tes courses, de A à Z.</title>
  ${basket({ cx: 80, cy: 80, size: 112, variant: 'color' })}
  <text x="156" y="98" ${FONT} font-weight="800" font-size="84" letter-spacing="-2.5" fill="${C.foret800}">Cabas</text>
  <text x="160" y="132" ${FONT} font-weight="500" font-size="22" fill="#5B6B62">Tes courses, de A à Z.</text>`,
  ),
  'logo-reversed.svg': svg(
    560,
    160,
    `  <title>Cabas — version inversée</title>
  <rect width="560" height="160" rx="28" fill="${C.foret800}"/>
  ${basket({ cx: 80, cy: 80, size: 112, variant: 'reversed' })}
  <text x="156" y="98" ${FONT} font-weight="800" font-size="84" letter-spacing="-2.5" fill="${C.lin}">Cabas</text>
  <text x="160" y="132" ${FONT} font-weight="500" font-size="22" fill="${C.moutarde500}">Tes courses, de A à Z.</text>`,
  ),
  'logo-mono.svg': svg(
    160,
    160,
    `  <title>Cabas — monochrome</title>
  ${basket({ cx: 80, cy: 80, size: 128, variant: 'mono', color: C.foret800 })}`,
  ),
};

// ─── Rendu ──────────────────────────────────────────────────────────────────
fs.mkdirSync(IMAGES, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });
for (const [name, content] of Object.entries(docs)) {
  fs.writeFileSync(path.join(DOCS, name), content);
  console.log(`✓ docs/brand/${name}`);
}

const browser = await chromium.launch();
try {
  for (const a of assets) {
    const page = await browser.newPage({ viewport: { width: a.size, height: a.size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${a.svg}</body></html>`,
    );
    await page.screenshot({
      path: path.join(IMAGES, a.file),
      omitBackground: a.transparent,
      clip: { x: 0, y: 0, width: a.size, height: a.size },
    });
    await page.close();
    console.log(`✓ assets/images/${a.file} (${a.size}×${a.size}${a.transparent ? ', transparent' : ''})`);
  }
} finally {
  await browser.close();
}
