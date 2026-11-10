/// <reference types="jest" />
/**
 * Tests ADVERSARIAUX — sécurité alimentaire.
 *
 * Promesse produit : « aucun plat suggéré ne contient un allergène déclaré »
 * (et aucun plat incompatible avec un régime déclaré). On attaque ici TOUS
 * les points d'entrée qui produisent des recettes, avec un ORACLE
 * indépendant écrit à partir de la spécification (il ne réutilise pas
 * `checkRecipe`), des données corrompues et des réponses de LLM malveillantes.
 */
import { INGREDIENTS_BY_ID, RECIPES, emptyPlan, makeProfile, recipe } from './fixtures';
import {
  assertPlanSafe,
  checkRecipe,
  dietAllows,
  filterSafeRecipes,
  isRecipeSafe,
  recipeAllergens,
} from '../constraints';
import {
  extractJson,
  generateMealPlan,
  parseLlmResponse,
  planFromSelection,
  selectLlmCandidates,
  setMealLocked,
  suggestAlternatives,
  weekSlots,
  type LlmSelection,
  type MealEngineInput,
} from '../mealEngine';
import { recipesUsingLeftovers } from '../pantry';
import { mulberry32 } from '../random';
import { ALLERGENS, DIETS } from '../types';
import type {
  Allergen,
  Diet,
  Ingredient,
  MealPlan,
  MealSlotPreference,
  MealType,
  PantryItem,
  Recipe,
  RecipeIngredient,
  UserProfile,
} from '../types';

const WEEK = '2026-11-09'; // lundi
const NOW = '2026-11-10T08:00:00.000Z';

// ─── Oracle indépendant (spécification) ──────────────────────────────────────

const has = Object.prototype.hasOwnProperty;

/**
 * Vrai si la recette est DANGEREUSE pour le profil, d'après la spécification :
 * allergènes déclarés, règles de chaque régime, ingrédients inconnus,
 * optionnels compris (fail closed).
 */
function oracleUnsafe(r: Recipe, profile: Pick<UserProfile, 'allergens' | 'diets'>, ings: Record<string, Ingredient>): boolean {
  let meat = false;
  let dairy = false;
  for (const x of r.ingredients) {
    if (!has.call(ings, x.ingredientId)) return true;
    const ing = ings[x.ingredientId];
    if (!ing || !Array.isArray(ing.allergens)) return true;
    const A = (a: Allergen) => ing.allergens.includes(a);
    if (ing.allergens.some((a) => profile.allergens.includes(a))) return true;
    const shellfish = ing.isSeafood || A('crustaces') || A('mollusques');
    const flesh = ing.isMeat || ing.isPork || ing.isFish || shellfish || A('poissons');
    for (const d of profile.diets) {
      switch (d) {
        case 'vegetarien':
          if (flesh) return true;
          break;
        case 'vegan':
          if (flesh || ing.isAnimalProduct || A('oeufs') || A('lait')) return true;
          break;
        case 'pescetarien':
          if (ing.isMeat || ing.isPork) return true;
          break;
        case 'halal':
          if (ing.isPork || ing.isAlcohol) return true;
          break;
        case 'casher':
          if (ing.isPork || shellfish) return true;
          break;
        case 'sans_porc':
          if (ing.isPork) return true;
          break;
        case 'sans_gluten':
          if (A('gluten')) return true;
          break;
        case 'sans_lactose':
          if (A('lait')) return true;
          break;
        default:
          return true;
      }
    }
    if (ing.isMeat || ing.isPork) meat = true;
    if (A('lait')) dairy = true;
  }
  return profile.diets.includes('casher') && meat && dairy;
}

// ─── Petites fabriques ───────────────────────────────────────────────────────

function ingr(id: string, o: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id,
    aisle: 'autre',
    allergens: [],
    isMeat: false,
    isPork: false,
    isFish: false,
    isSeafood: false,
    isAnimalProduct: false,
    baseUnit: 'g',
    ...o,
  };
}

function riOf(ingredientId: string, optional = false): RecipeIngredient {
  return optional ? { ingredientId, quantity: 100, unit: 'g', optional } : { ingredientId, quantity: 100, unit: 'g' };
}

function input(o: Partial<MealEngineInput> = {}): MealEngineInput {
  return {
    profile: makeProfile(),
    recipes: RECIPES,
    ingredientsById: INGREDIENTS_BY_ID,
    weekStart: WEEK,
    seed: 'adv',
    now: NOW,
    ...o,
  };
}

