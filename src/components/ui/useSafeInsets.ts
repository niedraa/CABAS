/**
 * Marges de zone sûre tolérantes : renvoie 0 partout si aucun
 * `SafeAreaProvider` n'est monté (tests, galerie isolée, web statique)
 * au lieu de lever une erreur comme `useSafeAreaInsets`.
 */
import { useContext } from 'react';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function useSafeInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? ZERO;
}
