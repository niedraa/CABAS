/** Point d'entrée Deno de l'Edge Function revenuecat-webhook (logique : handler.ts). */
import { denoEnv, optionalEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabaseClient.ts';
import { createRevenueCatWebhookHandler } from './handler.ts';
import { createSubscriptionRepository } from './repo.ts';

const handler = createRevenueCatWebhookHandler({
  repo: createSubscriptionRepository(createServiceClient(denoEnv)),
  // Absent : chaque appel est refusé (500 server_misconfigured), jamais ouvert.
  webhookSecret: optionalEnv(denoEnv, 'REVENUECAT_WEBHOOK_SECRET', ''),
  entitlementId: optionalEnv(denoEnv, 'REVENUECAT_ENTITLEMENT_ID', 'premium'),
  logger: createLogger('revenuecat-webhook'),
});

Deno.serve(handler);
