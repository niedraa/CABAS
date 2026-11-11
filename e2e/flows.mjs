/**
 * Parcours e2e de Cabas, joués dans l'ordre dans un navigateur vierge.
 * Chaque parcours reçoit le harnais (`h`, voir harness.mjs).
 */

/**
 * Créneaux par défaut (dîners + déjeuners du week-end), par jour de la semaine
 * (0 = lundi). Cabas ne planifie rien sur un jour passé.
 */
const DEFAULT_SLOT_WEEKDAYS = [0, 1, 2, 3, 4, 5, 5, 6, 6];
const FREE_MEALS = 3;

/** Jour de la semaine (0 = lundi) de la date simulée, à l'heure de Paris. */
function parisWeekday(date) {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/Paris' }).format(date);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
}

/** Créneaux par défaut encore à venir dans la semaine de la date simulée. */
function upcomingSlots(h) {
  const weekday = parisWeekday(h.now);
  return DEFAULT_SLOT_WEEKDAYS.filter((d) => d >= weekday).length;
}

/**
 * S'il reste moins de 3 créneaux cette semaine (dimanche), l'onboarding
 * planifie directement la semaine suivante.
 */
function plansNextWeek(h) {
  return upcomingSlots(h) < FREE_MEALS;
}

/** Repas attendus en Premium sur la semaine planifiée (créneaux encore à venir). */
function premiumMeals(h) {
  return plansNextWeek(h) ? DEFAULT_SLOT_WEEKDAYS.length : upcomingSlots(h);
}

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
    // 10 enseignes en 3 familles (hypers & supers, discount, proximité).
    for (const g of ['hyper', 'discount', 'proximite']) await h.see(`stores-group-${g}`);
    for (const id of ['leclerc', 'carrefour', 'lidl']) await h.tap(`stores-${id}`);
    await h.seeText('Cabas comparera les prix entre ces 3 enseignes');
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
    const meals = await h.waitForCount('[data-testid^="meal-"][data-testid$="-open"]', FREE_MEALS);
    h.expect(meals === FREE_MEALS, `${FREE_MEALS} repas attendus en offre gratuite, ${meals} affichés`);
    await h.shot('semaine', 1000);
    // Aller-retour entre les deux semaines, puis retour sur la semaine planifiée.
    if (plansNextWeek(h)) {
      await h.tap('week-switch-current');
      await h.shot('semaine-en-cours');
      await h.tap('week-switch-next');
    } else {
      await h.tap('week-switch-next');
      await h.shot('semaine-prochaine');
      await h.tap('week-switch-current');
    }
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

const prices = {
  name: 'Prix : panier « un seul magasin », « le moins cher » réservé à Premium, livraison',
  async run(h) {
    await h.tap('tab-prix');
    await h.see('price-screen');
    await h.see('price-ready', 20_000);
    await h.see('basket-receipt');
    // Provenance des prix (Open Prices) en pied de page.
    await h.see('price-notice');
    await h.shot('prix', 1000);

    // Compte gratuit : « le moins cher » → meilleur magasin + invitation Premium chiffrée.
    await h.tap('basket-controls-mode-cheapest');
    await h.seeText('Le moins cher, c’est Premium');
    await h.shot('prix-premium-invitation');

    // Livraison : frais affichés (ou magasins qui ne livrent pas exclus), puis retour au drive.
    await h.tap('basket-controls-delivery');
    await h.wait(800);
    await h.shot('prix-livraison');
    await h.tap('basket-controls-drive');
    await h.wait(500);
  },
};

const comparator = {
  name: 'Comparateur : offres de ≥ 3 enseignes, choix d’un autre produit',
  async run(h) {
    await h.see('comparison-list');
    await h.tap('compare-0');
    await h.see('comparator-content');
    // Une ligne par enseigne (pas les sous-éléments « -provenance » / « -sheet »).
    const offers = await h.waitForCount('[data-testid^="offer-"]:not([data-testid$="-provenance"]):not([data-testid$="-sheet"])', -1, 1500);
    h.expect(offers >= 3, `Au moins 3 enseignes attendues, ${offers} affichées`);
    await h.shot('comparateur', 900);
    if (await h.count('choice-1')) {
      await h.tap('choice-1');
      await h.wait(600);
      if (await h.count('choice-reset')) await h.tap('choice-reset');
    }
    await h.page.keyboard.press('Escape');
    await h.wait(500);
    if (await h.count('comparator-content')) await h.page.goBack();
    await h.see('price-screen');
  },
};