function recipesById(list: readonly Recipe[]): Record<string, Recipe> {
  return Object.fromEntries(list.map((r) => [r.id, r]));
}

/** Tous les repas d'un planning sont sûrs selon l'oracle (recette de la liste fournie). */
function expectPlanSafe(plan: MealPlan, list: readonly Recipe[], profile: UserProfile, ings: Record<string, Ingredient>) {
  for (const m of plan.meals) {
    const versions = list.filter((r) => r.id === m.recipeId);
    expect(versions.length).toBeGreaterThan(0);
    // Chaque version portant cet id doit être sûre (le client peut afficher n'importe laquelle).
    for (const v of versions) expect(oracleUnsafe(v, profile, ings)).toBe(false);
  }
}

// ─── 1. Règles de régime, une par une ────────────────────────────────────────

describe('règles de régime (matrice exhaustive)', () => {
  const miel = ingr('miel', { isAnimalProduct: true });
  const oeuf = ingr('oeuf', { allergens: ['oeufs'] }); // drapeau animal OUBLIÉ : l'allergène suffit
  const beurre = ingr('beurre', { allergens: ['lait'] }); // idem
  const gelatinePorc = ingr('gelatine', { isAnimalProduct: true, isPork: true });
  const anchois = ingr('worcestershire', { allergens: ['poissons'] }); // sauce : pas de drapeau isFish
  const saumon = ingr('saumon', { isFish: true, isAnimalProduct: true, allergens: ['poissons'] });
  const crevette = ingr('crevette', { isSeafood: true, allergens: ['crustaces'] });
  const calamarSansDrapeau = ingr('calamar', { allergens: ['mollusques'] }); // isSeafood oublié
  const poulet = ingr('poulet', { isMeat: true, isAnimalProduct: true });
  const lardons = ingr('lardons', { isMeat: true, isPork: true, isAnimalProduct: true });
  const vin = ingr('vin', { isAlcohol: true, allergens: ['sulfites'] });
  const farine = ingr('farine', { allergens: ['gluten'] });
  const tofu = ingr('tofu', { allergens: ['soja'] });

  const cases: [Diet, Ingredient, boolean][] = [
    ['vegan', miel, false],
    ['vegan', oeuf, false],
    ['vegan', beurre, false],
    ['vegan', gelatinePorc, false],
    ['vegan', anchois, false],
    ['vegan', tofu, true],
    ['vegetarien', gelatinePorc, false],
    ['vegetarien', anchois, false],
    ['vegetarien', calamarSansDrapeau, false],
    ['vegetarien', miel, true],
    ['vegetarien', oeuf, true],
    ['pescetarien', saumon, true],
    ['pescetarien', crevette, true],
    ['pescetarien', poulet, false],
    ['pescetarien', lardons, false],
    ['pescetarien', gelatinePorc, false],
    ['halal', lardons, false],
    ['halal', gelatinePorc, false],
    ['halal', vin, false],
    ['halal', poulet, true],
    ['casher', lardons, false],
    ['casher', crevette, false],
    ['casher', calamarSansDrapeau, false],
    ['casher', saumon, true],
    ['sans_porc', gelatinePorc, false],
    ['sans_porc', poulet, true],
    ['sans_gluten', farine, false],
    ['sans_gluten', tofu, true],
    ['sans_lactose', beurre, false],
    ['sans_lactose', oeuf, true],
  ];
  it.each(cases)('%s + %p → autorisé = %s', (diet, ing, expected) => {
    expect(dietAllows(diet, ing)).toBe(expected);
  });

  it('régime inconnu (donnée corrompue / version future) → tout est refusé', () => {
    expect(dietAllows('paleo' as Diet, tofu)).toBe(false);
  });

  const ings = Object.fromEntries([poulet, beurre, saumon, ingr('riz')].map((i) => [i.id, i]));
  const p = (diets: Diet[]) => makeProfile({ diets });

  it('casher : viande + lait interdit, même si le laitage est OPTIONNEL', () => {
    const r = recipe('poulet_beurre', { title: 'x', ingredients: [riOf('poulet'), riOf('beurre', true)] });
    expect(isRecipeSafe(r, p(['casher']), ings)).toBe(false);
    expect(isRecipeSafe(r, p([]), ings)).toBe(true);
  });

  it('casher : poisson + lait autorisé (le poisson n’est pas de la viande)', () => {
    const r = recipe('saumon_beurre', { title: 'x', ingredients: [riOf('saumon'), riOf('beurre')] });
    expect(isRecipeSafe(r, p(['casher']), ings)).toBe(true);
  });

  it('cumul de régimes : halal + sans_gluten + vegan sont tous appliqués', () => {
    const r = recipe('riz_poulet', { title: 'x', ingredients: [riOf('riz'), riOf('poulet')] });
    expect(isRecipeSafe(r, p(['halal', 'sans_gluten']), ings)).toBe(true);
    expect(isRecipeSafe(r, p(['halal', 'sans_gluten', 'vegan']), ings)).toBe(false);
  });

  it('allergène dans un ingrédient OPTIONNEL → recette non sûre', () => {
    const r = recipe('opt', { title: 'x', ingredients: [riOf('riz'), riOf('beurre', true)] });
    expect(isRecipeSafe(r, makeProfile({ allergens: ['lait'] }), ings)).toBe(false);
    expect(recipeAllergens(r, ings)).toEqual(['lait']);
  });

  it('chaque allergène réglementaire est bloqué individuellement', () => {
    for (const a of ALLERGENS) {
      const i = ingr(`ing_${a}`, { allergens: [a] });
      const r = recipe(`r_${a}`, { title: a, ingredients: [riOf(i.id)] });
      const db = { [i.id]: i };
      expect(isRecipeSafe(r, makeProfile({ allergens: [a] }), db)).toBe(false);
      // Un autre allergène déclaré ne la bloque pas.
      const other = ALLERGENS.find((x) => x !== a) as Allergen;
      expect(isRecipeSafe(r, makeProfile({ allergens: [other] }), db)).toBe(true);
    }
  });
});

