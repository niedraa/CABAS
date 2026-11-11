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
  // Open Prices : au plus une requête toutes les 2 s.
  delayMs: intEnv(denoEnv, 'OPEN_PRICES_DELAY_MS', 2000, 2000, 10_000),
  timeBudgetMs: intEnv(denoEnv, 'COLLECT_TIME_BUDGET_MS', 120_000, 5_000, 380_000),
  maxPages: intEnv(denoEnv, 'OPEN_PRICES_MAX_PAGES', 200, 1, 500),
});

Deno.serve(handler);
