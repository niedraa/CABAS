/**
 * Tests des stores (mode démo : catalogue embarqué, moteur local, achat simulé).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { addDays, isRecipeSafe } from '@/core';
import { isHapticsEnabled } from '@/lib/haptics';
import { getCatalogSnapshot } from '@/services/catalog';
import { __setMealPlannerForTests, getMealPlanner } from '@/services/mealPlanner';

import {
  addFromCheckedList,
  checkPriceDrops,
  DEFAULT_NOTIFICATION_PREFS,
  getList,
  mealsByDay,
  resetAllStores,
  selectIsPremium,
  useBasketStore,
  useBudgetStore,
  useListStore,
  useOrderStore,
  usePantryStore,
  usePlanStore,
  useProfileStore,
  useSettingsStore,
  useSubscriptionStore,
  useWeekStore,
  waitForHydration,
  type ProfileDraft,
  type StoredOrder,
} from '..';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async (req: { identifier?: string }) => req.identifier ?? 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  SchedulableTriggerInputTypes: { WEEKLY: 'weekly', DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'opened' })) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

const PEANUT_RECIPE = 'rec_pad_thai_poulet';

const CAMILLE: ProfileDraft = {
  displayName: 'Camille',
  household: { adults: 2, children: 1 },
  allergens: ['arachides'],
  weeklyBudgetCents: 12000,
  maxCookTimeWeekdayMin: 45,
  maxCookTimeWeekendMin: 90,
  equipment: ['plaques', 'four', 'mixeur', 'micro_ondes'],
  preferredStoreIds: ['leclerc', 'carrefour', 'auchan'],
};

function onboard(draft: ProfileDraft = CAMILLE) {
  const s = useProfileStore.getState();
  s.updateDraft(draft);
  if ((draft.allergens?.length ?? 0) > 0 || (draft.diets?.length ?? 0) > 0) s.setHealthDataConsent(true);
  const res = useProfileStore.getState().completeOnboarding();
  if (!res.ok) throw new Error(res.issues.map((i) => i.message).join(' '));
  return res.profile;
}

const week = () => useWeekStore.getState().currentWeekStart;

/** Attend (micro-tâches) qu'une condition devienne vraie. */
async function waitFor(cond: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries && !cond(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!cond()) throw new Error('condition jamais remplie');
}

beforeAll(async () => {
  await waitForHydration();
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetAllStores({ resetSimulatedPurchases: true });
  // Rien n'est planifié sur un jour passé : on se place le lundi de la semaine en
  // cours pour que les tests ne dépendent pas du jour où ils tournent.
  useWeekStore.getState().refreshToday(useWeekStore.getState().currentWeekStart);
});

describe('profileStore', () => {
  it('valide l’onboarding : magasin requis, consentement requis pour les allergies', () => {
    const s = useProfileStore.getState();
    s.updateDraft({ preferredStoreIds: [] });
    let res = useProfileStore.getState().completeOnboarding();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.field)).toContain('preferredStoreIds');

    s.updateDraft({ preferredStoreIds: ['leclerc', 'magasin_inconnu'], allergens: ['arachides'] });
    res = useProfileStore.getState().completeOnboarding();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.map((i) => i.field)).toEqual(['healthDataConsentAt']);
    expect(useProfileStore.getState().onboardingCompleted).toBe(false);

    useProfileStore.getState().setHealthDataConsent(true);
    res = useProfileStore.getState().completeOnboarding();
    expect(res.ok).toBe(true);
    const st = useProfileStore.getState();
    expect(st.onboardingCompleted).toBe(true);
    expect(st.profile?.preferredStoreIds).toEqual(['leclerc']); // magasin inconnu retiré
    expect(st.profile?.healthDataConsentAt).toBeTruthy();
    expect(st.profile?.id).toBeTruthy();
  });

  it('retirer le consentement efface allergies et régimes', () => {
    onboard({ ...CAMILLE, diets: ['halal'] });
    useProfileStore.getState().setHealthDataConsent(false);
    const p = useProfileStore.getState().profile!;
    expect(p).toMatchObject({ healthDataConsentAt: null, allergens: [], diets: [] });
  });

  it('updateProfile applique les mêmes règles', () => {
    onboard();
    expect(useProfileStore.getState().updateProfile({ household: { adults: 0, children: 0 } }).ok).toBe(false);
    const res = useProfileStore.getState().updateProfile({ weeklyBudgetCents: 9000 });
    expect(res.ok).toBe(true);
    expect(useProfileStore.getState().profile?.weeklyBudgetCents).toBe(9000);
  });
});

