/**
 * Ajouter au placard : recherche d'un ingrédient du catalogue (ou texte
 * libre), puis quantité et date limite facultative.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Plus, RefreshCw } from 'lucide-react-native';

import { AISLE_EMOJI, QuantityField } from '@/components/feature/list';
import { Button, Divider, ListRow, PressableScale, SearchField, Sheet, Text } from '@/components/ui';
import type { Aisle, BaseUnit, Ingredient } from '@/core';
import { AISLE_LABELS, capitalize, foldText, guessAisle } from '@/core';
import { aisleColors, useTheme, withAlpha } from '@/theme';

import { ExpiryPicker } from './ExpiryPicker';
import { defaultQuantity, searchIngredients } from './pantryView';

export interface PantryDraft {
  label: string;
  quantity: number;
  unit: BaseUnit;
  ingredientId?: string;
  expiresAt?: string;
}

export interface AddPantrySheetProps {
  visible: boolean;
  ingredients: readonly Ingredient[];
  today: string;
  onClose: () => void;
  onAdd: (draft: PantryDraft) => void;
}

export function AddPantrySheet({ visible, ingredients, today, onClose, onAdd }: AddPantrySheetProps) {
  // Chaque ouverture repart d'un formulaire vierge (le contenu reste monté
  // pendant l'animation de sortie).
  const [session, setSession] = useState({ n: 0, open: visible });
  if (session.open !== visible) setSession({ n: visible ? session.n + 1 : session.n, open: visible });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ajouter au placard"
      subtitle="Cabas le retire de ta liste de courses."
      snapPoints={[0.86]}
      scrollable
      testID="pantry-add-sheet"
    >
      <AddForm key={session.n} ingredients={ingredients} today={today} onAdd={onAdd} />
    </Sheet>
  );
}

interface Choice {
  label: string;
  ingredientId?: string;
  unit: BaseUnit;
  aisle: Aisle;
}

const FREE_UNITS: readonly BaseUnit[] = ['piece', 'g', 'ml'];

function AddForm({ ingredients, today, onAdd }: { ingredients: readonly Ingredient[]; today: string; onAdd: (d: PantryDraft) => void }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);

  const results = useMemo(() => searchIngredients(ingredients, query, 6), [ingredients, query]);
  const q = query.trim();
  const exact = results.some((i) => foldText(i.name) === foldText(q));

  const pick = (c: Choice) => {
    setChoice(c);
    setQuantity(defaultQuantity(c.unit));
  };

  if (!choice) {
    return (
      <View style={{ gap: t.spacing.md }}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Œufs, riz, reste de soupe…"
          accessibilityLabel="Chercher un aliment"
          autoFocus
          testID="pantry-search"
        />
        {q.length === 0 ? (
          <Text variant="footnote" color="textSecondary">
            Cherche un aliment du catalogue, ou écris ce que tu veux.
          </Text>
        ) : (
          <Animated.View layout={LinearTransition} style={{ gap: t.spacing.xxs }}>
            {results.map((ing, i) => (
              <Animated.View key={ing.id} entering={FadeInDown.delay(i * t.motion.stagger).springify().damping(t.motion.spring.damping)}>
                {i > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  left={<AisleThumb aisle={ing.aisle} />}
                  title={capitalize(ing.name)}
                  subtitle={AISLE_LABELS[ing.aisle]}
                  onPress={() => pick({ label: capitalize(ing.name), ingredientId: ing.id, unit: ing.baseUnit, aisle: ing.aisle })}
                  testID={`pantry-result-${ing.id}`}
                />
              </Animated.View>
            ))}
            {!exact ? (
              <Animated.View entering={FadeIn}>
                {results.length > 0 ? <Divider inset={52} /> : null}
                <ListRow
                  icon={Plus}
                  title={`Ajouter « ${q} »`}
                  subtitle="Texte libre"
                  onPress={() => pick({ label: capitalize(q), unit: 'piece', aisle: guessAisle(q) })}
                  testID="pantry-result-free"
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(t.motion.duration.base)} style={{ gap: t.spacing.xl }}>
      <View style={[styles.chosen, { gap: t.spacing.md }]}>
        <AisleThumb aisle={choice.aisle} />
        <View style={styles.flex}>
          <Text variant="headline" numberOfLines={2}>
            {choice.label}
          </Text>
          <Text variant="footnote" color="textSecondary">
            {choice.ingredientId ? AISLE_LABELS[choice.aisle] : 'Texte libre'}
          </Text>
        </View>
        <PressableScale
          onPress={() => setChoice(null)}
          accessibilityLabel="Changer d’aliment"
          hitSlop={t.layout.hitSlop}
          style={[styles.change, { gap: t.spacing.xs }]}
          testID="pantry-change"
        >
          <RefreshCw size={t.iconSize.xs} color={t.scheme === 'dark' ? t.colors.primary : t.colors.success} strokeWidth={2.4} />
          <Text variant="subhead" style={{ color: t.scheme === 'dark' ? t.colors.primary : t.colors.success, fontFamily: t.typography.headline.fontFamily }}>
            Changer
          </Text>
        </PressableScale>
      </View>
      <QuantityField
        value={quantity}
        unit={choice.unit}
        onChange={setQuantity}
        units={choice.ingredientId ? undefined : FREE_UNITS}
        onUnitChange={(u) => {
          setChoice({ ...choice, unit: u });
          setQuantity(defaultQuantity(u));
        }}
        testID="pantry-add-quantity"
      />
      <ExpiryPicker value={expiresAt} onChange={setExpiresAt} today={today} testID="pantry-add-expiry" />
      <Button
        label="Ajouter au placard"
        size="lg"
        fullWidth
        leftIcon={Plus}
        disabled={!(quantity > 0)}
        onPress={() => onAdd({ label: choice.label, quantity, unit: choice.unit, ingredientId: choice.ingredientId, expiresAt })}
        testID="pantry-add-submit"
      />
    </Animated.View>
  );
}

function AisleThumb({ aisle }: { aisle: Aisle }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.thumb,
        { borderRadius: t.radius.sm, backgroundColor: withAlpha(aisleColors[aisle] ?? aisleColors.autre, t.scheme === 'dark' ? 0.3 : 0.2) },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text style={styles.emoji} allowFontScaling={false}>
        {AISLE_EMOJI[aisle]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chosen: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  change: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  thumb: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 20, lineHeight: 26 },
});
