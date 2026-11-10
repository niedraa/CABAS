/**
 * Icône lucide de chaque fonctionnalité (correspondances du livre de marque :
 * Semaine `CalendarDays`, Panier `ShoppingCart`, Livraison `Truck`, IA
 * `Sparkles`, Budget `PiggyBank`…).
 */
import { BellRing, CalendarDays, PiggyBank, ShoppingCart, Sparkles, Truck, Warehouse, type LucideIcon } from 'lucide-react-native';

import type { Feature } from '@/core';

export const FEATURE_ICONS: Record<Feature, LucideIcon> = {
  unlimited_planning: CalendarDays,
  advanced_personalization: Sparkles,
  optimized_basket: ShoppingCart,
  one_click_order: Truck,
  price_alerts: BellRing,
  budget_tracking: PiggyBank,
  pantry: Warehouse,
};
