/**
 * Options et règles pures des sections de profil (onboarding + édition du
 * profil). Aucun composant ici : libellés, emoji, bornes, et petites
 * fonctions testables (aimantation du budget, créneaux, consentement…).
 */
import {
  ALLERGEN_LABELS,
  ALLERGENS,
  CUISINE_LABELS,
  CUISINES,
  DIET_LABELS,
  DIETS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  foldText,
  householdPortions,
  type Allergen,
  type Cuisine,
  type Diet,
  type Equipment,
  type Household,
  type Ingredient,
  type MealSlotPreference,
  type MealType,
} from '@/core';

export interface ProfileChoice<T extends string> {
  value: T;
  label: string;
  emoji: string;
}

// ─── Régimes & allergies ─────────────────────────────────────────────────────

export const DIET_EMOJI: Record<Diet, string> = {
  vegetarien: '🥦',
  vegan: '🌱',
  pescetarien: '🐟',
  halal: '🌙',
  casher: '✡️',
  sans_porc: '🐷',
  sans_gluten: '🌾',
  sans_lactose: '🥛',
};

export const ALLERGEN_EMOJI: Record<Allergen, string> = {
  gluten: '🌾',
  crustaces: '🦐',
  oeufs: '🥚',
  poissons: '🐟',
  arachides: '🥜',
  soja: '🫘',
  lait: '🥛',
  fruits_a_coque: '🌰',
  celeri: '🥬',
  moutarde: '🌭',
  sesame: '🥯',
  sulfites: '🍷',
  lupin: '🌼',
  mollusques: '🦪',
};

export const DIET_CHOICES: readonly ProfileChoice<Diet>[] = DIETS.map((d) => ({
  value: d,
  label: DIET_LABELS[d],
  emoji: DIET_EMOJI[d],
}));

export const ALLERGEN_CHOICES: readonly ProfileChoice<Allergen>[] = ALLERGENS.map((a) => ({
  value: a,
  label: ALLERGEN_LABELS[a],
  emoji: ALLERGEN_EMOJI[a],
}));

/**
 * Consentement RGPD (art. 9) : nécessaire dès qu'un régime ou une allergie
 * est déclaré.
 */
export function needsHealthConsent(v: { diets: readonly Diet[]; allergens: readonly Allergen[] }): boolean {
  return v.diets.length > 0 || v.allergens.length > 0;
}

/** Vrai si l'étape « régime » peut être validée (consentement donné quand il est requis). */
export function isHealthStepValid(v: {
  diets: readonly Diet[];
  allergens: readonly Allergen[];
  healthDataConsentAt: string | null;
}): boolean {
  return !needsHealthConsent(v) || !!v.healthDataConsentAt;
}

/**
 * Recherche d'ingrédients « je n'aime pas » : correspondance sans accents ni
 * casse, en début de mot d'abord. Exclut ceux déjà choisis.
 */
export function searchIngredients(
  ingredients: readonly Ingredient[],
  query: string,
  exclude: readonly string[] = [],
  limit = 6,
): Ingredient[] {
  const q = foldText(query.trim());
  if (q.length < 2) return [];
  const excluded = new Set(exclude);
  const starts: Ingredient[] = [];
  const contains: Ingredient[] = [];
  const seenNames = new Set<string>();
  for (const ing of ingredients) {
    if (excluded.has(ing.id)) continue;
    const name = foldText(ing.name);
    if (seenNames.has(name)) continue;
    if (name.startsWith(q) || name.split(/[\s'’-]+/).some((w) => w.startsWith(q))) {
      starts.push(ing);
      seenNames.add(name);
    } else if (name.includes(q)) {
      contains.push(ing);
      seenNames.add(name);
    }
  }
  const byLength = (a: Ingredient, b: Ingredient) => a.name.length - b.name.length;
  return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, limit);
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export interface BudgetRange {
  minCents: number;
  maxCents: number;
  stepCents: number;
}

/** Budget hebdo : 30 € → 300 €, crans de 5 €. */
export const BUDGET_RANGE: BudgetRange = { minCents: 3000, maxCents: 30000, stepCents: 500 };

/** Aimante un budget sur le cran le plus proche, dans les bornes. */
export function snapBudgetCents(cents: number, range: BudgetRange = BUDGET_RANGE): number {
  'worklet';
  if (!Number.isFinite(cents)) return range.minCents;
  const clamped = Math.min(range.maxCents, Math.max(range.minCents, cents));
  const steps = Math.round((clamped - range.minCents) / range.stepCents);
  return Math.min(range.maxCents, range.minCents + steps * range.stepCents);
}

/** Position du curseur (0 → largeur) → budget aimanté. */
export function budgetFromPosition(x: number, width: number, range: BudgetRange = BUDGET_RANGE): number {
  'worklet';
  if (!(width > 0)) return range.minCents;
  const ratio = Math.min(1, Math.max(0, x / width));
  return snapBudgetCents(range.minCents + ratio * (range.maxCents - range.minCents), range);
}

/** Budget → fraction 0..1 de la piste. */
export function budgetToRatio(cents: number, range: BudgetRange = BUDGET_RANGE): number {
  'worklet';
  const span = range.maxCents - range.minCents;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (cents - range.minCents) / span));
}

