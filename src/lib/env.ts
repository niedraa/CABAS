/**
 * Variables d'environnement publiques de Cabas, typées.
 *
 * Expo remplace `process.env.EXPO_PUBLIC_X` au BUNDLING, uniquement quand la
 * variable est lue de façon statique (`process.env.EXPO_PUBLIC_X`, jamais
 * `process.env[nom]`) : chaque variable est donc lue explicitement ci-dessous.
 *
 * - `isDemoMode` : pas de Supabase configuré → catalogue embarqué, moteur de
 *   repas local, abonnement simulé. L'app reste 100 % utilisable.
 * - `devToolsEnabled` : routes `/dev/*` (seed de démo…) accessibles.
 */

/** Variables brutes, telles que fournies par Expo (ou par un test). */
export interface RawEnv {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_IOS_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?: string;
  EXPO_PUBLIC_POSTHOG_KEY?: string;
  EXPO_PUBLIC_POSTHOG_HOST?: string;
  EXPO_PUBLIC_SENTRY_DSN?: string;
  EXPO_PUBLIC_DEV_TOOLS?: string;
}

/** Configuration normalisée : `null` quand la variable est absente ou invalide. */
export interface AppEnv {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  revenueCatIosKey: string | null;
  revenueCatAndroidKey: string | null;
  posthogKey: string | null;
  /** Instance PostHog (UE par défaut, données hébergées en Europe). */
  posthogHost: string;
  sentryDsn: string | null;
  /** `EXPO_PUBLIC_DEV_TOOLS` vaut 1 / true / yes / on. */
  devTools: boolean;
}

export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Chaîne non vide après nettoyage, sinon null. */
function clean(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

/** URL http(s) valide sans « / » final, sinon null. */
function cleanUrl(value: string | undefined): string | null {
  const v = clean(value);
  if (!v || !/^https?:\/\/[^\s/]+/i.test(v)) return null;
  return v.replace(/\/+$/, '');
}

/** Interprète un booléen d'environnement (« 1 », « true », « yes », « on »). */
export function parseBooleanFlag(value: string | undefined): boolean {
  const v = clean(value);
  return v !== null && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

/** Normalise les variables brutes (fonction pure, testée). */
export function parseEnv(raw: RawEnv): AppEnv {
  const supabaseUrl = cleanUrl(raw.EXPO_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = clean(raw.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  return {
    // Supabase n'est utilisable qu'avec l'URL ET la clé : sinon mode démo.
    supabaseUrl: supabaseUrl && supabaseAnonKey ? supabaseUrl : null,
    supabaseAnonKey: supabaseUrl && supabaseAnonKey ? supabaseAnonKey : null,
    revenueCatIosKey: clean(raw.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
    revenueCatAndroidKey: clean(raw.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
    posthogKey: clean(raw.EXPO_PUBLIC_POSTHOG_KEY),
    posthogHost: cleanUrl(raw.EXPO_PUBLIC_POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST,
    sentryDsn: cleanUrl(raw.EXPO_PUBLIC_SENTRY_DSN),
    devTools: parseBooleanFlag(raw.EXPO_PUBLIC_DEV_TOOLS),
  };
}

/** Configuration de l'app (lecture statique : indispensable pour l'inlining d'Expo). */
export const env: AppEnv = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_DEV_TOOLS: process.env.EXPO_PUBLIC_DEV_TOOLS,
});

/** Mode démo / hors-ligne : aucun backend Supabase configuré. */
export const isDemoMode: boolean = env.supabaseUrl === null;

/** Outils de développement (routes `/dev/*`) : drapeau explicite ou build de dev. */
export const devToolsEnabled: boolean =
  env.devTools || (typeof __DEV__ !== 'undefined' && __DEV__ === true && process.env.NODE_ENV !== 'test');
