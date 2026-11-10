/**
 * Synchronisation Supabase (production uniquement ; sans effet en démo).
 *
 * L'appareil reste la source de vérité immédiate (mode hors-ligne) ; les
 * changements sont poussés en différé (`schedulePush`, 1,5 s) par upsert,
 * sous la RLS de l'utilisateur. Au lancement, `pullAll()` récupère l'état
 * serveur (nouvel appareil, réinstallation) ; `useAppBootstrap` le fusionne
 * dans les stores locaux.
 *
 * API : `isSyncEnabled()`, `schedulePush(key, task)`, `flushSync()`,
 * `pushProfile`, `pushPlan`, `pushList`, `pushPantry`, `pushSpending`,
 * `pushOrder`, `pushNotificationPrefs`, `pullAll()`.
 */
import type {
  MealPlan,
  NotificationPreferences,
  OrderHandoff,
  PantryItem,
  ShoppingList,
  SpendingEntry,
  UserProfile,
} from '@/core';
import { addDays, startOfWeek } from '@/core';

import { getCurrentUserId, hasRemoteSession } from './auth';
import {
  handoffToRow,
  listItemToRow,
  notificationPrefsToRow,
  pantryToRow,
  profileToRow,
  rowToMealPlan,
  rowToNotificationPrefs,
  rowToPantry,
  rowToProfile,
  rowToSpending,
  spendingToRow,
  type Row,
} from './mappers';
import { captureError } from './monitoring';
import { getSupabase } from './supabase';

export const SYNC_DEBOUNCE_MS = 1500;

export function isSyncEnabled(): boolean {
  return getSupabase() !== null;
}

/** Client + utilisateur authentifié, ou null (démo, hors-ligne). */
async function context(): Promise<{ client: NonNullable<ReturnType<typeof getSupabase>>; userId: string } | null> {
  const client = getSupabase();
  const userId = getCurrentUserId();
  if (!client || !userId) return null;
  if (!(await hasRemoteSession())) return null;
  return { client, userId };
}

function check(res: { error: unknown }): void {
  if (res.error) throw res.error;
}

/** Liste « in » PostgREST correctement échappée : ("a","b"). */
function inList(ids: readonly string[]): string {
  return `(${ids.map((id) => `"${id.replace(/["\\]/g, '')}"`).join(',')})`;
}

// ─── Poussées ────────────────────────────────────────────────────────────────

/** Ids de planning attribués par le serveur (un seul planning par semaine). */
const remotePlanIds = new Map<string, string>();

export async function pushProfile(profile: UserProfile, onboardingCompletedAt: string | null): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  // L'id du profil EST auth.uid() (RLS) : on force celui de la session.
  const row = profileToRow({ ...profile, id: ctx.userId }, onboardingCompletedAt);
  check(await ctx.client.from('profiles').upsert(row, { onConflict: 'id' }));
}

export async function pushPlan(plan: MealPlan): Promise<string | null> {
  const ctx = await context();
  if (!ctx) return null;
  const { data, error } = await ctx.client.rpc('save_meal_plan', { p_plan: plan });
  if (error) throw error;
  const id = typeof data === 'string' ? data : plan.id;
  remotePlanIds.set(plan.id, id);
  return id;
}

export async function pushList(list: ShoppingList): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const mealPlanId = list.mealPlanId ? (remotePlanIds.get(list.mealPlanId) ?? null) : null;
  check(
    await ctx.client
      .from('shopping_lists')
      .upsert({ user_id: ctx.userId, id: list.id, meal_plan_id: mealPlanId }, { onConflict: 'user_id,id' }),
  );
  const ids = list.items.map((i) => i.id);
  let del = ctx.client.from('shopping_list_items').delete().eq('user_id', ctx.userId).eq('list_id', list.id);
  if (ids.length > 0) del = del.not('id', 'in', inList(ids));
  check(await del);
  if (list.items.length > 0) {
    const rows = list.items.map((item, i) => listItemToRow(ctx.userId, list.id, item, i));
    check(await ctx.client.from('shopping_list_items').upsert(rows, { onConflict: 'user_id,list_id,id' }));
  }
}

async function replaceUserRows(table: string, rows: Row[], ids: string[]): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  let del = ctx.client.from(table).delete().eq('user_id', ctx.userId);
  if (ids.length > 0) del = del.not('id', 'in', inList(ids));
  check(await del);
  if (rows.length > 0) check(await ctx.client.from(table).upsert(rows, { onConflict: 'user_id,id' }));
}

