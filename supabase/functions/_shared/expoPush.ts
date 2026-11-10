/**
 * Client Expo Push (https://exp.host/--/api/v2/push/send).
 *
 * - Lots de 100 messages maximum (limite Expo).
 * - Les tickets sont renvoyés DANS L'ORDRE des messages envoyés.
 * - `DeviceNotRegistered` : le jeton n'est plus valide (app désinstallée) →
 *   l'appelant doit le supprimer.
 * - EXPO_ACCESS_TOKEN (facultatif) : requis si la « sécurité push renforcée »
 *   est activée sur le projet Expo.
 *
 * Les reçus (2ᵉ étape, /push/getReceipts) ne sont pas encore traités : voir
 * docs/BACKEND.md › Limites connues.
 */

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_BATCH_SIZE = 100;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

export class ExpoHttpError extends Error {
  constructor(readonly status: number) {
    super(`Expo Push HTTP ${status}`);
    this.name = 'ExpoHttpError';
  }
}

export interface ExpoClientOptions {
  fetch: typeof fetch;
  accessToken?: string;
  url?: string;
}

/** Envoie un lot (≤ 100). Lève ExpoHttpError si la requête entière échoue. */
export async function sendExpoBatch(messages: ExpoMessage[], opts: ExpoClientOptions): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  if (messages.length > EXPO_BATCH_SIZE) throw new Error(`Lot Expo trop grand (${messages.length} > ${EXPO_BATCH_SIZE})`);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
  const res = await opts.fetch(opts.url ?? EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new ExpoHttpError(res.status);
  }
  const body = await res.json().catch(() => null);
  const data = body && typeof body === 'object' ? (body as { data?: unknown }).data : null;
  if (!Array.isArray(data) || data.length !== messages.length) {
    // Réponse inattendue : chaque message est considéré en erreur (réessai ultérieur).
    return messages.map(() => ({ status: 'error', message: 'Réponse Expo inattendue', details: { error: 'InvalidResponse' } }));
  }
  return data.map((t) =>
    t && typeof t === 'object' && (t as { status?: unknown }).status === 'ok'
      ? { status: 'ok', id: String((t as { id?: unknown }).id ?? '') }
      : {
        status: 'error',
        message: String((t as { message?: unknown })?.message ?? 'Erreur Expo'),
        details: { error: String((t as { details?: { error?: unknown } })?.details?.error ?? '') || undefined },
      }
  );
}

/** Découpe en lots de 100. */
export function chunk<T>(xs: readonly T[], size = EXPO_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
