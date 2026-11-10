/**
 * Tests des modules partagés des Edge Functions.
 */
import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from '@std/assert';
import {
  ANTHROPIC_API_URL,
  buildMessagesBody,
  createAnthropicClient,
  LlmError,
  TimeoutError,
  withTimeout,
} from './anthropic.ts';
import { bearerToken, requireUser, timingSafeEqual, verifySharedSecret } from './auth.ts';
import { TtlCache } from './catalog.ts';
import { ConfigError, intEnv, mapEnv, optionalEnv, requireEnv } from './env.ts';
import { chunk, EXPO_PUSH_URL, ExpoHttpError, sendExpoBatch } from './expoPush.ts';
import { HttpError, readJson, withHandler } from './http.ts';
import { memoryLogger, redact } from './logger.ts';
import {
  effectiveEntitlement,
  priceToRow,
  rowToIngredient,
  rowToMealPlan,
  rowToPrice,
  rowToProduct,
  rowToProfile,
  rowToRecipe,
  rowToSubscription,
} from './mappers.ts';
import { DbError, fetchAll, unwrap } from './supabaseClient.ts';
import { parseShoppingListItems } from './validation.ts';

// ─── Anthropic ───────────────────────────────────────────────────────────────

function captureFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(response);
  }) as typeof fetch;
  return { f, calls };
}

const okBody = (text: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', ...extra }), {
    status: 200,
  });

Deno.test('anthropic : en-têtes, URL et corps de la requête Messages API', async () => {
  const { f, calls } = captureFetch(okBody('{"meals":[]}'));
  const client = createAnthropicClient({ apiKey: 'sk-ant-test', fetch: f });
  assertEquals(client.model, 'claude-haiku-5-5');
  const text = await client.complete({ system: 'sys', user: 'usr' }, { signal: new AbortController().signal });
  assertEquals(text, '{"meals":[]}');
  assertEquals(calls[0].url, ANTHROPIC_API_URL);
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get('x-api-key'), 'sk-ant-test');
  assertEquals(headers.get('anthropic-version'), '2023-06-01');
  assertEquals(headers.get('content-type'), 'application/json');
  const body = JSON.parse(String(calls[0].init.body));
  assertEquals(body.model, 'claude-haiku-5-5');
  assertEquals(body.max_tokens, 1500);
  assertEquals(body.system, 'sys');
  assertEquals(body.messages, [{ role: 'user', content: 'usr' }]);
  assertEquals(body.output_config, { effort: 'low' });
  assertEquals(body.thinking, { type: 'disabled' });
});

Deno.test("anthropic : hors Haiku, la réflexion n'est pas désactivée (refusé par Opus 5.5)", () => {
  const body = buildMessagesBody('claude-opus-5-5', 1500, { system: 's', user: 'u' });
  assertFalse('thinking' in body);
  assertEquals(body.model, 'claude-opus-5-5');
});

Deno.test('anthropic : erreurs HTTP, refus, réponse vide', async () => {
  const signal = new AbortController().signal;
  const http = createAnthropicClient({
    apiKey: 'k',
    fetch: captureFetch(
      new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), {
        status: 529,
      }),
    ).f,
  });
  const e1 = await assertRejects(() => http.complete({ system: '', user: '' }, { signal }), LlmError);
  assertEquals(e1.kind, 'http');
  assertEquals(e1.status, 529);
  assert(e1.message.includes('overloaded_error'));

  const refusal = createAnthropicClient({
    apiKey: 'k',
    fetch: captureFetch(okBody('', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' } })).f,
  });
  assertEquals(
    (await assertRejects(() => refusal.complete({ system: '', user: '' }, { signal }), LlmError)).kind,
    'refusal',
  );

  const empty = createAnthropicClient({
    apiKey: 'k',
    fetch: captureFetch(new Response(JSON.stringify({ content: [] }))).f,
  });
  assertEquals(
    (await assertRejects(() => empty.complete({ system: '', user: '' }, { signal }), LlmError)).kind,
    'empty',
  );
});

