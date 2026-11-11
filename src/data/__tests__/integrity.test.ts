/**
 * Tests d'intégrité du catalogue.
 *
 * Ils garantissent la cohérence référentielle (ids, ingrédients, produits,
 * prix), l'exactitude de l'étiquetage des allergènes (critère de sécurité du
 * dossier), la couverture des régimes alimentaires par la base de recettes et
 * la PROVENANCE des prix (relevés Open Prices ou estimations signalées).
 * Les attendus du catalogue sont DÉRIVÉS des données (sources, instantané),
 * jamais des comptes en dur. Les régimes sont TOUJOURS déduits des
 * ingrédients, jamais des tags.
 */
import { describe, expect, it } from '@jest/globals';

import { isValidGtin } from '../../core/openPrices';
import {
  AISLES,
  ALLERGENS,
  CUISINES,
  EQUIPMENT,
  STORE_CHAINS,
  UNITS,
  type Allergen,
  type Ingredient,
  type Price,
  type Product,
  type Recipe,
  type StoreChain,
} from '../../core/types';
import {
  bioProductId,
  buildCatalog,
  GENERALIST_CHAINS,
  looseProductId,
  mddProductId,
  nationalProductId,
  type OpenDataSnapshot,
} from '../generator/buildCatalog';
import {
  catalog,
  catalogMeta,
  DATA_ATTRIBUTION,
  DEMO_DATA_NOTICE,
  ingredients,
  ingredientsById,
  NON_PURCHASABLE_INGREDIENT_IDS,
  PRICE_DATA_NOTICE,
  prices,
  products,
  productsById,
  recipes,
  recipesById,
  stores,
  storesById,
} from '../index';
import snapshotJson from '../openData/snapshot.json';
import { productSources } from '../productSources';

const snapshot = snapshotJson as unknown as OpenDataSnapshot;

// ─── Aides ───────────────────────────────────────────────────────────────────

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}

/** Ingrédients d'une recette (optionnels COMPRIS, comme le fait core/constraints). */
function recipeIngredients(recipe: Recipe): Ingredient[] {
  return recipe.ingredients.map((ri) => ingredientsById[ri.ingredientId]).filter(Boolean);
}

function hasAllergen(ing: Ingredient, a: Allergen): boolean {
  return ing.allergens.includes(a);
}

const isFlesh = (ing: Ingredient) =>
  ing.isMeat || ing.isPork || ing.isFish || ing.isSeafood || hasAllergen(ing, 'poissons') || hasAllergen(ing, 'crustaces') || hasAllergen(ing, 'mollusques');

const isVegetarian = (r: Recipe) => recipeIngredients(r).every((ing) => !isFlesh(ing));
const isVegan = (r: Recipe) =>
  recipeIngredients(r).every(
    (ing) => !isFlesh(ing) && !ing.isAnimalProduct && !hasAllergen(ing, 'lait') && !hasAllergen(ing, 'oeufs'),
  );
const isGlutenFree = (r: Recipe) => recipeIngredients(r).every((ing) => !hasAllergen(ing, 'gluten'));
const isLactoseFree = (r: Recipe) => recipeIngredients(r).every((ing) => !hasAllergen(ing, 'lait'));
const hasFishOrSeafood = (r: Recipe) => recipeIngredients(r).some((ing) => ing.isFish || ing.isSeafood);
const hasPork = (r: Recipe) => recipeIngredients(r).some((ing) => ing.isPork);
const isQuick = (r: Recipe) => r.prepTimeMin + r.cookTimeMin <= 25;
const isHalalMeatDish = (r: Recipe) => {
  const ings = recipeIngredients(r);
  return ings.some((ing) => ing.isMeat) && ings.every((ing) => !ing.isPork && !ing.isAlcohol);
};

/** Supprime les accents (« Pâtes » → « Pates »). */
function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Texte de recherche d'un ingrédient : nom + id. */
function haystack(ing: Ingredient): string {
  return `${plain(ing.name)} ${ing.id.replace(/_/g, ' ')}`;
}

/** Ingrédients achetés pour les recettes (non optionnels, hors eau). */
const requiredIngredientIds = Array.from(
  new Set(
    recipes.flatMap((r) =>
      r.ingredients.filter((ri) => !ri.optional && !NON_PURCHASABLE_INGREDIENT_IDS.includes(ri.ingredientId)).map((ri) => ri.ingredientId),
    ),
  ),
);

// ─── Ingrédients ─────────────────────────────────────────────────────────────

