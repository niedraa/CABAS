/**
 * Garde la dernière valeur non nulle : une feuille qui se ferme continue
 * d'afficher son contenu pendant l'animation de sortie.
 */
import { useState } from 'react';

export function useStickyValue<T>(value: T | null): T | null {
  const [kept, setKept] = useState<T | null>(value);
  if (value !== null && value !== kept) setKept(value);
  return value ?? kept;
}