describe('planStore', () => {
  it('gratuit : 3 repas, aucun allergène, liste générée, < 10 s', async () => {
    const profile = onboard();
    const res = await usePlanStore.getState().generate();
    expect(res.ok).toBe(true);
    const st = usePlanStore.getState();
    const plan = st.plans[week()];
    expect(plan.meals).toHaveLength(3);
    const cat = getCatalogSnapshot();
    for (const m of plan.meals) expect(isRecipeSafe(cat.recipesById[m.recipeId], profile, cat.ingredientsById)).toBe(true);
    expect(st.status).toBe('idle');
    expect(st.lastDurationMs).toBeLessThan(10_000);
    expect(st.recentRecipeIds.length).toBeGreaterThan(0);
    // La liste suit le planning.
    const list = getList(week());
    expect(list.mealPlanId).toBe(plan.id);
    expect(list.items.length).toBeGreaterThan(0);
    // Sélecteur jours.
    const days = mealsByDay(plan);
    expect(days).toHaveLength(7);
    expect(days.reduce((n, d) => n + d.meals.length, 0)).toBe(3);
  });

  it('sans profil : refus explicite', async () => {
    const res = await usePlanStore.getState().generate();
    expect(res).toMatchObject({ ok: false, reason: 'no_profile' });
  });

  it('Premium : 9 repas ; ajout limité en gratuit', async () => {
    onboard();
    await useSubscriptionStore.getState().purchase('monthly');
    expect(selectIsPremium(useSubscriptionStore.getState())).toBe(true);
    await usePlanStore.getState().generate();
    expect(usePlanStore.getState().plans[week()].meals).toHaveLength(9);

    await resetAllStores({ resetSimulatedPurchases: true });
    onboard();
    await usePlanStore.getState().generate();
    const free = usePlanStore.getState().plans[week()];
    const used = new Set(free.meals.map((m) => `${m.date}|${m.type}`));
    const slot = mealsByDay(free).find((d) => !used.has(`${d.date}|diner`))!;
    const res = usePlanStore.getState().addMeal({ date: slot.date, type: 'diner' });
    expect(res).toMatchObject({ ok: false, reason: 'limit' });
  });

  it('en milieu de semaine : aucun repas sur un jour passé, les repas passés restent en place', async () => {
    onboard();
    const ws = week();
    const thursday = addDays(ws, 3);
    // Lundi : 3 repas gratuits (lundi, mardi, mercredi soir).
    await usePlanStore.getState().generate();
    const monday = usePlanStore.getState().plans[ws].meals;
    expect(monday.map((m) => m.date)).toEqual([ws, addDays(ws, 1), addDays(ws, 2)]);

    // Jeudi, compte gratuit tout neuf : les 3 repas tombent à partir d'aujourd'hui.
    await resetAllStores({ resetSimulatedPurchases: true });
    onboard();
    useWeekStore.getState().refreshToday(thursday);
    const res = await usePlanStore.getState().generate();
    expect(res.ok).toBe(true);
    const fresh = usePlanStore.getState().plans[ws].meals;
    expect(fresh).toHaveLength(3);
    expect(fresh.every((m) => m.date >= thursday)).toBe(true);

    // Premium, régénération le jeudi : les repas d'avant jeudi sont gardés tels quels.
    await useSubscriptionStore.getState().purchase('monthly');
    usePlanStore.getState().setPlan({ ...usePlanStore.getState().plans[ws], meals: monday });
    await usePlanStore.getState().generate(ws, { keepLocked: true });
    const regen = usePlanStore.getState().plans[ws].meals;
    for (const m of monday) {
      if (m.date < thursday) expect(regen.find((r) => r.id === m.id)).toEqual(m);
    }
    expect(regen.filter((m) => m.date < thursday)).toHaveLength(monday.filter((m) => m.date < thursday).length);
    expect(regen.some((m) => m.date >= thursday)).toBe(true);
  });

  it('générations simultanées : chaque semaine garde son propre état « en cours »', async () => {
    onboard();
    const ws = week();
    const next = addDays(ws, 7);
    // Planificateur « lent » : chaque semaine attend qu'on la libère.
    const real = getMealPlanner();
    const gates: Record<string, () => void> = {};
    __setMealPlannerForTests({
      ...real,
      requestMealPlan: async (req) => {
        await new Promise<void>((resolve) => (gates[req.weekStart] = resolve));
        return real.requestMealPlan(req);
      },
    });
    try {
      const a = usePlanStore.getState().generate(ws);
      const b = usePlanStore.getState().generate(next);
      await waitFor(() => !!gates[ws] && !!gates[next]);
      expect(usePlanStore.getState().generatingWeeks).toEqual({ [ws]: true, [next]: true });
      gates[ws]();
      await a;
      // La semaine en cours est prête, la suivante tourne encore.
      expect(usePlanStore.getState().generatingWeeks[ws]).toBeUndefined();
      expect(usePlanStore.getState().generatingWeeks[next]).toBe(true);
      expect(usePlanStore.getState().status).toBe('generating');
      gates[next]();
      await b;
      expect(usePlanStore.getState().generatingWeeks).toEqual({});
      expect(usePlanStore.getState().status).toBe('idle');
    } finally {
      __setMealPlannerForTests(null);
    }
  });

  it('remplacement sûr, verrou conservé à la régénération, portions, suppression', async () => {
    onboard();
    await useSubscriptionStore.getState().purchase('monthly');
    await usePlanStore.getState().generate();
    const plan = usePlanStore.getState().plans[week()];
    const dinner = plan.meals.find((m) => m.type === 'diner')!;

    expect(usePlanStore.getState().swapMeal(dinner.id, PEANUT_RECIPE)).toMatchObject({ ok: false, reason: 'unsafe' });
    const alts = usePlanStore.getState().getAlternatives(dinner.id);
    expect(alts.length).toBeGreaterThan(0);
    expect(usePlanStore.getState().swapMeal(dinner.id, alts[0].id).ok).toBe(true);

    usePlanStore.getState().toggleLock(dinner.id);
    usePlanStore.getState().setServings(dinner.id, 5);
    await usePlanStore.getState().generate();
    const kept = usePlanStore.getState().plans[week()].meals.find((m) => m.id === dinner.id)!;
    expect(kept).toMatchObject({ recipeId: alts[0].id, locked: true, servings: 5 });

    const other = usePlanStore.getState().plans[week()].meals.find((m) => !m.locked)!;
    usePlanStore.getState().removeMeal(other.id);
    expect(usePlanStore.getState().plans[week()].meals.some((m) => m.id === other.id)).toBe(false);
  });

  it('nouvelle allergie déclarée : le plat concerné disparaît du planning', async () => {
    onboard({ ...CAMILLE, allergens: [] });
    await useSubscriptionStore.getState().purchase('monthly');
    await usePlanStore.getState().generate();
    const dinner = usePlanStore.getState().plans[week()].meals.find((m) => m.type === 'diner')!;
    expect(usePlanStore.getState().swapMeal(dinner.id, PEANUT_RECIPE).ok).toBe(true);

    useProfileStore.getState().setHealthDataConsent(true);
    expect(useProfileStore.getState().updateProfile({ allergens: ['arachides'] }).ok).toBe(true);
    const meals = usePlanStore.getState().plans[week()].meals;
    expect(meals.some((m) => m.recipeId === PEANUT_RECIPE)).toBe(false);
  });
});

