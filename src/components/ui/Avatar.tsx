/**
 * Avatar à initiales (ou emoji) sur pastel déterministe.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { initialsOf } from '@/lib/format';
import { useTheme } from '@/theme';

import { pastelFor } from './RecipeThumb';
import { Text } from './Text';

export interface AvatarProps {
  name: string;
  emoji?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ name, emoji, size = 44, style }: AvatarProps) {
  const t = useTheme();
  const pastel = pastelFor(name);
  const fontSize = Math.round(size * (emoji ? 0.5 : 0.38));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Avatar de ${name}`}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.scheme === 'dark' ? pastel.dark : pastel.light,
        },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize,
          lineHeight: Math.round(fontSize * 1.2),
          fontFamily: emoji ? undefined : t.typography.title3.fontFamily,
          color: t.colors.text,
        }}
      >
        {emoji ?? initialsOf(name)}
      </Text>
    </View>
  );
}
