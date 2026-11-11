/**
 * Description de l’instantané du catalogue Cabas — données ouvertes (licence ODbL, voir DATA_LICENSE.md).
 *
 * ⚠️ FICHIER GÉNÉRÉ — ne pas modifier à la main.
 * Sources : src/data/productSources.ts + src/data/openData/snapshot.json
 * (instantané du 2026-11-11) · Générateur : src/data/generator/run.mjs
 * (`npm run data:generate`). Un test vérifie qu'il est à jour.
 */
import type { CatalogMeta } from '../core/types';

export const catalogMeta: CatalogMeta = {
  "snapshotAt": "2026-11-11",
  "pricesFrom": "2025-11-11",
  "pricesTo": "2026-11-11",
  "observedPrices": 1142,
  "estimatedPrices": 1216,
  "chainIndex": {
    "leclerc": {
      "value": 1,
      "basis": "measured",
      "commonProducts": 20785
    },
    "carrefour": {
      "value": 1.084,
      "basis": "measured",
      "commonProducts": 3233
    },
    "auchan": {
      "value": 1.115,
      "basis": "measured",
      "commonProducts": 2728
    },
    "intermarche": {
      "value": 1.087,
      "basis": "measured",
      "commonProducts": 1451
    },
    "superu": {
      "value": 1.145,
      "basis": "measured",
      "commonProducts": 1562
    },
    "lidl": {
      "value": 0.98,
      "basis": "press",
      "commonProducts": 24
    },
    "aldi": {
      "value": 1.02,
      "basis": "press",
      "commonProducts": 1
    },
    "netto": {
      "value": 1,
      "basis": "press",
      "commonProducts": 0
    },
    "monoprix": {
      "value": 1.274,
      "basis": "measured",
      "commonProducts": 1026
    },
    "franprix": {
      "value": 1.439,
      "basis": "measured",
      "commonProducts": 1068
    }
  },
  "coverage": {
    "leclerc": {
      "observed": 241,
      "estimated": 89
    },
    "carrefour": {
      "observed": 216,
      "estimated": 107
    },
    "auchan": {
      "observed": 160,
      "estimated": 140
    },
    "intermarche": {
      "observed": 140,
      "estimated": 171
    },
    "superu": {
      "observed": 178,
      "estimated": 138
    },
    "lidl": {
      "observed": 46,
      "estimated": 35
    },
    "aldi": {
      "observed": 12,
      "estimated": 35
    },
    "netto": {
      "observed": 1,
      "estimated": 118
    },
    "monoprix": {
      "observed": 82,
      "estimated": 190
    },
    "franprix": {
      "observed": 66,
      "estimated": 193
    }
  },
  "sources": [
    {
      "name": "Open Food Facts",
      "url": "https://world.openfoodfacts.org",
      "license": "ODbL 1.0"
    },
    {
      "name": "Open Prices",
      "url": "https://prices.openfoodfacts.org",
      "license": "ODbL 1.0"
    },
    {
      "name": "OpenStreetMap",
      "url": "https://www.openstreetmap.org/copyright",
      "license": "ODbL 1.0"
    }
  ],
  "lastCreatedAt": "2026-11-10T22:52:46.303406Z"
};
