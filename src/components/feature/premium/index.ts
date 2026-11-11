/**
 * Premium : briques du paywall (`src/app/premium.tsx`) et du statut
 * d'abonnement (profil, réglages).
 *
 * ```tsx
 * const feature = parseFeatureParam(params.feature);       // ?feature=optimized_basket
 * <PremiumHero {...paywallHeadline(feature, offeredTrialDays(offerings))} />
 * <FeatureList features={orderedFeatures(feature)} highlight={feature} />
 * <PlanPicker options={planOptions(offerings)} value={pkg} onChange={setPkg} />
 * const status = subscriptionStatus(state);                // { kind, label, detail, endDate… }
 * ```
 * Pour ouvrir le paywall : `router.push(premiumHref('budget_tracking'))`.
 */
export { PremiumHero, type PremiumHeroProps } from './PremiumHero';
export { FeatureList, type FeatureListProps } from './FeatureList';
export { PlanPicker, PlanOptionCard, type PlanPickerProps, type PlanOptionCardProps } from './PlanPicker';
export { FEATURE_ICONS } from './featureIcons';
export * from './paywall';