Deno.test("withTimeout : rejette à l'échéance même si la tâche ignore le signal", async () => {
  const started = Date.now();
  await assertRejects(() => withTimeout(30, () => new Promise<never>(() => {})), TimeoutError);
  assert(Date.now() - started < 500);
  assertEquals(await withTimeout(1000, () => Promise.resolve(42)), 42);
  await assertRejects(() => withTimeout(1000, () => Promise.reject(new Error('boom'))), Error, 'boom');
});

// ─── Auth ────────────────────────────────────────────────────────────────────

Deno.test('timingSafeEqual', () => {
  assert(timingSafeEqual('abc', 'abc'));
  assertFalse(timingSafeEqual('abc', 'abd'));
  assertFalse(timingSafeEqual('abc', 'abcd'));
  assertFalse(timingSafeEqual('', 'a'));
  assert(timingSafeEqual('é😀', 'é😀'));
});

Deno.test('verifySharedSecret / bearerToken', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h });
  verifySharedSecret(req({ 'x-cron-secret': 's3cret' }), 'x-cron-secret', 's3cret');
  assertThrows(
    () => verifySharedSecret(req({ 'x-cron-secret': 'nope' }), 'x-cron-secret', 's3cret'),
    HttpError,
    'Accès refusé',
  );
  assertThrows(() => verifySharedSecret(req({}), 'x-cron-secret', 's3cret'), HttpError);
  // Secret attendu vide → jamais d'accès ouvert.
  const e = assertThrows(() => verifySharedSecret(req({ 'x-cron-secret': '' }), 'x-cron-secret', ''), HttpError);
  assertEquals(e.status, 500);
  verifySharedSecret(req({ authorization: 'Bearer abc' }), 'authorization', 'abc');
  verifySharedSecret(req({ authorization: 'abc' }), 'authorization', 'abc');
  assertEquals(bearerToken(req({ authorization: 'bearer  tok ' })), 'tok');
  assertEquals(bearerToken(req({ authorization: 'Basic x' })), null);
});

Deno.test('requireUser : jeton absent / invalide → 401, valide → utilisateur', async () => {
  const auth = {
    getUser: (jwt?: string) =>
      Promise.resolve(
        jwt === 'good'
          ? { data: { user: { id: 'u1', email: 'a@b.c' } }, error: null }
          : { data: { user: null }, error: new Error('invalid JWT') },
      ),
  };
  const mk = (h?: string) => new Request('http://x', { headers: h ? { authorization: h } : {} });
  assertEquals(await requireUser(mk('Bearer good'), auth), { id: 'u1', email: 'a@b.c' });
  assertEquals((await assertRejects(() => requireUser(mk('Bearer bad'), auth), HttpError)).status, 401);
  assertEquals((await assertRejects(() => requireUser(mk(), auth), HttpError)).status, 401);
});

// ─── HTTP ────────────────────────────────────────────────────────────────────

Deno.test('readJson : vide → {}, invalide → 400, trop gros → 413', async () => {
  assertEquals(await readJson(new Request('http://x', { method: 'POST', body: '' })), {});
  assertEquals(await readJson(new Request('http://x', { method: 'POST', body: '{"a":1}' })), { a: 1 });
  assertEquals(
    (await assertRejects(() => readJson(new Request('http://x', { method: 'POST', body: '{' })), HttpError)).status,
    400,
  );
  const big = 'x'.repeat(2000);
  assertEquals(
    (await assertRejects(
      () => readJson(new Request('http://x', { method: 'POST', body: JSON.stringify(big) }), 1000),
      HttpError,
    )).status,
    413,
  );
});

