/**
 * listStore : retouches des articles du menu, mémoire des retraits, surplus
 * rangé au placard (mode démo : catalogue embarqué, moteur local).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook } from '@testing-library/react-native';

import type { ShoppingListItem } from '@/core';
import { dismissalKey, withoutDismissed } from '@/core';
import { leftoversState } from '@/components/feature/list/listView';

import {
  addFromCheckedList,
  getList,
  resetAllStores,
  useExpiringSoon,
  useListStore,
  usePantryStore,
  usePlanStore,
  useProfileStore,
  useWeekStore,
  waitForHydration,
  type ProfileDraft,
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

const DRAFT: ProfileDraft = {
  displayName: 'Sam',
  household: { adults: 2, children: 0 },
  weeklyBudgetCents: 10000,
  maxCookTimeWeekdayMin: 45,
  maxCookTimeWeekendMin: 90,
  equipment: ['plaques', 'four', 'mixeur', 'micro_ondes'],
  preferredStoreIds: ['leclerc'],
};

const week = () => useWeekStore.getState().currentWeekStart;
const list = () => useListStore.getState();
const itemOf = (id: string) => getList(week()).items.find((i) => i.id === id);

async function planWeek(): Promise<string> {
  useProfileStore.getState().updateDraft(DRAFT);
  const res = useProfileStore.getState().completeOnboarding();
  if (!res.ok) throw new Error(res.issues.map((i) => i.message).join(' '));
  await usePlanStore.getState().generate();
  return week();
}

/** Article du menu en grammes, assez gros pour être divisé, hors placard de base. */
function gramItem(ws: string, minQuantity = 40): ShoppingListItem {
  const found = getList(ws).items.find((i) => i.source === 'plan' && i.unit === 'g' && i.quantity >= minQuantity && !i.pantryStaple);
  if (!found) throw new Error('aucun article en grammes dans la liste');
  return found;
}

beforeAll(async () => {
  await waitForHydration();
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await resetAllStores({ resetSimulatedPurchases: true });
  useWeekStore.getState().refreshToday(useWeekStore.getState().currentWeekStart);
});

describe('retouches d’un article du menu', () => {
  it('quantité baissée puis cochée : elle survit au rangement du surplus (régénération)', async () => {
    const ws = await planWeek();
    const target = gramItem(ws);
    const lowered = Math.floor(target.quantity / 2);
    list().updateItem(target.id, { quantity: lowered, label: 'Mon riz', aisle: 'autre' }, ws);
    for (const i of getList(ws).items) list().setChecked(i.id, true, ws);

    // Le placard change (surplus rangé) → la liste est régénérée.
    addFromCheckedList(ws);
    usePlanStore.getState().syncList(ws);

    expect(itemOf(target.id)).toMatchObject({ quantity: lowered, label: 'Mon riz', aisle: 'autre', checked: true });
    expect(getList(ws).items.every((i) => i.checked)).toBe(true);
  });

  it('le besoin change (placard) : Cabas recalcule la quantité, libellé et rayon restent', async () => {
    const ws = await planWeek();
    const target = gramItem(ws);
    list().updateItem(target.id, { quantity: Math.floor(target.quantity / 2), label: 'Mon riz' }, ws);
    usePantryStore.getState().add({
      label: target.label,
      quantity: Math.floor(target.quantity / 4),
      unit: target.unit,
      ingredientId: target.ingredientId,
    });
    const after = itemOf(target.id)!;
    expect(after.quantity).toBeLessThan(target.quantity);
    expect(after.quantity).not.toBe(Math.floor(target.quantity / 2));
    expect(after.label).toBe('Mon riz');
    expect(list().overrides[ws][dismissalKey(target)]).toEqual({ label: 'Mon riz' });
  });

  it('remettre la quantité du menu efface la retouche', async () => {
    const ws = await planWeek();
    const target = gramItem(ws);
    list().updateItem(target.id, { quantity: target.quantity + 100 }, ws);
    expect(list().overrides[ws][dismissalKey(target)]?.quantity).toEqual({ value: target.quantity + 100, planned: target.quantity });
    list().updateItem(target.id, { quantity: target.quantity }, ws);
    expect(list().overrides[ws][dismissalKey(target)]).toBeUndefined();
  });
});

