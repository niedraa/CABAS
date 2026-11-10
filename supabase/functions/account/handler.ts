/**
 * account — droits RGPD de l'utilisateur.
 *
 * POST { action: 'export' }  → toutes ses données en JSON (portabilité, art. 20),
 *                              en pièce jointe `cabas-export-AAAA-MM-JJ.json`.
 * POST { action: 'delete' }  → effacement (art. 17) :
 *    1. RPC delete_my_account() exécutée AVEC LE JWT de l'utilisateur (elle ne
 *       peut supprimer que ses propres données : auth.uid()) ;
 *    2. suppression du compte auth (service_role → auth.admin.deleteUser), qui
 *       révoque aussi ses sessions. Les éventuelles lignes restantes partent
 *       en cascade (FK on delete cascade).
 *
 * L'abonnement en cours n'est PAS résilié par cette suppression : il se gère
 * dans l'App Store / Google Play (l'app l'indique avant confirmation).
 */
import { HttpError, json, readJson, requireMethod, withHandler } from '../_shared/http.ts';
import type { Logger } from '../_shared/logger.ts';
import { optionalEnum, requireRecord } from '../_shared/validation.ts';

export interface AccountRepository {
  /** RPC export_my_data() (JWT utilisateur). */
  exportData(): Promise<Record<string, unknown>>;
  /** RPC delete_my_account() (JWT utilisateur) ; renvoie les compteurs. */
  deleteAppData(): Promise<Record<string, unknown>>;
  /** auth.admin.deleteUser (service_role). */
  deleteAuthUser(userId: string): Promise<void>;
}

export interface AccountDeps {
  authenticate(req: Request): Promise<{ userId: string; email?: string; repo: AccountRepository }>;
  logger: Logger;
  now?: () => Date;
}

const ACTIONS = ['export', 'delete'] as const;

export function createAccountHandler(deps: AccountDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  return withHandler(deps.logger, async (req, log) => {
    requireMethod(req, 'POST');
    const { userId, email, repo } = await deps.authenticate(req);
    const body = requireRecord(await readJson(req, 4 * 1024));
    const action = optionalEnum(body.action, 'action', ACTIONS);
    if (!action) throw new HttpError(400, 'invalid_request', 'action doit valoir « export » ou « delete ».');

    if (action === 'export') {
      const data = await repo.exportData();
      const date = now().toISOString().slice(0, 10);
      log.info('data exported', { userId });
      return json(
        { format: 'cabas-export', version: 1, account: { id: userId, email: email ?? null }, ...data },
        200,
        { 'Content-Disposition': `attachment; filename="cabas-export-${date}.json"`, 'Cache-Control': 'no-store' },
      );
    }

    // Suppression : données applicatives d'abord (avec le JWT : impossible de viser un autre compte)…
    const deleted = await repo.deleteAppData();
    // … puis le compte d'authentification.
    try {
      await repo.deleteAuthUser(userId);
    } catch (err) {
      log.error('auth user deletion failed after app data deletion', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new HttpError(
        502,
        'auth_deletion_failed',
        "Tes données ont été supprimées, mais la fermeture du compte a échoué. Réessaie : l'opération reprendra là où elle s'est arrêtée.",
      );
    }
    log.info('account deleted', { userId });
    return json({ status: 'deleted', deleted });
  });
}
