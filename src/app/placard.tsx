/**
 * Placard anti-gaspi : ce qu'il y a déjà à la maison (retiré automatiquement
 * de la liste de courses), dates limites, et recettes pour écouler les restes.
 * Ajout libre ou lié à un ingrédient du catalogue (pour la déduction).
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { AlarmClock, Minus, Plus, Trash2 } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import { searchIngredients } from '@/components/feature/profile';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  FAB,
  IconButton,
  InfoBanner,
  RecipeThumb,
  Screen,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Stack,
  Text,
  TextField,
  useToast,
} from '@/components/ui';
import { addDays, daysBetween, formatQuantity, parseDecimalFr, todayISO, type BaseUnit, type PantryItem } from '@/core';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { useExpiringSoon, useLeftoverSuggestions, usePantryStore } from '@/stores';
import { useTheme } from '@/theme';

const EXPIRY_CHOICES = [
  { label: 'Pas de date', days: null },
  { label: '3 jours', days: 3 },
  { label: '1 semaine', days: 7 },
  { label: '1 mois', days: 30 },
] as const;

function expiryLabel(item: PantryItem, today: string): { label: string; tone: 'danger' | 'accent' | 'neutral' } | null {
  if (!item.expiresAt) return null;
  const d = daysBetween(today, item.expiresAt.slice(0, 10));
  if (d < 0) return { label: 'Périmé', tone: 'danger' };
  if (d === 0) return { label: 'Aujourd’hui', tone: 'danger' };
  if (d <= 3) return { label: `${d} j`, tone: 'accent' };
  return { label: `${d} j`, tone: 'neutral' };
}

/** Pas de consommation « −1 » adapté à l'unité. */
function stepFor(unit: BaseUnit): number {
  return unit === 'piece' ? 1 : 100;
}