Deno.test('withHandler : erreurs typées, erreurs de config, erreurs inconnues (sans fuite)', async () => {
  const log = memoryLogger();
  const h = (err: unknown) => withHandler(log, () => Promise.reject(err));
  const r1 = await h(new HttpError(418, 'teapot', 'Je suis une théière'))(new Request('http://x', { method: 'POST' }));
  assertEquals(r1.status, 418);
  assertEquals((await r1.json()).error, { code: 'teapot', message: 'Je suis une théière' });
  const r2 = await h(new ConfigError('SUPABASE_URL manquante'))(new Request('http://x', { method: 'POST' }));
  assertEquals(r2.status, 500);
  assertEquals((await r2.json()).error.code, 'server_misconfigured');
  const r3 = await h(new Error('secret interne'))(new Request('http://x', { method: 'POST' }));
  const body = await r3.json();
  assertEquals(r3.status, 500);
  assertFalse(JSON.stringify(body).includes('secret interne'));
  assertEquals(r3.headers.get('access-control-allow-origin'), '*');
  assert(log.lines.some((l) => l.level === 'error'));
});

// ─── Logger ──────────────────────────────────────────────────────────────────

Deno.test('logger : masque secrets, jetons, JWT et données de santé', () => {
  const out = redact({
    authorization: 'Bearer x',
    apiKey: 'sk-ant-abc',
    allergens: ['arachides'],
    diets: ['halal'],
    email: 'a@b.c',
    note:
      'token ExponentPushToken[abcdef] et jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    nested: { cronSecret: 'zzz', count: 3 },
  }) as Record<string, unknown>;
  for (const k of ['authorization', 'apiKey', 'allergens', 'diets', 'email']) assertEquals(out[k], '[masqué]', k);
  assertEquals(out.note, 'token [masqué] et jwt [masqué]');
  assertEquals(out.nested, { cronSecret: '[masqué]', count: 3 });
});

// ─── Env ─────────────────────────────────────────────────────────────────────

Deno.test('env : requireEnv / optionalEnv / intEnv', () => {
  const env = mapEnv({ A: ' a ', EMPTY: '  ', N: '12', BAD: 'x' });
  assertEquals(requireEnv(env, 'A'), 'a');
  assertThrows(() => requireEnv(env, 'EMPTY'), ConfigError);
  assertThrows(() => requireEnv(env, 'MISSING'), ConfigError);
  assertEquals(optionalEnv(env, 'MISSING', 'def'), 'def');
  assertEquals(optionalEnv(env, 'MISSING'), undefined);
  assertEquals(intEnv(env, 'N', 5), 12);
  assertEquals(intEnv(env, 'N', 5, 0, 10), 10);
  assertEquals(intEnv(env, 'BAD', 5), 5);
});

// ─── Mappers ─────────────────────────────────────────────────────────────────

Deno.test('mappers : ingrédient (numeric en chaîne, champs optionnels)', () => {
  const ing = rowToIngredient({
    id: 'oignon',
    name: 'Oignon',
    name_plural: 'Oignons',
    aisle: 'fruits_legumes',
    allergens: [],
    is_meat: false,
    is_pork: false,
    is_fish: false,
    is_seafood: false,
    is_animal_product: false,
    is_alcohol: false,
    grams_per_piece: '110.000',
    density: null,
    base_unit: 'g',
    is_pantry_staple: false,
    season_months: [9, 10, 13],
  });
  assertEquals(ing.gramsPerPiece, 110);
  assertFalse('density' in ing);
  assertFalse('isAlcohol' in ing);
  assertEquals(ing.seasonMonths, [9, 10]);
});

Deno.test('mappers : recette triée par position, étapes jsonb', () => {
  const r = rowToRecipe({
    id: 'rec',
    title: 'T',
    description: 'D',
    emoji: '🍛',
    color: '#FFFFFF',
    image_url: null,
    cuisine: 'indienne',
    tags: ['batch'],
    meal_types: ['diner'],
    servings: 4,
    prep_time_min: 10,
    cook_time_min: 20,
    difficulty: 1,
    equipment: ['plaques'],
    steps: [{ text: 'a', timerMin: 5 }, { text: 'b' }],
    kcal_per_serving: 500,
    cost_level: 1,
    recipe_ingredients: [
      { position: 1, ingredient_id: 'riz', quantity: '200.000', unit: 'g', optional: false, note: null },
      { position: 0, ingredient_id: 'oignon', quantity: 1, unit: 'piece', optional: true, note: 'émincé' },
    ],
  });
  assertEquals(r.ingredients.map((i) => i.ingredientId), ['oignon', 'riz']);
  assertEquals(r.ingredients[0], {
    ingredientId: 'oignon',
    quantity: 1,
    unit: 'piece',
    optional: true,
    note: 'émincé',
  });
  assertEquals(r.ingredients[1].quantity, 200);
  assertEquals(r.steps, [{ text: 'a', timerMin: 5 }, { text: 'b' }]);
  assertFalse('imageUrl' in r);
});

