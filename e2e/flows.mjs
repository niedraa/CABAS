/**
 * Parcours e2e de Cabas, joués dans l'ordre dans un navigateur vierge.
 * Chaque parcours reçoit le harnais (`h`, voir harness.mjs).
 */

/** Clique sur le CTA collé en bas de l'étape d'onboarding courante. */
async function next(h) {
  const cta = h.get('onboarding-cta');
  await cta.waitFor({ state: 'visible' });
  if ((await cta.getAttribute('aria-disabled')) === 'true') {
    const hint = await h.page.locator(`${h.sel('onboarding-footer-hint')} >> visible=true`).allInnerTexts();
    throw new Error(`Bouton « Continuer » désactivé : ${hint.join(' / ')}`);
  }
  await cta.click();
}

const onboarding = {
  name: 'Onboarding : profil complet en 7 étapes',
  async run(h) {
    await h.goto('/');
    await h.see('onboarding-start', 60_000);
    await h.shot('bienvenue', 1200);
    await h.tap('onboarding-start');

    // 1. Foyer : 2 adultes + 1 enfant.
    await h.see('onboarding-foyer');
    await h.tap('household-children-inc');
    const portions = await h.get('household-portions').innerText();
    // 2 adultes + 1 enfant (0,6) = 2,6 → arrondi à la demi-portion supérieure : 3.
    h.expect(/≈\s*3 portions/.test(portions), `Portions attendues : ≈ 3 — affiché : « ${portions} »`);
    await h.shot('foyer');
    await next(h);

    // 2. Allergie aux arachides : le consentement RGPD est exigé avant de continuer.
    await h.see('onboarding-regime');
    await h.tap('diet-allergy-allergens-arachides');
    await h.see('diet-allergy-consent');
    h.expect((await h.get('onboarding-cta').getAttribute('aria-disabled')) === 'true', 'Le consentement aux données de santé devrait être obligatoire.');
    await h.shot('regime-consentement');
    await h.tap('diet-allergy-consent');
    await next(h);

    // 3. Budget & temps (valeurs par défaut).
    await h.see('onboarding-budget-temps');
    await h.shot('budget-temps');
    await next(h);

    // 4. Cuisine.
    await h.see('onboarding-cuisine');
    await h.shot('cuisine');
    await next(h);

    // 5. Magasins : au moins un exigé.
    await h.see('onboarding-magasins');
    for (const id of ['leclerc', 'carrefour', 'lidl']) await h.tap(`stores-${id}`);
    await h.shot('magasins');
    await next(h);

    // 6. Créneaux.
    await h.see('onboarding-creneaux');
    await h.shot('creneaux');
    await next(h);

    // 7. Récapitulatif → génération.
    await h.see('onboarding-recap');
    await h.shot('recap');
    const t0 = Date.now();
    await next(h);
    await h.see('plan-generation');
    await h.shot('generation', 900);
    await h.see('week-screen', 30_000);
    const seconds = (Date.now() - t0) / 1000;
    console.log(`    planning généré et affiché en ${seconds.toFixed(1)} s (animation comprise)`);
    h.expect(seconds < 15, `Génération trop lente : ${seconds.toFixed(1)} s`);
  },
};

const week = {
  name: 'Semaine : 3 repas en gratuit, créneaux Premium visibles',
  async run(h) {
    await h.see('week-screen');
    await h.see('week-stats');
    // Les cartes entrent en cascade : on attend qu'elles soient toutes là.
    const meals = await h.waitForCount('[data-testid^="meal-"][data-testid$="-open"]', 3);
    h.expect(meals === 3, `3 repas attendus en offre gratuite, ${meals} affichés`);
    await h.shot('semaine', 1000);
    await h.tap('week-switch-next');
    await h.shot('semaine-prochaine');
    await h.tap('week-switch-current');
    await h.wait(500);
  },
};

const recipe = {
  name: 'Recette : fiche, portions, aucun allergène déclaré, mode cuisine',
  async run(h) {
    await h.page.locator('[data-testid^="meal-"][data-testid$="-open"] >> visible=true').first().click();
    await h.see('recipe-screen');
    const allergens = (await h.page.locator(`${h.sel('recipe-allergens')} >> visible=true`).allInnerTexts()).join(' ');
    h.expect(!/arachide/i.test(allergens), `Un plat proposé contient un allergène déclaré : ${allergens}`);
    await h.shot('recette', 900);
    await h.tap('recipe-servings-inc');
    await h.tap('cooking-open');
    await h.see('cooking-mode');
    await h.shot('mode-cuisine', 900);
    if (await h.count('cooking-mode-next')) {
      await h.tap('cooking-mode-next');
      await h.shot('mode-cuisine-etape-2');
    }
    await h.tap('cooking-mode-close');
    await h.wait(500);
    await h.tap('recipe-back');
    await h.see('week-screen');
  },
};

const replace = {
  name: 'Remplacer un plat : alternatives sûres, annulation possible',
  async run(h) {
    await h.page.locator('[data-testid^="meal-"][data-testid$="-swap"] >> visible=true').first().click();
    await h.see('replace-sheet');
    await h.see('alt-0');
    await h.shot('remplacer', 900);
    await h.tap('alt-0');
    await h.seeText('Plat remplacé');
    await h.shot('plat-remplace');
    await h.wait(600);
  },
};

export const FLOWS = [onboarding, week, recipe, replace];
