/**
 * Kit UI de Cabas — direction artistique « Marché frais ».
 * Tout composant d'écran doit être construit à partir de ces briques.
 * Galerie de contrôle visuel : route `/design-system`.
 */
export { Text, type TextProps, type ThemeColorKey } from './Text';
export { PressableScale, type PressableScaleProps, type HapticKind } from './PressableScale';
export { Stack, Row, type StackProps, type SpacingKey } from './Stack';
export { renderIcon, type IconComponent, type IconLike, type IconProps } from './icon';
export { useSafeInsets } from './useSafeInsets';
export { usePresence } from './usePresence';

export { Screen, type ScreenProps } from './Screen';
export { TopBar, Header, TOP_BAR_HEIGHT, type TopBarProps } from './TopBar';

export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { IconButton, type IconButtonProps, type IconButtonVariant } from './IconButton';
export { FAB, type FABProps } from './FAB';
export { Card, type CardProps, type CardVariant } from './Card';

export { Chip, ToggleChip, type ChipProps, type ToggleChipProps } from './Chip';
export { ChipGroup, type ChipGroupProps, type ChipOption } from './ChipGroup';
export { Stepper, type StepperProps } from './Stepper';
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from './SegmentedControl';
export { Switch, type SwitchProps } from './Switch';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { TextField, type TextFieldProps, type TextFieldRef } from './TextField';
export { SearchField, type SearchFieldProps } from './SearchField';

export { ListRow, type ListRowProps } from './ListRow';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { Divider, type DividerProps } from './Divider';
export { KeyValueRow, type KeyValueRowProps } from './KeyValueRow';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { InfoBanner, type InfoBannerProps, type InfoBannerTone } from './InfoBanner';
export { Avatar, type AvatarProps } from './Avatar';

export { PriceTag, type PriceTagProps, type PriceTagSize } from './PriceTag';
export { AnimatedNumber, AnimatedPrice, type AnimatedNumberProps, type AnimatedPriceProps } from './AnimatedNumber';
export {
  StoreBadge,
  StoreBadgeStack,
  STORE_MONOGRAMS,
  storeBadgeName,
  storeStackLabel,
  type StoreBadgeProps,
  type StoreBadgeSize,
} from './StoreBadge';
export { RecipeThumb, pastelFor, type RecipeThumbProps, type RecipeThumbSize } from './RecipeThumb';

export { ProgressBar, ProgressRing, type ProgressBarProps, type ProgressRingProps, type ProgressTone } from './Progress';
export { Skeleton, SkeletonText, type SkeletonProps } from './Skeleton';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { StaggeredList, staggerEntering, type StaggeredListProps } from './StaggeredList';

export { Sheet, type SheetProps } from './Sheet';
export { ToastProvider, useToast, type ToastApi, type ToastOptions, type ToastTone } from './Toast';
export { Dialog, ConfirmDialog, type DialogProps, type ConfirmDialogProps } from './Dialog';
export {
  AnimatedTabBar,
  type AnimatedTabBarProps,
  type TabBarOptionsLike,
  type TabRouteLike,
  type TabEventEmitterLike,
} from './AnimatedTabBar';