Deno.test('mappers : produit / prix (RPC get_prices_for_ingredients) et aller-retour', () => {
  const row = {
    product_id: 'prd',
    ean: '3000000000001',
    product_name: 'Riz',
    brand: 'X',
    is_store_brand: true,
    store_chain: 'lidl',
    ingredient_id: 'riz',
    pack_size: '1000.000',
    pack_unit: 'g',
    nutri_score: 'A',
    allergens: [],
    organic: false,
    store_id: 'lidl',
    price_cents: 129,
    promo_price_cents: 99,
    promo_label: '-20 %',
    promo_until: '2026-11-17',
    source: 'demo',
    price_updated_at: '2026-11-09 06:00:00+00',
  };
  const p = rowToProduct(row);
  assertEquals(p.packSize, 1000);
  assertEquals(p.storeChain, 'lidl');
  assertEquals(p.name, 'Riz');
  const price = rowToPrice(row);
  assertEquals(price.updatedAt, '2026-11-09T06:00:00.000Z');
  assertEquals(price.promoPriceCents, 99);
  assertEquals(rowToPrice(priceToRow(price)), price);
});

Deno.test('mappers : profil (créneaux invalides filtrés) et planning', () => {
  const p = rowToProfile({
    id: 'u',
    display_name: 'A',
    adults: 2,
    children: 1,
    diets: ['halal'],
    allergens: ['lait'],
    disliked_ingredient_ids: [],
    favorite_cuisines: [],
    weekly_budget_cents: 9000,
    max_cook_time_weekday_min: 30,
    max_cook_time_weekend_min: 60,
    equipment: ['four'],
    preferred_store_ids: ['lidl'],
    meal_slots: [{ weekday: 0, type: 'diner' }, { weekday: 9, type: 'diner' }, { weekday: 1, type: 'gouter' }, null],
    health_data_consent_at: '2026-11-01T10:00:00+00:00',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
  });
  assertEquals(p.household, { adults: 2, children: 1 });
  assertEquals(p.mealSlots, [{ weekday: 0, type: 'diner' }]);
  assertEquals(p.healthDataConsentAt, '2026-11-01T10:00:00.000Z');
  const plan = rowToMealPlan({
    id: 'plan',
    week_start: '2026-11-16',
    generated_at: '2026-11-10T08:00:00Z',
    source: 'ai',
    planned_meals: [
      { id: 'm2', date: '2026-11-16', meal_type: 'diner', recipe_id: 'r2', servings: 2, locked: false, reason: null },
      {
        id: 'm1',
        date: '2026-11-16',
        meal_type: 'dejeuner',
        recipe_id: 'r1',
        servings: 2,
        locked: true,
        reason: 'Rapide',
      },
    ],
  });
  assertEquals(plan.meals.map((m) => m.id), ['m1', 'm2']);
  assertEquals(plan.meals[0], {
    id: 'm1',
    date: '2026-11-16',
    type: 'dejeuner',
    recipeId: 'r1',
    servings: 2,
    locked: true,
    reason: 'Rapide',
  });
});