const order = {
  name: 'Commande : liste copiée, drive ouvert, commande validée → budget',
  async run(h) {
    await h.page.locator('[data-testid^="store-part-"][data-testid$="-order"] >> visible=true').first().click();
    await h.see('order-screen');
    await h.see('order-receipt');
    await h.shot('commande', 900);
    if (await h.count('order-actions-copy')) {
      await h.tap('order-actions-copy');
      // Lecture du presse-papiers : page au premier plan (Chromium exige le focus) et
      // délai borné, pour qu'un blocage du navigateur échoue au lieu de figer le parcours.
      await h.page.bringToFront();
      let timer;
      const copied = await Promise.race([
        h.page.evaluate(() => navigator.clipboard.readText().catch(() => '')),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Presse-papiers illisible (10 s)')), 10_000);
        }),
      ]).finally(() => clearTimeout(timer));
      h.expect(copied.length > 20, 'La liste aurait dû être copiée dans le presse-papiers');
    }
    // Le drive s'ouvre dans un nouvel onglet : on vérifie l'URL (UTM) puis on le ferme.
    const [popup] = await Promise.all([h.page.waitForEvent('popup', { timeout: 8000 }).catch(() => null), h.tap('order-open')]);
    if (popup) {
      h.expect(/utm_source=cabas/.test(popup.url()), `URL de commande sans UTM : ${popup.url()}`);
      await popup.close();
    }
    await h.see('order-confirm');
    await h.tap('order-confirm');
    await h.see('order-confirmed');
    await h.shot('commande-validee', 1400);
    await h.tap('order-done');
    await h.see('price-screen');
  },
};

/** Lignes d'articles de la liste (cases à cocher). */
const ITEM_ROWS = '[data-testid^="item-"][aria-checked]';

const list = {
  name: 'Liste : rayons, cocher, ajout en langage naturel, tout coché, placard',
  async run(h) {
    await h.tap('tab-liste');
    await h.see('list-screen');
    await h.see('list-progress');
    const total = await h.waitForCount(ITEM_ROWS, -1, 1500);
    h.expect(total > 3, `La liste devrait contenir plusieurs articles (${total})`);
    await h.shot('liste', 900);

    // Ajout libre : « 2 baguettes » → rayon deviné.
    await h.get('list-add-input').fill('2 baguettes');
    await h.tap('list-add-submit');
    await h.seeText('Ajouté à ta liste');
    await h.seeText('Baguette');

    // Cocher un article puis tout le reste.
    const first = h.page.locator(`${ITEM_ROWS}[aria-checked="false"] >> visible=true`).first();
    await first.click();
    await h.shot('liste-coche', 400);
    for (let guard = 0; guard < 80; guard++) {
      const next = h.page.locator(`${ITEM_ROWS}[aria-checked="false"] >> visible=true`).first();
      if ((await next.count()) === 0) break;
      await next.click();
      await h.wait(60);
    }
    await h.see('list-done', 8000);
    await h.shot('liste-terminee', 1200);

    // Le reste des paquets entamés rejoint le placard.
    await h.tap('list-done-store');
    await h.tap('list-done-pantry');
    await h.see('pantry-screen');
  },
};

const pantry = {
  name: 'Placard : restes rangés, ajout depuis le catalogue',
  async run(h) {
    await h.see('pantry-all');
    await h.shot('placard', 900);
    await h.tap('pantry-add');
    await h.see('pantry-add-sheet');
    await h.get('pantry-search').fill('tomate');
    const result = h.page.locator('[data-testid^="pantry-result-"]:not([data-testid="pantry-result-free"]) >> visible=true').first();
    await result.click();
    await h.shot('placard-ajout');
    await h.tap('pantry-add-submit');
    await h.seeText('Ajouté au placard');
    await h.wait(500);
    await h.page.goBack();
    await h.see('list-screen');
  },
};

