import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import {
  createSimulatedPurchases,
  createSimulatedStore,
  getPurchases,
  isNativePurchasesAvailable,
  normalizeOffering,
  subscriptionFromCustomerInfo,
} from '../purchases';

jest.mock('react-native-purchases', () => ({ __esModule: true, default: {}, PURCHASES_ERROR_CODE: {} }));

const DAY = 86_400_000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('magasin simulé (démo / web / Expo Go)', () => {
  it('est utilisé dans les tests (pas de module natif)', () => {
    expect(isNativePurchasesAvailable()).toBe(false);
    expect(getPurchases().isSimulated()).toBe(true);
  });

  it('offre mensuelle et annuelle avec essai de 7 jours', async () => {
    const offers = await createSimulatedStore().getOfferings();
    expect(offers.simulated).toBe(true);
    expect(offers.monthly?.priceCents).toBe(499);
    expect(offers.annual?.priceCents).toBe(3999);
    expect(offers.annual?.pricePerMonthString).toBeTruthy();
    expect(offers.monthly?.trial?.days).toBe(7);
  });

  it('achat → Premium en essai 7 jours, puis renouvellement ou retour au gratuit', async () => {
    let now = Date.parse('2026-11-10T09:00:00Z');
    const store = createSimulatedStore({ now: () => now });
    const service = createSimulatedPurchases(store);
    const listener = jest.fn();
    const unsub = service.addListener(listener);

    const res = await service.purchase('monthly');
    expect(res.status).toBe('success');
    if (res.status !== 'success') return;
    expect(res.state).toMatchObject({ entitlement: 'premium', isTrial: true, willRenew: true });
    expect(Date.parse(res.state.expiresAt!) - now).toBe(7 * DAY);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ entitlement: 'premium' }));

    // L'essai est consommé : plus d'essai proposé.
    expect((await store.getOfferings()).monthly?.trial).toBeNull();

    // Restauration : renvoie l'état courant.
    const restored = await service.restore();
    expect(restored).toMatchObject({ status: 'success', state: { entitlement: 'premium' } });

    // Fin de l'essai : renouvellement automatique (plus en essai).
    now += 8 * DAY;
    const renewed = await service.getSubscriptionState();
    expect(renewed).toMatchObject({ entitlement: 'premium', isTrial: false });

    // Expiration forcée (outil de dev) → gratuit.
    await store.expire();
    expect((await service.getSubscriptionState()).entitlement).toBe('free');
    unsub();
  });

  it('persiste son état (cabas/purchases-sim)', async () => {
    await createSimulatedStore().purchase('annual');
    const again = createSimulatedStore();
    expect((await again.getState()).entitlement).toBe('premium');
    await again.reset();
    expect((await createSimulatedStore().getState()).entitlement).toBe('free');
  });
});

describe('normalisation RevenueCat', () => {
  const product = (over: Record<string, unknown>) => ({
    identifier: 'cabas_premium_monthly',
    priceString: '4,99 €',
    price: 4.99,
    pricePerMonthString: '4,99 €',
    introPrice: null,
    defaultOption: null,
    ...over,
  });

  it('offre → { monthly, annual } avec essai', () => {
    const offering = {
      monthly: { identifier: '$rc_monthly', packageType: 'MONTHLY', product: product({ introPrice: { price: 0, periodNumberOfUnits: 1, periodUnit: 'WEEK', cycles: 1 } }) },
      annual: { identifier: '$rc_annual', packageType: 'ANNUAL', product: product({ identifier: 'cabas_premium_annual', price: 39.99, priceString: '39,99 €', pricePerMonthString: '3,33 €' }) },
      availablePackages: [],
    } as unknown as PurchasesOffering;
    const n = normalizeOffering(offering);
    expect(n.monthly).toMatchObject({ id: 'monthly', priceCents: 499, trial: { days: 7 } });
    expect(n.annual).toMatchObject({ id: 'annual', priceCents: 3999, pricePerMonthString: '3,33 €', trial: null });
    expect(normalizeOffering(null)).toEqual({ monthly: null, annual: null, simulated: false });
    const pkgOnly = normalizeOffering({
      monthly: null,
      annual: null,
      availablePackages: [offering.monthly as PurchasesPackage],
    } as unknown as PurchasesOffering);
    expect(pkgOnly.monthly?.identifier).toBe('$rc_monthly');
  });

  it('CustomerInfo → SubscriptionState', () => {
    const info = (active: Record<string, unknown>) => ({ entitlements: { active } }) as unknown as CustomerInfo;
    expect(subscriptionFromCustomerInfo(info({})).entitlement).toBe('free');
    expect(
      subscriptionFromCustomerInfo(
        info({
          premium: {
            isActive: true,
            periodType: 'TRIAL',
            expirationDate: '2026-11-17T00:00:00Z',
            productIdentifier: 'cabas_premium_annual',
            willRenew: true,
          },
        }),
      ),
    ).toEqual({
      entitlement: 'premium',
      isTrial: true,
      expiresAt: '2026-11-17T00:00:00Z',
      productId: 'cabas_premium_annual',
      willRenew: true,
    });
  });
});
