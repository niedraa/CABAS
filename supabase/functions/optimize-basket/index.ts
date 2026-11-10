/** Point d'entrée Deno de l'Edge Function optimize-basket (logique : handler.ts). */
import { requireUser } from '../_shared/auth.ts';
import { denoEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createUserClient } from '../_shared/supabaseClient.ts';
import { createOptimizeBasketHandler } from './handler.ts';
import { createBasketRepository } from './repo.ts';

const handler = createOptimizeBasketHandler({
  logger: createLogger('optimize-basket'),
  async authenticate(req) {
    const client = createUserClient(req, denoEnv);
    const user = await requireUser(req, client.auth);
    return { userId: user.id, repo: createBasketRepository(client, user.id, () => new Date()) };
  },
});

Deno.serve(handler);
