/** Point d'entrée Deno de l'Edge Function send-notifications (logique : handler.ts). */
import { denoEnv, intEnv, optionalEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createServiceClient } from '../_shared/supabaseClient.ts';
import { createSendNotificationsHandler } from './handler.ts';
import { createNotificationRepository } from './repo.ts';

const handler = createSendNotificationsHandler({
  repo: createNotificationRepository(createServiceClient(denoEnv)),
  // Absent : chaque appel est refusé (500 server_misconfigured), jamais ouvert.
  cronSecret: optionalEnv(denoEnv, 'CRON_SECRET', ''),
  expoAccessToken: optionalEnv(denoEnv, 'EXPO_ACCESS_TOKEN'),
  fetch: (input, init) => fetch(input, init),
  logger: createLogger('send-notifications'),
  orderReminderHour: intEnv(denoEnv, 'ORDER_REMINDER_HOUR', 10, 0, 23),
});

Deno.serve(handler);