describe('ingrédients', () => {
  it('compte environ 140 ingrédients aux ids uniques en snake_case', () => {
    expect(ingredients.length).toBeGreaterThanOrEqual(130);
    expect(duplicates(ingredients.map((i) => i.id))).toEqual([]);
    for (const ing of ingredients) expect(ing.id).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/);
  });

  it('utilise uniquement des valeurs de référentiel valides', () => {
    for (const ing of ingredients) {
      expect(AISLES).toContain(ing.aisle);
      expect(['g', 'ml', 'piece']).toContain(ing.baseUnit);
      expect(ing.name.trim().length).toBeGreaterThan(1);
      for (const a of ing.allergens) expect(ALLERGENS).toContain(a);
      expect(duplicates(ing.allergens)).toEqual([]);
      if (ing.gramsPerPiece !== undefined) expect(ing.gramsPerPiece).toBeGreaterThan(0);
      if (ing.density !== undefined) expect(ing.density).toBeGreaterThan(0);
      for (const m of ing.seasonMonths ?? []) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
      }
    }
  });

  it('a des drapeaux de régime cohérents entre eux', () => {
    for (const ing of ingredients) {
      if (ing.isMeat || ing.isPork || ing.isFish || ing.isSeafood) expect(ing.isAnimalProduct).toBe(true);
      // Poisson ⇔ allergène « poissons ».
      expect(ing.isFish).toBe(hasAllergen(ing, 'poissons'));
      // Fruits de mer ⇔ crustacés ou mollusques.
      expect(ing.isSeafood).toBe(hasAllergen(ing, 'crustaces') || hasAllergen(ing, 'mollusques'));
      // Lait / œuf ⇒ produit d'origine animale (les « laits » végétaux n'ont pas l'allergène lait).
      if (hasAllergen(ing, 'lait') || hasAllergen(ing, 'oeufs')) expect(ing.isAnimalProduct).toBe(true);
      if (ing.isAlcohol) expect(ing.allergens).toContain('sulfites');
    }
  });

  it('étiquette exactement les exemples de référence', () => {
    const expectAllergens = (id: string, expected: Allergen[]) =>
      expect([...ingredientsById[id].allergens].sort()).toEqual([...expected].sort());
    expectAllergens('pates_spaghetti', ['gluten']);
    expectAllergens('sauce_soja', ['soja', 'gluten']);
    expectAllergens('beurre', ['lait']);
    expectAllergens('parmesan', ['lait']);
    expectAllergens('pesto', ['lait', 'fruits_a_coque']);
    expectAllergens('moutarde', ['moutarde']);
    expectAllergens('vin_blanc', ['sulfites']);
    expectAllergens('crevettes', ['crustaces']);
    expectAllergens('moules', ['mollusques']);
    expectAllergens('tahini', ['sesame']);
    expectAllergens('farine_ble', ['gluten']);
    expectAllergens('farine_sarrasin', []);
    expectAllergens('riz_basmati', []);
    expectAllergens('lait_coco', []);
    expectAllergens('oeuf', ['oeufs']);
    expectAllergens('cacahuetes', ['arachides']);
    expectAllergens('celeri_branche', ['celeri']);
    expect(ingredientsById.beurre.isAnimalProduct).toBe(true);
    expect(ingredientsById.miel.isAnimalProduct).toBe(true);
    expect(ingredientsById.vin_blanc.isAlcohol).toBe(true);
    expect(ingredientsById.crevettes.isSeafood).toBe(true);
    expect(ingredientsById.lardons).toMatchObject({ isMeat: true, isPork: true });
    expect(ingredientsById.gelatine).toMatchObject({ isAnimalProduct: true, isPork: true });
    expect(ingredientsById.tofu_ferme.isAnimalProduct).toBe(false);
  });

  it('donne les poids unitaires et densités attendus', () => {
    const gpp: Record<string, number> = {
      oignon_jaune: 110,
      ail: 5,
      citron: 120,
      oeuf: 55,
      tomate: 120,
      carotte: 100,
      pomme_de_terre: 150,
      avocat: 200,
      courgette: 220,
      poivron_rouge: 160,
      aubergine: 280,
      banane: 120,
      echalote: 30,
    };
    for (const [id, g] of Object.entries(gpp)) expect(ingredientsById[id].gramsPerPiece).toBe(g);
    expect(ingredientsById.huile_olive.density).toBe(0.92);
    expect(ingredientsById.miel.density).toBe(1.4);
    for (const id of ['sel', 'poivre', 'huile_olive', 'vinaigre_vin', 'sucre', 'farine_ble', 'cumin', 'paprika']) {
      expect(ingredientsById[id].isPantryStaple).toBe(true);
    }
    // Produits frais de saison.
    for (const id of ['tomate', 'courgette', 'courge_butternut', 'poireau']) {
      expect(ingredientsById[id].seasonMonths?.length).toBeGreaterThan(0);
    }
  });

  describe('contrôles par mots-clés de l’étiquetage des allergènes', () => {
    const rules: { label: string; pattern: RegExp; allergen: Allergen; except?: RegExp }[] = [
      {
        label: 'céréales à gluten',
        pattern: /farine|pates?\b|pain|semoule|boulgour|chapelure|\bble\b|spaghetti|penne|coquillette|tagliatelle|lasagne|gnocchi|tortilla/,
        allergen: 'gluten',
        except: /\briz\b|\bmais\b|sarrasin/,
      },
      {
        label: 'produits laitiers',
        pattern: /lait|creme|beurre|fromage|yaourt|parmesan|mozzarella|comte|emmental|chevre|feta|ricotta|reblochon|cheddar/,
        allergen: 'lait',
        except: /coco|soja/,
      },
      { label: 'œufs', pattern: /\boeufs?\b|mayonnaise/, allergen: 'oeufs' },
      { label: 'poissons', pattern: /saumon|cabillaud|thon|sardine|colin|merlu|lieu/, allergen: 'poissons' },
      { label: 'crustacés', pattern: /crevette|gambas|langoustine|crabe/, allergen: 'crustaces' },
      { label: 'mollusques', pattern: /\bmoules?\b|huitre|calamar|seiche|poulpe/, allergen: 'mollusques' },
      { label: 'soja', pattern: /soja|tofu/, allergen: 'soja' },
      { label: 'moutarde', pattern: /moutarde|mayonnaise/, allergen: 'moutarde' },
      { label: 'sésame', pattern: /sesame|tahin/, allergen: 'sesame' },
      { label: 'arachides', pattern: /cacahuete|arachide/, allergen: 'arachides' },
      {
        label: 'fruits à coque',
        pattern: /noix|amande|noisette|cajou|pistache|pecan|pesto/,
        allergen: 'fruits_a_coque',
        except: /coco|muscade/,
      },
      { label: 'sulfites', pattern: /\bvin\b|vinaigre/, allergen: 'sulfites' },
      { label: 'céleri', pattern: /celeri|bouillon/, allergen: 'celeri' },
    ];

    it.each(rules.map((r) => [r.label, r] as const))('%s', (_label, rule) => {
      const offenders = ingredients
        .filter((ing) => rule.pattern.test(haystack(ing)) && !(rule.except && rule.except.test(haystack(ing))))
        .filter((ing) => !ing.allergens.includes(rule.allergen))
        .map((ing) => ing.id);
      expect(offenders).toEqual([]);
    });

    it('marque les viandes et le porc', () => {
      for (const ing of ingredients) {
        const h = haystack(ing);
        if (/lardon|jambon|porc|chorizo|saucisse|bacon|gelatine/.test(h)) expect(ing.isPork).toBe(true);
        if (/poulet|dinde|boeuf|agneau|\bveau\b|merguez|volaille|lardon|jambon|chorizo|saucisse/.test(h)) {
          expect(ing.isMeat).toBe(true);
        }
      }
    });

    it("n'étiquette pas de viande / poisson sur les ingrédients végétaux", () => {
      const plant = ['tofu_ferme', 'creme_soja', 'lait_coco', 'pois_chiches', 'lentilles_corail', 'bouillon_legumes'];
      for (const id of plant) {
        const ing = ingredientsById[id];
        expect(isFlesh(ing)).toBe(false);
        expect(ing.isAnimalProduct).toBe(false);
      }
    });
  });
});

