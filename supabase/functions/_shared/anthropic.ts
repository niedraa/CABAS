/**
 * Client minimal de l'API Messages de Claude (Anthropic), en `fetch` brut :
 * une seule requête non streamée, sans dépendance npm (démarrage à froid
 * rapide dans l'Edge Function, budget total < 10 s).
 *
 * - En-têtes : `x-api-key`, `anthropic-version: 2023-06-01`.
 * - Modèle : ANTHROPIC_MODEL, défaut `claude-haiku-5-5` (le plus rapide).
 * - Effort `low` : sélection dans une liste de candidats, pas de raisonnement
 *   long nécessaire. Sur Haiku, la réflexion est désactivée (autorisé à
 *   effort ≤ high) pour tenir le délai ; sur les autres modèles (Opus 5.5…),
 *   où elle ne peut pas être désactivée, on laisse la réflexion adaptative.
 * - `stop_reason: "refusal"` ou réponse sans texte → erreur (repli règles).
 *
 * Minimisation RGPD : l'appelant ne transmet AUCUNE donnée de santé (voir
 * core › buildLlmPrompt) ; ce module ne journalise ni le prompt ni la réponse.
 */

export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';
export const DEFAULT_MAX_TOKENS = 1500;

export interface LlmPrompt {
  system: string;
  user: string;
}

/** Interface consommée par les handlers (facilement remplaçable en test). */
export interface LlmClient {
  readonly model: string;
  complete(prompt: LlmPrompt, opts: { signal: AbortSignal }): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    readonly kind: 'http' | 'refusal' | 'empty' | 'invalid_response',
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  /** fetch injectable (tests). */
  fetch?: typeof fetch;
  url?: string;
}

/** Corps de requête Messages API (exporté pour les tests). */
export function buildMessagesBody(model: string, maxTokens: number, prompt: LlmPrompt): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    output_config: { effort: 'low' },
  };
  if (model.startsWith('claude-haiku')) body.thinking = { type: 'disabled' };
  return body;
}

interface MessagesResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string | null;
  stop_details?: { category?: string | null } | null;
}

export function createAnthropicClient(cfg: AnthropicConfig): LlmClient {
  const model = cfg.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const maxTokens = cfg.maxTokens ?? DEFAULT_MAX_TOKENS;
  const doFetch = cfg.fetch ?? fetch;
  const url = cfg.url ?? ANTHROPIC_API_URL;
  return {
    model,
    async complete(prompt, { signal }) {
      const res = await doFetch(url, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(buildMessagesBody(model, maxTokens, prompt)),
      });
      if (!res.ok) {
        // Corps d'erreur Anthropic : { type: "error", error: { type, message } } — on ne garde que le type.
        let errType = '';
        try {
          const j = await res.json();
          errType = String(j?.error?.type ?? '');
        } catch {
          // corps illisible : ignoré
        }
        throw new LlmError('http', `Claude API HTTP ${res.status}${errType ? ` (${errType})` : ''}`, res.status);
      }
      let data: MessagesResponse;
      try {
        data = await res.json();
      } catch {
        throw new LlmError('invalid_response', 'Réponse Claude illisible');
      }
      if (data.stop_reason === 'refusal') {
        throw new LlmError(
          'refusal',
          `Claude a décliné la requête (${data.stop_details?.category ?? 'sans catégorie'})`,
        );
      }
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      if (!text.trim()) throw new LlmError('empty', 'Réponse Claude sans texte');
      return text;
    },
  };
}

/** Délai dépassé (distinct des autres erreurs pour les métriques). */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Délai dépassé (${ms} ms)`);
    this.name = 'TimeoutError';
  }
}

/**
 * Exécute `fn` avec un délai : annule le signal ET rejette à l'échéance, même
 * si `fn` ignore le signal (le handler ne reste jamais bloqué).
 */
export async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, Math.max(0, ms));
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } catch (err) {
    // Un fetch annulé lève une AbortError : on la présente comme un délai dépassé.
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
