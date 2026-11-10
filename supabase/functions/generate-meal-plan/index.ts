/**
 * Point d'entrée Deno de l'Edge Function generate-meal-plan.
 * Toute la logique est dans handler.ts (testée sans réseau ni base).
 */
import { createAnthropicClient } from '../_shared/anthropic.ts';
import { requireUser } from '../_shared/auth.ts';
import { denoEnv, intEnv, optionalEnv } from '../_shared/env.ts';
import { createLogger } from '../_shared/logger.ts';
import { createUserClient } from '../_shared/supabaseClient.ts';
import { createGenerateMealPlanHandler } from './handler.ts';
import { createMealPlanRepository } from './repo.ts';

const logger = createLogger('generate-meal-plan', { level: optionalEnv(denoEnv, 'LOG_LEVEL') === 'debug' ? 'debug' : 'info' });
const apiKey = optionalEnv(denoEnv, 'ANTHROPIC_API_KEY');
if (!apiKey) logger.warn('ANTHROPIC_API_KEY absente : moteur de règles uniquement');

const handler = createGenerateMealPlanHandler({
  logger,
  llm: apiKey
    ? createAnthropicClient({
      apiKey,
      model: optionalEnv(denoEnv, 'ANTHROPIC_MODEL'),
      maxTokens: intEnv(denoEnv, 'ANTHROPIC_MAX_TOKENS', 1500, 256, 8000),
    })
    : null,
  llmTimeoutMs: intEnv(denoEnv, 'LLM_TIMEOUT_MS', 7000, 1000, 8500),
  async authenticate(req) {
    const client = createUserClient(req, denoEnv);
    const user = await requireUser(req, client.auth);
    return { userId: user.id, repo: createMealPlanRepository(client, user.id, () => new Date()) };
  },
});

Deno.serve(handler);