// ─── 2. Données corrompues : fail closed, jamais d'exception ─────────────────

describe('données corrompues — ingrédients inconnus et clés piégées', () => {
  const PROTO_KEYS = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'];

  it.each(PROTO_KEYS)('ingrédient « %s » (clé héritée d’Object) → inconnu, pas de crash', (key) => {
    const r = recipe(`piege_${key}`, { title: 'Piège', ingredients: [riOf('riz'), riOf(key)] });
    expect(() => checkRecipe(r, makeProfile(), INGREDIENTS_BY_ID)).not.toThrow();
    const check = checkRecipe(r, makeProfile(), INGREDIENTS_BY_ID);
    expect(check.safe).toBe(false);
    expect(check.violations.some((v) => v.kind === 'unknown_ingredient')).toBe(true);
    expect(() => recipeAllergens(r, INGREDIENTS_BY_ID)).not.toThrow();
  });

  it('un catalogue contenant une recette piégée génère quand même un planning sûr', () => {
    const trap = recipe('piege', { title: 'Piège', ingredients: [riOf('constructor')], prepTimeMin: 1, cookTimeMin: 1 });
    const recipes = [trap, ...RECIPES];
    const plan = generateMealPlan(input({ recipes }));
    expect(plan.meals.length).toBeGreaterThan(0);
    expect(plan.meals.some((m) => m.recipeId === 'piege')).toBe(false);
  });

  it('ingrédient sans liste d’allergènes (enregistrement incomplet) → non sûr, pas de crash', () => {
    const broken = { ...ingr('mystere'), allergens: undefined } as unknown as Ingredient;
    const db = { ...INGREDIENTS_BY_ID, mystere: broken };
    const r = recipe('mystere_r', { title: 'Mystère', ingredients: [riOf('mystere')] });
    expect(() => checkRecipe(r, makeProfile(), db)).not.toThrow();
    expect(isRecipeSafe(r, makeProfile({ allergens: ['arachides'] }), db)).toBe(false);
  });

  it('recette référençant un ingrédient inconnu → rejetée partout', () => {
    const ghost = recipe('fantome', { title: 'Fantôme', ingredients: [riOf('riz'), riOf('ingredient_inexistant')], prepTimeMin: 1, cookTimeMin: 1, costLevel: 1 });
    const recipes = [ghost, ...RECIPES];
    const profile = makeProfile({ favoriteCuisines: ['francaise'] });
    const inp = input({ recipes, profile });
    const plan = generateMealPlan(inp);
    expect(plan.meals.some((m) => m.recipeId === 'fantome')).toBe(false);
    expect(selectLlmCandidates(inp).some((r) => r.id === 'fantome')).toBe(false);
    expect(suggestAlternatives(inp, plan, plan.meals[0].id, 50).some((r) => r.id === 'fantome')).toBe(false);
    expect(filterSafeRecipes(recipes, profile, INGREDIENTS_BY_ID).some((r) => r.id === 'fantome')).toBe(false);
    const forced = planFromSelection(inp, [{ date: WEEK, type: 'diner', recipeId: 'fantome' }], 'ai');
    expect(forced.meals.some((m) => m.recipeId === 'fantome')).toBe(false);
  });

  it('recette dupliquée (même id, une version dangereuse) → l’id entier est écarté', () => {
    // Ex. cache local périmé + version serveur qui ajoute des cacahuètes.
    const old = recipe('wok', { title: 'Wok', ingredients: [riOf('riz')], prepTimeMin: 1, cookTimeMin: 1 });
    const updated = recipe('wok', { title: 'Wok', ingredients: [riOf('riz'), riOf('cacahuetes')], prepTimeMin: 1, cookTimeMin: 1 });
    const profile = makeProfile({ allergens: ['arachides'] });
    for (const recipes of [[old, updated, ...RECIPES], [updated, old, ...RECIPES]]) {
      const inp = input({ recipes, profile });
      const plan = generateMealPlan(inp);
      expectPlanSafe(plan, recipes, profile, INGREDIENTS_BY_ID);
      expect(selectLlmCandidates(inp).some((r) => r.id === 'wok')).toBe(false);
      const ai = planFromSelection(inp, [{ date: WEEK, type: 'diner', recipeId: 'wok' }], 'ai');
      expectPlanSafe(ai, recipes, profile, INGREDIENTS_BY_ID);
      expect(suggestAlternatives(inp, plan, plan.meals[0].id, 100).some((r) => r.id === 'wok')).toBe(false);
    }
  });

  it('profil sans allergènes/régimes définis (undefined) → pas de crash', () => {
    const profile = { ...makeProfile(), allergens: undefined, diets: undefined } as unknown as UserProfile;
    expect(() => generateMealPlan(input({ profile }))).not.toThrow();
  });
});

