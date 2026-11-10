/**
 * Sections du profil (onboarding + édition du profil). Chaque section est un
 * composant CONTRÔLÉ : `value` + `onChange`, sans accès direct aux stores ni
 * aux services (le catalogue — magasins, ingrédients — est passé en props).
 *
 * ```tsx
 * <HouseholdSection value={draft.household} onChange={(household) => save({ household })} />
 * <DietAllergySection value={{ diets, allergens, dislikedIngredientIds, healthDataConsentAt }} onChange={save} ingredients={catalog.ingredients} />
 * <BudgetTimeSection value={{ weeklyBudgetCents, maxCookTimeWeekdayMin, maxCookTimeWeekendMin }} onChange={save} household={household} />
 * <EquipmentCuisineSection value={{ equipment, favoriteCuisines }} onChange={save} />
 * <StoresSection value={preferredStoreIds} onChange={(ids) => save({ preferredStoreIds: ids })} stores={catalog.stores} />
 * <MealSlotsSection value={mealSlots} onChange={(mealSlots) => save({ mealSlots })} freeLimit={isPremium ? null : 3} />
 * ```
 */
export { HouseholdSection, type HouseholdSectionProps } from './HouseholdSection';
export { DietAllergySection, HEALTH_CONSENT_LABEL, type DietAllergySectionProps, type DietAllergyValue } from './DietAllergySection';
export { BudgetTimeSection, type BudgetTimeSectionProps, type BudgetTimeValue } from './BudgetTimeSection';
export { BudgetSlider, type BudgetSliderProps } from './BudgetSlider';
export { ChoiceTiles, type ChoiceTile, type ChoiceTilesProps } from './ChoiceTiles';
export { EquipmentCuisineSection, type EquipmentCuisineSectionProps, type EquipmentCuisineValue } from './EquipmentCuisineSection';
export { StoresSection, storeServiceLabels, type StoresSectionProps } from './StoresSection';
export { MealSlotsSection, type MealSlotsSectionProps } from './MealSlotsSection';
export * from './profileOptions';