export default function PantryScreen() {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const items = usePantryStore((s) => s.items);
  const expiring = useExpiringSoon(3);
  const suggestions = useLeftoverSuggestions(6);
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/profil' as Href));

  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ea = a.expiresAt?.slice(0, 10) ?? '9999';
        const eb = b.expiresAt?.slice(0, 10) ?? '9999';
        return ea < eb ? -1 : ea > eb ? 1 : a.label.localeCompare(b.label, 'fr');
      }),
    [items],
  );

  const remove = (item: PantryItem) => {
    usePantryStore.getState().remove(item.id);
    haptics.select();
    toast.show({
      title: `${item.label} retiré`,
      tone: 'neutral',
      action: { label: 'Annuler', onPress: () => usePantryStore.getState().setItems([...usePantryStore.getState().items, item]) },
    });
  };

  return (
    <Screen
      title="Placard"
      subtitle="Ce que tu as déjà : Cabas le retire de ta liste."
      onBack={close}
      bottomInset="safe"
      testID="pantry-screen"
    >
      <View style={{ gap: t.spacing.xl, paddingBottom: 80 }}>
        {expiring.length > 0 ? (
          <InfoBanner
            tone="warning"
            icon={AlarmClock}
            title={`${expiring.length} article${expiring.length > 1 ? 's' : ''} à consommer vite`}
            message={expiring.map((p) => p.label).slice(0, 4).join(', ')}
          />
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            illustration={<EmptyBasket size={140} />}
            title="Ton placard est vide"
            body="Ajoute ce qui te reste (riz, crème, légumes…) : Cabas l’enlève de ta liste et te propose des recettes pour ne rien gaspiller."
            action={{ label: 'Ajouter un article', leftIcon: Plus, onPress: () => setAdding(true) }}
          />
        ) : (
          <View>
            <SectionHeader title="À la maison" subtitle={`${items.length} article${items.length > 1 ? 's' : ''}`} />
            <Card variant="plain" padding="sm" radius="lg">
              {sorted.map((item) => {
                const exp = expiryLabel(item, today);
                return (
                  <Animated.View key={item.id} entering={FadeIn} layout={LinearTransition} style={[styles.row, { padding: t.spacing.sm }]} testID={`pantry-${item.id}`}>
                    <View style={styles.flex}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text variant="footnote" color="textSecondary">
                        {formatQuantity(item.quantity, item.unit)}
                        {item.ingredientId ? ' · déduit de ta liste' : ''}
                      </Text>
                    </View>
                    {exp ? <Badge label={exp.label} tone={exp.tone} size="sm" icon={AlarmClock} /> : null}
                    <IconButton
                      icon={Minus}
                      size="sm"
                      variant="tonal"
                      accessibilityLabel={`Utiliser ${formatQuantity(stepFor(item.unit), item.unit)} de ${item.label}`}
                      onPress={() => {
                        haptics.select();
                        usePantryStore.getState().consume(item.id, Math.min(item.quantity, stepFor(item.unit)));
                      }}
                    />
                    <IconButton icon={Trash2} size="sm" variant="plain" accessibilityLabel={`Retirer ${item.label}`} onPress={() => remove(item)} />
                  </Animated.View>
                );
              })}
            </Card>
          </View>
        )}

        {suggestions.length > 0 ? (
          <View>
            <SectionHeader title="Idées anti-gaspi" subtitle="Des recettes qui utilisent tes restes" />
            <View style={{ gap: t.spacing.sm }}>
              {suggestions.map((s) => (
                <Card
                  key={s.recipe.id}
                  variant="plain"
                  padding="md"
                  radius="lg"
                  onPress={() => router.push({ pathname: '/recette/[id]', params: { id: s.recipe.id } } as unknown as Href)}
                  accessibilityLabel={`${s.recipe.title}, utilise ${s.matchedIngredientIds.length} de tes restes`}
                >
                  <View style={styles.row}>
                    <RecipeThumb emoji={s.recipe.emoji} seed={s.recipe.id} recipeId={s.recipe.id} size="sm" />
                    <View style={styles.flex}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {s.recipe.title}
                      </Text>
                      <Text variant="footnote" color="textSecondary" numberOfLines={1}>
                        Utilise : {s.matchedIngredientIds.map((id) => catalog.ingredientsById[id]?.name ?? id).join(', ')}
                      </Text>
                    </View>
                    <Badge label={`${Math.round(s.coverage * 100)} %`} tone="success" size="sm" />
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      {items.length > 0 ? <FAB icon={Plus} label="Ajouter" onPress={() => setAdding(true)} bottomOffset={24} testID="pantry-add" /> : null}
      <AddPantrySheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function AddPantrySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const [label, setLabel] = useState('');
  const [ingredientId, setIngredientId] = useState<string | undefined>();
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<BaseUnit>('g');
  const [expiry, setExpiry] = useState<number | null>(null);
  const matches = useMemo(() => (ingredientId ? [] : searchIngredients(catalog.ingredients, label, [], 5)), [catalog, label, ingredientId]);
  const quantity = parseDecimalFr(qty);
  const valid = label.trim().length > 0 && quantity !== null && quantity > 0;

  const reset = () => {
    setLabel('');
    setIngredientId(undefined);
    setQty('');
    setUnit('g');
    setExpiry(null);
  };
  const save = () => {
    if (!valid || quantity === null) return;
    const item = usePantryStore.getState().add({
      label: label.trim(),
      quantity,
      unit,
      ingredientId,
      expiresAt: expiry !== null ? addDays(todayISO(), expiry) : undefined,
    });
    if (item) {
      haptics.success();
      toast.show({ title: `${item.label} au placard`, tone: 'success', duration: 1800 });
      reset();
      onClose();
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ajouter au placard"
      scrollable
      testID="pantry-sheet"
      footer={<Button label="Ajouter" fullWidth disabled={!valid} onPress={save} testID="pantry-save" />}
    >
      <Stack gap="lg">
        <View style={{ gap: t.spacing.sm }}>
          <TextField
            label="Article"
            value={label}
            onChangeText={(v) => {
              setLabel(v);
              setIngredientId(undefined);
            }}
            placeholder="Ex. riz basmati, crème fraîche"
            maxLength={60}
            testID="pantry-label"
          />
          {matches.length > 0 ? (
            <View style={styles.chips}>
              {matches.map((ing) => (
                <Chip
                  key={ing.id}
                  label={ing.name}
                  size="sm"
                  onPress={() => {
                    haptics.select();
                    setLabel(ing.name);
                    setIngredientId(ing.id);
                    setUnit(ing.baseUnit);
                  }}
                  role="button"
                />
              ))}
            </View>
          ) : ingredientId ? (
            <Text variant="caption" color="success">
              ✓ Lié au catalogue : sera retiré de ta liste de courses
            </Text>
          ) : null}
        </View>
        <TextField label="Quantité" value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Ex. 500" testID="pantry-qty" />
        <SegmentedControl<BaseUnit>
          options={[
            { value: 'g', label: 'grammes' },
            { value: 'ml', label: 'millilitres' },
            { value: 'piece', label: 'pièces' },
          ]}
          value={unit}
          onChange={setUnit}
          size="sm"
          accessibilityLabel="Unité"
        />
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="subhead">À consommer avant</Text>
          <View style={styles.chips}>
            {EXPIRY_CHOICES.map((c) => (
              <Chip key={c.label} label={c.label} size="sm" role="radio" selected={expiry === c.days} onPress={() => setExpiry(c.days)} />
            ))}
          </View>
        </View>
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
