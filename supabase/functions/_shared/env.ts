/**
 * Lecture typée des variables d'environnement (secrets Supabase).
 *
 * Les handlers ne lisent JAMAIS `Deno.env` directement : ils reçoivent un
 * `EnvReader`, ce qui permet de les tester avec un environnement factice.
 */

export interface EnvReader {
  get(name: string): string | undefined;
}

/** Environnement réel (Deno). */
export const denoEnv: EnvReader = {
  get: (name) => Deno.env.get(name),
};

/** Environnement en mémoire (tests). */
export function mapEnv(values: Record<string, string | undefined>): EnvReader {
  return { get: (name) => values[name] };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Variable obligatoire (non vide) ; sinon ConfigError (→ HTTP 500 générique). */
export function requireEnv(env: EnvReader, name: string): string {
  const v = env.get(name)?.trim();
  if (!v) throw new ConfigError(`Variable d'environnement manquante : ${name}`);
  return v;
}

/** Variable facultative, avec valeur par défaut. */
export function optionalEnv(env: EnvReader, name: string, fallback: string): string;
export function optionalEnv(env: EnvReader, name: string): string | undefined;
export function optionalEnv(env: EnvReader, name: string, fallback?: string): string | undefined {
  const v = env.get(name)?.trim();
  return v ? v : fallback;
}

/** Entier borné ; valeur absente ou illisible → défaut. */
export function intEnv(env: EnvReader, name: string, fallback: number, min = -Infinity, max = Infinity): number {
  const raw = env.get(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