// ─── 3. Repas verrouillés devenus dangereux ──────────────────────────────────

describe('repas verrouillés après changement de profil', () => {
  function lockedPlanFor(profile: UserProfile): MealPlan {
    const plan = generateMealPlan(input({ profile, maxMeals: 14 }));
    return plan.meals.reduce((p, m) => setMealLocked(p, m.id, true), plan);
  }

  const changes: [string, Partial<UserProfile>][] = [
    ['nouvelle allergie lait', { allergens: ['lait'] }],
    ['nouvelle allergie gluten', { allergens: ['gluten'] }],
    ['devient vegan', { diets: ['vegan'] }],
    ['devient végétarien', { diets: ['vegetarien'] }],
    ['devient halal', { diets: ['halal'] }],
    ['devient casher', { diets: ['casher'] }],
    ['devient sans gluten', { diets: ['sans_gluten'] }],
  ];

  it.each(changes)('%s → aucun repas verrouillé dangereux n’est conservé', (_label, change) => {
    const before = makeProfile({ mealSlots: allSlots(), maxCookTimeWeekdayMin: 0, maxCookTimeWeekendMin: 0 });
    const locked = lockedPlanFor(before);
    expect(locked.meals.length).toBeGreaterThan(5);
    const after = { ...before, ...change };
    const next = generateMealPlan(input({ profile: after, existing: locked, maxMeals: 14 }));
    expectPlanSafe(next, RECIPES, after, INGREDIENTS_BY_ID);
    expect(assertPlanSafe(next, recipesById(RECIPES), after, INGREDIENTS_BY_ID).ok).toBe(true);
    // Le mode IA ne réintroduit pas non plus le plat dangereux verrouillé.
    const ai = planFromSelection(
      input({ profile: after, existing: locked, maxMeals: 14 }),
      locked.meals.map((m) => ({ date: m.date, type: m.type, recipeId: m.recipeId })),
      'ai',
    );
    expectPlanSafe(ai, RECIPES, after, INGREDIENTS_BY_ID);
  });

  it('repas verrouillé dont la recette a disparu du catalogue → retiré', () => {
    const before = makeProfile();
    const locked = lockedPlanFor(before);
    const gone = locked.meals[0].recipeId;
    const recipes = RECIPES.filter((r) => r.id !== gone);
    const next = generateMealPlan(input({ profile: before, existing: locked, recipes }));
    expect(next.meals.some((m) => m.recipeId === gone)).toBe(false);
  });

  it('repas verrouillé à date corrompue → ignoré, pas de crash', () => {
    const existing = emptyPlan(WEEK, [
      { id: 'm_bad', date: 'pas-une-date', type: 'diner', recipeId: 'dahl', servings: 2, locked: true },
    ]);
    expect(() => generateMealPlan(input({ existing }))).not.toThrow();
    expect(() => parseLlmResponse('{"meals":[]}', input({ existing }), RECIPES)).not.toThrow();
  });
});