describe('listStore', () => {
  it('régénération : articles manuels et cases cochées conservés', async () => {
    onboard();
    await usePlanStore.getState().generate();
    const ws = week();
    const manual = useListStore.getState().addManualItem('Sacs poubelle', 1, 'piece');
    expect(manual?.source).toBe('manual');
    expect(useListStore.getState().addManualItem('   ')).toBeNull();
    const first = getList(ws).items.find((i) => i.source === 'plan')!;
    useListStore.getState().toggleItem(first.id);

    usePlanStore.getState().syncList(ws);
    const items = getList(ws).items;
    expect(items.find((i) => i.id === manual!.id)).toBeDefined();
    expect(items.find((i) => i.id === first.id)?.checked).toBe(true);

    useListStore.getState().updateItem(manual!.id, { quantity: 3, label: '  ' });
    expect(getList(ws).items.find((i) => i.id === manual!.id)).toMatchObject({ quantity: 3, label: 'Sacs poubelle' });

    useListStore.getState().uncheckAll();
    expect(getList(ws).items.every((i) => !i.checked)).toBe(true);
    useListStore.getState().toggleItem(first.id);
    useListStore.getState().clearChecked();
    expect(getList(ws).items.find((i) => i.id === first.id)).toBeUndefined();
    useListStore.getState().removeItem(manual!.id);
    expect(getList(ws).items.find((i) => i.id === manual!.id)).toBeUndefined();
  });

  it('articles du menu vidés ou retirés : ils ne reviennent pas quand la liste est régénérée', async () => {
    onboard();
    await usePlanStore.getState().generate();
    const ws = week();
    const plan = getList(ws).items.filter((i) => i.source === 'plan');
    expect(plan.length).toBeGreaterThan(2);
    const [a, b, c] = plan;

    // « Vider les articles cochés » puis le placard change (→ régénération de la liste).
    useListStore.getState().toggleItem(a.id);
    useListStore.getState().toggleItem(b.id);
    useListStore.getState().clearChecked();
    usePantryStore.getState().add({ label: 'Sel', quantity: 1000, unit: 'g' });
    usePlanStore.getState().syncList(ws);
    let ids = getList(ws).items.map((i) => i.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);

    // Glisser pour retirer : même règle.
    useListStore.getState().removeItem(c.id);
    usePlanStore.getState().syncList(ws);
    expect(getList(ws).items.map((i) => i.id)).not.toContain(c.id);

    // Annuler : l'article revient, et reste après régénération.
    useListStore.getState().restoreItems([a]);
    usePlanStore.getState().syncList(ws);
    ids = getList(ws).items.map((i) => i.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(ids.filter((id) => id === a.id)).toHaveLength(1);

    // Tout remettre à zéro efface la mémoire des retraits.
    useListStore.getState().reset();
    expect(useListStore.getState().dismissed).toEqual({});
  });
});

describe('basketStore', () => {
  it('gratuit : comparaison complète, panier « un seul magasin » même si « le moins cher » est demandé', async () => {
    onboard();
    await usePlanStore.getState().generate();
    await useBasketStore.getState().setMode('cheapest');
    const planBasket = await useBasketStore.getState().compute();
    const st = useBasketStore.getState();
    expect(planBasket?.mode).toBe('single_store');
    expect(st.downgraded).toBe(true);
    expect(st.status).toBe('ready');
    expect(st.comparisons.length).toBeGreaterThan(0);
    expect(st.plan!.parts).toHaveLength(1);
    expect(['leclerc', 'carrefour', 'auchan']).toContain(st.plan!.parts[0].storeId);
  });

  it('Premium : « le moins cher » appliqué ; articles cochés exclus ; alternative MDD', async () => {
    onboard();
    await useSubscriptionStore.getState().purchase('annual');
    await usePlanStore.getState().generate();
    await useBasketStore.getState().setMode('cheapest');
    await useBasketStore.getState().compute();
    let st = useBasketStore.getState();
    expect(st.plan?.mode).toBe('cheapest');
    expect(st.downgraded).toBe(false);

    const item = getList(week()).items.find((i) => st.comparisons.some((c) => c.itemId === i.id))!;
    useListStore.getState().toggleItem(item.id);
    await useBasketStore.getState().compute();
    st = useBasketStore.getState();
    expect(st.comparisons.some((c) => c.itemId === item.id)).toBe(false);

    const withAlt = st.comparisons.find((c) => c.cheaperAlternative);
    if (withAlt) {
      await useBasketStore.getState().selectAlternative(withAlt.itemId, withAlt.cheaperAlternative!.productId);
      const after = useBasketStore.getState();
      expect(after.selectedAlternatives[withAlt.itemId]).toBe(withAlt.cheaperAlternative!.productId);
      expect(after.comparisons.find((c) => c.itemId === withAlt.itemId)?.cheaperAlternative).toBeUndefined();
    }
  });
});

describe('orderStore & budgetStore', () => {
  it('confirmer une commande crée une dépense (avec économies), une seule fois', async () => {
    onboard();
    await usePlanStore.getState().generate();
    await useBasketStore.getState().compute();
    const part = useBasketStore.getState().plan!.parts[0];
    const order = useOrderStore.getState().prepareOrder(part, part.storeId)!;
    expect(order.status).toBe('prepared');
    expect(order.url).toMatch(/^https?:\/\//);
    expect(order.weekStart).toBe(week());

    expect(await useOrderStore.getState().openOrder(order.id)).toBe(true);
    expect(useOrderStore.getState().orders[0].status).toBe('opened');
    expect(useOrderStore.getState().orderText(order.id)).toContain(getCatalogSnapshot().storesById[part.storeId].name);

    const entry = useOrderStore.getState().confirmOrder(order.id)!;
    expect(entry).toMatchObject({ storeId: part.storeId, totalCents: order.totalCents, source: 'order' });
    expect(entry.savingsCents).toBe(order.savingsCents);
    useOrderStore.getState().confirmOrder(order.id);
    expect(useBudgetStore.getState().entries).toHaveLength(1);
    expect(useOrderStore.getState().orders[0].status).toBe('confirmed');

    const manual = useBudgetStore.getState().addManualEntry({ date: '2026-11-02', storeId: 'lidl', totalCents: 4250 });
    expect(useBudgetStore.getState().entries).toHaveLength(2);
    useBudgetStore.getState().removeEntry(manual.id);
    expect(useBudgetStore.getState().entries).toHaveLength(1);
  });
});

describe('pantryStore', () => {
  it('le placard est déduit de la liste ; le surplus des courses n’est pas recompté', async () => {
    onboard();
    await useSubscriptionStore.getState().purchase('monthly');
    await usePlanStore.getState().generate();
    const ws = week();
    const target = getList(ws).items.find((i) => i.source === 'plan' && i.ingredientId && !i.pantryStaple)!;
    const ing = getCatalogSnapshot().ingredientsById[target.ingredientId!];

    // Stock suffisant : l'article disparaît de la liste.
    const stock = usePantryStore.getState().add({ label: ing.name, quantity: target.quantity * 10, unit: target.unit, ingredientId: ing.id })!;
    expect(getList(ws).items.find((i) => i.ingredientId === ing.id)).toBeUndefined();
    usePantryStore.getState().remove(stock.id);
    const back = getList(ws).items.find((i) => i.ingredientId === ing.id)!;
    expect(back.quantity).toBe(target.quantity);

    // Après les courses : le surplus va au placard sans modifier la liste de la semaine.
    for (const i of getList(ws).items) useListStore.getState().setChecked(i.id, true);
    const before = getList(ws).items.map((i) => `${i.id}:${i.quantity}`).sort();
    const added = addFromCheckedList(ws);
    expect(added).toBe(usePantryStore.getState().items.length);
    usePlanStore.getState().syncList(ws);
    expect(getList(ws).items.map((i) => `${i.id}:${i.quantity}`).sort()).toEqual(before);

    // consume / update
    const first = usePantryStore.getState().items[0];
    if (first) {
      usePantryStore.getState().consume(first.id, first.quantity);
      expect(usePantryStore.getState().items.find((p) => p.id === first.id)).toBeUndefined();
    }
  });
});

describe('settingsStore', () => {
  it('valeurs par défaut RGPD et réglages', async () => {
    const s = useSettingsStore.getState();
    expect(s.analyticsConsent).toBe(false);
    expect(s.notificationPrefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(s.notificationPrefs).toMatchObject({ planningReminderWeekday: 6, planningReminderHour: 18 });

    s.setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    s.setThemePreference('dark');
    await s.updateNotificationPrefs({ planningReminderHour: 42, planningReminderWeekday: -3 });
    const st = useSettingsStore.getState();
    expect(st.themePreference).toBe('dark');
    expect(st.notificationPrefs.planningReminderHour).toBe(23);
    expect(st.notificationPrefs.planningReminderWeekday).toBe(0);

    s.setAnalyticsConsent(true);
    expect(useSettingsStore.getState().analyticsConsentAt).toBeTruthy();

    await resetAllStores();
    expect(isHapticsEnabled()).toBe(true);
    expect(useSettingsStore.getState().themePreference).toBe('system');
    expect(useSettingsStore.getState().analyticsConsent).toBe(false);
  });

  it('autorisation des notifications puis programmation du rappel', async () => {
    const N = jest.requireMock('expo-notifications') as { scheduleNotificationAsync: jest.Mock; getPermissionsAsync: jest.Mock };
    N.getPermissionsAsync.mockResolvedValueOnce({ granted: false, status: 'undetermined', canAskAgain: true });
    N.getPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
    const status = await useSettingsStore.getState().requestNotificationPermission();
    expect(status).toBe('granted');
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'cabas-planning-reminder',
        trigger: expect.objectContaining({ type: 'weekly', weekday: 1, hour: 18 }),
      }),
    );
    N.getPermissionsAsync.mockResolvedValue({ granted: false, status: 'undetermined', canAskAgain: true });
  });
});

