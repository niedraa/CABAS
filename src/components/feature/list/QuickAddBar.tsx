/**
 * Ajout rapide d'un article à la main : un seul champ, quantité facultative
 * comprise à la volée (« 2 baguettes », « 500 g de farine », « lait 1 l »).
 * Aperçu en direct du rayon deviné et de la quantité avant validation.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ArrowUp, Plus } from 'lucide-react-native';

import { IconButton, Text, TextField, type TextFieldRef } from '@/components/ui';
import { AISLE_LABELS } from '@/core';
import { haptics } from '@/lib/haptics';
import { aisleColors, useTheme } from '@/theme';

import { parseQuickAdd, quickAddPreview, type QuickAdd } from './listView';

export interface QuickAddBarProps {
  onAdd: (entry: QuickAdd) => void;
  placeholder?: string;
  testID?: string;
}

export function QuickAddBar({ onAdd, placeholder = 'Ajouter (ex. 2 baguettes)', testID }: QuickAddBarProps) {
  const t = useTheme();
  const [text, setText] = useState('');
  const input = useRef<TextFieldRef>(null);
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const preview = quickAddPreview(parsed);

  const submit = () => {
    if (!parsed) {
      haptics.warning();
      input.current?.focus();
      return;
    }
    onAdd(parsed);
    setText('');
  };

  return (
    <View style={{ gap: t.spacing.xs }} testID={testID}>
      <TextField
        ref={input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        accessibilityLabel="Ajouter un article à la liste"
        accessibilityHint="Tu peux préciser la quantité : 2 baguettes, 500 g de farine."
        leftIcon={Plus}
        shape="pill"
        returnKeyType="done"
        submitBehavior="submit"
        blurOnSubmit={false}
        onSubmitEditing={submit}
        autoCorrect={false}
        testID={testID ? `${testID}-input` : undefined}
        right={
          <View style={[styles.send, { marginRight: -t.spacing.xs }]}>
            <IconButton
              icon={ArrowUp}
              variant={parsed ? 'filled' : 'tonal'}
              size="sm"
              accessibilityLabel={parsed ? `Ajouter ${parsed.label}` : 'Ajouter'}
              disabled={!parsed}
              haptic="impact"
              onPress={submit}
              testID={testID ? `${testID}-submit` : undefined}
            />
          </View>
        }
      />
      {preview && parsed ? (
        <Animated.View
          entering={FadeIn.duration(t.motion.duration.fast)}
          exiting={FadeOut.duration(t.motion.duration.instant)}
          style={[styles.preview, { gap: t.spacing.xs, paddingHorizontal: t.spacing.lg }]}
          accessibilityLiveRegion="polite"
          testID={testID ? `${testID}-preview` : undefined}
        >
          <View style={[styles.dot, { backgroundColor: aisleColors[preview.aisle] ?? aisleColors.autre, borderRadius: t.radius.pill }]} />
          <Text variant="footnote" color="textSecondary" numberOfLines={1} style={styles.flex}>
            {AISLE_LABELS[preview.aisle]}
            {preview.quantity ? ` · ${preview.quantity}` : ''}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  send: {},
  preview: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8 },
  flex: { flex: 1 },
});