describe('mémoire des retraits', () => {
  it('retient le besoin du menu, pas une quantité retouchée', async () => {
    const ws = await planWeek();
    const plan = getList(ws).items.filter((i) => i.source === 'plan' && i.unit === 'g' && i.quantity >= 40 && !i.pantryStaple);
    expect(plan.length).toBeGreaterThan(1);
    const [lowered, raised] = plan;

    // Baissé puis retiré : il ne revient pas à la régénération suivante.
    list().updateItem(lowered.id, { quantity: Math.floor(lowered.quantity / 2) }, ws);
    list().removeItem(lowered.id, ws);
    expect(list().dismissed[ws][dismissalKey(lowered)]).toBe(lowered.quantity);
    usePlanStore.getState().syncList(ws);
    expect(itemOf(lowered.id)).toBeUndefined();

    // Augmenté puis retiré : il revient si le menu en demande vraiment davantage.
    list().updateItem(raised.id, { quantity: raised.quantity * 3 }, ws);
    list().removeItem(raised.id, ws);
    const dismissed = list().dismissed[ws];
    expect(dismissed[dismissalKey(raised)]).toBe(raised.quantity);
    expect(withoutDismissed([{ ...raised, quantity: raised.quantity * 1.5 }], dismissed)).toHaveLength(1);
  });
});

describe('storeLeftovers', () => {
  it('range le surplus une seule fois, même après une décoche ou un redémarrage', async () => {
    const ws = await planWeek();
    for (const i of getList(ws).items) list().setChecked(i.id, true, ws);
    const first = list().storeLeftovers(ws);
    expect(first).toBeGreaterThan(0);
    expect(leftoversState(getList(ws).items, list().leftovers[ws])).toBe('stored');

    // L'utilisateur date un reste et en consomme un autre…
    const [dated, used] = usePantryStore.getState().items;
    usePantryStore.getState().update(dated.id, { expiresAt: '2030-01-01' });
    if (used) usePantryStore.getState().consume(used.id, used.quantity);
    const pantryBefore = usePantryStore.getState().items;

    // … puis décoche et recoche : rien n'est rangé une seconde fois.
    const any = getList(ws).items[0];
    list().setChecked(any.id, false, ws);
    list().setChecked(any.id, true, ws);
    expect(leftoversState(getList(ws).items, list().leftovers[ws])).toBe('stored');
    expect(addFromCheckedList(ws)).toBe(0);
    expect(usePantryStore.getState().items).toEqual(pantryBefore);

    // Persisté : l'information survit au redémarrage.
    const persisted = useListStore.persist.getOptions().partialize?.(useListStore.getState()) as Record<string, unknown>;
    expect(persisted).toHaveProperty(['leftovers', ws]);
    expect(persisted).toHaveProperty('overrides');

    // Un nouvel article coché peut, lui, être rangé.
    const extra = list().addManualItem('Lessive', 1, 'piece', ws)!;
    list().setChecked(extra.id, true, ws);
    expect(leftoversState(getList(ws).items, list().leftovers[ws])).toBe('todo');
    list().storeLeftovers(ws);
    expect(list().leftovers[ws].itemIds).toContain(extra.id);
  });

  it('rien à ranger : 0 article et un état distinct de « surplus rangé »', async () => {
    const ws = week();
    const lessive = list().addManualItem('Lessive', 1, 'piece', ws)!;
    list().setChecked(lessive.id, true, ws);
    expect(list().storeLeftovers(ws)).toBe(0);
    expect(list().leftovers[ws]).toEqual({ itemIds: [lessive.id], stored: 0 });
    expect(leftoversState(getList(ws).items, list().leftovers[ws])).toBe('none');
    list().reset();
    expect(list().leftovers).toEqual({});
    expect(list().overrides).toEqual({});
  });
});

describe('useExpiringSoon', () => {
  it('compte depuis le jour local de l’appareil (weekStore), pas la date UTC', async () => {
    useWeekStore.getState().refreshToday('2030-01-01');
    usePantryStore.getState().add({ label: 'Yaourt', quantity: 4, unit: 'piece', expiresAt: '2030-01-04' });
    usePantryStore.getState().add({ label: 'Crème', quantity: 1, unit: 'piece', expiresAt: '2030-01-05' });
    const { result } = await renderHook(() => useExpiringSoon(3));
    expect(result.current.map((p) => p.label)).toEqual(['Yaourt']);
  });
});
