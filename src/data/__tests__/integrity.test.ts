/**
 * Tests d'intégrité du catalogue de démonstration.
 *
 * Ils garantissent la cohérence référentielle (ids, ingrédients, produits,
 * prix), l'exactitude de l'étiquetage des allergènes (critère de sécurité du
 * dossier) et la couverture des régimes alimentaires par la base de recettes.
 * Les régimes sont TOUJOURS déduits des ingrédients, jamais des tags.
 */
import { describe, expect, it } from '@jest/globals';

import {
  AISLES,
  ALLERGENS,
  CUISINES,
  EQUIPMENT,
  UNITS,
  type Allergen,
  type Ingredient,
  type Price,
  type Product,
  type Recipe,
} from '../../core/types';
import { buildPrices, buildProducts, isValidEan13, ean13CheckDigit } from '../generator/buildCatalog';
import {
  catalog,
  DEMO_DATA_NOTICE,
  ingredients,
  ingredientsById,
  NON_PURCHASABLE_INGREDIENT_IDS,
  prices,
  products,
  productsById,
  recipes,
  recipesById,
  stores,
  storesById,
} from '../index';
import { productSpecs } from '../productSpecs';

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

const pricesByProduct = new Map<string, Price[]>();
for (const price of prices) {
  const list = pricesByProduct.get(price.productId) ?? [];
  list.push(price);
  pricesByProduct.set(price.productId, list);
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
  it('propose 5 enseignes avec des frais et des URL cohérents', () => {
    expect(stores.map((s) => s.id)).toEqual(['leclerc', 'carrefour', 'auchan', 'intermarche', 'lidl']);
    for (const s of stores) {
      expect(s.chain).toBe(s.id);
      expect(s.searchUrlTemplate).toMatch(/^https:\/\/.+\{query\}/);
      expect(s.driveUrl).toMatch(/^https:\/\//);
      expect(Number.isInteger(s.driveFeeCents)).toBe(true);
      expect(s.driveFeeCents).toBeGreaterThanOrEqual(0);
      expect(s.minOrderCents).toBeGreaterThanOrEqual(0);
      if (s.deliveryFeeCents !== null) expect(s.deliveryFeeCents).toBeGreaterThan(0);
    }
    expect(storesById.lidl.deliveryFeeCents).toBeNull();
  });
});

// ─── Produits ────────────────────────────────────────────────────────────────

