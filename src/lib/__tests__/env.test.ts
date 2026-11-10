import { DEFAULT_POSTHOG_HOST, isDemoMode, parseBooleanFlag, parseEnv } from '../env';
import { STORE_VERSIONS, storageKey } from '../storage';

describe('parseEnv', () => {
  it('passe en mode démo sans Supabase complet', () => {
    expect(parseEnv({}).supabaseUrl).toBeNull();
    // URL sans clé (ou l'inverse) : inutilisable → mode démo.
    const half = parseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' });
    expect(half.supabaseUrl).toBeNull();
    expect(half.supabaseAnonKey).toBeNull();
  });

  it('normalise les valeurs (espaces, / final, URL invalide)', () => {
    const env = parseEnv({
      EXPO_PUBLIC_SUPABASE_URL: '  https://abc.supabase.co/ ',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
      EXPO_PUBLIC_REVENUECAT_IOS_KEY: '',
      EXPO_PUBLIC_POSTHOG_HOST: 'pas-une-url',
      EXPO_PUBLIC_SENTRY_DSN: 'https://k@o1.ingest.sentry.io/1',
      EXPO_PUBLIC_DEV_TOOLS: 'TRUE',
    });
    expect(env.supabaseUrl).toBe('https://abc.supabase.co');
    expect(env.supabaseAnonKey).toBe('anon');
    expect(env.revenueCatIosKey).toBeNull();
    expect(env.posthogHost).toBe(DEFAULT_POSTHOG_HOST);
    expect(env.sentryDsn).toBe('https://k@o1.ingest.sentry.io/1');
    expect(env.devTools).toBe(true);
  });

  it('interprète les drapeaux booléens', () => {
    for (const v of ['1', 'true', 'yes', 'on', ' On ']) expect(parseBooleanFlag(v)).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'non']) expect(parseBooleanFlag(v)).toBe(false);
  });

  it('est en mode démo dans les tests (aucune variable)', () => {
    expect(isDemoMode).toBe(true);
  });
});

describe('storage', () => {
  it('préfixe les clés par cabas/ et versionne chaque store', () => {
    expect(storageKey('plan')).toBe('cabas/plan');
    expect(Object.values(STORE_VERSIONS).every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
  });
});
