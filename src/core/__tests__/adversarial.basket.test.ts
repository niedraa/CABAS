/// <reference types="jest" />
/**
 * Tests ADVERSARIAUX — panier optimisé.
 *
 * Référence « force brute » INDÉPENDANTE : on énumère toutes les affectations
 * article → magasin (ou « manquant »), et non les sous-ensembles de magasins
 * comme l'implémentation. Ordre de préférence de la spécification :
 * minimum de commande respecté si possible, puis couverture maximale, puis
 * total minimal (frais compris).
 */
import { MAX_COMBINATIONS, optimizeBasket, storeFees } from '../basketOptimizer';
import { mulberry32, seededShuffle } from '../random';
import type { BasketPlan, ItemComparison, OrderChannel, Store, StoreChain, StoreOffer } from '../types';

const NOW = '2026-11-10T10:00:00.000Z';
const CHAINS: StoreChain[] = ['leclerc', 'carrefour', 'auchan', 'intermarche', 'lidl', 'monoprix'];

function st(id: string, o: Partial<Store> = {}): Store {
  return {
    id,
    chain: 'leclerc',
    name: id,
    city: 'Lille',
    driveFeeCents: 0,
    deliveryFeeCents: 0,
    minOrderCents: 0,
    searchUrlTemplate: 'https://x.example/?q={query}',
    driveUrl: 'https://x.example/drive',
    ...o,
  };
}

function offer(storeId: string, totalCents: number, ppu = totalCents): StoreOffer {
  return {
    storeId,
    productId: `p_${storeId}`,
    packs: 1,
    unitPriceCents: totalCents,
    totalCents,
    pricePerBaseUnitCents: ppu,
    referenceUnit: 'kg',
    isStoreBrand: false,
    isPromo: false,
  };
}

function cmp(itemId: string, offers: StoreOffer[]): ItemComparison {
  const sorted = offers.slice().sort((a, b) => a.totalCents - b.totalCents || (a.storeId < b.storeId ? -1 : 1));
  return { itemId, label: itemId, offers: sorted, best: sorted[0] };
}

interface BruteResult {
  valid: boolean;
  covered: number;
  total: number;
}

/** Meilleure affectation par énumération exhaustive (référence). */
function bruteForce(
  comparisons: readonly ItemComparison[],
  stores: readonly Store[],
  maxStores: number,
  channel: OrderChannel,
  includeFees: boolean,
): BruteResult | undefined {
  const eligible = new Map(stores.filter((s) => storeFees(s, channel) !== null).map((s) => [s.id, s]));
  let best: BruteResult | undefined;
  const subtotal = new Map<string, number>();
  const rec = (i: number, covered: number, itemsTotal: number) => {
    if (i === comparisons.length) {
      if (subtotal.size === 0 && comparisons.length > 0 && covered === 0) {
        // Panier vide : seulement si rien n'est disponible.
      }
      let fees = 0;
      let valid = true;
      for (const [sid, sub] of subtotal) {
        const s = eligible.get(sid) as Store;
        fees += includeFees ? (storeFees(s, channel) ?? 0) : 0;
        if (sub < (s.minOrderCents ?? 0)) valid = false;
      }
      const cand = { valid, covered, total: itemsTotal + fees };
      if (
        !best ||
        (cand.valid && !best.valid) ||
        (cand.valid === best.valid &&
          (cand.covered > best.covered || (cand.covered === best.covered && cand.total < best.total)))
      ) {
        best = cand;
      }
      return;
    }
    // Option « manquant ».
    rec(i + 1, covered, itemsTotal);
    for (const o of comparisons[i].offers) {
      if (!eligible.has(o.storeId)) continue;
      const isNew = !subtotal.has(o.storeId);
      if (isNew && subtotal.size >= maxStores) continue;
      subtotal.set(o.storeId, (subtotal.get(o.storeId) ?? 0) + o.totalCents);
      rec(i + 1, covered + 1, itemsTotal + o.totalCents);
      const left = (subtotal.get(o.storeId) as number) - o.totalCents;
      if (isNew) subtotal.delete(o.storeId);
      else subtotal.set(o.storeId, left);
    }
  };
  rec(0, 0, 0);
  return best;
}

