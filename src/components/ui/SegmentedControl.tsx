/**
 * Contrôle segmenté avec pastille glissante (ressort `springIndicator`).
 * Ex. « Le moins cher | Un seul magasin », « Midi | Soir ».
 */
import React, { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { boxShadow, useTheme } from '@/theme';

import { renderIcon, type IconLike } from './icon';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconLike;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const PAD = 4;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const t = useTheme();
  const c = t.colors;
  const [width, setWidth] = useState(0);
  const count = Math.max(1, options.length);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segW = width > 0 ? (width - PAD * 2) / count : 0;
  const height = size === 'sm' ? 38 : 46;

  const x = useDerivedValue(() => withSpring(index * segW, t.motion.springIndicator), [index, segW]);
  const indicatorStyle = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: x.get() }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { height, borderRadius: t.radius.pill, backgroundColor: c.backgroundAlt, padding: PAD },
        style,
      ]}
    >
      {segW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              top: PAD,
              bottom: PAD,
              left: PAD,
              borderRadius: t.radius.pill,
              backgroundColor: c.surfaceElevated,
              boxShadow: boxShadow('sm', c.shadow),
            },
            indicatorStyle,
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        const fg = active ? c.text : c.textSecondary;
        return (
          <PressableScale
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            haptic="select"
            scaleTo={0.96}
            onPress={() => {
              if (!active) onChange(o.value);
            }}
            style={styles.segment}
          >
            {renderIcon(o.icon, { size: 16, color: fg })}
            <Text variant={size === 'sm' ? 'subhead' : 'bodyMedium'} style={{ color: fg }} numberOfLines={1}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'stretch' },
  indicator: { position: 'absolute' },
  segment: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});
