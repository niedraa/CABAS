/**
 * Gestion « monté / démonté » d'un élément animé (feuille, dialogue).
 *
 * `visible` passe à true  → on monte puis `progress` monte vers 1 (ressort).
 * `visible` passe à false → `progress` redescend vers 0, PUIS on démonte.
 */
import { useEffect, useState } from 'react';
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion } from '@/theme';

export interface PresenceConfig {
  /** Ressort d'entrée (défaut : `motion.spring`). */
  spring?: { damping: number; stiffness: number; mass: number };
  /** Durée de sortie (ms) — la sortie est plus rapide que l'entrée. */
  exitDuration?: number;
}

export function usePresence(
  visible: boolean,
  config: PresenceConfig = {},
): { rendered: boolean; progress: SharedValue<number> } {
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);
  const spring = config.spring ?? motion.spring;
  const exitDuration = config.exitDuration ?? motion.duration.base;

  // Monter dès que l'élément doit apparaître (ajustement d'état pendant le rendu,
  // recommandé par React plutôt qu'un effet).
  if (visible && !rendered) setRendered(true);

  useEffect(() => {
    if (visible) {
      progress.set(withSpring(1, spring));
    } else {
      progress.set(
        withTiming(0, { duration: exitDuration }, (finished) => {
          if (finished) scheduleOnRN(setRendered, false);
        }),
      );
    }
    // `spring` est un objet de tokens stable : seule la visibilité compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return { rendered: rendered || visible, progress };
}