// ─── Recettes ────────────────────────────────────────────────────────────────

describe('recettes', () => {
  it('compte au moins 64 recettes aux ids uniques', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(64);
    expect(duplicates(recipes.map((r) => r.id))).toEqual([]);
    expect(duplicates(recipes.map((r) => r.title))).toEqual([]);
    for (const r of recipes) expect(r.id).toMatch(/^rec_[a-z0-9_]+$/);
  });

  it('référence uniquement des ingrédients existants, avec des quantités valides', () => {
    const missing: string[] = [];
    for (const r of recipes) {
      for (const ri of r.ingredients) {
        if (!ingredientsById[ri.ingredientId]) missing.push(`${r.id} → ${ri.ingredientId}`);
        expect(UNITS).toContain(ri.unit);
        expect(ri.quantity).toBeGreaterThan(0);
      }
      expect(duplicates(r.ingredients.map((ri) => ri.ingredientId))).toEqual([]);
    }
    expect(missing).toEqual([]);
  });

  it('utilise des unités convertibles vers l’unité de base de chaque ingrédient', () => {
    const COUNT_UNITS = ['piece', 'gousse', 'botte', 'tranche', 'sachet', 'boite'];
    const problems: string[] = [];
    for (const r of recipes) {
      for (const ri of r.ingredients) {
        const ing = ingredientsById[ri.ingredientId];
        if (!ing) continue;
        const countUnit = COUNT_UNITS.includes(ri.unit);
        // Une unité « pièce » vers une base g/ml exige un poids unitaire, et inversement.
        if (countUnit !== (ing.baseUnit === 'piece') && !ing.gramsPerPiece) {
          problems.push(`${r.id} : ${ri.quantity} ${ri.unit} de ${ing.id} (base ${ing.baseUnit})`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('a des fiches complètes et bien formées', () => {
    for (const r of recipes) {
      expect(r.title.trim().length).toBeGreaterThan(3);
      expect(r.description).toMatch(/\.$/);
      expect(r.description.length).toBeLessThan(140);
      expect(r.emoji.length).toBeGreaterThan(0);
      expect(r.color).toMatch(/^#[0-9A-F]{6}$/i);
      expect(CUISINES).toContain(r.cuisine);
      expect(r.mealTypes.length).toBeGreaterThan(0);
      for (const m of r.mealTypes) expect(['dejeuner', 'diner']).toContain(m);
      for (const e of r.equipment) expect(EQUIPMENT).toContain(e);
      expect(r.servings).toBeGreaterThan(0);
      expect(r.prepTimeMin).toBeGreaterThan(0);
      expect(r.cookTimeMin).toBeGreaterThanOrEqual(0);
      expect([1, 2, 3]).toContain(r.difficulty);
      expect([1, 2, 3]).toContain(r.costLevel);
      expect(r.kcalPerServing).toBeGreaterThan(100);
      expect(r.kcalPerServing).toBeLessThan(1200);
      expect(r.ingredients.length).toBeGreaterThanOrEqual(5);
      expect(r.ingredients.length).toBeLessThanOrEqual(15);
      expect(r.tags.length).toBeGreaterThan(0);
    }
  });

  it('a entre 4 et 8 étapes claires par recette, avec des minuteurs valides', () => {
    for (const r of recipes) {
      expect(r.steps.length).toBeGreaterThanOrEqual(4);
      expect(r.steps.length).toBeLessThanOrEqual(8);
      for (const step of r.steps) {
        expect(step.text.trim().length).toBeGreaterThan(10);
        expect(step.text).toMatch(/[.!]$/);
        if (step.timerMin !== undefined) {
          expect(Number.isInteger(step.timerMin)).toBe(true);
          expect(step.timerMin).toBeGreaterThan(0);
        }
      }
      // Au moins un minuteur dès qu'il y a de la cuisson.
      if (r.cookTimeMin > 0) expect(r.steps.some((s) => s.timerMin !== undefined)).toBe(true);
    }
  });

  it('déclare le four quand une étape le préchauffe ou gratine', () => {
    for (const r of recipes) {
      if (r.steps.some((s) => /\bfour\b|enfourne|gratine/i.test(s.text))) expect(r.equipment).toContain('four');
      if (r.steps.some((s) => /\bmixe/i.test(s.text))) expect(r.equipment).toContain('mixeur');
    }
  });

  describe('couverture des régimes (déduite des ingrédients)', () => {
    const count = (pred: (r: Recipe) => boolean) => recipes.filter(pred).length;

    it.each([
      ['végétariennes', isVegetarian, 18],
      ['vegan', isVegan, 8],
      ['sans gluten', isGlutenFree, 16],
      ['sans lactose ET sans gluten', (r: Recipe) => isLactoseFree(r) && isGlutenFree(r), 10],
      ['poisson / fruits de mer', hasFishOrSeafood, 10],
      ['avec du porc', hasPork, 6],
      ['rapides (≤ 25 min)', isQuick, 18],
      ['viande compatible halal (sans porc ni alcool)', isHalalMeatDish, 12],
    ] as const)('au moins N recettes %s', (_label, pred, min) => {
      expect(count(pred)).toBeGreaterThanOrEqual(min);
    });

    it('les recettes vegan sont aussi végétariennes', () => {
      for (const r of recipes) if (isVegan(r)) expect(isVegetarian(r)).toBe(true);
    });

    it('varie les cuisines, les coûts, les difficultés et les moments du repas', () => {
      for (const c of CUISINES) expect(recipes.some((r) => r.cuisine === c)).toBe(true);
      for (const level of [1, 2, 3] as const) {
        expect(count((r) => r.costLevel === level)).toBeGreaterThanOrEqual(5);
      }
      for (const level of [1, 2, 3] as const) {
        expect(count((r) => r.difficulty === level)).toBeGreaterThanOrEqual(5);
      }
      const both = count((r) => r.mealTypes.includes('dejeuner') && r.mealTypes.includes('diner'));
      expect(both / recipes.length).toBeGreaterThan(0.6);
      expect(count((r) => r.mealTypes.includes('dejeuner'))).toBeGreaterThan(30);
      expect(count((r) => r.mealTypes.includes('diner'))).toBeGreaterThan(30);
    });
  });
});

// ─── Magasins ────────────────────────────────────────────────────────────────

describe('magasins', () => {
  it('couvre les 10 enseignes, dans l’ordre d’affichage, avec des frais et des URL cohérents', () => {
    expect(stores.map((s) => s.id)).toEqual([...STORE_CHAINS]);
    for (const s of stores) {
      expect(s.chain).toBe(s.id);
      expect(s.name.trim().length).toBeGreaterThan(1);
      expect(s.city).toBe('France');
      expect(['drive', 'click_collect', 'none']).toContain(s.pickup);
      expect(s.searchUrlTemplate).toMatch(/^https:\/\//);
      expect(s.driveUrl).toMatch(/^https:\/\//);
      expect(Number.isInteger(s.driveFeeCents)).toBe(true);
      expect(s.driveFeeCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(s.minOrderCents)).toBe(true);
      expect(s.minOrderCents).toBeGreaterThanOrEqual(0);
      if (s.deliveryFeeCents !== null) {
        expect(Number.isInteger(s.deliveryFeeCents)).toBe(true);
        expect(s.deliveryFeeCents).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Produits ────────────────────────────────────────────────────────────────

type Kind = 'national' | 'bio' | 'mdd' | 'vrac';

/** Produits attendus d'après productSources : id → { genre, code-barres, enseignes }. */
const expectedProducts = new Map<string, { kind: Kind; ean?: string; chains?: StoreChain[]; categoryTags?: string[] }>();
for (const s of productSources) {
  if (s.national) expectedProducts.set(nationalProductId(s.ingredientId), { kind: 'national', ean: s.national.ean });
  if (s.bio) expectedProducts.set(bioProductId(s.ingredientId), { kind: 'bio', ean: s.bio.ean });
  for (const m of s.mdd ?? []) {
    expectedProducts.set(mddProductId(s.ingredientId, m.chains[0]), { kind: 'mdd', ean: m.ean, chains: [...new Set(m.chains)] });
  }
  if (s.loose) {
    expectedProducts.set(looseProductId(s.ingredientId), {
      kind: 'vrac',
      categoryTags: s.loose.categoryTags.map((t) => t.trim().toLowerCase()),
    });
  }
}
const kindOf = (p: Product): Kind => expectedProducts.get(p.id)!.kind;

const pricesByProduct = new Map<string, Price[]>();
for (const price of prices) {
  const list = pricesByProduct.get(price.productId) ?? [];
  list.push(price);
  pricesByProduct.set(price.productId, list);
}

describe('produits', () => {
  it('viennent tous de productSources, avec les identifiants stables attendus', () => {
    expect(duplicates(products.map((p) => p.id))).toEqual([]);
    for (const p of products) {
      const expected = expectedProducts.get(p.id);
      expect(expected).toBeDefined();
      expect(p.id).toMatch(/^prd_[a-z0-9]+(_[a-z0-9]+)*$/);
      if (expected?.ean) expect(p.ean).toBe(expected.ean);
    }
  });

  it('ont un code-barres réel valide et unique, ou une catégorie vrac (jamais les deux)', () => {
    const eans = products.flatMap((p) => (p.ean ? [p.ean] : []));
    expect(duplicates(eans)).toEqual([]);
    for (const p of products) {
      if (kindOf(p) === 'vrac') {
        expect(p.ean).toBeUndefined();
        expect(expectedProducts.get(p.id)?.categoryTags).toContain(p.offCategoryTag);
        expect(p.brand).toBe('Vrac');
      } else {
        expect(p.offCategoryTag).toBeUndefined();
        expect(isValidGtin(p.ean!)).toBe(true);
      }
    }
  });

  it('sont rattachés à un ingrédient, dans son unité de base, avec des champs bien formés', () => {
    for (const p of products) {
      const ing = ingredientsById[p.ingredientId];
      expect(ing).toBeDefined();
      expect(NON_PURCHASABLE_INGREDIENT_IDS).not.toContain(p.ingredientId);
      expect(p.packUnit).toBe(ing.baseUnit);
      expect(p.packSize).toBeGreaterThan(0);
      if (p.nutriScore !== undefined) expect(['A', 'B', 'C', 'D', 'E']).toContain(p.nutriScore);
      expect(p.name.trim().length).toBeGreaterThan(2);
      expect(p.brand.trim().length).toBeGreaterThan(1);
      if (kindOf(p) === 'bio') expect(p.organic).toBe(true);
    }
  });

  it('portent au moins les allergènes de l’ingrédient ET ceux déclarés par Open Food Facts', () => {
    for (const p of products) {
      const declared = new Set<Allergen>([
        ...ingredientsById[p.ingredientId].allergens,
        ...(p.ean ? (snapshot.offProducts[p.ean]?.allergens ?? []) : []),
      ]);
      for (const a of declared) expect(p.allergens).toContain(a);
      for (const a of p.allergens) expect(ALLERGENS).toContain(a);
      expect(duplicates(p.allergens)).toEqual([]);
      // Ordre réglementaire (sortie déterministe).
      expect([...p.allergens].sort((a, b) => ALLERGENS.indexOf(a) - ALLERGENS.indexOf(b))).toEqual(p.allergens);
    }
  });

  it('distinguent marques nationales et marques distributeur (MDD liées à leurs enseignes)', () => {
    for (const p of products) {
      const expected = expectedProducts.get(p.id)!;
      if (expected.kind === 'mdd') {
        expect(p.isStoreBrand).toBe(true);
        expect(p.storeChains).toEqual(expected.chains);
        for (const c of p.storeChains!) expect(STORE_CHAINS).toContain(c);
        expect(p.id).toBe(mddProductId(p.ingredientId, p.storeChains![0]));
      } else {
        expect(p.isStoreBrand).toBe(false);
        expect(p.storeChains).toBeUndefined();
      }
    }
  });

  it('ont tous au moins un prix', () => {
    for (const p of products) expect(pricesByProduct.get(p.id)?.length ?? 0).toBeGreaterThan(0);
  });
});

// ─── Prix ────────────────────────────────────────────────────────────────────

describe('prix', () => {
  it('référencent des produits et magasins existants, une seule fois par couple', () => {
    for (const price of prices) {
      expect(productsById[price.productId]).toBeDefined();
      expect(storesById[price.storeId]).toBeDefined();
    }
    expect(duplicates(prices.map((p) => `${p.productId}@${p.storeId}`))).toEqual([]);
  });

  it('sont en centimes entiers réalistes, sans aucune promotion', () => {
    for (const price of prices) {
      expect(Number.isInteger(price.priceCents)).toBe(true);
      expect(price.priceCents).toBeGreaterThan(0);
      expect(price.priceCents).toBeLessThan(10_000);
      expect(price.promoPriceCents).toBeUndefined();
      expect(price.promoLabel).toBeUndefined();
      expect(price.promoUntil).toBeUndefined();
      expect(['open_prices', 'estimate']).toContain(price.source);
    }
  });

  it('documentent chaque relevé : nombre de relevés et dates dans la fenêtre de l’instantané', () => {
    for (const price of prices.filter((p) => p.source === 'open_prices')) {
      expect(Number.isInteger(price.observationCount)).toBe(true);
      expect(price.observationCount!).toBeGreaterThanOrEqual(1);
      expect(price.observedFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(price.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(price.observedFrom! <= price.updatedAt).toBe(true);
      expect(price.observedFrom! >= catalogMeta.pricesFrom).toBe(true);
      expect(price.updatedAt <= catalogMeta.pricesTo).toBe(true);
      expect(price.estimateMethod).toBeUndefined();
      expect(price.estimateBasisCount).toBeUndefined();
    }
  });

  it('reprennent exactement la médiane de l’instantané pour un produit à code-barres', () => {
    for (const price of prices.filter((p) => p.source === 'open_prices')) {
      const product = productsById[price.productId];
      if (!product.ean) continue;
      const agg = snapshot.aggregates[`ean:${product.ean}`]?.[price.storeId as StoreChain];
      expect(agg).toBeDefined();
      expect(price.priceCents).toBe(agg!.medianCents);
      expect(price.observationCount).toBe(agg!.count);
    }
  });

  it('signalent chaque estimation : méthode cohérente avec le produit, et au moins un prix réel', () => {
    const methodFor: Record<Kind, string> = { national: 'chain_index', bio: 'chain_index', mdd: 'mdd_ratio', vrac: 'category_median' };
    for (const price of prices.filter((p) => p.source === 'estimate')) {
      const product = productsById[price.productId];
      // Une MDD relevée dans une de ses enseignes est estimée dans les autres d'après SON prix.
      const ownObserved = (pricesByProduct.get(product.id) ?? []).some((p) => p.source === 'open_prices');
      const expected = kindOf(product) === 'mdd' && ownObserved ? 'chain_index' : methodFor[kindOf(product)];
      expect(price.estimateMethod).toBe(expected);
      expect(Number.isInteger(price.estimateBasisCount)).toBe(true);
      expect(price.estimateBasisCount!).toBeGreaterThanOrEqual(1);
      expect(price.updatedAt).toBe(catalogMeta.snapshotAt);
      expect(price.observationCount).toBeUndefined();
      expect(price.observedFrom).toBeUndefined();
    }
  });

  it('n’estiment jamais une marque nationale chez un discounter (Lidl, Aldi, Netto)', () => {
    for (const price of prices.filter((p) => p.estimateMethod === 'chain_index')) {
      if (productsById[price.productId].isStoreBrand) continue; // MDD : vendue dans ses enseignes (test suivant)
      expect(GENERALIST_CHAINS).toContain(storesById[price.storeId].chain);
    }
  });

  it('estiment une MDD multi-enseignes d’après son propre prix relevé, ramené par les indices', () => {
    const index = (storeId: string) => catalogMeta.chainIndex[storesById[storeId].chain].value;
    const problems: string[] = [];
    for (const price of prices.filter((p) => p.estimateMethod === 'chain_index' && productsById[p.productId].isStoreBrand)) {
      const own = (pricesByProduct.get(price.productId) ?? []).filter((p) => p.source === 'open_prices');
      // Bornes : chaque relevé propre converti vers l'enseigne estimée (± 1 c d'arrondi).
      const converted = own.map((o) => (o.priceCents / index(o.storeId)) * index(price.storeId));
      const lo = Math.min(...converted) - 1;
      const hi = Math.max(...converted) + 1;
      if (own.length === 0 || price.priceCents < lo || price.priceCents > hi) {
        problems.push(`${price.productId} @ ${price.storeId} : ${price.priceCents} c hors [${lo.toFixed(0)} ; ${hi.toFixed(0)}]`);
      }
      expect(price.estimateBasisCount).toBe(own.reduce((s, o) => s + (o.observationCount ?? 0), 0));
    }
    expect(problems).toEqual([]);
  });

  it('placent chaque MDD uniquement dans ses enseignes', () => {
    for (const price of prices) {
      const product = productsById[price.productId];
      if (product.isStoreBrand) expect(product.storeChains).toContain(storesById[price.storeId].chain);
    }
  });
});

// ─── Couverture (après import des produits réels) ────────────────────────────

/** Tant que productSources est vide (phase d'import en cours), il n'y a rien à couvrir. */
const describeCatalog = productSources.length > 0 ? describe : describe.skip;

describeCatalog('couverture du catalogue', () => {
  const storesWithPrice = (ingredientId: string) =>
    new Set(products.filter((p) => p.ingredientId === ingredientId).flatMap((p) => (pricesByProduct.get(p.id) ?? []).map((x) => x.storeId)));
  const hasObservedPrice = (ingredientId: string) =>
    products.some((p) => p.ingredientId === ingredientId && (pricesByProduct.get(p.id) ?? []).some((x) => x.source === 'open_prices'));

  it('donne à chaque ingrédient de recette au moins un prix relevé, comparable dans au moins 3 enseignes', () => {
    const problems: string[] = [];
    for (const id of requiredIngredientIds) {
      if (!hasObservedPrice(id)) problems.push(`${id} : aucun prix relevé`);
      const n = storesWithPrice(id).size;
      if (n < 3) problems.push(`${id} : prix dans ${n} enseigne(s)`);
    }
    expect(problems).toEqual([]);
  });

  it('couvre par des prix RELEVÉS au moins 80 % des ingrédients achetables', () => {
    const purchasable = Array.from(
      new Set(recipes.flatMap((r) => r.ingredients.map((ri) => ri.ingredientId))),
    ).filter((id) => !NON_PURCHASABLE_INGREDIENT_IDS.includes(id));
    const covered = purchasable.filter(hasObservedPrice);
    expect(covered.length / purchasable.length).toBeGreaterThanOrEqual(0.8);
  });

  it('propose des prix dans chacune des 10 enseignes', () => {
    for (const chain of STORE_CHAINS) {
      const c = catalogMeta.coverage[chain];
      expect(c.observed + c.estimated).toBeGreaterThan(0);
    }
  });
});

// ─── Méta & mentions ─────────────────────────────────────────────────────────

describe('méta et mentions', () => {
  it('décrit fidèlement l’instantané et la couverture', () => {
    expect(catalogMeta.snapshotAt).toBe(snapshot.snapshotAt);
    expect(catalogMeta.pricesFrom).toBe(snapshot.pricesFrom);
    expect(catalogMeta.pricesTo).toBe(snapshot.pricesTo);
    expect(catalogMeta.pricesFrom < catalogMeta.pricesTo).toBe(true);
    expect(catalogMeta.observedPrices).toBe(prices.filter((p) => p.source === 'open_prices').length);
    expect(catalogMeta.estimatedPrices).toBe(prices.filter((p) => p.source === 'estimate').length);
    expect(Object.keys(catalogMeta.coverage)).toEqual([...STORE_CHAINS]);
    for (const chain of STORE_CHAINS) {
      const here = prices.filter((p) => storesById[p.storeId].chain === chain);
      expect(catalogMeta.coverage[chain]).toEqual({
        observed: here.filter((p) => p.source === 'open_prices').length,
        estimated: here.filter((p) => p.source === 'estimate').length,
      });
    }
  });

  it('publie un indice de prix pour chaque enseigne (Leclerc = 1, bornes respectées)', () => {
    expect(Object.keys(catalogMeta.chainIndex)).toEqual([...STORE_CHAINS]);
    expect(catalogMeta.chainIndex.leclerc).toMatchObject({ value: 1, basis: 'measured' });
    for (const chain of STORE_CHAINS) {
      const ix = catalogMeta.chainIndex[chain];
      expect(['measured', 'press']).toContain(ix.basis);
      expect(ix.value).toBeGreaterThanOrEqual(0.85);
      expect(ix.value).toBeLessThanOrEqual(1.6);
      if (ix.basis === 'measured' && chain !== 'leclerc') expect(ix.commonProducts).toBeGreaterThanOrEqual(200);
    }
  });

  it('crédite les sources ouvertes (ODbL)', () => {
    expect(catalogMeta.sources.map((s) => s.name)).toEqual(['Open Food Facts', 'Open Prices', 'OpenStreetMap']);
    for (const s of catalogMeta.sources) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.license).toMatch(/ODbL/);
    }
    expect(DATA_ATTRIBUTION).toMatch(/Open Food Facts/);
    expect(DATA_ATTRIBUTION).toMatch(/Open Prices/);
    expect(DATA_ATTRIBUTION).toMatch(/OpenStreetMap/);
    expect(DATA_ATTRIBUTION).toMatch(/ODbL/);
  });

  it('explique l’origine des prix en français (et garde l’alias déprécié)', () => {
    expect(PRICE_DATA_NOTICE).toMatch(/Open Prices/);
    expect(PRICE_DATA_NOTICE).toMatch(/indicatifs/);
    expect(PRICE_DATA_NOTICE).not.toMatch(/fictiv|démonstration/);
    if (catalogMeta.estimatedPrices > 0) expect(PRICE_DATA_NOTICE).toMatch(/Estimé/);
    expect(DEMO_DATA_NOTICE).toBe(PRICE_DATA_NOTICE);
  });
});

// ─── Générateur & index ──────────────────────────────────────────────────────

/** Toutes les clés d'un objet JSON, en profondeur. */
function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) deepKeys(v, out);
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      deepKeys(v, out);
    }
  }
  return out;
}

describe('générateur et index', () => {
  it('products.ts, prices.ts et meta.ts sont à jour (sinon : npm run data:generate)', () => {
    const rebuilt = buildCatalog(productSources, snapshot, ingredients, stores, ALLERGENS);
    expect(rebuilt.products).toEqual(products);
    expect(rebuilt.prices).toEqual(prices);
    expect(rebuilt.meta).toEqual(catalogMeta);
  });

  it('chaque source produit vise un ingrédient achetable existant, une seule fois', () => {
    expect(duplicates(productSources.map((s) => s.ingredientId))).toEqual([]);
    for (const s of productSources) {
      expect(ingredientsById[s.ingredientId]).toBeDefined();
      expect(NON_PURCHASABLE_INGREDIENT_IDS).not.toContain(s.ingredientId);
    }
  });

  it('l’instantané ne contient aucune donnée personnelle (owner) et couvre 365 jours', () => {
    const keys = deepKeys(snapshot);
    expect(keys.has('owner')).toBe(false);
    expect(keys.has('owner_comment')).toBe(false);
    expect(snapshot.pricesTo).toBe(snapshot.snapshotAt);
    const days = (Date.parse(snapshot.pricesTo) - Date.parse(snapshot.pricesFrom)) / 86_400_000;
    expect(days).toBe(365);
  });

  it('expose des index par id et un objet catalogue cohérents', () => {
    expect(Object.keys(ingredientsById)).toHaveLength(ingredients.length);
    expect(Object.keys(recipesById)).toHaveLength(recipes.length);
    expect(Object.keys(storesById)).toHaveLength(stores.length);
    expect(Object.keys(productsById)).toHaveLength(products.length);
    expect(catalog).toEqual({ ingredients, recipes, stores, products, prices });
    expect(recipesById.rec_carbonara.title).toBe('Spaghetti carbonara');
  });
});