/** Invariants d'un panier, quel que soit le cas. */
function checkInvariants(plan: BasketPlan, comparisons: readonly ItemComparison[], stores: readonly Store[], maxStores: number, channel: OrderChannel, includeFees: boolean) {
  const storeById = new Map(stores.map((s) => [s.id, s]));
  let total = 0;
  const seen = new Set<string>();
  expect(plan.parts.length).toBeLessThanOrEqual(maxStores);
  for (const part of plan.parts) {
    const s = storeById.get(part.storeId) as Store;
    expect(s).toBeDefined();
    expect(storeFees(s, channel)).not.toBeNull();
    expect(part.lines.length).toBeGreaterThan(0); // pas de frais pour un magasin vide
    expect(part.subtotalCents).toBe(part.lines.reduce((a, l) => a + l.totalCents, 0));
    expect(part.feesCents).toBe(includeFees ? (storeFees(s, channel) ?? 0) : 0);
    for (const l of part.lines) {
      const c = comparisons.find((x) => x.itemId === l.itemId) as ItemComparison;
      const o = c.offers.find((x) => x.storeId === part.storeId && x.productId === l.productId);
      expect(o?.totalCents).toBe(l.totalCents);
      expect(seen.has(l.itemId)).toBe(false);
      seen.add(l.itemId);
    }
    total += part.subtotalCents + part.feesCents;
  }
  expect(plan.totalCents).toBe(total);
  expect(plan.savingsCents).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(plan.savingsCents)).toBe(true);
  // Chaque article est soit dans une ligne, soit manquant — jamais les deux.
  expect([...seen, ...plan.missingItemIds].sort()).toEqual(comparisons.map((c) => c.itemId).sort());
}

function randomCase(rand: () => number, opts: { maxStoreCount: number; minOrders: boolean; maxItems: number }) {
  const nStores = 1 + Math.floor(rand() * opts.maxStoreCount);
  const stores: Store[] = [];
  for (let i = 0; i < nStores; i++) {
    stores.push(
      st(`s${i}`, {
        chain: CHAINS[i % CHAINS.length],
        driveFeeCents: rand() < 0.5 ? 0 : 50 * Math.floor(rand() * 6),
        deliveryFeeCents: rand() < 0.2 ? null : 100 * Math.floor(rand() * 8),
        minOrderCents: opts.minOrders && rand() < 0.5 ? 100 * Math.floor(rand() * 15) : 0,
      }),
    );
  }
  const nItems = 1 + Math.floor(rand() * opts.maxItems);
  const comparisons: ItemComparison[] = [];
  for (let i = 0; i < nItems; i++) {
    const offers: StoreOffer[] = [];
    for (const s of stores) {
      if (rand() < 0.3) continue;
      // Prix « ronds » pour provoquer beaucoup d'égalités.
      const cents = 50 + 25 * Math.floor(rand() * 20);
      offers.push(offer(s.id, cents, rand() < 0.5 ? cents : cents + Math.floor(rand() * 3)));
    }
    comparisons.push(cmp(`i${i}`, offers));
  }
  const maxStores = 1 + Math.floor(rand() * 3);
  const channel: OrderChannel = rand() < 0.7 ? 'drive' : 'delivery';
  const includeFees = rand() < 0.8;
  return { stores, comparisons, maxStores, channel, includeFees };
}

