/**
 * Navigation racine : présentation de chaque route du Stack racine et point
 * d'entrée selon l'état de l'onboarding. Pur (testable), utilisé par
 * `src/app/_layout.tsx` et `src/app/index.tsx`.
 */
import { radius } from '@/theme';

/** Sous-ensemble des options du native stack utilisées ici. */
export interface RootScreenOptions {
  presentation?: 'card' | 'modal' | 'formSheet' | 'transparentModal' | 'containedModal' | 'fullScreenModal';
  animation?: 'default' | 'fade' | 'none' | 'slide_from_right' | 'slide_from_bottom' | 'fade_from_bottom' | 'ios_from_right';
  gestureEnabled?: boolean;
  sheetAllowedDetents?: number[];
  sheetGrabberVisible?: boolean;
  sheetCornerRadius?: number;
}

/** Présentation par route (nom de route expo-router : `recette/[id]`, `(tabs)`…). */
export function rootScreenOptionsFor(routeName: string): RootScreenOptions {
  const name = routeName.replace(/\/index$/, '');
  switch (name) {
    case 'index':
      return { animation: 'none' };
    case '(onboarding)':
    case '(tabs)':
      // Bascule onboarding ↔ app : fondu, pas de retour par geste.
      return { animation: 'fade', gestureEnabled: false };
    case 'premium':
      return { presentation: 'modal', animation: 'slide_from_bottom' };
    case 'remplacer/[mealId]':
      return {
        presentation: 'formSheet',
        sheetAllowedDetents: [0.62, 0.95],
        sheetGrabberVisible: true,
        sheetCornerRadius: radius.xl,
      };
    case 'comparateur/[itemId]':
      return {
        presentation: 'formSheet',
        sheetAllowedDetents: [0.7, 0.95],
        sheetGrabberVisible: true,
        sheetCornerRadius: radius.xl,
      };
    case 'commande/[storeId]':
      return { presentation: 'modal', animation: 'slide_from_bottom' };
    case 'dev/seed':
    case 'design-system':
      return { animation: 'fade' };
    default:
      // recette/[id], placard, budget, parametres/*, +not-found…
      return { animation: 'slide_from_right' };
  }
}

/** Où atterrit l'app au démarrage. */
export function entryHref(onboardingCompleted: boolean): '/(tabs)' | '/bienvenue' {
  return onboardingCompleted ? '/(tabs)' : '/bienvenue';
}
