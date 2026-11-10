/**
 * Implémentation Supabase de l'AccountRepository : RPC avec le client
 * UTILISATEUR, suppression auth avec le client SERVICE.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { DbError, unwrap } from '../_shared/supabaseClient.ts';
import type { AccountRepository } from './handler.ts';

export function createAccountRepository(
  userClient: SupabaseClient,
  serviceClient: () => SupabaseClient,
): AccountRepository {
  return {
    async exportData() {
      return unwrap<Record<string, unknown>>('export_my_data', await userClient.rpc('export_my_data')) ?? {};
    },
    async deleteAppData() {
      return unwrap<Record<string, unknown>>('delete_my_account', await userClient.rpc('delete_my_account')) ?? {};
    },
    async deleteAuthUser(userId) {
      const { error } = await serviceClient().auth.admin.deleteUser(userId);
      if (error) throw new DbError('auth.admin.deleteUser', error.message);
    },
  };
}