describe('optimizeBasket(cheapest) vs force brute', () => {
  it('400 cas aléatoires (≤ 6 magasins, sans minimum de commande) : optimum exact', () => {
    const rand = mulberry32(1789);
    let nonTrivial = 0;
    for (let c = 0; c < 400; c++) {
      const { stores, comparisons, maxStores, channel, includeFees } = randomCase(rand, { maxStoreCount: 6, minOrders: false, maxItems: 6 });
      const plan = optimizeBasket(comparisons, stores, 'cheapest', { maxStores, channel, includeFees, now: NOW });
      const ref = bruteForce(comparisons, stores, maxStores, channel, includeFees);
      checkInvariants(plan, comparisons, stores, maxStores, channel, includeFees);
      const covered = comparisons.length - plan.missingItemIds.length;
      expect({ covered, total: plan.totalCents }).toEqual({ covered: ref?.covered ?? 0, total: ref?.total ?? 0 });
      if (plan.parts.length > 1) nonTrivial++;
    }
    expect(nonTrivial).toBeGreaterThan(40); // le jeu de tests exerce bien le multi-magasins
  });

  it('300 cas avec PLUS de 6 magasins (présélection) : optimum exact', () => {
    const rand = mulberry32(2026);
    for (let c = 0; c < 300; c++) {
      const base = randomCase(rand, { maxStoreCount: 9, minOrders: false, maxItems: 5 });
      // Force 7 à 9 magasins.
      const extra = Array.from({ length: 7 + Math.floor(rand() * 3) - base.stores.length }, (_, i) => st(`x${i}`, { driveFeeCents: 100 * Math.floor(rand() * 3) }));
      const stores = [...base.stores, ...extra];
      const comparisons = base.comparisons.map((cp) => {
        const more = extra.filter(() => rand() < 0.5).map((s) => offer(s.id, 50 + 25 * Math.floor(rand() * 20)));
        return cmp(cp.itemId, [...cp.offers, ...more]);
      });
      const maxStores = 1 + Math.floor(rand() * 2);
      const plan = optimizeBasket(comparisons, stores, 'cheapest', { maxStores, channel: 'drive', now: NOW });
      const ref = bruteForce(comparisons, stores, maxStores, 'drive', true);
      checkInvariants(plan, comparisons, stores, maxStores, 'drive', true);
      expect({ covered: comparisons.length - plan.missingItemIds.length, total: plan.totalCents }).toEqual({
        covered: ref?.covered ?? 0,
        total: ref?.total ?? 0,
      });
    }
  });

  it('300 cas AVEC minimums de commande : panier valide dès qu’un panier valide existe, jamais moins bon que les magasins seuls', () => {
    const rand = mulberry32(7);
    for (let c = 0; c < 300; c++) {
      const { stores, comparisons, maxStores, channel, includeFees } = randomCase(rand, { maxStoreCount: 5, minOrders: true, maxItems: 5 });
      const plan = optimizeBasket(comparisons, stores, 'cheapest', { maxStores, channel, includeFees, now: NOW });
      checkInvariants(plan, comparisons, stores, maxStores, channel, includeFees);
      const ref = bruteForce(comparisons, stores, maxStores, channel, includeFees);
      const planValid = plan.parts.every((p) => p.subtotalCents >= (stores.find((s) => s.id === p.storeId)?.minOrderCents ?? 0));
      // (Le panier vide est toujours « valide » pour la force brute : on ne
      // l'exige pas de l'implémentation, qui préfère alors couvrir la liste.)
      if (ref?.valid && ref.covered > 0) {
        expect(planValid).toBe(true);
        // L'implémentation ne peut pas faire mieux que l'optimum…
        const covered = comparisons.length - plan.missingItemIds.length;
        expect(covered < ref.covered || (covered === ref.covered && plan.totalCents >= ref.total)).toBe(true);
      }
      // …et ne fait jamais pire que le meilleur magasin unique valide.
      const single = optimizeBasket(comparisons, stores, 'single_store', { channel, includeFees, now: NOW });
      const singleValid = single.parts.every((p) => p.subtotalCents >= (stores.find((s) => s.id === p.storeId)?.minOrderCents ?? 0));
      if (singleValid && planValid && single.missingItemIds.length === plan.missingItemIds.length) {
        expect(plan.totalCents).toBeLessThanOrEqual(single.totalCents);
      }
    }
  });
});

