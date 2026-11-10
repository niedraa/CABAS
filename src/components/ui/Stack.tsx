/**
 * Empilement avec espacement de la grille 4 pt (`gap`).
 * `Stack` vertical par défaut, `Row` horizontal centré verticalement.
 */
import React from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

export type SpacingKey = keyof typeof spacing;

export interface StackProps extends ViewProps {
  gap?: SpacingKey;
  direction?: 'column' | 'row';
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  flex?: number;
  padding?: SpacingKey;
}

export function Stack({
  gap = 'md',
  direction = 'column',
  align,
  justify,
  wrap,
  flex,
  padding,
  style,
  ...rest
}: StackProps) {
  return (
    <View
      style={[
        {
          flexDirection: direction,
          gap: spacing[gap],
          alignItems: align,
          justifyContent: justify,
          flexWrap: wrap ? 'wrap' : 'nowrap',
          flex,
          padding: padding ? spacing[padding] : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Row(props: StackProps) {
  return <Stack direction="row" align="center" {...props} />;
}
