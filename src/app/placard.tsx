/**
 * (V2, inclus en gratuit) « Mon placard » — anti-gaspi.
 *
 * Ce qu'on a déjà à la maison est déduit de la liste de courses. En tête,
 * ce qui périme bientôt ; puis des recettes sûres qui écoulent les restes ;
 * puis tout le placard. Ajouter (catalogue ou texte libre, quantité, date
 * limite), modifier, « Tout utilisé », retirer — avec annulation.
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { AlarmClock, Lightbulb, Plus } from 'lucide-react-native';

import { EmptyBasket } from '@/components/brand';
import {
  AddPantrySheet,
  LeftoverCard,
  leftoverUsesLabel,
  pantryAisle,
  pantryCountLabel,
  PantryItemRow,
  PantryItemSheet,
  splitPantry,
  type PantryDraft,
  type PantryEdit,
} from '@/components/feature/pantry';
import { Button, EmptyState, Screen, SectionHeader, Skeleton, staggerEntering, Text, useToast } from '@/components/ui';
import type { PantryItem } from '@/core';
import { foldText } from '@/core';
import { useHydrated } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { getList, useExpiringSoon, useLeftoverSuggestions, usePantryStore, useWeekStore } from '@/stores';
import { boxShadow, useTheme } from '@/theme';

export default function PantryScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const hydrated = useHydrated();
  const catalog = useCatalog();
  const today = useWeekStore((s) => s.today);
  const items = usePantryStore((s) => s.items);
  const expiring = useExpiringSoon(3);
  const suggestions = useLeftoverSuggestions(8);
  const { soon, rest } = useMemo(() => splitPantry(items, expiring), [items, expiring]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = editingId ? (items.find((p) => p.id === editingId) ?? null) : null;

  const back = () => (router.canGoBack() ? router.back() : router.replace('/liste' as Href));
  const pantry = () => usePantryStore.getState();

  /**
   * Annulation : remet l'article ET sa semaine d'origine en une seule mise à
   * jour (sinon le surplus d'une liste serait redéduit de cette même liste).
   */
  const restore = (item: PantryItem, origin: string | undefined) => {
    haptics.select();
    usePantryStore.setState((s) => ({
      items: s.items.some((p) => p.id === item.id) ? s.items : [...s.items, item],
      origins: origin ? { ...s.origins, [item.id]: origin } : s.origins,
    }));
  };

  const finishItem = (item: PantryItem) => {
    const origin = pantry().origins[item.id];
    setEditingId(null);
    pantry().consume(item.id, item.quantity);
    toast.show({
      title: 'Zéro gaspi, bravo !',
      message: `${item.label} : terminé.`,
      tone: 'success',
      action: { label: 'Annuler', onPress: () => restore(item, origin) },
    });
  };

  const remove = (item: PantryItem) => {
    const origin = pantry().origins[item.id];
    setEditingId(null);
    pantry().remove(item.id);
    toast.show({
      title: 'Retiré du placard',
      message: item.label,
      tone: 'neutral',
      action: { label: 'Annuler', onPress: () => restore(item, origin) },
    });
  };

  const save = (item: PantryItem, edit: PantryEdit) => {
    setEditingId(null);
    const s = pantry();
    if (edit.quantity < item.quantity) s.consume(item.id, item.quantity - edit.quantity);
    const patch: Partial<Pick<PantryItem, 'quantity' | 'expiresAt'>> = {};
    if (edit.quantity > item.quantity) patch.quantity = edit.quantity;
    if ((edit.expiresAt ?? '') !== (item.expiresAt?.slice(0, 10) ?? '')) patch.expiresAt = edit.expiresAt;
    if (Object.keys(patch).length > 0) s.update(item.id, patch);
    haptics.success();
  };

  const add = (draft: PantryDraft) => {
    // Était-il sur la liste de la semaine ? (la liste va le déduire toute seule)
    const key = foldText(draft.label.trim());
    const onList = getList().items.some(
      (i) => !i.checked && (draft.ingredientId ? i.ingredientId === draft.ingredientId : foldText(i.label.trim()) === key),
    );
    const created = pantry().add(draft);
    setAdding(false);
    if (!created) return;
    toast.show({
      title: 'Ajouté au placard',
      message: onList ? `${created.label} : ta liste en tient compte.` : created.label,
      tone: 'success',
    });
  };

  const openRecipe = (id: string) => router.push({ pathname: '/recette/[id]', params: { id } } as unknown as Href);

  if (!hydrated) {
    return (
      <Screen title="Mon placard" onBack={back} scroll={false}>
        <View style={{ gap: t.spacing.md }} accessibilityLabel="Chargement de ton placard">
          <Skeleton height={140} radius={t.radius.lg} />
          <Skeleton height={160} radius={t.radius.lg} />
        </View>
      </Screen>
    );
  }

  const empty = items.length === 0;
  const layout = LinearTransition.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness);

  const renderRows = (list: readonly PantryItem[], offset: number) =>
    list.map((item, i) => (
      <Animated.View key={item.id} entering={staggerEntering(offset + i)} exiting={FadeOut.duration(t.motion.duration.fast)} layout={layout}>
        <PantryItemRow
          item={item}
          aisle={pantryAisle(item, catalog.ingredientsById)}
          today={today}
          divider={i > 0}
          onPress={() => setEditingId(item.id)}
          onUseAll={() => finishItem(item)}
          onRemove={() => remove(item)}
          testID={`pantry-${item.id}`}
        />
      </Animated.View>
    ));

  const card = (children: React.ReactNode, highlight = false) => (
    <View style={{ borderRadius: t.radius.lg, boxShadow: boxShadow('sm', c.shadow) }}>
      <View
        style={[
          styles.card,
          {
            backgroundColor: c.surface,
            borderRadius: t.radius.lg,
            borderColor: highlight ? c.accent : c.border,
            borderWidth: highlight ? 1.5 : StyleSheet.hairlineWidth * 2,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );

  return (
    <View style={styles.root} testID="pantry-screen">
      <Screen
        title="Mon placard"
        subtitle="Ce que tu as déjà à la maison est retiré de ta liste de courses."
        onBack={back}
        bottomInset="safe"
        footer={
          empty ? undefined : (
            <Button label="Ajouter au placard" leftIcon={Plus} size="lg" fullWidth onPress={() => setAdding(true)} testID="pantry-add" />
          )
        }
      >
        {empty ? (
          <EmptyState
            illustration={<EmptyBasket size={140} />}
            title="Ton placard est vide"
            body="Note ce que tu as déjà : Cabas le retire de ta liste et te souffle des recettes anti-gaspi."
            action={{ label: 'Ajouter un aliment', leftIcon: Plus, onPress: () => setAdding(true) }}
          />
        ) : (
          <Animated.View layout={layout} style={{ gap: t.spacing.xxl, paddingTop: t.spacing.sm }}>
            {soon.length > 0 ? (
              <Animated.View layout={layout} style={{ gap: t.spacing.sm }} testID="pantry-soon">
                <SectionHeader
                  title="À consommer vite"
                  subtitle="Cuisine-les en premier."
                  right={<AlarmClock size={t.iconSize.md} color={c.danger} strokeWidth={2.2} />}
                />
                {card(renderRows(soon, 0), true)}
              </Animated.View>
            ) : null}

            {suggestions.length > 0 ? (
              <Animated.View layout={layout} style={{ gap: t.spacing.sm }} testID="pantry-ideas">
                <SectionHeader title="Idées anti-gaspi" subtitle="Des recettes sûres pour ton foyer, avec tes restes." />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginHorizontal: -t.spacing.screen }}
                  contentContainerStyle={{ paddingHorizontal: t.spacing.screen, paddingVertical: t.spacing.xs, gap: t.spacing.md }}
                >
                  {suggestions.map((s, i) => (
                    <Animated.View key={s.recipe.id} entering={staggerEntering(i)}>
                      <LeftoverCard
                        recipe={s.recipe}
                        uses={leftoverUsesLabel(s.matchedIngredientIds, catalog.ingredientsById)}
                        onPress={() => openRecipe(s.recipe.id)}
                        testID={`leftover-${i}`}
                      />
                    </Animated.View>
                  ))}
                </ScrollView>
              </Animated.View>
            ) : null}

            {rest.length > 0 ? (
              <Animated.View layout={layout} style={{ gap: t.spacing.sm }} testID="pantry-all">
                <SectionHeader title={soon.length > 0 ? 'Le reste du placard' : 'Dans mon placard'} subtitle={pantryCountLabel(rest.length)} />
                {card(renderRows(rest, soon.length))}
              </Animated.View>
            ) : null}

            <View style={[styles.tip, { gap: t.spacing.sm, paddingHorizontal: t.spacing.xs }]}>
              <Lightbulb size={t.iconSize.sm} color={c.textTertiary} style={styles.tipIcon} />
              <Text variant="footnote" color="textSecondary" style={styles.flex}>
                Après tes courses, « Ranger le reste au placard » depuis ta liste ajoute ici le surplus des paquets entamés.
              </Text>
            </View>
          </Animated.View>
        )}
      </Screen>

      <PantryItemSheet
        visible={!!editing}
        item={editing}
        today={today}
        onClose={() => setEditingId(null)}
        onSave={(edit) => editing && save(editing, edit)}
        onUseAll={() => editing && finishItem(editing)}
        onRemove={() => editing && remove(editing)}
      />
      <AddPantrySheet visible={adding} ingredients={catalog.ingredients} today={today} onClose={() => setAdding(false)} onAdd={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  card: { overflow: 'hidden' },
  tip: { flexDirection: 'row', alignItems: 'flex-start' },
  tipIcon: { marginTop: 1 },
});
