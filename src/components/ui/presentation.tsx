/**
 * Présentation native des Modal du kit (Dialog, Sheet) — contrainte iOS.
 *
 * Sur iOS, chaque Modal RN est un contrôleur présenté par celui de l'écran,
 * qui n'en présente qu'UN à la fois : une Modal montée pendant qu'une autre
 * est encore présentée (animation de sortie, fermeture native en cours) ne
 * s'affiche jamais (UIKit refuse : « already presenting »). Exemple : le
 * « Continuer » d'une confirmation qui enchaîne sur une seconde confirmation.
 *
 * Chaque Modal réserve donc un créneau auprès de son niveau de présentation
 * (l'app, ou la Modal du kit qui la contient) avant de se monter, et le
 * libère une fois refermée côté natif : la suivante s'affiche alors.
 * Une Modal rendue DANS une autre est présentée par celle-ci (niveau
 * distinct, aucune attente). Android et web : créneau toujours accordé.
 */
import React, { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

type Level = object;

const ROOT_LEVEL: Level = {};
const LevelContext = createContext<Level>(ROOT_LEVEL);

/** Détenteurs de créneau par niveau. */
const holders = new Map<Level, Set<object>>();
/** Abonnés React (`useSyncExternalStore`) : un créneau a changé de main. */
const listeners = new Set<() => void>();
/** Modal en attente d'un créneau : relancées à chaque libération. */
const waiters = new Set<() => void>();

function emit(): void {
  for (const l of Array.from(listeners)) l();
}

function heldByOther(level: Level, token: object): boolean {
  const set = holders.get(level);
  if (!set) return false;
  for (const h of set) if (h !== token) return true;
  return false;
}

function tryAcquire(level: Level, token: object): boolean {
  if (heldByOther(level, token)) return false;
  let set = holders.get(level);
  if (!set) {
    set = new Set();
    holders.set(level, set);
  }
  set.add(token);
  emit();
  return true;
}

function release(level: Level, token: object): void {
  const set = holders.get(level);
  if (!set || !set.delete(token)) return;
  if (set.size === 0) holders.delete(level);
  emit();
  for (const w of Array.from(waiters)) w();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Les créneaux ne s'appliquent qu'à iOS (lu à l'appel : modifiable en test). */
function gated(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Créneau de présentation d'une Modal.
 *  - `want` : la Modal doit s'afficher (prop `visible`) ;
 *  - `held` : la Modal est encore montée (sortie animée, fermeture native).
 * Renvoie vrai quand la Modal peut se monter (toujours vrai hors iOS).
 */
export function usePresentationSlot(want: boolean, held: boolean): boolean {
  const level = useContext(LevelContext);
  const [token] = useState<object>(() => ({}));
  const isHolder = useCallback(() => holders.get(level)?.has(token) ?? false, [level, token]);
  const granted = useSyncExternalStore(subscribe, isHolder, isHolder);
  const isGated = gated();

  // Demande du créneau ; s'il est pris, attente de sa libération.
  useEffect(() => {
    if (!isGated || !want || granted) return;
    if (tryAcquire(level, token)) return;
    const retry = () => {
      if (tryAcquire(level, token)) waiters.delete(retry);
    };
    waiters.add(retry);
    return () => {
      waiters.delete(retry);
    };
  }, [isGated, want, granted, level, token]);

  // Modal refermée (et plus demandée) : créneau rendu.
  useEffect(() => {
    if (isGated && !want && !held && granted) release(level, token);
  }, [isGated, want, held, granted, level, token]);

  // Démontage du composant : créneau libéré quoi qu'il arrive.
  useEffect(() => () => release(level, token), [level, token]);

  return !isGated || granted;
}

/** À placer dans la Modal : les Modal du kit rendues dedans forment un niveau à part. */
export function PresentationLevel({ children }: { children?: React.ReactNode }) {
  const [level] = useState<Level>(() => ({}));
  return <LevelContext.Provider value={level}>{children}</LevelContext.Provider>;
}

/** Tests : oublie tous les créneaux. */
export function __resetPresentationForTests(): void {
  holders.clear();
  waiters.clear();
  emit();
}