describe('optimizeBasket — budget de combinaisons', () => {
  it(`beaucoup de magasins sans limite : présélection (≤ ${MAX_COMBINATIONS} combinaisons), rapide et cohérent`, () => {
    const rand = mulberry32(11);
    const stores = Array.from({ length: 25 }, (_, i) => st(`m${String(i).padStart(2, '0')}`, { driveFeeCents: 100 * (i % 3) }));
    const comparisons = Array.from({ length: 30 }, (_, k) =>
      cmp(`i${k}`, stores.filter(() => rand() < 0.6).map((s) => offer(s.id, 50 + 25 * Math.floor(rand() * 20)))),
    );
    const t0 = Date.now();
    const plan = optimizeBasket(comparisons, stores, 'cheapest', { maxStores: Infinity, now: NOW });
    expect(Date.now() - t0).toBeLessThan(3000);
    checkInvariants(plan, comparisons, stores, Infinity, 'drive', true);
    // Jamais pire que le meilleur magasin unique couvrant autant d'articles.
    const single = optimizeBasket(comparisons, stores, 'single_store', { now: NOW });
    if (single.missingItemIds.length === plan.missingItemIds.length) expect(plan.totalCents).toBeLessThanOrEqual(single.totalCents);
    expect(plan.missingItemIds.length).toBeLessThanOrEqual(single.missingItemIds.length);
    // Déterministe malgré la présélection.
    expect(optimizeBasket(comparisons, seededShuffle(stores, rand), 'cheapest', { maxStores: Infinity, now: NOW })).toEqual(plan);
  });

  it('2 magasins max parmi 40 : énumération exhaustive (820 paires) → optimum exact', () => {
    const rand = mulberry32(12);
    const stores = Array.from({ length: 40 }, (_, i) => st(`n${String(i).padStart(2, '0')}`, { driveFeeCents: 100 * (i % 4) }));
    const comparisons = Array.from({ length: 4 }, (_, k) =>
      cmp(`i${k}`, stores.filter(() => rand() < 0.4).map((s) => offer(s.id, 50 + 25 * Math.floor(rand() * 20)))),
    );
    const plan = optimizeBasket(comparisons, stores, 'cheapest', { now: NOW });
    const ref = bruteForce(comparisons, stores, 2, 'drive', true);
    expect({ covered: comparisons.length - plan.missingItemIds.length, total: plan.totalCents }).toEqual({ covered: ref?.covered, total: ref?.total });
  });
});

