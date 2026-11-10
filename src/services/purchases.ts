/**
 * Abonnement Premium (RevenueCat — `react-native-purchases`).
 *
 * Production iOS / Android (build natif + clé publique RevenueCat) : SDK réel,
 * droit `premium` lu dans `CustomerInfo.entitlements.active`.
 * Mode démo, web, Expo Go ou module natif absent : MAGASIN SIMULÉ, toujours
 * fonctionnel — un achat accorde Premium avec 7 jours d'essai (`isTrial`,
 * `expiresAt` = +7 j) ; état persistant (`cabas/purchases-sim`).
 *
 * API : `configure(userId)`, `getOfferings()` → `{ monthly, annual }` normalisés,
 * `purchase(packageId)`, `restore()`, `getSubscriptionState()`,
 * `addListener(cb)` → désabonnement, `isSimulated()`, `getManagementUrl()`.
 */
import { NativeModules, Platform } from 'react-native';
import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

import type { SubscriptionState } from '@/core';
import { formatPrice, PREMIUM_PRICING } from '@/core';
import { env, isDemoMode } from '@/lib/env';
import { readJSON, storageKey, writeJSON } from '@/lib/storage';

import { errorMessage } from './supabase';

/** Identifiant du droit configuré dans RevenueCat. */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

export const FREE_SUBSCRIPTION: SubscriptionState = {
  entitlement: 'free',
  isTrial: false,
  expiresAt: null,
  productId: null,
  willRenew: false,
};

export type PackageId = 'monthly' | 'annual';

export interface NormalizedPackage {
  id: PackageId;
  /** Identifiant du package RevenueCat (« $rc_monthly »…). */
  identifier: string;
  productId: string;
  /** Prix localisé fourni par le store (« 4,99 € »). */
  priceString: string;
  priceCents: number | null;
  /** Équivalent mensuel (« 3,33 € ») pour l'annuel. */
  pricePerMonthString: string | null;
  period: 'month' | 'year';
  /** Essai gratuit proposé à cet utilisateur (null si déjà utilisé / absent). */
  trial: { days: number; label: string } | null;
}

export interface NormalizedOfferings {
  monthly: NormalizedPackage | null;
  annual: NormalizedPackage | null;
  /** Offres du magasin simulé (démo, web, Expo Go). */
  simulated: boolean;
}

export type PurchaseResult =
  | { status: 'success'; state: SubscriptionState }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type SubscriptionListener = (state: SubscriptionState) => void;

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function unitDays(unit: string): number {
  switch (unit.toUpperCase()) {
    case 'DAY':
      return 1;
    case 'WEEK':
      return 7;
    case 'MONTH':
      return 30;
    case 'YEAR':
      return 365;
    default:
      return 0;
  }
}

function trialLabel(days: number): string {
  return days === 1 ? '1 jour d’essai gratuit' : `${days} jours d’essai gratuit`;
}

/** Essai gratuit d'un produit (iOS : introPrice à 0 ; Android : phase gratuite). */
export function trialOf(product: PurchasesStoreProduct): NormalizedPackage['trial'] {
  const intro = product.introPrice;
  if (intro && intro.price === 0) {
    const days = intro.periodNumberOfUnits * unitDays(intro.periodUnit) * Math.max(1, intro.cycles);
    if (days > 0) return { days, label: trialLabel(days) };
  }
  const free = product.defaultOption?.freePhase;
  if (free) {
    const days = free.billingPeriod.value * unitDays(free.billingPeriod.unit);
    if (days > 0) return { days, label: trialLabel(days) };
  }
  return null;
}

function normalizePackage(pkg: PurchasesPackage, id: PackageId): NormalizedPackage {
  const p = pkg.product;
  return {
    id,
    identifier: pkg.identifier,
    productId: p.identifier,
    priceString: p.priceString,
    priceCents: Number.isFinite(p.price) ? Math.round(p.price * 100) : null,
    pricePerMonthString: id === 'annual' ? p.pricePerMonthString : null,
    period: id === 'annual' ? 'year' : 'month',
    trial: trialOf(p),
  };
}

/** Offre RevenueCat → `{ monthly, annual }`. */
export function normalizeOffering(offering: PurchasesOffering | null): NormalizedOfferings {
  if (!offering) return { monthly: null, annual: null, simulated: false };
  const monthly = offering.monthly ?? offering.availablePackages.find((p) => p.packageType === 'MONTHLY') ?? null;
  const annual = offering.annual ?? offering.availablePackages.find((p) => p.packageType === 'ANNUAL') ?? null;
  return {
    monthly: monthly ? normalizePackage(monthly, 'monthly') : null,
    annual: annual ? normalizePackage(annual, 'annual') : null,
    simulated: false,
  };
}

/** CustomerInfo → état d'abonnement du domaine. */
export function subscriptionFromCustomerInfo(info: CustomerInfo): SubscriptionState {
  const ent = info.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  if (!ent || !ent.isActive) return { ...FREE_SUBSCRIPTION };
  return {
    entitlement: 'premium',
    isTrial: ent.periodType === 'TRIAL',
    expiresAt: ent.expirationDate,
    productId: ent.productIdentifier,
    willRenew: ent.willRenew,
  };
}

