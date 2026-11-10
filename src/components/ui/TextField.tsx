/**
 * Champ de saisie : libellé au-dessus, bordure qui s'allume au focus
 * (interpolation de couleur), message d'aide ou d'erreur, bouton « effacer ».
 */
import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import { CircleAlert, X } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  helper?: string;
  error?: string | null;
  leftIcon?: IconLike;
  /** Affiche un bouton « effacer » quand le champ n'est pas vide. */
  clearable?: boolean;
  /** Élément à droite (unité « € », bouton…). */
  right?: React.ReactNode;
  shape?: 'rounded' | 'pill';
  containerStyle?: StyleProp<ViewStyle>;
}

export type TextFieldRef = React.ComponentRef<typeof TextInput>;

export const TextField = forwardRef<TextFieldRef, TextFieldProps>(function TextField(
  {
    label,
    helper,
    error,
    leftIcon,
    clearable,
    right,
    shape = 'rounded',
    containerStyle,
    value,
    onChangeText,
    onFocus,
    onBlur,
    editable = true,
    accessibilityLabel,
    ...rest
  },
  ref,
) {
  const t = useTheme();
  const c = t.colors;
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  const focus = useDerivedValue(() => withSpring(focused ? 1 : 0, t.motion.springSnappy), [focused]);
  const frameStyle = useAnimatedStyle(() => ({
    borderColor: hasError ? c.danger : interpolateColor(focus.get(), [0, 1], [c.border, c.primary]),
    // Halo doux au focus.
    boxShadow: `0px 0px 0px ${3 * focus.get()}px ${hasError ? c.dangerSoft : c.primarySoft}`,
  }));

  const showClear = clearable && editable && !!value && value.length > 0;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="subhead" color="text" style={styles.label} nativeID={label}>
          {label}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.frame,
          {
            backgroundColor: editable ? c.surface : c.backgroundAlt,
            borderRadius: shape === 'pill' ? t.radius.pill : t.radius.md,
            minHeight: 52,
          },
          frameStyle,
        ]}
      >
        {leftIcon ? <View style={styles.left}>{renderIcon(leftIcon, { size: 20, color: c.textSecondary })}</View> : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityLabelledBy={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={c.textTertiary}
          selectionColor={c.primary}
          cursorColor={c.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            t.typography.body,
            styles.input,
            { color: c.text, paddingLeft: leftIcon ? 0 : 16, paddingRight: showClear || right ? 4 : 16 },
          ]}
          {...rest}
        />
        {showClear ? (
          <PressableScale
            accessibilityLabel="Effacer"
            haptic="tap"
            scaleTo={0.85}
            hitSlop={8}
            onPress={() => onChangeText?.('')}
            style={[styles.clear, { backgroundColor: c.backgroundAlt }]}
          >
            <X size={14} color={c.textSecondary} strokeWidth={2.6} />
          </PressableScale>
        ) : null}
        {right ? <View style={styles.right}>{right}</View> : null}
      </Animated.View>
      {hasError ? (
        <View style={styles.message} accessibilityLiveRegion="polite">
          <CircleAlert size={14} color={c.danger} strokeWidth={2.4} />
          <Text variant="footnote" color="danger" style={styles.flex}>
            {error}
          </Text>
        </View>
      ) : helper ? (
        <Text variant="footnote" color="textSecondary" style={styles.messageText}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { marginLeft: 4 },
  frame: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5 },
  left: { paddingLeft: 14, paddingRight: 10 },
  // Le cadre animé montre déjà le focus : pas de contour navigateur en plus (web).
  input: { flex: 1, minHeight: 50, paddingVertical: 12, outlineStyle: 'solid', outlineWidth: 0 },
  clear: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  right: { paddingRight: 14 },
  message: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 4 },
  messageText: { marginLeft: 4 },
  flex: { flex: 1 },
});
