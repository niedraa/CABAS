/**
 * Analytique produit (PostHog, instance UE) — sans effet sans clé ni consentement.
 *
 * RGPD : la collecte est OPT-IN (`setAnalyticsConsent(true)` depuis le réglage
 * de l'utilisateur). Aucune donnée de santé n'est JAMAIS envoyée : les
 * propriétés dont le nom évoque allergies / régimes / santé sont supprimées
 * (`scrubAnalyticsProps`), ainsi que les valeurs non scalaires.
 *
 * API : `initAnalytics({ consent })`, `setAnalyticsConsent(bool)`,
 * `track(event, props?)`, `screen(name)`, `identify(userId)`, `resetAnalytics()`.
 */
import type { PostHog } from 'posthog-react-native';

import { env } from '@/lib/env';

/** Entonnoir du parcours (profil → repas → liste → prix → commande) + monétisation. */
export type AnalyticsEvent =
  | 'app_opened'
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'plan_generated'
  | 'plan_generation_failed'
  | 'meal_swapped'
  | 'meal_locked'
  | 'meal_removed'
  | 'meal_added'
  | 'recipe_viewed'
  | 'cooking_mode_started'
  | 'list_generated'
  | 'item_checked'
  | 'manual_item_added'
  | 'basket_computed'
  | 'basket_mode_changed'
  | 'alternative_selected'
  | 'order_prepared'
  | 'order_opened'
  | 'order_list_copied'
  | 'order_confirmed'
  | 'paywall_viewed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_cancelled'
  | 'purchase_failed'
  | 'purchase_restored'
  | 'pantry_item_added'
  | 'budget_entry_added'
  | 'notification_permission'
  | 'data_exported'
  | 'account_deleted';

export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsValue | undefined>;

/** Clés interdites : données de santé / sensibles (RGPD art. 9). */
const FORBIDDEN_KEY = /(allerg|diet|regime|régime|health|sante|santé|halal|casher|kosher|vegan|vegetar|gluten|lactose|consent)/i;

/** Retire toute propriété sensible ou non scalaire. */
export function scrubAnalyticsProps(props: AnalyticsProps | undefined): Record<string, AnalyticsValue> {
  const out: Record<string, AnalyticsValue> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN_KEY.test(k)) continue;
    if (v === undefined) continue;
    if (v === null || typeof v === 'number' || typeof v === 'boolean') {
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = v;
    } else if (typeof v === 'string') {
      if (FORBIDDEN_KEY.test(v)) continue; // valeur du type « allergen:arachides »
      out[k] = v.slice(0, 200);
    }
  }
  return out;
}

let client: PostHog | null = null;
let consent = false;
let pendingIdentify: string | null = null;

function createClient(): PostHog | null {
  if (!env.posthogKey) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
    const mod = require('posthog-react-native') as typeof import('posthog-react-native');
    return new mod.PostHog(env.posthogKey, {
      host: env.posthogHost,
      captureAppLifecycleEvents: true,
      // Pas d'enregistrement de session ni d'autocapture : minimisation des données.
      enableSessionReplay: false,
    });
  } catch {
    return null;
  }
}

/** Initialise l'analytique si une clé existe ET que l'utilisateur a consenti. */
export function initAnalytics(opts: { consent: boolean }): void {
  setAnalyticsConsent(opts.consent);
}

/** Consentement (opt-in) : crée le client ou le coupe et l'oublie. */
export function setAnalyticsConsent(value: boolean): void {
  consent = value;
  if (value) {
    if (!client) client = createClient();
    if (client) {
      void client.optIn().catch(() => undefined);
      if (pendingIdentify) client.identify(pendingIdentify);
    }
  } else if (client) {
    const c = client;
    client = null;
    void c.optOut().catch(() => undefined);
    c.reset();
  }
}

export function isAnalyticsActive(): boolean {
  return consent && client !== null;
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!consent || !client) return;
  try {
    client.capture(event, scrubAnalyticsProps(props));
  } catch {
    // jamais bloquant
  }
}

export function screen(name: string, props?: AnalyticsProps): void {
  if (!consent || !client) return;
  try {
    void client.screen(name, scrubAnalyticsProps(props)).catch(() => undefined);
  } catch {
    // jamais bloquant
  }
}

/** Identifiant pseudonyme (uuid Supabase / local) — jamais d'e-mail ni de nom. */
export function identify(userId: string): void {
  pendingIdentify = userId;
  if (!consent || !client) return;
  try {
    client.identify(userId);
  } catch {
    // ignoré
  }
}

export function resetAnalytics(): void {
  pendingIdentify = null;
  try {
    client?.reset();
  } catch {
    // ignoré
  }
}

export const analytics = { init: initAnalytics, setConsent: setAnalyticsConsent, track, screen, identify, reset: resetAnalytics };