describe('optimizeBasket — déterminisme et cas limites', () => {
  it('même entrée dans un ordre différent → même panier (300 cas)', () => {
    const rand = mulberry32(99);
    for (let c = 0; c < 300; c++) {
      const { stores, comparisons, maxStores, channel, includeFees } = randomCase(rand, { maxStoreCount: 8, minOrders: rand() < 0.5, maxItems: 6 });
      for (const mode of ['cheapest', 'single_store'] as const) {
        const opts = { maxStores, channel, includeFees, now: NOW };
        const a = optimizeBasket(comparisons, stores, mode, opts);
        const shuffledComps = comparisons.map((cp) => ({ ...cp, offers: seededShuffle(cp.offers, rand) }));
        const b = optimizeBasket(shuffledComps, seededShuffle(stores, rand), mode, opts);
        expect(b).toEqual(a);
      }
    }
  });

  it('maxStores = 1 en mode « le moins cher » ≡ « un seul magasin »', () => {
    const rand = mulberry32(5);
    for (let c = 0; c < 200; c++) {
      const { stores, comparisons, channel, includeFees } = randomCase(rand, { maxStoreCount: 6, minOrders: rand() < 0.5, maxItems: 6 });
      const opts = { channel, includeFees, now: NOW };
      const single = optimizeBasket(comparisons, stores, 'single_store', opts);
      const cheapest1 = optimizeBasket(comparisons, stores, 'cheapest', { ...opts, maxStores: 1 });
      expect({ ...cheapest1, mode: 'single_store' }).toEqual(single);
    }
  });

  it('maxStores invalide (NaN, 0, négatif, 1,7) → défaut raisonnable, jamais illimité', () => {
    const stores = [st('a', { driveFeeCents: 0 }), st('b'), st('c')];
    const comps = [cmp('x', [offer('a', 100), offer('b', 500), offer('c', 500)]), cmp('y', [offer('a', 500), offer('b', 100), offer('c', 500)]), cmp('z', [offer('a', 500), offer('b', 500), offer('c', 100)])];
    expect(optimizeBasket(comps, stores, 'cheapest', { maxStores: NaN, now: NOW }).parts).toHaveLength(2);
    expect(optimizeBasket(comps, stores, 'cheapest', { maxStores: 0, now: NOW }).parts).toHaveLength(1);
    expect(optimizeBasket(comps, stores, 'cheapest', { maxStores: -4, now: NOW }).parts).toHaveLength(1);
    expect(optimizeBasket(comps, stores, 'cheapest', { maxStores: 1.7, now: NOW }).parts).toHaveLength(1);
    expect(optimizeBasket(comps, stores, 'cheapest', { maxStores: Infinity, now: NOW }).parts).toHaveLength(3);
  });

  it('aucun prix nulle part → panier vide, tout manquant, économie 0', () => {
    const plan = optimizeBasket([cmp('x', []), cmp('y', [])], [st('a'), st('b')], 'cheapest', { now: NOW });
    expect(plan).toEqual({ mode: 'cheapest', parts: [], totalCents: 0, savingsCents: 0, missingItemIds: ['x', 'y'], computedAt: NOW });
  });

  it('aucun magasin / liste vide → panier vide cohérent', () => {
    expect(optimizeBasket([cmp('x', [offer('a', 100)])], [], 'cheapest', { now: NOW })).toMatchObject({ parts: [], totalCents: 0, savingsCents: 0, missingItemIds: ['x'] });
    expect(optimizeBasket([], [st('a')], 'cheapest', { now: NOW })).toMatchObject({ parts: [], totalCents: 0, savingsCents: 0, missingItemIds: [] });
  });

  it('livraison non proposée → magasin exclu ; magasins hors préférences exclus', () => {
    const stores = [st('a', { deliveryFeeCents: null }), st('b', { deliveryFeeCents: 300 })];
    const comps = [cmp('x', [offer('a', 100), offer('b', 400)])];
    const plan = optimizeBasket(comps, stores, 'cheapest', { channel: 'delivery', now: NOW });
    expect(plan.parts.map((p) => p.storeId)).toEqual(['b']);
    expect(plan.totalCents).toBe(700);
    const onlyA = optimizeBasket(comps, stores, 'cheapest', { allowedStoreIds: ['a'], now: NOW });
    expect(onlyA.parts.map((p) => p.storeId)).toEqual(['a']);
  });

  it('frais : séparer en deux magasins seulement si l’économie dépasse les frais', () => {
    const stores = [st('a', { driveFeeCents: 100 }), st('b', { driveFeeCents: 100 })];
    const comps = [cmp('x', [offer('a', 100), offer('b', 300)]), cmp('y', [offer('a', 300), offer('b', 100)])];
    // Séparer économise 200 de produits et ne coûte que 100 de frais en plus : rentable.
    const split = optimizeBasket(comps, stores, 'cheapest', { now: NOW });
    expect(split.parts).toHaveLength(2);
    expect(split.totalCents).toBe(400);
    const pricey = [st('a', { driveFeeCents: 300 }), st('b', { driveFeeCents: 300 })];
    // Ici le 2e retrait (300) dépasse l'économie (200) : un seul magasin.
    const plan = optimizeBasket(comps, pricey, 'cheapest', { now: NOW });
    expect(plan.parts).toHaveLength(1);
    expect(plan.totalCents).toBe(700);
  });

  it('économie jamais négative, y compris si le « moins cher » couvre plus d’articles', () => {
    const stores = [st('a'), st('b')];
    const comps = [cmp('x', [offer('a', 100), offer('b', 100)]), cmp('y', [offer('b', 900)])];
    for (const mode of ['cheapest', 'single_store'] as const) {
      expect(optimizeBasket(comps, stores, mode, { now: NOW }).savingsCents).toBeGreaterThanOrEqual(0);
    }
  });

  it('égalités parfaites → départage stable par id de magasin', () => {
    const stores = [st('b'), st('a'), st('c')];
    const comps = [cmp('x', [offer('c', 100), offer('b', 100), offer('a', 100)])];
    const plan = optimizeBasket(comps, stores, 'cheapest', { now: NOW });
    expect(plan.parts.map((p) => p.storeId)).toEqual(['a']);
  });
});
