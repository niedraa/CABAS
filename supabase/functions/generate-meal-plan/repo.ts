/**
 * Implémentation Supabase du MealPlanRepository (client UTILISATEUR → RLS).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Entitlement, MealPlan } from '../_shared/core/index.ts';
import { loadRecipeCatalog } from '../_shared/catalog.ts';
import { effectiveEntitlement, type Row, rowToMealPlan, rowToProfile, rowToSubscription } from '../_shared/mappers.ts';
import { unwrap } from '../_shared/supabaseClient.ts';
import type { MealPlanRepository } from './handler.ts';

export function createMealPlanRepository(client: SupabaseClient, userId: string, now: () => Date): MealPlanRepository {
  return {
    async loadProfile() {
      const row = unwrap<Row | null>('profile', await client.from('profiles').select('*').eq('id', userId).maybeSingle());
      return row ? rowToProfile(row) : null;
    },
    async loadEntitlement(): Promise<Entitlement> {
      const row = unwrap<Row | null>(
        'subscription',
        await client.from('subscriptions').select('*').eq('user_id', userId).maybeSingle(),
      );
      return effectiveEntitlement(rowToSubscription(row), now());
    },
    loadCatalog: () => loadRecipeCatalog(client),
    async loadPlan(weekStart: string): Promise<MealPlan | null> {
      const row = unwrap<Row | null>(
        'meal_plan',
        await client
          .from('meal_plans')
          .select('*, planned_meals(*)')
          .eq('user_id', userId)
          .eq('week_start', weekStart)
          .maybeSingle(),
      );
      return row ? rowToMealPlan(row) : null;
    },
    async savePlan(plan: MealPlan): Promise<string> {
      const id = unwrap<string>('save_meal_plan', await client.rpc('save_meal_plan', { p_plan: plan }));
      return id;
    },
  };
}