describe('alertes prix', () => {
  it('jamais de notification de baisse sur un produit contenant un allergène déclaré du profil', async () => {
    const N = jest.requireMock('expo-notifications') as { scheduleNotificationAsync: jest.Mock };
    const catalog = getCatalogSnapshot();
    // Un produit au gluten, au prix relevé, commandé deux fois plus cher : une baisse nette.
    const price = catalog.prices.find(
      (p) => p.source === 'open_prices' && !p.promoPriceCents && catalog.productsById[p.productId]?.allergens.includes('gluten'),
    )!;
    expect(price).toBeDefined();
    onboard(CAMILLE);
    await useSubscriptionStore.getState().purchase('monthly');
    expect(useSettingsStore.getState().notificationPrefs.priceDrops).toBe(true);
    const paid = price.priceCents * 2;
    const order = (n: number): StoredOrder => ({
      id: `o${n}`,
      storeId: price.storeId,
      channel: 'drive',
      url: '',
      lines: [{ itemId: 'i1', label: 'Article', productId: price.productId, packs: 1, totalCents: paid, priceSource: 'open_prices' }],
      totalCents: paid,
      createdAt: `2026-10-0${n}T10:00:00.000Z`,
      status: 'confirmed',
      weekStart: '2026-09-28',
      savingsCents: 0,
      mealPlanId: null,
    });
    useOrderStore.getState().setOrders([order(2), order(1)]);
    const priceDropCalls = () =>
      N.scheduleNotificationAsync.mock.calls.filter((c) => String(c[0]?.identifier).startsWith(`cabas-price-drop-${price.productId}`));
    N.scheduleNotificationAsync.mockClear();

    // Gluten déclaré APRÈS les commandes : aucune alerte, aucune notification.
    expect(useProfileStore.getState().updateProfile({ allergens: ['gluten'] }).ok).toBe(true);
    expect(await checkPriceDrops()).toEqual([]);
    expect(priceDropCalls()).toHaveLength(0);

    // Témoin : sans cet allergène, la même baisse est bien notifiée.
    expect(useProfileStore.getState().updateProfile({ allergens: ['arachides'] }).ok).toBe(true);
    const sent = await checkPriceDrops();
    expect(sent.map((d) => [d.productId, d.storeId, d.newCents])).toEqual([[price.productId, price.storeId, price.priceCents]]);
    expect(priceDropCalls()).toHaveLength(1);
  });
});

describe('resetAllStores', () => {
  it('remet tout à zéro', async () => {
    onboard();
    await usePlanStore.getState().generate();
    await resetAllStores();
    expect(useProfileStore.getState().profile).toBeNull();
    expect(usePlanStore.getState().plans).toEqual({});
    expect(useListStore.getState().lists).toEqual({});
    expect(useBasketStore.getState().plan).toBeNull();
    expect(useProfileStore.getState().hydrated).toBe(true);
  });
});
