/** Point d'entrée Deno de l'Edge Function collect-prices (logique : handler.ts). */
import { denoEnv, intEnv, optionalEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabaseClient.ts';
import { createCollectPricesHandler } from './handler.ts';
import { createPriceCollectionRepository } from './repo.ts';

const handler = createCollectPricesHandler({
  repo: createPriceCollectionRepository(createServiceClient(denoEnv), () => new Date()),
  // Absent : chaque appel est refusé (500 server_misconfigured), jamais ouvert.
  cronSecret: optionalEnv(denoEnv, 'CRON_SECRET', ''),
  fetch: (input, init) => fetch(input, init),
  logger: createLogger('collect-prices'),
  delayMs: intEnv(denoEnv, 'OPEN_PRICES_DELAY_MS', 1000, 0, 10_000),
  timeBudgetMs: intEnv(denoEnv, 'COLLECT_TIME_BUDGET_MS', 120_000, 5_000, 380_000),
  maxAgeDays: intEnv(denoEnv, 'OPEN_PRICES_MAX_AGE_DAYS', 60, 1, 365),
});

Deno.serve(handler);
