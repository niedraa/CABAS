/**
 * Compte & données personnelles (RGPD : portabilité art. 20, effacement art. 17).
 *
 * - `exportMyData()` → JSON (chaîne) : production → Edge Function `account`
 *   (`{ action: 'export' }`) complétée des données locales ; démo → toutes les
 *   données locales Cabas (`cabas/*`).
 * - `shareExport()` : fichier `cabas-export-AAAA-MM-JJ.json` partagé via la
 *   feuille système (expo-file-system `File`/`Paths` + expo-sharing) ; sur le
 *   web, téléchargement direct (Blob).
 * - `deleteMyAccount()` : production → `account` (`{ action: 'delete' }`) ;
 *   puis effacement de TOUTES les données locales et déconnexion. Les stores en
 *   mémoire sont remis à zéro par `deleteAccount()` de `src/stores`.
 */
import { Platform } from 'react-native';

import { todayISO } from '@/core';
import { clearAllCabasData, readAllCabasData, STORAGE_PREFIX } from '@/lib/storage';

import { track } from './analytics';
import { getCurrentUserId, signOut } from './auth';
import { errorMessage, getSupabase } from './supabase';

/** Clés locales exclues de l'export (jetons, caches techniques). */
const EXCLUDED_KEYS = new Set([`${STORAGE_PREFIX}auth`, `${STORAGE_PREFIX}catalog-cache`]);

export interface ExportDocument {
  app: 'Cabas';
  format: 1;
  exportedAt: string;
  userId: string | null;
  mode: 'demo' | 'remote';
  /** Données serveur (production). */
  server?: unknown;
  /** Données de l'appareil, par store (`cabas/profile`, `cabas/plan`…). */
  device: Record<string, unknown>;
}

async function localData(): Promise<Record<string, unknown>> {
  const all = await readAllCabasData();
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(all)) {
    if (EXCLUDED_KEYS.has(k) || k.startsWith(`${STORAGE_PREFIX}auth`)) continue;
    // `persist` stocke { state, version } : on exporte l'état.
    out[k] = v && typeof v === 'object' && 'state' in (v as object) ? (v as { state: unknown }).state : v;
  }
  return out;
}

export async function exportMyData(): Promise<string> {
  const supabase = getSupabase();
  const doc: ExportDocument = {
    app: 'Cabas',
    format: 1,
    exportedAt: new Date().toISOString(),
    userId: getCurrentUserId(),
    mode: supabase ? 'remote' : 'demo',
    device: await localData(),
  };
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('account', { body: { action: 'export' }, timeout: 15000 });
    if (error) throw new Error(`Export impossible pour le moment (${errorMessage(error)}).`);
    doc.server = data;
  }
  track('data_exported', { mode: doc.mode });
  return JSON.stringify(doc, null, 2);
}

export function exportFileName(date = todayISO()): string {
  return `cabas-export-${date}.json`;
}

/** Exporte et partage (ou télécharge sur le web). Renvoie le nom du fichier. */
export async function shareExport(): Promise<string> {
  const json = await exportMyData();
  const name = exportFileName();
  if (Platform.OS === 'web') {
    const g = globalThis as unknown as { document?: Document; URL?: typeof URL; Blob?: typeof Blob };
    if (!g.document || !g.Blob || !g.URL) throw new Error('Téléchargement indisponible.');
    const blob = new g.Blob([json], { type: 'application/json' });
    const url = g.URL.createObjectURL(blob);
    const a = g.document.createElement('a');
    a.href = url;
    a.download = name;
    g.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => g.URL?.revokeObjectURL(url), 1000);
    return name;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- module natif chargé à la demande (absent sur le web / en démo)
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Le partage n’est pas disponible sur cet appareil.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Mes données Cabas' });
  return name;
}

/**
 * Supprime le compte (serveur puis appareil). En production, une erreur
 * serveur interrompt AVANT tout effacement local (rien n'est perdu à moitié).
 */
export async function deleteMyAccount(): Promise<void> {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.functions.invoke('account', { body: { action: 'delete' }, timeout: 15000 });
    if (error) throw new Error(`Suppression impossible pour le moment (${errorMessage(error)}). Réessaie avec une connexion.`);
  }
  track('account_deleted', {});
  await signOut();
  await clearAllCabasData();
}