const premium = {
  name: 'Premium : paywall, essai de 7 jours (magasin simulé), planning complet',
  async run(h) {
    await h.tap('tab-semaine');
    await h.see('week-screen');
    await h.page.getByText('Essayer 7 jours').first().click();
    await h.see('premium-screen');
    await h.see('plan-picker');
    await h.shot('paywall', 1000);
    await h.tap('premium-cta');
    await h.see('premium-done', 15_000);
    await h.shot('premium-active', 1200);
    await h.tap('premium-done');
    await h.see('week-screen');
    // Premium : la semaine se complète avec tous les créneaux choisis.
    await h.tap('regenerate');
    await h.seeText('De nouvelles idées ?');
    await h.page.getByRole('button', { name: 'Nouvelles idées', exact: true }).last().click();
    const expected = premiumMeals(h);
    const meals = await h.waitForCount('[data-testid^="meal-"][data-testid$="-open"]', expected, 15_000);
    h.expect(meals === expected, `${expected} repas attendus en Premium, ${meals} affichés`);
    await h.shot('semaine-premium', 1000);
  },
};

const profile = {
  name: 'Profil : abonnement, édition du foyer, apparence sombre / claire',
  async run(h) {
    await h.tap('tab-profil');
    await h.see('profile-screen');
    await h.seeText('Essai Premium');
    await h.shot('profil', 900);

    // Édition d'une section du profil.
    await h.tap('profile-section-foyer');
    await h.see('edit-section-foyer');
    await h.tap('household-adults-inc');
    await h.tap('edit-save');
    await h.see('profile-screen');

    // Apparence : bascule de thème, puis retour au réglage système.
    await h.tap('settings-apparence');
    await h.see('settings-apparence-screen');
    const other = h.config.colorScheme === 'dark' ? 'light' : 'dark';
    await h.tap(`theme-picker-${other}`);
    await h.shot(`apparence-${other}`, 800);
    await h.tap('theme-picker-system');
    await h.page.goBack();
    await h.see('profile-screen');

    // À propos › Sources et licences : Open Food Facts, Open Prices, OpenStreetMap (ODbL).
    await h.tap('settings-sources');
    await h.see('settings-sources-screen');
    await h.see('source-open_prices');
    await h.see('sources-chains');
    await h.shot('sources', 900);
    await h.page.goBack();
    await h.see('profile-screen');
  },
};

const budget = {
  name: 'Budget (Premium) : dépense ajoutée, économies',
  async run(h) {
    await h.tap('shortcut-budget');
    await h.see('budget-screen');
    await h.tap('budget-add');
    await h.see('add-spending');
    await h.get('add-spending-amount').fill('42,50');
    await h.tap('add-spending-submit');
    await h.seeText('42,50');
    await h.shot('budget', 900);
    await h.page.goBack();
    await h.see('profile-screen');
  },
};

const deleteAccount = {
  name: 'Compte : suppression (RGPD) → retour à l’accueil',
  async run(h) {
    await h.tap('settings-compte');
    await h.see('settings-compte-screen');
    await h.shot('compte', 800);
    await h.tap('account-delete');
    // Double confirmation (boîtes de dialogue : rôles accessibles, pas de testID dans une modale web).
    await h.seeText('Supprimer ton compte ?');
    await h.page.getByRole('button', { name: 'Continuer', exact: true }).last().click();
    await h.seeText('C’est définitif');
    await h.shot('suppression-confirmation', 600);
    await h.page.getByRole('button', { name: 'Supprimer définitivement', exact: true }).last().click();
    await h.see('onboarding-start', 20_000);
    await h.shot('apres-suppression', 1000);
  },
};

export const FLOWS = [onboarding, week, recipe, replace, prices, comparator, order, list, pantry, premium, profile, budget, deleteAccount];
