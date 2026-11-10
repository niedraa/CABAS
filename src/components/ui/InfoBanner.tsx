/**
 * Bandeau d'information (astuce, avertissement, premium, hors-ligne).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CircleAlert, CircleCheck, Info, Lightbulb, Sparkles, TriangleAlert, X } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type InfoBannerTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'premium' | 'tip';

export interface InfoBannerProps {
  tone?: InfoBannerTone;
  title?: string;
  message: string;
  icon?: IconLike;
  action?: { label: string; onPress: () => void };
  onClose?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function InfoBanner({ tone = 'info', title, message, icon, action, onClose, style }: InfoBannerProps) {
  const t = useTheme();
  const c = t.colors;
  const map: Record<InfoBannerTone, { bg: string; fg: string; icon: IconLike }> = {
    info: { bg: c.infoSoft, fg: c.info, icon: Info },
    success: { bg: c.successSoft, fg: c.success, icon: CircleCheck },
    warning: { bg: c.accentSoft, fg: c.accentText, icon: TriangleAlert },
    danger: { bg: c.dangerSoft, fg: c.danger, icon: CircleAlert },
    neutral: { bg: c.backgroundAlt, fg: c.textSecondary, icon: Info },
    premium: { bg: c.hero, fg: c.accent, icon: Sparkles },
    tip: { bg: c.accentSoft, fg: c.accentText, icon: Lightbulb },
  };
  const m = map[tone];
  const textColor = tone === 'premium' ? c.heroText : c.text;
  return (
    <View
      accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : 'summary'}
      style={[styles.base, { backgroundColor: m.bg, borderRadius: t.radius.lg }, style]}
    >
      <View style={styles.icon}>{renderIcon(icon ?? m.icon, { size: 20, color: m.fg })}</View>
      <View style={styles.texts}>
        {title ? (
          <Text variant="headline" style={{ color: textColor }}>
            {title}
          </Text>
        ) : null}
        <Text variant="footnote" style={{ color: tone === 'premium' ? c.heroText : c.textSecondary, opacity: tone === 'premium' ? 0.85 : 1 }}>
          {message}
        </Text>
        {action ? (
          <PressableScale onPress={action.onPress} accessibilityLabel={action.label} style={styles.action} hitSlop={8}>
            <Text variant="subhead" style={{ color: m.fg, fontFamily: t.typography.headline.fontFamily }}>
              {action.label} →
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {onClose ? (
        <PressableScale onPress={onClose} accessibilityLabel="Fermer" hitSlop={10} scaleTo={0.85} style={styles.close}>
          <X size={18} color={tone === 'premium' ? c.heroText : c.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', padding: 14, gap: 12, alignItems: 'flex-start' },
  icon: { paddingTop: 1 },
  texts: { flex: 1, gap: 2 },
  action: { marginTop: 6, alignSelf: 'flex-start' },
  close: { padding: 2 },
});