/** Petit commentaire bienveillant sous le budget (jamais culpabilisant). */
export function budgetHint(cents: number, household: Household): string {
  const portions = householdPortions(household);
  // Repère grossier : ~ 4,50 € par portion et par jour sur 7 jours (2 repas).
  const perPortionDay = cents / portions / 7;
  if (perPortionDay < 250) return 'Serré mais faisable : Cabas mise sur les petits prix et les MDD.';
  if (perPortionDay < 550) return 'Un budget équilibré : de quoi bien manger sans se ruiner.';
  return 'Confortable : place aux bons produits et aux petits plaisirs.';
}

// ─── Temps de cuisine ────────────────────────────────────────────────────────

export interface CookTimeChoice {
  /** Minutes maximum (prépa + cuisson). */
  value: number;
  label: string;
  emoji: string;
  hint: string;
}

/** « 60+ » est stocké en 120 min (sans vraie limite pour un plat mijoté). */
export const COOK_TIME_CHOICES: readonly CookTimeChoice[] = [
  { value: 15, label: '15 min', emoji: '⚡', hint: 'Express' },
  { value: 30, label: '30 min', emoji: '🍳', hint: 'Rapide' },
  { value: 45, label: '45 min', emoji: '🥘', hint: 'Tranquille' },
  { value: 120, label: '60+ min', emoji: '🍲', hint: 'Mijoté' },
];

/** Choix le plus proche d'une durée quelconque (profil importé, ancienne valeur). */
export function nearestCookTime(min: number): number {
  let best = COOK_TIME_CHOICES[0].value;
  for (const c of COOK_TIME_CHOICES) {
    if (Math.abs(c.value - min) < Math.abs(best - min)) best = c.value;
  }
  // Tout ce qui dépasse l'heure tombe sur « 60+ ».
  return min >= 60 ? COOK_TIME_CHOICES[COOK_TIME_CHOICES.length - 1].value : best;
}

// ─── Ustensiles & cuisines ───────────────────────────────────────────────────

export const EQUIPMENT_EMOJI: Record<Equipment, string> = {
  four: '🔥',
  plaques: '🍳',
  micro_ondes: '⚡',
  mixeur: '🥤',
  robot: '🤖',
  cocotte_minute: '🍲',
  friteuse_air: '🍟',
  barbecue: '🍖',
};

export const CUISINE_EMOJI: Record<Cuisine, string> = {
  francaise: '🥖',
  italienne: '🍝',
  mediterraneenne: '🫒',
  asiatique: '🥢',
  orientale: '🧆',
  mexicaine: '🌮',
  indienne: '🍛',
  americaine: '🍔',
  monde: '🌍',
};

export const EQUIPMENT_CHOICES: readonly ProfileChoice<Equipment>[] = EQUIPMENT.map((e) => ({
  value: e,
  label: EQUIPMENT_LABELS[e],
  emoji: EQUIPMENT_EMOJI[e],
}));

export const CUISINE_CHOICES: readonly ProfileChoice<Cuisine>[] = CUISINES.map((c) => ({
  value: c,
  label: CUISINE_LABELS[c],
  emoji: CUISINE_EMOJI[c],
}));

// ─── Foyer ───────────────────────────────────────────────────────────────────

export const HOUSEHOLD_LIMITS = { adults: { min: 1, max: 12 }, children: { min: 0, max: 12 } } as const;

/** « 2,5 » (virgule décimale, sans « ,0 »). */
export function formatPortions(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
}

