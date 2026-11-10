/** Ligne à insérer dans `notification_queue` (partagée par collect-prices et send-notifications). */
export interface NotificationInsert {
  userId: string;
  kind: 'planning_reminder' | 'order_reminder' | 'price_drop';
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Clé de déduplication (contrainte unique en base). */
  dedupeKey: string;
}
