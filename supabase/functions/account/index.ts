/** Point d'entrée Deno de l'Edge Function account (logique : handler.ts). */
import { requireUser } from '../_shared/auth.ts';
import { denoEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient, createUserClient } from '../_shared/supabaseClient.ts';
import { createAccountHandler } from './handler.ts';
import { createAccountRepository } from './repo.ts';

const handler = createAccountHandler({
  logger: createLogger('account'),
  async authenticate(req) {
    const client = createUserClient(req, denoEnv);
    const user = await requireUser(req, client.auth);
    return {
      userId: user.id,
      email: user.email,
      repo: createAccountRepository(client, () => createServiceClient(denoEnv)),
    };
  },
});

Deno.serve(handler);