export async function pushPantry(items: readonly PantryItem[]): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  await replaceUserRows('pantry_items', items.map((p) => pantryToRow(userId, p)), items.map((p) => p.id));
}

export async function pushSpending(entries: readonly SpendingEntry[]): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  await replaceUserRows('spending_entries', entries.map((e) => spendingToRow(userId, e)), entries.map((e) => e.id));
}

export async function pushOrder(handoff: OrderHandoff, mealPlanId: string | null = null): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const remotePlan = mealPlanId ? (remotePlanIds.get(mealPlanId) ?? null) : null;
  check(
    await ctx.client.from('order_handoffs').upsert(handoffToRow(ctx.userId, handoff, remotePlan), { onConflict: 'user_id,id' }),
  );
}

export async function pushNotificationPrefs(prefs: NotificationPreferences): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  check(
    await ctx.client
      .from('notification_preferences')
      .upsert(notificationPrefsToRow(ctx.userId, prefs), { onConflict: 'user_id' }),
  );
}

// ─── Différé ─────────────────────────────────────────────────────────────────

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; task: () => Promise<unknown> }>();

async function run(key: string, task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch (err) {
    captureError(err, { where: 'sync', key });
  }
}

/**
 * Programme une poussée ; un nouvel appel avec la même clé remplace le
 * précédent (seul le dernier état part). Sans effet en démo.
 */
export function schedulePush(key: string, task: () => Promise<unknown>, delayMs = SYNC_DEBOUNCE_MS): void {
  if (!isSyncEnabled()) return;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    void run(key, task);
  }, delayMs);
  pending.set(key, { timer, task });
}

/** Exécute immédiatement les poussées en attente (avant une génération serveur, en arrière-plan). */
export async function flushSync(): Promise<void> {
  const tasks = Array.from(pending.entries());
  pending.clear();
  for (const [, p] of tasks) clearTimeout(p.timer);
  await Promise.all(tasks.map(([key, p]) => run(key, p.task)));
}

// ─── Récupération ────────────────────────────────────────────────────────────

export interface PulledData {
  profile: UserProfile | null;
  onboardingCompleted: boolean;
  plans: MealPlan[];
  pantry: PantryItem[];
  spending: SpendingEntry[];
  notificationPrefs: NotificationPreferences | null;
}

/** État serveur de l'utilisateur (null en démo / hors-ligne / erreur). */
export async function pullAll(today: string = new Date().toISOString().slice(0, 10)): Promise<PulledData | null> {
  const ctx = await context();
  if (!ctx) return null;
  try {
    const since = addDays(startOfWeek(today), -7);
    const [profileRes, plansRes, pantryRes, spendingRes, prefsRes] = await Promise.all([
      ctx.client.from('profiles').select('*').eq('id', ctx.userId).maybeSingle(),
      ctx.client
        .from('meal_plans')
        .select('*, planned_meals(*)')
        .eq('user_id', ctx.userId)
        .gte('week_start', since)
        .order('week_start'),
      ctx.client.from('pantry_items').select('*').eq('user_id', ctx.userId),
      ctx.client.from('spending_entries').select('*').eq('user_id', ctx.userId).order('date', { ascending: false }).limit(500),
      ctx.client.from('notification_preferences').select('*').eq('user_id', ctx.userId).maybeSingle(),
    ]);
    for (const r of [profileRes, plansRes, pantryRes, spendingRes, prefsRes]) check(r);
    const profileRow = profileRes.data as Row | null;
    const plans = ((plansRes.data as Row[] | null) ?? []).map(rowToMealPlan);
    for (const p of plans) remotePlanIds.set(p.id, p.id);
    return {
      profile: profileRow ? rowToProfile(profileRow) : null,
      onboardingCompleted: !!profileRow?.onboarding_completed_at,
      plans,
      pantry: ((pantryRes.data as Row[] | null) ?? []).map(rowToPantry),
      spending: ((spendingRes.data as Row[] | null) ?? []).map(rowToSpending),
      notificationPrefs: prefsRes.data ? rowToNotificationPrefs(prefsRes.data as Row) : null,
    };
  } catch (err) {
    captureError(err, { where: 'pullAll' });
    return null;
  }
}