function allSlots(): MealSlotPreference[] {
  const out: MealSlotPreference[] = [];
  for (let d = 0; d < 7; d++) for (const t of ['dejeuner', 'diner'] as MealType[]) out.push({ weekday: d as MealSlotPreference['weekday'], type: t });
  return out;
}

// ─── 4. Réponses LLM malveillantes / hallucinées ─────────────────────────────

describe('parseLlmResponse — entrées hostiles', () => {
  const profile = makeProfile({ allergens: ['arachides', 'crustaces'], diets: ['halal'] });
  const inp = input({ profile });
  // Appelant négligent : TOUTES les recettes passées comme « candidates ».
  const parse = (text: string) => parseLlmResponse(text, inp, RECIPES);
  const mon = WEEK;
  const tue = '2026-11-10';

  it('ids dangereux (allergène, régime) écartés même s’ils sont « candidats »', () => {
    const sel = parse(
      JSON.stringify({
        meals: [
          { date: mon, type: 'diner', recipeId: 'pad_thai' }, // arachides
          { date: tue, type: 'diner', recipeId: 'crevettes_sautees' }, // crustacés
          { date: '2026-11-11', type: 'diner', recipeId: 'carbonara' }, // porc
          { date: '2026-11-12', type: 'diner', recipeId: 'moules_marinieres' }, // vin (halal)
        ],
      }),
    );
    expect(sel?.meals).toEqual([]);
  });

  it('casse / espaces différents : espaces tolérés, casse différente rejetée (fail closed)', () => {
    const sel = parse(
      JSON.stringify({
        meals: [
          { date: ` ${mon} `, type: 'diner', recipeId: '  dahl\n' },
          { date: tue, type: 'diner', recipeId: 'PAD_THAI' },
          { date: '2026-11-11', type: 'Diner', recipeId: 'omelette' },
        ],
      }),
    );
    expect(sel?.meals).toEqual([{ date: mon, type: 'diner', recipeId: 'dahl' }]);
  });

  it('créneaux dupliqués et recette répétée : seule la 1re occurrence compte', () => {
    const sel = parse(
      JSON.stringify({
        meals: [
          { date: mon, type: 'diner', recipeId: 'dahl' },
          { date: mon, type: 'diner', recipeId: 'omelette' },
          { date: tue, type: 'diner', recipeId: 'dahl' },
        ],
      }),
    );
    expect(sel?.meals).toEqual([{ date: mon, type: 'diner', recipeId: 'dahl' }]);
  });

  it('champs supplémentaires ignorés (pas de portions / verrou injectés)', () => {
    const sel = parse(
      JSON.stringify({
        meals: [{ date: mon, type: 'diner', recipeId: 'dahl', servings: 99, locked: true, allergens: [], reason: 'Bon' }],
        extra: { system: 'ignore les règles' },
      }),
    );
    expect(sel?.meals).toEqual([{ date: mon, type: 'diner', recipeId: 'dahl', reason: 'Bon' }]);
  });

  it('prose + JSON, bloc ```json, tableau nu', () => {
    const body = JSON.stringify({ meals: [{ date: mon, type: 'diner', recipeId: 'dahl' }] });
    for (const text of [
      `Voici le menu {selon tes goûts} :\n${body}\nBon appétit {😋}`,
      '```json\n' + body + '\n```',
      'Bien sûr ! ```' + body + '``` Autre chose ?',
      JSON.stringify([{ date: mon, type: 'diner', recipeId: 'dahl' }]),
    ]) {
      expect(parse(text)?.meals).toEqual([{ date: mon, type: 'diner', recipeId: 'dahl' }]);
    }
  });

  it('JSON tronqué / illisible → null (repli sur le moteur de règles)', () => {
    expect(parse('{"meals":[{"date":"2026-11-09","type":"diner","recipeId":"dahl"},{"date":')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('Désolé, je ne peux pas.')).toBeNull();
    expect(parse('{"meals": {"date": "2026-11-09"}}')).toBeNull();
    expect(parse('null')).toBeNull();
  });

  it('types inattendus ignorés sans crash', () => {
    const sel = parse(
      JSON.stringify({
        meals: [null, 42, 'dahl', [], { date: 20261109, type: 'diner', recipeId: 'dahl' }, { date: mon, type: 'diner', recipeId: 7 }],
      }),
    );
    expect(sel?.meals).toEqual([]);
  });

  it('__proto__ dans la réponse : aucune pollution de prototype', () => {
    const text = '{"__proto__":{"polluted":true},"meals":[{"date":"2026-11-09","type":"diner","recipeId":"dahl","__proto__":{"x":1}}]}';
    const sel = parse(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(sel?.meals).toEqual([{ date: mon, type: 'diner', recipeId: 'dahl' }]);
  });

  it('créneau hors semaine ou non demandé → écarté ; raison tronquée à 120 caractères', () => {
    const sel = parse(
      JSON.stringify({
        meals: [
          { date: '2026-11-16', type: 'diner', recipeId: 'dahl' },
          { date: mon, type: 'dejeuner', recipeId: 'omelette' }, // pas de déjeuner le lundi (créneaux par défaut)
          { date: tue, type: 'diner', recipeId: 'omelette', reason: 'x'.repeat(500) },
        ],
      }),
    );
    expect(sel?.meals).toHaveLength(1);
    expect(sel?.meals[0].reason).toHaveLength(120);
  });

  it('candidat FALSIFIÉ (même id, ingrédients « nettoyés ») : planFromSelection revalide avec le catalogue', () => {
    const forged = { ...RECIPES.find((r) => r.id === 'pad_thai')!, ingredients: [riOf('riz')] };
    const sel = parseLlmResponse(JSON.stringify({ meals: [{ date: mon, type: 'diner', recipeId: 'pad_thai' }] }), inp, [forged]);
    expect(sel?.meals).toHaveLength(1); // le faux candidat paraît sûr…
    const plan = planFromSelection(inp, sel as LlmSelection, 'ai');
    expect(plan.meals.some((m) => m.recipeId === 'pad_thai')).toBe(false); // …mais il est rejeté ici
    expectPlanSafe(plan, RECIPES, profile, INGREDIENTS_BY_ID);
  });

  it('extractJson : beaucoup d’accolades parasites, temps raisonnable', () => {
    const body = JSON.stringify({ meals: [{ date: mon, type: 'diner', recipeId: 'dahl' }] });
    const noise = '{a} [b] '.repeat(400);
    const t0 = Date.now();
    expect(extractJson(`${noise}${body}${noise}`)).toEqual(JSON.parse(body));
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

// ─── 5. Remplacement, anti-gaspi, relâchement ────────────────────────────────

describe('autres points d’entrée', () => {
  it('suggestAlternatives après changement de profil : jamais de plat dangereux', () => {
    const plan = generateMealPlan(input());
    const profile = makeProfile({ allergens: ['lait', 'oeufs'], diets: ['vegetarien'] });
    for (const m of plan.meals) {
      for (const r of suggestAlternatives(input({ profile }), plan, m.id, 100)) {
        expect(oracleUnsafe(r, profile, INGREDIENTS_BY_ID)).toBe(false);
        expect(r.mealTypes).toContain(m.type);
      }
    }
    expect(suggestAlternatives(input(), plan, 'inconnu')).toEqual([]);
    expect(suggestAlternatives(input(), plan, plan.meals[0].id, -3)).toEqual([]);
  });

  it('recipesUsingLeftovers : sûres uniquement, ingrédients inconnus exclus', () => {
    const ghost = recipe('fantome', { title: 'Fantôme', ingredients: [riOf('oeuf'), riOf('xyz')] });
    const trap = recipe('piege', { title: 'Piège', ingredients: [riOf('oeuf'), riOf('constructor')] });
    const pantry: PantryItem[] = [
      { id: 'p1', ingredientId: 'oeuf', label: 'Œufs', quantity: 6, unit: 'piece', addedAt: NOW, expiresAt: '2026-11-11' },
      { id: 'p2', ingredientId: 'lait', label: 'Lait', quantity: 500, unit: 'ml', addedAt: NOW },
      { id: 'p3', ingredientId: 'cacahuetes', label: 'Cacahuètes', quantity: 100, unit: 'g', addedAt: NOW },
    ];
    for (const profile of [makeProfile(), makeProfile({ allergens: ['oeufs'] }), makeProfile({ diets: ['vegan'], allergens: ['arachides'] })]) {
      const out = recipesUsingLeftovers([ghost, trap, ...RECIPES], pantry, INGREDIENTS_BY_ID, profile, 100);
      for (const s of out) {
        expect(oracleUnsafe(s.recipe, profile, INGREDIENTS_BY_ID)).toBe(false);
        expect(['fantome', 'piege']).not.toContain(s.recipe.id);
      }
    }
  });

  it('relâchement : si seules des recettes dangereuses existent, le créneau reste vide', () => {
    const recipes = RECIPES.filter((r) => r.id === 'pad_thai' || r.id === 'crevettes_sautees');
    const profile = makeProfile({ allergens: ['arachides', 'crustaces'] });
    const plan = generateMealPlan(input({ recipes, profile }));
    expect(plan.meals).toEqual([]);
  });

  it('relâchement : temps / ustensiles / « pas aimé » relâchés, jamais la sécurité', () => {
    // Une seule recette sûre, longue, avec un ustensile absent et un ingrédient détesté.
    const safe = recipe('long', {
      title: 'Long',
      ingredients: [riOf('riz'), riOf('carotte')],
      prepTimeMin: 200,
      cookTimeMin: 200,
      equipment: ['barbecue'],
    });
    const profile = makeProfile({ allergens: ['arachides'], dislikedIngredientIds: ['carotte'] });
    const plan = generateMealPlan(input({ recipes: [safe, RECIPES.find((r) => r.id === 'pad_thai')!], profile }));
    expect(plan.meals.length).toBe(weekSlots(profile, WEEK).length);
    expect(new Set(plan.meals.map((m) => m.recipeId))).toEqual(new Set(['long']));
  });
});

// ─── 6. Propriété : catalogues ALÉATOIRES vs oracle ──────────────────────────

describe('propriété : catalogues et profils aléatoires (oracle indépendant)', () => {
  function pick<T>(rand: () => number, arr: readonly T[]): T {
    return arr[Math.floor(rand() * arr.length)];
  }

  function randomCatalog(rand: () => number): { ings: Record<string, Ingredient>; recipes: Recipe[] } {
    const list: Ingredient[] = [];
    for (let i = 0; i < 30; i++) {
      const allergens = ALLERGENS.filter(() => rand() < 0.08);
      const isPork = rand() < 0.07;
      const isMeat = isPork || rand() < 0.12;
      list.push(
        ingr(`i${i}`, {
          allergens,
          isPork,
          isMeat,
          isFish: rand() < 0.08,
          isSeafood: rand() < 0.05,
          isAnimalProduct: isMeat || rand() < 0.15,
          isAlcohol: rand() < 0.05,
        }),
      );
    }
    const ings = Object.fromEntries(list.map((i) => [i.id, i]));
    const recipes: Recipe[] = [];
    for (let r = 0; r < 60; r++) {
      const n = 1 + Math.floor(rand() * 5);
      const ingredients: RecipeIngredient[] = [];
      for (let k = 0; k < n; k++) {
        const roll = rand();
        const id = roll < 0.03 ? 'inconnu' : roll < 0.05 ? pick(rand, ['constructor', 'toString', '__proto__']) : `i${Math.floor(rand() * 30)}`;
        ingredients.push(riOf(id, rand() < 0.2));
      }
      const mealTypes: MealType[] = rand() < 0.3 ? ['diner'] : rand() < 0.3 ? ['dejeuner'] : ['dejeuner', 'diner'];
      recipes.push(
        recipe(`r${r}`, {
          title: `R${r}`,
          ingredients,
          mealTypes,
          prepTimeMin: Math.floor(rand() * 40),
          cookTimeMin: Math.floor(rand() * 60),
          costLevel: (1 + Math.floor(rand() * 3)) as 1 | 2 | 3,
          equipment: rand() < 0.2 ? ['four'] : ['plaques'],
          cuisine: pick(rand, ['francaise', 'italienne', 'asiatique'] as const),
        }),
      );
    }
    // Quelques doublons d'id (versions divergentes).
    for (let d = 0; d < 3; d++) {
      const base = pick(rand, recipes);
      recipes.push({ ...base, ingredients: [...base.ingredients, riOf(`i${Math.floor(rand() * 30)}`)] });
    }
    return { ings, recipes };
  }

  function randomProfile(rand: () => number): UserProfile {
    return makeProfile({
      allergens: ALLERGENS.filter(() => rand() < 0.15),
      diets: DIETS.filter(() => rand() < 0.15),
      dislikedIngredientIds: rand() < 0.5 ? [`i${Math.floor(rand() * 30)}`] : [],
      mealSlots: rand() < 0.5 ? [] : allSlots().filter(() => rand() < 0.6),
      equipment: rand() < 0.5 ? ['plaques'] : ['plaques', 'four'],
    });
  }

  it('300 cas : planning, verrouillés, alternatives, candidats, IA, anti-gaspi — toujours sûrs', () => {
    const rand = mulberry32(20261110);
    let mealsChecked = 0;
    for (let c = 0; c < 300; c++) {
      const { ings, recipes } = randomCatalog(rand);
      const profileBefore = randomProfile(rand);
      const profile = randomProfile(rand);
      const base = { recipes, ingredientsById: ings, weekStart: WEEK, seed: c, now: NOW };

      // Planning fait avec l'ANCIEN profil, tout verrouillé, puis profil changé.
      const old = generateMealPlan({ ...base, profile: profileBefore, maxMeals: 14 });
      // On verrouille aussi des recettes arbitraires (même dangereuses) pour forcer le tri.
      const forcedLocks = old.meals.map((m) => ({ ...m, locked: true, recipeId: rand() < 0.5 ? pick(rand, recipes).id : m.recipeId }));
      const existing = { ...old, meals: forcedLocks };

      const inp: MealEngineInput = { ...base, profile, existing, maxMeals: rand() < 0.3 ? 3 : 14 };
      const plan = generateMealPlan(inp);
      expectPlanSafe(plan, recipes, profile, ings);
      mealsChecked += plan.meals.length;

      // Sélection IA hostile : ids aléatoires (dangereux compris), créneaux de la semaine.
      const slots = weekSlots(profile, WEEK);
      const hostile = slots.map((s) => ({ date: s.date, type: s.type, recipeId: pick(rand, recipes).id }));
      const parsed = parseLlmResponse(JSON.stringify({ meals: hostile }), inp, recipes);
      for (const m of parsed?.meals ?? []) {
        // Le parseur valide contre `candidates` : la version vue doit être sûre.
        const seen = recipes.filter((r) => r.id === m.recipeId);
        expect(seen.some((r) => !oracleUnsafe(r, profile, ings))).toBe(true);
      }
      expectPlanSafe(planFromSelection(inp, hostile, 'ai'), recipes, profile, ings);
      expectPlanSafe(planFromSelection(inp, parsed ?? [], 'ai'), recipes, profile, ings);

      for (const r of selectLlmCandidates(inp)) {
        for (const v of recipes.filter((x) => x.id === r.id)) expect(oracleUnsafe(v, profile, ings)).toBe(false);
      }
      if (plan.meals.length > 0) {
        for (const r of suggestAlternatives(inp, plan, plan.meals[0].id, 100)) {
          for (const v of recipes.filter((x) => x.id === r.id)) expect(oracleUnsafe(v, profile, ings)).toBe(false);
        }
      }
      const pantry: PantryItem[] = Object.keys(ings)
        .filter(() => rand() < 0.3)
        .map((id) => ({ id: `p_${id}`, ingredientId: id, label: id, quantity: 1, unit: 'g', addedAt: NOW }));
      for (const s of recipesUsingLeftovers(recipes, pantry, ings, profile, 100)) {
        expect(oracleUnsafe(s.recipe, profile, ings)).toBe(false);
      }
    }
    expect(mealsChecked).toBeGreaterThan(500);
  });
});
