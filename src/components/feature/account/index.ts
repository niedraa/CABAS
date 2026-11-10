/**
 * Compte & réglages : briques de l'onglet Profil et des écrans
 * `src/app/parametres/*` (édition du profil, notifications, apparence,
 * abonnement, compte & données RGPD).
 *
 * ```tsx
 * <ProfileHeader name={displayNameOf(profile)} household={profile.household} onPress={…} />
 * <SubscriptionCard status={subscriptionStatus(state)} trialDays={7} onUpgrade={…} onManage={…} />
 * <SettingsGroup title="Réglages"><SettingsRow title="Notifications" icon={Bell} chevron onPress={…} /></SettingsGroup>
 * <ProfileSectionEditor section="regime" draft={draft} onChange={patch} ingredients={…} stores={…} freeLimit={3} />
 * ```
 */
export { ProfileHeader, type ProfileHeaderProps } from './ProfileHeader';
export { SubscriptionCard, type SubscriptionCardProps } from './SubscriptionCard';
export { SettingsGroup, SettingsRow, type SettingsGroupProps } from './SettingsGroup';
export { ProfileSectionRow, type ProfileSectionRowProps } from './ProfileSectionRow';
export { ShortcutTile, type ShortcutTileProps } from './ShortcutTile';
export { ThemePicker, type ThemePickerProps } from './ThemePicker';
export { WeekdayPicker, type WeekdayPickerProps } from './WeekdayPicker';
export { ProfileSectionEditor, type ProfileSectionEditorProps } from './ProfileSectionEditor';
export * from './profileSections';
export * from './settingsOptions';