// ─── Magasin simulé ──────────────────────────────────────────────────────────

const SIM_KEY = storageKey('purchases-sim');

interface SimulatedStoreFile {
  state: SubscriptionState;
  trialUsed: boolean;
  period: 'month' | 'year' | null;
}

const SIM_PRODUCTS: Record<PackageId, string> = {
  monthly: 'cabas_premium_monthly',
  annual: 'cabas_premium_annual',
};

function addPeriod(fromMs: number, period: 'month' | 'year'): number {
  const d = new Date(fromMs);
  if (period === 'month') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.getTime();
}

export interface SimulatedStore {
  getState(): Promise<SubscriptionState>;
  getOfferings(): Promise<NormalizedOfferings>;
  purchase(id: PackageId): Promise<SubscriptionState>;
  restore(): Promise<SubscriptionState>;
  /** Outils de dev : remet l'abonnement simulé à zéro (essai à nouveau disponible). */
  reset(): Promise<void>;
  /** Outils de dev / tests : fait expirer l'abonnement simulé. */
  expire(): Promise<void>;
}

export function createSimulatedStore(opts: { now?: () => number } = {}): SimulatedStore {
  const now = opts.now ?? (() => Date.now());
  let cache: SimulatedStoreFile | null = null;

  async function load(): Promise<SimulatedStoreFile> {
    if (cache) return cache;
    cache = await readJSON<SimulatedStoreFile>(SIM_KEY, { state: { ...FREE_SUBSCRIPTION }, trialUsed: false, period: null });
    return cache;
  }
  async function save(file: SimulatedStoreFile): Promise<void> {
    cache = file;
    await writeJSON(SIM_KEY, file);
  }
  /** Fin d'essai / de période : renouvellement automatique si actif, sinon gratuit. */
  async function current(): Promise<SubscriptionState> {
    const file = await load();
    const s = file.state;
    if (s.entitlement !== 'premium' || !s.expiresAt) return { ...s };
    let exp = Date.parse(s.expiresAt);
    if (!Number.isFinite(exp) || exp > now()) return { ...s };
    if (s.willRenew && file.period) {
      while (exp <= now()) exp = addPeriod(exp, file.period);
      const renewed: SubscriptionState = { ...s, isTrial: false, expiresAt: new Date(exp).toISOString() };
      await save({ ...file, state: renewed });
      return { ...renewed };
    }
    await save({ ...file, state: { ...FREE_SUBSCRIPTION } });
    return { ...FREE_SUBSCRIPTION };
  }

  return {
    getState: current,
    async getOfferings() {
      const file = await load();
      const trial = file.trialUsed ? null : { days: PREMIUM_PRICING.trialDays, label: trialLabel(PREMIUM_PRICING.trialDays) };
      return {
        simulated: true,
        monthly: {
          id: 'monthly',
          identifier: '$rc_monthly',
          productId: SIM_PRODUCTS.monthly,
          priceString: formatPrice(PREMIUM_PRICING.monthlyCents),
          priceCents: PREMIUM_PRICING.monthlyCents,
          pricePerMonthString: null,
          period: 'month',
          trial,
        },
        annual: {
          id: 'annual',
          identifier: '$rc_annual',
          productId: SIM_PRODUCTS.annual,
          priceString: formatPrice(PREMIUM_PRICING.yearlyCents),
          priceCents: PREMIUM_PRICING.yearlyCents,
          pricePerMonthString: formatPrice(Math.round(PREMIUM_PRICING.yearlyCents / 12)),
          period: 'year',
          trial,
        },
      };
    },
    async purchase(id) {
      const file = await load();
      const period = id === 'annual' ? 'year' : 'month';
      const withTrial = !file.trialUsed;
      const expiresAt = withTrial ? now() + PREMIUM_PRICING.trialDays * DAY_MS : addPeriod(now(), period);
      const state: SubscriptionState = {
        entitlement: 'premium',
        isTrial: withTrial,
        expiresAt: new Date(expiresAt).toISOString(),
        productId: SIM_PRODUCTS[id],
        willRenew: true,
      };
      await save({ state, trialUsed: true, period });
      return { ...state };
    },
    restore: current,
    async reset() {
      await save({ state: { ...FREE_SUBSCRIPTION }, trialUsed: false, period: null });
    },
    async expire() {
      const file = await load();
      await save({ ...file, state: { ...FREE_SUBSCRIPTION } });
    },
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

type PurchasesModule = typeof import('react-native-purchases');

/** SDK natif utilisable (build natif, hors Expo Go et web). */
export function isNativePurchasesAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  const g = globalThis as { expo?: { modules?: { ExpoGo?: unknown } } };
  if (g.expo?.modules?.ExpoGo) return false;
  return !!NativeModules.RNPurchases;
}

function apiKey(): string | null {
  if (Platform.OS === 'ios') return env.revenueCatIosKey;
  if (Platform.OS === 'android') return env.revenueCatAndroidKey;
  return null;
}

export interface PurchasesService {
  isSimulated(): boolean;
  configure(userId: string): Promise<void>;
  getOfferings(): Promise<NormalizedOfferings>;
  purchase(id: PackageId): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
  getSubscriptionState(): Promise<SubscriptionState>;
  addListener(listener: SubscriptionListener): () => void;
  /** Page de gestion de l'abonnement du store (null en simulé). */
  getManagementUrl(): Promise<string | null>;
  /** Magasin simulé (outils de dev) ; null en production native. */
  simulated: SimulatedStore | null;
}

export function createSimulatedPurchases(store: SimulatedStore = createSimulatedStore()): PurchasesService {
  const listeners = new Set<SubscriptionListener>();
  const emit = (s: SubscriptionState) => {
    for (const l of Array.from(listeners)) l({ ...s });
  };
  return {
    simulated: store,
    isSimulated: () => true,
    configure: async () => undefined,
    getOfferings: () => store.getOfferings(),
    async purchase(id) {
      try {
        const state = await store.purchase(id);
        emit(state);
        return { status: 'success', state };
      } catch (err) {
        return { status: 'error', message: errorMessage(err) };
      }
    },
    async restore() {
      const state = await store.restore();
      emit(state);
      return { status: 'success', state };
    },
    getSubscriptionState: () => store.getState(),
    addListener(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getManagementUrl: async () => null,
  };
}

function createNativePurchases(key: string): PurchasesService {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
  const mod: PurchasesModule = require('react-native-purchases');
  const Purchases = mod.default;
  let configuredFor: string | null = null;

  async function findPackage(id: PackageId): Promise<PurchasesPackage | null> {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    return id === 'annual'
      ? (current.annual ?? current.availablePackages.find((p) => p.packageType === 'ANNUAL') ?? null)
      : (current.monthly ?? current.availablePackages.find((p) => p.packageType === 'MONTHLY') ?? null);
  }

  function isCancelled(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: unknown; userCancelled?: unknown };
    return e.userCancelled === true || e.code === mod.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  }

  return {
    simulated: null,
    isSimulated: () => false,
    async configure(userId) {
      if (configuredFor === userId) return;
      if (configuredFor === null && !(await Purchases.isConfigured())) {
        Purchases.configure({ apiKey: key, appUserID: userId });
      }
      // app_user_id RevenueCat = id utilisateur Supabase (le webhook s'appuie dessus).
      if ((await Purchases.getAppUserID()) !== userId) await Purchases.logIn(userId);
      configuredFor = userId;
    },
    async getOfferings() {
      const offerings = await Purchases.getOfferings();
      return normalizeOffering(offerings.current);
    },
    async purchase(id) {
      try {
        const pkg = await findPackage(id);
        if (!pkg) return { status: 'error', message: 'Offre indisponible pour le moment.' };
        const res = await Purchases.purchasePackage(pkg);
        return { status: 'success', state: subscriptionFromCustomerInfo(res.customerInfo) };
      } catch (err) {
        if (isCancelled(err)) return { status: 'cancelled' };
        return { status: 'error', message: errorMessage(err) };
      }
    },
    async restore() {
      try {
        const info = await Purchases.restorePurchases();
        return { status: 'success', state: subscriptionFromCustomerInfo(info) };
      } catch (err) {
        return { status: 'error', message: errorMessage(err) };
      }
    },
    async getSubscriptionState() {
      const info = await Purchases.getCustomerInfo();
      return subscriptionFromCustomerInfo(info);
    },
    addListener(listener) {
      const fn = (info: CustomerInfo) => listener(subscriptionFromCustomerInfo(info));
      Purchases.addCustomerInfoUpdateListener(fn);
      return () => {
        Purchases.removeCustomerInfoUpdateListener(fn);
      };
    },
    async getManagementUrl() {
      try {
        const info = await Purchases.getCustomerInfo();
        return info.managementURL ?? null;
      } catch {
        return null;
      }
    },
  };
}

let service: PurchasesService | null = null;

/** Service d'achat selon la plateforme et l'environnement. */
export function getPurchases(): PurchasesService {
  if (service) return service;
  const key = apiKey();
  service = !isDemoMode && key && isNativePurchasesAvailable() ? createNativePurchases(key) : createSimulatedPurchases();
  return service;
}

export function __setPurchasesForTests(s: PurchasesService | null): void {
  service = s;
}

// Raccourcis
export const configurePurchases = (userId: string) => getPurchases().configure(userId);
export const getOfferings = () => getPurchases().getOfferings();
export const purchase = (id: PackageId) => getPurchases().purchase(id);
export const restorePurchases = () => getPurchases().restore();
export const getSubscriptionState = () => getPurchases().getSubscriptionState();
export const addSubscriptionListener = (l: SubscriptionListener) => getPurchases().addListener(l);
