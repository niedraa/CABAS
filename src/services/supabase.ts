/**
 * Client Supabase (créé à la demande, une seule fois).
 *
 * `getSupabase()` renvoie `null` en mode démo (aucune variable Supabase) :
 * chaque service a alors une implémentation locale.
 *
 * Session persistée dans AsyncStorage, rafraîchie automatiquement ; pas de
 * détection de session dans l'URL (pas de lien magique dans l'app).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env } from '@/lib/env';

let client: SupabaseClient | null = null;
let polyfilled = false;

/** `URL` / `URLSearchParams` complets (requis par supabase-js sous Hermes). */
function ensureUrlPolyfill(): void {
  if (polyfilled || Platform.OS === 'web') return;
  polyfilled = true;
  require('react-native-url-polyfill/auto');
}

/** Client Supabase, ou `null` en mode démo. */
export function getSupabase(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (client) return client;
  ensureUrlPolyfill();
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      storageKey: 'cabas/auth',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { headers: { 'x-client-info': `cabas-app/${Platform.OS}` } },
  });
  return client;
}

/** Vrai si un backend Supabase est configuré. */
export function hasSupabase(): boolean {
  return env.supabaseUrl !== null && env.supabaseAnonKey !== null;
}

/** Erreur réseau / délai : utile pour décider d'un repli local. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

/** Remplace le client (tests uniquement). */
export function __setSupabaseForTests(c: SupabaseClient | null): void {
  client = c;
}
