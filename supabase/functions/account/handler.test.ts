import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { HttpError } from '../_shared/http.ts';
import { silentLogger } from '../_shared/logger.ts';
import { type AccountRepository, createAccountHandler } from './handler.ts';

const NOW = new Date('2026-11-10T09:00:00.000Z');

function fakeRepo(opts: { authFails?: boolean } = {}) {
  const calls: string[] = [];
  const repo: AccountRepository = {
    exportData() {
      calls.push('export');
      return Promise.resolve({ profile: { id: 'u1', allergens: ['arachides'] }, mealPlans: [] });
    },
    deleteAppData() {
      calls.push('deleteAppData');
      return Promise.resolve({ userId: 'u1', deleted: { profiles: 1 } });
    },
    deleteAuthUser(userId) {
      calls.push(`deleteAuthUser:${userId}`);
      return opts.authFails ? Promise.reject(new Error('admin api down')) : Promise.resolve();
    },
  };
  return { repo, calls };
}

function handler(repo: AccountRepository) {
  return createAccountHandler({
    logger: silentLogger,
    now: () => NOW,
    authenticate: () => Promise.resolve({ userId: 'u1', email: 'alice@example.com', repo }),
  });
}

const post = (body: unknown) => new Request('http://localhost/account', { method: 'POST', body: JSON.stringify(body) });

Deno.test('export : JSON complet en pièce jointe, non mis en cache', async () => {
  const { repo, calls } = fakeRepo();
  const res = await handler(repo)(post({ action: 'export' }));
  assertEquals(res.status, 200);
  assertStringIncludes(res.headers.get('content-disposition') ?? '', 'cabas-export-2026-11-10.json');
  assertEquals(res.headers.get('cache-control'), 'no-store');
  const data = await res.json();
  assertEquals(data.format, 'cabas-export');
  assertEquals(data.account, { id: 'u1', email: 'alice@example.com' });
  assertEquals(data.profile.allergens, ['arachides']);
  assertEquals(calls, ['export']);
});

Deno.test('delete : données applicatives PUIS compte auth', async () => {
  const { repo, calls } = fakeRepo();
  const res = await handler(repo)(post({ action: 'delete' }));
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.status, 'deleted');
  assertEquals(data.deleted.deleted.profiles, 1);
  assertEquals(calls, ['deleteAppData', 'deleteAuthUser:u1']);
});

Deno.test('delete : échec de la suppression auth → 502 explicite (rejouable)', async () => {
  const { repo, calls } = fakeRepo({ authFails: true });
  const res = await handler(repo)(post({ action: 'delete' }));
  assertEquals(res.status, 502);
  const data = await res.json();
  assertEquals(data.error.code, 'auth_deletion_failed');
  assertEquals(calls, ['deleteAppData', 'deleteAuthUser:u1']);
});

Deno.test('action invalide ou absente → 400 ; GET → 405 ; non connecté → 401', async () => {
  const { repo, calls } = fakeRepo();
  for (const body of [{}, { action: 'purge' }, { action: 42 }]) {
    const res = await handler(repo)(post(body));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  }
  const get = await handler(repo)(new Request('http://localhost/account'));
  assertEquals(get.status, 405);
  await get.body?.cancel();
  const anon = createAccountHandler({
    logger: silentLogger,
    authenticate: () => Promise.reject(new HttpError(401, 'unauthorized', 'Connexion requise.')),
  });
  const res = await anon(post({ action: 'delete' }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
  assert(calls.length === 0, 'aucune opération sans authentification valide');
});