/** « Cabas cuisinera pour ≈ 2,5 portions ». */
export function portionsSentence(h: Household): string {
  const p = householdPortions(h);
  return `Cabas cuisinera pour ≈ ${formatPortions(p)} portion${p > 1 ? 's' : ''}`;
}

/** Emoji d'illustration du foyer (un par personne, plafonné). */
export function householdEmoji(h: Household, max = 8): string[] {
  const adults = ['🧑', '👩', '👨', '🧔', '👵', '👴'];
  const kids = ['🧒', '👧', '👦', '👶'];
  const out: string[] = [];
  for (let i = 0; i < h.adults && out.length < max; i++) out.push(adults[i % adults.length]);
  for (let i = 0; i < h.children && out.length < max; i++) out.push(kids[i % kids.length]);
  return out;
}

// ─── Magasins ────────────────────────────────────────────────────────────────

export const STORES_MIN = 1;
export const STORES_MAX = 5;
/** À partir de 3 enseignes, le comparateur fait de vraies économies. */
export const STORES_RECOMMENDED = 3;

export type StoreToggleResult = { ids: string[]; blocked: null | 'max' };

/** Ajoute / retire un magasin (maximum `STORES_MAX`). */
export function toggleStoreId(ids: readonly string[], id: string, max = STORES_MAX): StoreToggleResult {
  if (ids.includes(id)) return { ids: ids.filter((x) => x !== id), blocked: null };
  if (ids.length >= max) return { ids: [...ids], blocked: 'max' };
  return { ids: [...ids, id], blocked: null };
}

// ─── Créneaux ────────────────────────────────────────────────────────────────

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
export const WEEKDAY_NAMES_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
export const MEAL_TYPES: readonly MealType[] = ['dejeuner', 'diner'];

type Weekday = MealSlotPreference['weekday'];
const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export function hasSlot(slots: readonly MealSlotPreference[], weekday: number, type: MealType): boolean {
  return slots.some((s) => s.weekday === weekday && s.type === type);
}

/** Tri stable : jour puis midi avant soir. */
export function sortSlots(slots: readonly MealSlotPreference[]): MealSlotPreference[] {
  const seen = new Set<string>();
  const out: MealSlotPreference[] = [];
  for (const s of slots) {
    const k = `${s.weekday}-${s.type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ weekday: s.weekday, type: s.type });
  }
  return out.sort((a, b) => a.weekday - b.weekday || (a.type === b.type ? 0 : a.type === 'dejeuner' ? -1 : 1));
}

export function toggleSlot(slots: readonly MealSlotPreference[], weekday: Weekday, type: MealType): MealSlotPreference[] {
  return hasSlot(slots, weekday, type)
    ? sortSlots(slots.filter((s) => !(s.weekday === weekday && s.type === type)))
    : sortSlots([...slots, { weekday, type }]);
}

export interface SlotPreset {
  id: 'evenings' | 'evenings_weekend' | 'weekdays';
  label: string;
  emoji: string;
  slots: MealSlotPreference[];
}

const slotsFor = (days: Weekday[], types: MealType[]) =>
  sortSlots(days.flatMap((weekday) => types.map((type) => ({ weekday, type }))));

export const SLOT_PRESETS: readonly SlotPreset[] = [
  { id: 'evenings', label: 'Tous les soirs', emoji: '🌙', slots: slotsFor(ALL_WEEKDAYS, ['diner']) },
  {
    id: 'evenings_weekend',
    label: 'Soirs + week-end midi',
    emoji: '☀️',
    slots: sortSlots([...slotsFor(ALL_WEEKDAYS, ['diner']), ...slotsFor([5, 6], ['dejeuner'])]),
  },
  { id: 'weekdays', label: 'Semaine seulement', emoji: '💼', slots: slotsFor([0, 1, 2, 3, 4], ['dejeuner', 'diner']) },
];

/** Préréglage correspondant exactement aux créneaux, sinon null. */
export function matchingPreset(slots: readonly MealSlotPreference[]): SlotPreset['id'] | null {
  const key = (xs: readonly MealSlotPreference[]) =>
    sortSlots(xs)
      .map((s) => `${s.weekday}${s.type}`)
      .join(',');
  const k = key(slots);
  return SLOT_PRESETS.find((p) => key(p.slots) === k)?.id ?? null;
}

/** « 9 repas par semaine ». */
export function mealsPerWeekLabel(n: number): string {
  if (n === 0) return 'Aucun repas choisi';
  return `${n} repas par semaine`;
}
