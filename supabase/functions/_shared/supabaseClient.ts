/**
 * Clients Supabase pour les Edge Functions.
 *
 * - `createUserClient` : agit AU NOM de l'utilisateur (son JWT est transmis à
 *   PostgREST) → la RLS s'applique. À privilégier.
 * - `createServiceClient` : clé service_role (BYPASSRLS). Réservé aux tâches
 *   système (cron, webhook, suppression du compte auth). Ne jamais exposer.
 *
 * SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY sont injectées
 * automatiquement par la plateforme.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type EnvReader, requireEnv } from './env.ts';
import { bearerToken } from './auth.ts';
import { HttpError } from './http.ts';

const CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function createUserClient(req: Request, env: EnvReader): SupabaseClient {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'unauthorized', 'Connexion requise.');
  return createClient(requireEnv(env, 'SUPABASE_URL'), requireEnv(env, 'SUPABASE_ANON_KEY'), {
    ...CLIENT_OPTIONS,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function createServiceClient(env: EnvReader): SupabaseClient {
  return createClient(requireEnv(env, 'SUPABASE_URL'), requireEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'), CLIENT_OPTIONS);
}

/** Résultat PostgREST minimal. */
interface PgResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/** Erreur base de données (journalisée, jamais renvoyée telle quelle au client). */
export class DbError extends Error {
  constructor(
    readonly operation: string,
    message: string,
    readonly code?: string,
  ) {
    super(`${operation} : ${message}`);
    this.name = 'DbError';
  }
}

/** Déballe un résultat PostgREST ou lève DbError. */
export function unwrap<T>(operation: string, res: PgResult<T>): T {
  if (res.error) throw new DbError(operation, res.error.message, res.error.code);
  return res.data as T;
}

/**
 * Lit toutes les pages d'une requête (PostgREST plafonne à `max_rows`, 1000
 * par défaut). `page(from, to)` doit appliquer `.range(from, to)`.
 */
export async function fetchAll<T>(
  operation: string,
  page: (from: number, to: number) => PromiseLike<PgResult<T[]>>,
  pageSize = 1000,
  maxRows = 100_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const rows = unwrap(operation, await page(from, from + pageSize - 1)) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
