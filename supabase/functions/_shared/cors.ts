/**
 * En-têtes CORS. L'app mobile n'en a pas besoin (pas de navigateur), mais la
 * version web (react-native-web) et le dashboard Supabase oui.
 */

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Réponse au pré-vol CORS, ou null si la requête n'est pas un OPTIONS. */
export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { status: 200, headers: corsHeaders });
}
