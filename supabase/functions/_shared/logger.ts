/**
 * Journalisation structurée (JSON, une ligne par événement) — lisible dans
 * les logs des Edge Functions Supabase.
 *
 * Minimisation RGPD : les champs dont le nom évoque un secret ou une donnée
 * de santé sont masqués, ainsi que les jetons Expo et les JWT dans les valeurs.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** Logger enfant avec des champs fixes (ex. requestId). */
  child(fields: Record<string, unknown>): Logger;
}

const SENSITIVE_KEY = /(token|secret|password|authorization|api[_-]?key|cookie|allergen|diet|health|email)/i;
const SENSITIVE_VALUE = [
  /Expo(nent)?PushToken\[[^\]]+\]/g, // jetons push
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /sk-ant-[A-Za-z0-9_-]+/g, // clés Anthropic
];

/** Copie profonde « sûre » d'une valeur à journaliser. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[profondeur max]';
  if (typeof value === 'string') {
    let s = value;
    for (const re of SENSITIVE_VALUE) s = s.replace(re, '[masqué]');
    return s.length > 2000 ? `${s.slice(0, 2000)}…` : s;
  }
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[masqué]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface LoggerOptions {
  /** Niveau minimal (défaut : info, ou LOG_LEVEL). */
  level?: LogLevel;
  /** Sortie (défaut : console). */
  sink?: (level: LogLevel, line: string) => void;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const consoleSink = (level: LogLevel, line: string) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export function createLogger(fn: string, opts: LoggerOptions = {}, base: Record<string, unknown> = {}): Logger {
  const min = ORDER[opts.level ?? 'info'];
  const sink = opts.sink ?? consoleSink;
  const emit = (level: LogLevel, message: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < min) return;
    const payload = { ts: new Date().toISOString(), level, fn, msg: message, ...(redact({ ...base, ...fields }) as object) };
    sink(level, JSON.stringify(payload));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger(fn, opts, { ...base, ...fields }),
  };
}

/** Logger muet (tests). */
export const silentLogger: Logger = createLogger('test', { sink: () => {} });

/** Logger qui mémorise ses lignes (tests). */
export function memoryLogger(): Logger & { lines: { level: LogLevel; entry: Record<string, unknown> }[] } {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = [];
  const logger = createLogger('test', { level: 'debug', sink: (level, line) => lines.push({ level, entry: JSON.parse(line) }) });
  return Object.assign(logger, { lines });
}