Deno.test('mappers : droit effectif (premium expiré → free)', () => {
  const now = new Date('2026-11-10T00:00:00Z');
  assertEquals(effectiveEntitlement(rowToSubscription(null), now), 'free');
  assertEquals(effectiveEntitlement(rowToSubscription({ entitlement: 'premium', expires_at: null }), now), 'premium');
  assertEquals(
    effectiveEntitlement(rowToSubscription({ entitlement: 'premium', expires_at: '2026-12-01T00:00:00Z' }), now),
    'premium',
  );
  assertEquals(
    effectiveEntitlement(rowToSubscription({ entitlement: 'premium', expires_at: '2026-11-09T00:00:00Z' }), now),
    'free',
  );
});

// ─── Divers ──────────────────────────────────────────────────────────────────

Deno.test('TtlCache : un seul chargement concurrent, expiration', async () => {
  let t = 0;
  let loads = 0;
  const cache = new TtlCache<number>(100, () => t);
  const load = () => {
    loads++;
    return new Promise<number>((r) => setTimeout(() => r(loads), 5));
  };
  const [a, b] = await Promise.all([cache.get(load), cache.get(load)]);
  assertEquals([a, b, loads], [1, 1, 1]);
  t = 50;
  assertEquals(await cache.get(load), 1);
  t = 200;
  assertEquals(await cache.get(load), 2);
});

Deno.test('fetchAll / unwrap : pagination et erreurs PostgREST', async () => {
  const data = Array.from({ length: 2500 }, (_, i) => i);
  const ranges: [number, number][] = [];
  const all = await fetchAll<number>('t', (from, to) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: data.slice(from, to + 1), error: null });
  });
  assertEquals(all.length, 2500);
  assertEquals(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assertThrows(() => unwrap('op', { data: null, error: { message: 'boom', code: '42501' } }), DbError, 'op : boom');
});

Deno.test('expoPush : lots, en-têtes, réponse inattendue, HTTP en erreur', async () => {
  assertEquals(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const { f, calls } = captureFetch(new Response(JSON.stringify({ data: [{ status: 'ok', id: 'x' }] })));
  const tickets = await sendExpoBatch([{ to: 'ExponentPushToken[a]', title: 't', body: 'b' }], {
    fetch: f,
    accessToken: 'tok',
  });
  assertEquals(tickets, [{ status: 'ok', id: 'x' }]);
  assertEquals(calls[0].url, EXPO_PUSH_URL);
  assertEquals(new Headers(calls[0].init.headers).get('authorization'), 'Bearer tok');
  const weird = await sendExpoBatch([{ to: 'a', title: 't', body: 'b' }], {
    fetch: captureFetch(new Response('{}')).f,
  });
  assertEquals(weird[0].status, 'error');
  await assertRejects(
    () =>
      sendExpoBatch([{ to: 'a', title: 't', body: 'b' }], { fetch: captureFetch(new Response('', { status: 500 })).f }),
    ExpoHttpError,
  );
  await assertRejects(() =>
    sendExpoBatch(Array.from({ length: 101 }, () => ({ to: 'a', title: 't', body: 'b' })), { fetch: f })
  );
});

Deno.test('validation : articles de liste normalisés', () => {
  const items = parseShoppingListItems([
    {
      id: 'a',
      quantity: 1,
      unit: 'g',
      ingredientId: 'riz',
      label: '  Riz  ',
      aisle: 'epicerie_salee',
      checked: true,
      source: 'plan',
      recipeIds: ['r', 3],
    },
    { id: 'b', quantity: 2, unit: 'piece', aisle: 'inconnu-ignoré-?' },
  ].slice(0, 1));
  assertEquals(items[0], {
    id: 'a',
    label: 'Riz',
    quantity: 1,
    unit: 'g',
    aisle: 'epicerie_salee',
    checked: true,
    source: 'plan',
    recipeIds: ['r'],
    ingredientId: 'riz',
  });
  assertThrows(() => parseShoppingListItems([{ id: 'b', quantity: 2, unit: 'piece', aisle: 'nope' }]), HttpError);
  assertEquals(parseShoppingListItems([{ id: 'c', quantity: 0, unit: 'ml' }])[0].aisle, 'autre');
});
