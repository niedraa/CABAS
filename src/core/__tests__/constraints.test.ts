/// <reference types="jest" />
import { INGREDIENTS_BY_ID as I, RECIPES, RECIPES_BY_ID as R, emptyPlan, makeProfile, recipe } from './fixtures';
import {
  assertPlanSafe,
  checkRecipe,
  dietAllows,
  filterRecipes,
  filterSafeRecipes,
  isRecipeSafe,
  recipeAllergens,
  recipeTotalTime,
} from '../constraints';
import type { Diet } from '../types';

const base = makeProfile();

describe('constraints — allergènes', () => {
  it('recipeAllergens couvre aussi les ingrédients optionnels', () => {
    expect(recipeAllergens(R.pates_tomate, I).sort()).toEqual(['gluten', 'lait']); // parmesan optionnel
    expect(recipeAllergens(R.crevettes_sautees, I).sort()).toEqual(['crustaces', 'gluten', 'soja']);
    expect(recipeAllergens(recipe('x', { title: 'x', ingredients: [{ ingredientId: 'inconnu', quantity: 1, unit: 'g' }] }), I)).toEqual([]);
  });

  it('un allergène dans un ingrédient OPTIONNEL rend la recette non sûre', () => {
    const p = makeProfile({ allergens: ['lait'] });
    const check = checkRecipe(R.pates_tomate, p, I);
    expect(check.safe).toBe(false);
    expect(check.allowed).toBe(false);
    expect(check.violations).toContainEqual({ kind: 'allergen', detail: 'Lait (parmesan)', ingredientId: 'parmesan' });
    expect(isRecipeSafe(R.salade_courgette, makeProfile({ allergens: ['fruits_a_coque'] }), I)).toBe(false);
  });

  it('un ingrédient inconnu rend la recette non sûre (fail closed)', () => {
    const r = recipe('mystere', { title: 'Mystère', ingredients: [{ ingredientId: 'ingredient_fantome', quantity: 1, unit: 'g' }] });
    const check = checkRecipe(r, base, I);
    expect(check.safe).toBe(false);
    expect(check.violations[0].kind).toBe('unknown_ingredient');
    expect(check.violations[0].ingredientId).toBe('ingredient_fantome');
  });

  it('recette sans allergène déclaré : sûre', () => {
    expect(checkRecipe(R.riz_legumes, makeProfile({ allergens: ['gluten', 'arachides'] }), I)).toEqual({
      allowed: true,
      safe: true,
      violations: [],
    });
  });
});

describe('constraints — régimes', () => {
  const allows = (d: Diet, id: string) => dietAllows(d, I[id]);

  it('végétarien : ni viande, ni poisson, ni fruits de mer', () => {
    for (const id of ['poulet', 'boeuf', 'lardons', 'saumon', 'crevettes', 'moules']) expect(allows('vegetarien', id)).toBe(false);
    for (const id of ['oeuf', 'lait', 'miel', 'tofu', 'riz']) expect(allows('vegetarien', id)).toBe(true);
    // défense en profondeur : allergène poisson sans drapeau
    expect(dietAllows('vegetarien', { ...I.riz, allergens: ['poissons'] })).toBe(false);
  });

  it('vegan exclut œufs, miel, lait (et tout produit animal)', () => {
    for (const id of ['oeuf', 'miel', 'lait', 'beurre', 'parmesan', 'poulet', 'saumon']) expect(allows('vegan', id)).toBe(false);
    for (const id of ['tofu', 'riz', 'lait_coco', 'pois_chiches']) expect(allows('vegan', id)).toBe(true);
    // défense en profondeur : allergène lait/œufs sans drapeau animal
    expect(dietAllows('vegan', { ...I.riz, allergens: ['oeufs'] })).toBe(false);
    expect(dietAllows('vegan', { ...I.riz, allergens: ['lait'] })).toBe(false);
  });

  it('pescétarien : poisson oui, viande non', () => {
    expect(allows('pescetarien', 'saumon')).toBe(true);
    expect(allows('pescetarien', 'crevettes')).toBe(true);
    expect(allows('pescetarien', 'poulet')).toBe(false);
    expect(allows('pescetarien', 'lardons')).toBe(false);
  });

  it('halal : ni porc ni alcool', () => {
    expect(allows('halal', 'lardons')).toBe(false);
    expect(allows('halal', 'vin_blanc')).toBe(false);
    expect(allows('halal', 'poulet')).toBe(true);
  });

  it('casher : ni porc ni crustacés/mollusques, poisson autorisé', () => {
    expect(allows('casher', 'lardons')).toBe(false);
    expect(allows('casher', 'crevettes')).toBe(false);
    expect(allows('casher', 'moules')).toBe(false);
    expect(dietAllows('casher', { ...I.riz, allergens: ['mollusques'] })).toBe(false);
    expect(allows('casher', 'saumon')).toBe(true);
    expect(allows('casher', 'poulet')).toBe(true);
  });

  it('casher : viande + lait dans la même recette interdit', () => {
    const p = makeProfile({ diets: ['casher'] });
    const check = checkRecipe(R.poulet_moutarde, p, I); // poulet + crème
    expect(check.safe).toBe(false);
    expect(check.violations.some((v) => v.kind === 'diet' && v.detail.includes('viande et produit laitier'))).toBe(true);
    // poisson + beurre (optionnel) : autorisé (le poisson est parvé)
    expect(isRecipeSafe(R.saumon_riz, p, I)).toBe(true);
    // viande sans laitage : autorisé
    expect(isRecipeSafe(R.poulet_curry, p, I)).toBe(true);
  });

  it('sans porc / sans gluten / sans lactose', () => {
    expect(allows('sans_porc', 'lardons')).toBe(false);
    expect(allows('sans_porc', 'boeuf')).toBe(true);
    expect(allows('sans_gluten', 'pates')).toBe(false);
    expect(allows('sans_gluten', 'sauce_soja')).toBe(false);
    expect(allows('sans_gluten', 'riz')).toBe(true);
    expect(allows('sans_lactose', 'creme')).toBe(false);
    expect(allows('sans_lactose', 'lait_coco')).toBe(true);
  });

  it('régime inconnu : refusé (fail closed)', () => {
    expect(dietAllows('paleo' as Diet, I.riz)).toBe(false);
  });

  it('les régimes s’appliquent aussi aux ingrédients optionnels', () => {
    expect(isRecipeSafe(R.saumon_riz, makeProfile({ diets: ['vegan'] }), I)).toBe(false);
    expect(isRecipeSafe(R.moules_marinieres, makeProfile({ diets: ['sans_lactose'] }), I)).toBe(false); // crème optionnelle
  });
});

