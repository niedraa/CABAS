// GENERATED — do not edit.
// Copie générée de src/core par scripts/sync-shared.mjs (npm run sync:shared).
// Toute modification doit être faite dans src/core puis resynchronisée.
/**
 * Identifiants uniques. Utilise `crypto.randomUUID` quand il existe
 * (Deno, navigateurs, Hermes récent) et un repli pseudo-aléatoire sinon.
 */

type CryptoLike = { randomUUID?: () => string; getRandomValues?: <T extends Uint8Array>(a: T) => T };

/** UUID v4 (format standard) — repli sur getRandomValues puis Math.random. */
export function uuid(): string {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Bits de version (4) et de variante (10xx) imposés par la RFC 4122.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex
    .slice(8, 10)
    .join('')}-${hex.slice(10, 16).join('')}`;
}

/** Crée un identifiant, préfixé si demandé : `createId('meal')` → `meal_3f2a…`. */
export function createId(prefix?: string): string {
  const id = uuid();
  return prefix ? `${prefix}_${id}` : id;
}
