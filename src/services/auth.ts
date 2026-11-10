/**
 * Authentification.
 *
 * Production : session anonyme Supabase (`signInAnonymously`) créée au
 * premier lancement, pour que la RLS (`auth.uid()`) protège les données de
 * l'utilisateur sans lui demander de compte. Mode démo : identifiant local
 * persistant (`cabas/auth-demo-user`).
 *
 * API :
 * - `ensureSession()` → `{ userId, mode, isAnonymous, offline }` (jamais d'exception :
 *   hors-ligne en production, on retombe sur l'identifiant local pour continuer).
 * - `getCurrentUserId()` → identifiant courant (null avant `ensureSession`).
 * - `signOut()` → déconnexion (et oubli de l'identifiant démo).
 */
import { createId } from '@/core';
import { readJSON, removeKey, storageKey, writeJSON } from '@/lib/storage';

import { errorMessage, getSupabase } from './supabase';

export interface SessionInfo {
  userId: string;
  mode: 'demo' | 'remote';
  isAnonymous: boolean;
  /** Production sans réseau : identifiant local provisoire. */
  offline: boolean;
  error?: string;
}

const DEMO_USER_KEY = storageKey('auth-demo-user');

let currentUserId: string | null = null;
let pending: Promise<SessionInfo> | null = null;

async function localUserId(): Promise<string> {
  const stored = await readJSON<string | null>(DEMO_USER_KEY, null);
  if (typeof stored === 'string' && stored.length > 0) return stored;
  const id = createId('local');
  await writeJSON(DEMO_USER_KEY, id);
  return id;
}

async function resolveSession(): Promise<SessionInfo> {
  const supabase = getSupabase();
  if (!supabase) {
    const userId = await localUserId();
    currentUserId = userId;
    return { userId, mode: 'demo', isAnonymous: true, offline: false };
  }
  try {
    const { data } = await supabase.auth.getSession();
    let user = data.session?.user ?? null;
    if (!user) {
      const res = await supabase.auth.signInAnonymously();
      if (res.error) throw res.error;
      user = res.data.user;
    }
    if (!user) throw new Error('Session indisponible');
    currentUserId = user.id;
    return { userId: user.id, mode: 'remote', isAnonymous: user.is_anonymous ?? true, offline: false };
  } catch (err) {
    // Hors-ligne au premier lancement : on continue en local, la session sera
    // créée au prochain lancement connecté.
    const userId = await localUserId();
    currentUserId = userId;
    return { userId, mode: 'remote', isAnonymous: true, offline: true, error: errorMessage(err) };
  }
}

let resolved: SessionInfo | null = null;

/**
 * Garantit une session (idempotent ; appels concurrents mutualisés). Une
 * session « hors-ligne » n'est pas mémorisée : l'appel suivant la retente.
 */
export function ensureSession(): Promise<SessionInfo> {
  if (resolved && !resolved.offline) return Promise.resolve(resolved);
  if (!pending) {
    pending = resolveSession()
      .then((s) => {
        resolved = s;
        return s;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Identifiant de l'utilisateur courant (null tant qu'aucune session n'est résolue). */
export function getCurrentUserId(): string | null {
  return currentUserId;
}

/** Vrai si une vraie session Supabase est active (synchronisation possible). */
export async function hasRemoteSession(): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  try {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  } catch {
    return false;
  }
}

/** Déconnexion : session Supabase fermée, identifiant démo oublié. */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // déjà déconnecté / hors-ligne
    }
  }
  await removeKey(DEMO_USER_KEY);
  currentUserId = null;
  resolved = null;
  pending = null;
}