describe('constraints — confort', () => {
  it('ingrédient détesté (non optionnel) → non autorisé mais sûr', () => {
    const check = checkRecipe(R.pates_tomate, makeProfile({ dislikedIngredientIds: ['oignon'] }), I);
    expect(check.allowed).toBe(false);
    expect(check.safe).toBe(true);
    expect(check.violations[0].kind).toBe('disliked');
    // optionnel détesté : simplement omis
    expect(checkRecipe(R.pates_tomate, makeProfile({ dislikedIngredientIds: ['parmesan'] }), I).allowed).toBe(true);
  });

  it('ustensiles : sous-ensemble, plaques supposées si rien déclaré', () => {
    const noOven = makeProfile({ equipment: ['plaques'] });
    const check = checkRecipe(R.gratin_dauphinois, noOven, I);
    expect(check.safe).toBe(true);
    expect(check.violations).toEqual([{ kind: 'equipment', detail: 'Nécessite : Four' }]);
    const empty = makeProfile({ equipment: [] });
    expect(checkRecipe(R.pates_tomate, empty, I).allowed).toBe(true);
    expect(checkRecipe(R.salade_courgette, empty, I).allowed).toBe(true);
    expect(checkRecipe(R.gratin_dauphinois, empty, I).allowed).toBe(false);
    const microOnly = makeProfile({ equipment: ['micro_ondes'] });
    expect(checkRecipe(R.pates_tomate, microOnly, I).allowed).toBe(false);
  });

  it('temps max', () => {
    expect(recipeTotalTime(R.boeuf_bourguignon)).toBe(180);
    const check = checkRecipe(R.boeuf_bourguignon, base, I, { maxTimeMin: 60 });
    expect(check.violations).toContainEqual({ kind: 'time', detail: '180 min (max 60 min)' });
    expect(check.safe).toBe(true);
    expect(checkRecipe(R.omelette, base, I, { maxTimeMin: 15 }).allowed).toBe(true);
  });

  it('profil partiel (champs absents) toléré', () => {
    const partial = {} as never;
    expect(checkRecipe(R.riz_legumes, partial, I).allowed).toBe(true);
    expect(checkRecipe({ ...R.riz_legumes, equipment: undefined as never }, partial, I).safe).toBe(true);
    // Liste d'ingrédients illisible : rien n'est vérifiable → non sûre (fail closed,
    // durci par la revue adversariale — voir adversarial.test.ts).
    expect(checkRecipe({ ...R.riz_legumes, equipment: undefined as never, ingredients: undefined as never }, partial, I).safe).toBe(false);
  });

  it('filterRecipes / filterSafeRecipes', () => {
    const p = makeProfile({ allergens: ['gluten'], equipment: ['plaques'] });
    const allowed = filterRecipes(RECIPES, p, I, { maxTimeMin: 30 });
    const safe = filterSafeRecipes(RECIPES, p, I);
    expect(allowed.length).toBeGreaterThan(0);
    expect(safe.length).toBeGreaterThanOrEqual(allowed.length);
    for (const r of allowed) expect(recipeAllergens(r, I)).not.toContain('gluten');
    expect(allowed.some((r) => r.equipment.includes('four'))).toBe(false);
    expect(safe.some((r) => r.id === 'gratin_dauphinois')).toBe(true);
  });
});

describe('assertPlanSafe', () => {
  it('signale les repas dangereux ou de recette inconnue', () => {
    const plan = emptyPlan('2026-09-14', [
      { id: 'm1', date: '2026-09-14', type: 'diner', recipeId: 'riz_legumes', servings: 3 },
      { id: 'm2', date: '2026-09-15', type: 'diner', recipeId: 'pad_thai', servings: 3 },
      { id: 'm3', date: '2026-09-16', type: 'diner', recipeId: 'recette_supprimee', servings: 3 },
    ]);
    const res = assertPlanSafe(plan, R, makeProfile({ allergens: ['arachides'] }), I);
    expect(res).toEqual({ ok: false, unsafeMealIds: ['m2', 'm3'] });
    expect(assertPlanSafe(emptyPlan('2026-09-14', [plan.meals[0]]), R, base, I)).toEqual({ ok: true, unsafeMealIds: [] });
  });
});
