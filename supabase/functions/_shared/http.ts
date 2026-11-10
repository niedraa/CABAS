/**
 * Utilitaires HTTP communs : réponses JSON, erreurs typées, lecture du corps,
 * enveloppe des handlers (CORS, journalisation, erreurs génériques).
 */
import { corsHeaders, handlePreflight } from './cors.ts';
import { ConfigError } from './env.ts';
import type { Logger } from './logger.ts';

/** Erreur « métier » renvoyée telle quelle au client (code stable + message FR). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Corps d'erreur standard : `{ error: { code, message, details? } }`. */
export function errorJson(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: details === undefined ? { code, message } : { code, message, details } }, status);
}

export function requireMethod(req: Request, method: string): void {
  if (req.method !== method) {
    throw new HttpError(405, 'method_not_allowed', `Méthode ${req.method} non autorisée (attendu : ${method}).`);
  }
}

/** Lit un corps JSON borné en taille. Corps vide → `{}`. */
export async function readJson(req: Request, maxBytes = 256 * 1024): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
  const text = await req.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new HttpError(413, 'payload_too_large', 'Requête trop volumineuse.');
  }
  if (text.trim() === '') return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Le corps de la requête n\'est pas un JSON valide.');
  }
}

/**
 * Enveloppe un handler : pré-vol CORS, identifiant de requête, conversion des
 * erreurs (HttpError → réponse explicite, le reste → 500 générique sans fuite
 * de détail interne).
 */
export function withHandler(
  logger: Logger,
  fn: (req: Request, log: Logger) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    const requestId = crypto.randomUUID();
    const log = logger.child({ requestId });
    const started = Date.now();
    try {
      const res = await fn(req, log);
      log.info('request done', { method: req.method, status: res.status, ms: Date.now() - started });
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        log.warn('request rejected', { status: err.status, code: err.code, ms: Date.now() - started });
        return errorJson(err.status, err.code, err.message, err.details);
      }
      if (err instanceof ConfigError) {
        log.error('configuration error', { error: err.message });
        return errorJson(500, 'server_misconfigured', 'Le service est mal configuré. Réessaie plus tard.');
      }
      log.error('unhandled error', { error: err instanceof Error ? { name: err.name, message: err.message } : String(err) });
      return errorJson(500, 'internal_error', 'Une erreur inattendue est survenue. Réessaie dans un instant.');
    }
  };
}
