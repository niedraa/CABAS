/**
 * Authentification des Edge Functions.
 *
 * - Fonctions « utilisateur » : JWT Supabase dans `Authorization: Bearer …`,
 *   vérifié via `auth.getUser()` (validation côté serveur Auth, révocation
 *   comprise).
 * - Fonctions « cron » et webhooks : secret partagé comparé en TEMPS CONSTANT.
 */
import { HttpError } from './http.ts';

/** Jeton Bearer de l'en-tête Authorization, ou null. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/**
 * Comparaison de chaînes en temps constant (indépendant de la position de la
 * première différence). La longueur fuit (inévitable) mais pas le contenu.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/**
 * Vérifie un secret partagé transmis dans un en-tête (ex. `x-cron-secret`).
 * Lève 401 si absent ou différent. Un secret attendu vide est refusé (500 en
 * amont via requireEnv) : jamais d'accès ouvert par mauvaise configuration.
 */
export function verifySharedSecret(req: Request, headerName: string, expected: string): void {
  if (!expected) throw new HttpError(500, 'server_misconfigured', 'Secret non configuré.');
  const provided = req.headers.get(headerName) ?? '';
  // On accepte aussi « Bearer <secret> » dans l'en-tête Authorization.
  const bearer = headerName.toLowerCase() === 'authorization' ? (bearerToken(req) ?? '') : '';
  const ok = timingSafeEqual(provided, expected) || (bearer !== '' && timingSafeEqual(bearer, expected));
  if (!ok) throw new HttpError(401, 'unauthorized', 'Accès refusé.');
}

/** Utilisateur authentifié minimal. */
export interface AuthUser {
  id: string;
  email?: string;
}

/** Interface minimale du client Auth (compatible supabase-js). */
export interface AuthLike {
  getUser(jwt?: string): Promise<{ data: { user: { id: string; email?: string } | null }; error: unknown }>;
}

/** Exige un utilisateur connecté : 401 sinon. */
export async function requireUser(req: Request, auth: AuthLike): Promise<AuthUser> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, 'unauthorized', 'Connexion requise.');
  const { data, error } = await auth.getUser(token);
  if (error || !data?.user?.id) throw new HttpError(401, 'unauthorized', 'Session invalide ou expirée. Reconnecte-toi.');
  return { id: data.user.id, email: data.user.email ?? undefined };
}