describe('produits', () => {
  it('ont des ids et des EAN-13 uniques et valides (préfixe France 300-379)', () => {
    expect(duplicates(products.map((p) => p.id))).toEqual([]);
    expect(duplicates(products.map((p) => p.ean))).toEqual([]);
    for (const p of products) {
      expect(isValidEan13(p.ean)).toBe(true);
      const prefix = Number(p.ean.slice(0, 3));
      expect(prefix).toBeGreaterThanOrEqual(300);
      expect(prefix).toBeLessThanOrEqual(379);
    }
  });

  it('calcule correctement le chiffre de contrôle EAN-13', () => {
    // Codes de référence connus.
    expect(ean13CheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(ean13CheckDigit('301762042200')).toBe(3); // 3017620422003 (pâte à tartiner)
    expect(isValidEan13('3017620422003')).toBe(true);
    expect(isValidEan13('3017620422004')).toBe(false);
    expect(isValidEan13('30176204220')).toBe(false);
  });

  it('sont rattachés à un ingrédient, dans son unité de base, avec ses allergènes', () => {
    for (const p of products) {
      const ing = ingredientsById[p.ingredientId];
      expect(ing).toBeDefined();
      expect(p.packUnit).toBe(ing.baseUnit);
      expect(p.packSize).toBeGreaterThan(0);
      expect([...p.allergens].sort()).toEqual([...ing.allergens].sort());
      if (p.nutriScore !== undefined) expect(['A', 'B', 'C', 'D', 'E']).toContain(p.nutriScore);
      expect(p.name.trim().length).toBeGreaterThan(2);
      expect(p.brand.trim().length).toBeGreaterThan(1);
    }
  });

  it('distinguent marques nationales et marques distributeur', () => {
    const chains = new Set(stores.map((s) => s.chain));
    for (const p of products) {
      if (p.isStoreBrand) {
        expect(p.storeChain).toBeDefined();
        expect(chains.has(p.storeChain!)).toBe(true);
      } else {
        expect(p.storeChain).toBeUndefined();
      }
    }
    expect(products.some((p) => p.organic)).toBe(true);
  });

  it('couvrent chaque ingrédient de recette par une marque nationale, et le plus souvent une MDD', () => {
    const recipeIngredientIds = new Set(
      recipes.flatMap((r) => r.ingredients.map((ri) => ri.ingredientId)).filter((id) => !NON_PURCHASABLE_INGREDIENT_IDS.includes(id)),
    );
    let withMdd = 0;
    for (const id of recipeIngredientIds) {
      const list = products.filter((p) => p.ingredientId === id);
      expect(list.some((p) => !p.isStoreBrand && p.storeChain === undefined)).toBe(true);
      if (list.some((p) => p.isStoreBrand)) withMdd++;
    }
    expect(withMdd / recipeIngredientIds.size).toBeGreaterThan(0.7);
    // Aucun produit pour l'eau du robinet.
    expect(products.some((p) => NON_PURCHASABLE_INGREDIENT_IDS.includes(p.ingredientId))).toBe(false);
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

  it('sont réalistes (> 0 et < 100 €, centimes entiers) et datés', () => {
    for (const price of prices) {
      expect(Number.isInteger(price.priceCents)).toBe(true);
      expect(price.priceCents).toBeGreaterThan(0);
      expect(price.priceCents).toBeLessThan(10_000);
      expect(price.source).toBe('demo');
      expect(price.updatedAt).toBe('2026-11-09T06:00:00.000Z');
    }
  });

  it('ont des promotions cohérentes sur environ 8 % des lignes', () => {
    const promos = prices.filter((p) => p.promoPriceCents !== undefined);
    const share = promos.length / prices.length;
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.13);
    for (const p of promos) {
      expect(Number.isInteger(p.promoPriceCents)).toBe(true);
      expect(p.promoPriceCents!).toBeLessThan(p.priceCents);
      expect(p.promoPriceCents!).toBeGreaterThan(0);
      expect(p.promoLabel).toBeTruthy();
      expect(p.promoUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.promoUntil! > '2026-11-10').toBe(true);
      expect(p.promoUntil! < '2027-01-01').toBe(true);
    }
  });

  it('placent chaque MDD uniquement dans son enseigne', () => {
    for (const price of prices) {
      const product = productsById[price.productId];
      if (product.isStoreBrand) expect(storesById[price.storeId].chain).toBe(product.storeChain);
    }
    for (const product of products.filter((p) => p.isStoreBrand)) {
      expect(pricesByProduct.get(product.id)?.length).toBe(1);
    }
  });

  it('placent chaque produit de marque nationale dans au moins 4 magasins sur 5', () => {
    for (const product of products.filter((p) => !p.isStoreBrand)) {
      const storesWithPrice = new Set((pricesByProduct.get(product.id) ?? []).map((p) => p.storeId));
      expect(storesWithPrice.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('permettent de comparer chaque ingrédient de recette dans au moins 3 magasins', () => {
    const tooFew: string[] = [];
    for (const id of requiredIngredientIds) {
      const storeIds = new Set(
        products.filter((p) => p.ingredientId === id).flatMap((p) => (pricesByProduct.get(p.id) ?? []).map((x) => x.storeId)),
      );
      if (storeIds.size < 3) tooFew.push(`${id} (${storeIds.size})`);
    }
    expect(requiredIngredientIds.length).toBeGreaterThan(100);
    expect(tooFew).toEqual([]);
  });

  it('rendent la MDD moins chère que la marque nationale (prix à l’unité, même magasin)', () => {
    const unit = (p: Product, price: Price) => price.priceCents / p.packSize;
    const violations: string[] = [];
    for (const mdd of products.filter((p) => p.isStoreBrand)) {
      const national = productsById[`prd_${mdd.ingredientId}`];
      expect(national).toBeDefined();
      const mddPrice = pricesByProduct.get(mdd.id)![0];
      const natPrice = (pricesByProduct.get(national.id) ?? []).find((x) => x.storeId === mddPrice.storeId);
      if (!natPrice) continue; // marque nationale non référencée dans ce magasin (ex. Lidl)
      if (unit(mdd, mddPrice) >= unit(national, natPrice)) {
        violations.push(`${mdd.id} : ${mddPrice.priceCents}/${mdd.packSize} ≥ ${natPrice.priceCents}/${national.packSize}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('reflètent les indices d’enseigne (Lidl et Leclerc moins chers que Carrefour en moyenne)', () => {
    const avgRatio = (storeId: string) => {
      const ratios: number[] = [];
      for (const product of products.filter((p) => !p.isStoreBrand)) {
        const list = pricesByProduct.get(product.id) ?? [];
        const here = list.find((x) => x.storeId === storeId);
        const ref = list.find((x) => x.storeId === 'carrefour');
        if (here && ref) ratios.push(here.priceCents / ref.priceCents);
      }
      return ratios.reduce((a, b) => a + b, 0) / ratios.length;
    };
    expect(avgRatio('leclerc')).toBeLessThan(0.99);
    expect(avgRatio('lidl')).toBeLessThan(0.99);
    expect(avgRatio('intermarche')).toBeGreaterThan(0.99);
  });

  it('donnent des prix au kilo plausibles pour quelques produits phares', () => {
    const perKg = (productId: string, storeId: string) => {
      const p = productsById[productId];
      const price = pricesByProduct.get(productId)!.find((x) => x.storeId === storeId)!;
      return (price.priceCents / p.packSize) * 1000;
    };
    // Pâtes : 1,50 à 5 €/kg ; filets de poulet : 10 à 25 €/kg ; beurre : 8 à 18 €/kg.
    expect(perKg('prd_pates_spaghetti', 'carrefour')).toBeGreaterThan(150);
    expect(perKg('prd_pates_spaghetti', 'carrefour')).toBeLessThan(500);
    expect(perKg('prd_blanc_poulet', 'carrefour')).toBeGreaterThan(1000);
    expect(perKg('prd_blanc_poulet', 'carrefour')).toBeLessThan(2500);
    expect(perKg('prd_beurre', 'carrefour')).toBeGreaterThan(800);
    expect(perKg('prd_beurre', 'carrefour')).toBeLessThan(1800);
  });
});

// ─── Générateur & index ──────────────────────────────────────────────────────

describe('générateur et index', () => {
  it('products.ts et prices.ts sont à jour avec productSpecs.ts (relancer run.mjs sinon)', () => {
    const regenerated = buildProducts(productSpecs, ingredients, stores, ALLERGENS);
    expect(regenerated).toEqual(products);
    expect(buildPrices(productSpecs, regenerated, stores)).toEqual(prices);
  });

  it('chaque spécification produit vise un ingrédient existant, une seule fois', () => {
    expect(duplicates(productSpecs.map((s) => s.ingredientId))).toEqual([]);
    for (const spec of productSpecs) expect(ingredientsById[spec.ingredientId]).toBeDefined();
  });

  it('expose des index par id et un objet catalogue cohérents', () => {
    expect(Object.keys(ingredientsById)).toHaveLength(ingredients.length);
    expect(Object.keys(recipesById)).toHaveLength(recipes.length);
    expect(Object.keys(storesById)).toHaveLength(stores.length);
    expect(Object.keys(productsById)).toHaveLength(products.length);
    expect(catalog).toEqual({ ingredients, recipes, stores, products, prices });
    expect(recipesById.rec_carbonara.title).toBe('Spaghetti carbonara');
    expect(DEMO_DATA_NOTICE).toMatch(/démonstration/);
  });
});
