/**
 * « Ma liste » — étape 3 du parcours : la liste de courses de la semaine,
 * calculée depuis les repas (conditionnements réels, placard déduit), rangée
 * par rayon dans l'ordre de parcours du magasin. 100 % hors-ligne.
 *
 * Cocher (toucher), ajouter un article libre, modifier / retirer (menu « … »),
 * masquer les articles pris, partager / copier la liste, ranger le surplus au
 * placard après les courses, puis comparer les prix (étape 4).
 */
import { router, type Href } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Archive, ArrowRight, CheckCheck, EyeOff, Eye, Plus, RotateCcw, Scale, Share2, Sparkles, Trash2 } from 'lucide-react-native';

import { EmptyList } from '@/components/brand';
import { AisleHeader, ItemEditSheet, itemSubtitle, ListItemRow, listAsText } from '@/components/feature/list';
import { listEstimateCents } from '@/components/feature/planning';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  InfoBanner,
  ProgressRing,
  Screen,
  Text,
  TextField,
  useToast,
  type TextFieldRef,
} from '@/components/ui';
import { formatPrice, formatWeekRange } from '@/core';
import { useCurrentWeek } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { computeComparison } from '@/services/basket';
import { useCatalog } from '@/services/catalog';
import { shareText } from '@/services/order';
import {
  addFromCheckedList,
  useListProgress,
  useListSections,
  useListStore,
  usePlanStore,
  useProfileStore,
  useWeekList,
  useWeekPlan,
} from '@/stores';
import { useTheme } from '@/theme';

export default function ListScreen() {
  const t = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const week = useCurrentWeek();
  const ws = week.activeWeekStart;
  const profile = useProfileStore((s) => s.profile);
  const plan = useWeekPlan(ws);
  const list = useWeekList(ws);
  const sections = useListSections(ws);
  const progress = useListProgress(ws);

  const [hideChecked, setHideChecked] = useState(false);
  const [draft, setDraft] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const inputRef = useRef<TextFieldRef>(null);

  const items = useMemo(() => list?.items ?? [], [list]);
  const remaining = progress.total - progress.done;
  const editItem = editId ? (items.find((i) => i.id === editId) ?? null) : null;
  const estimate = useMemo(
    () => (items.length > 0 ? listEstimateCents(computeComparison(items, profile?.preferredStoreIds, catalog)) : null),
    [items, profile, catalog],
  );

  const toggle = (id: string) => {
    const before = items.find((i) => i.id === id);
    useListStore.getState().toggleItem(id, ws);
    if (before && !before.checked && remaining === 1) {
      haptics.success();
      toast.show({ title: 'Tout est dans le cabas !', message: 'Range le surplus au placard si tu veux.', emoji: '🧺', tone: 'success' });
    }
  };

  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    const item = useListStore.getState().addManualItem(label, undefined, undefined, ws);
    if (item) {
      haptics.success();
      setDraft('');
      toast.show({ title: `${item.label} ajouté`, tone: 'success', duration: 1800 });
    }
  };

  const share = async () => {
    haptics.tap();
    const title = `Ma liste Cabas — semaine du ${formatWeekRange(ws)}`;
    const res = await shareText(listAsText(items, { title }), title);
    if (res === 'copied') toast.show({ title: 'Liste copiée', message: 'Colle-la où tu veux.', tone: 'success' });
    else if (res === 'failed') toast.show({ title: 'Partage impossible', message: 'Réessaie dans un instant.', tone: 'danger' });
  };

  const toPantry = () => {
    const n = addFromCheckedList(ws);
    haptics.success();
    toast.show({
      title: n > 0 ? `${n} article${n > 1 ? 's' : ''} rangé${n > 1 ? 's' : ''} au placard` : 'Rien à ranger',
      message: n > 0 ? 'Le surplus des paquets entamés est noté.' : 'Aucun paquet entamé parmi les articles cochés.',
      tone: n > 0 ? 'success' : 'neutral',
      action: n > 0 ? { label: 'Voir', onPress: () => router.push('/placard' as Href) } : undefined,
    });
  };

  const regenerate = () => {
    if (!plan) return;
    usePlanStore.getState().syncList(ws);
    haptics.success();
  };

  // ── États vides ─────────────────────────────────────────────────────────
  const header = (
    <View style={{ gap: t.spacing.md }}>
      <AddItemField value={draft} onChange={setDraft} onSubmit={addItem} inputRef={inputRef} />
    </View>
  );

  if (items.length === 0) {
    return (
      <Screen title="Ma liste" eyebrow={`Semaine du ${formatWeekRange(ws)}`} bottomInset="tabBar" testID="list-screen">
        {header}
        <EmptyState
          illustration={<EmptyList size={150} />}
          title={plan ? 'Ta liste est vide' : 'Pas encore de liste'}
          body={
            plan
              ? 'Elle se remplit avec les ingrédients de tes repas. Tu peux aussi ajouter des articles à la main.'
              : 'Planifie tes repas : Cabas calcule les quantités et range tout par rayon.'
          }
          action={
            plan
              ? { label: 'Créer depuis mes repas', leftIcon: Sparkles, onPress: regenerate }
              : { label: 'Planifier ma semaine', leftIcon: Sparkles, onPress: () => router.navigate('/' as Href) }
          }
          style={{ marginTop: t.spacing.xl }}
        />
      </Screen>
    );
  }

  const visibleSections = sections
    .map((s) => ({ ...s, visible: hideChecked ? s.items.filter((i) => !i.checked) : s.items }))
    .filter((s) => s.visible.length > 0);

  return (
    <Screen
      title="Ma liste"
      eyebrow={`Semaine du ${formatWeekRange(ws)}`}
      bottomInset="tabBar"
      headerRight={<IconButton icon={Share2} accessibilityLabel="Partager la liste" variant="tonal" onPress={() => void share()} testID="list-share" />}
      testID="list-screen"
    >
      <View style={{ gap: t.spacing.lg }}>
        {/* Progression + prix estimé */}
        <Card variant="elevated" padding="lg" radius="xl" testID="list-summary">
          <View style={styles.summaryRow}>
            <ProgressRing
              progress={progress.ratio}
              size={68}
              strokeWidth={7}
              tone="success"
              accessibilityLabel={`${progress.done} articles pris sur ${progress.total}`}
            >
              <Text variant="headline" tabular>
                {Math.round(progress.ratio * 100)}%
              </Text>
            </ProgressRing>
            <View style={styles.flex}>
              <Text variant="title3" testID="list-remaining">
                {remaining === 0 ? 'Tout est pris !' : `${remaining} article${remaining > 1 ? 's' : ''} à acheter`}
              </Text>
              <Text variant="footnote" color="textSecondary">
                {progress.done} sur {progress.total} dans le cabas
                {estimate !== null && remaining > 0 ? ` · ≈ ${formatPrice(estimate)} au meilleur prix` : ''}
              </Text>
            </View>
          </View>
          {remaining > 0 ? (
            <Button
              label="Comparer les prix"
              leftIcon={Scale}
              rightIcon={ArrowRight}
              fullWidth
              onPress={() => router.navigate('/panier' as Href)}
              style={{ marginTop: t.spacing.lg }}
              testID="list-compare"
            />
          ) : (
            <Button
              label="Ranger le surplus au placard"
              leftIcon={Archive}
              variant="secondary"
              fullWidth
              onPress={toPantry}
              style={{ marginTop: t.spacing.lg }}
              testID="list-to-pantry"
            />
          )}
        </Card>

        {header}

        {items.some((i) => i.pantryStaple && !i.checked) ? (
          <InfoBanner
            tone="tip"
            title="Jette un œil à ton placard"
            message="Les articles « Placard ? » sont souvent déjà chez toi : coche-les s’il t’en reste."
          />
        ) : null}

        <View style={styles.toolbar}>
          <Button
            label={hideChecked ? 'Afficher les cochés' : 'Masquer les cochés'}
            size="sm"
            variant="ghost"
            leftIcon={hideChecked ? Eye : EyeOff}
            disabled={progress.done === 0}
            onPress={() => setHideChecked((v) => !v)}
            testID="list-hide-checked"
          />
          {progress.done > 0 ? (
            <Button label="Tout décocher" size="sm" variant="ghost" leftIcon={RotateCcw} onPress={() => useListStore.getState().uncheckAll(ws)} />
          ) : null}
        </View>

        {/* Rayons */}
        <View style={{ gap: t.spacing.xl }}>
          {visibleSections.map((s) => (
            <Animated.View key={s.aisle} entering={FadeIn} layout={LinearTransition} testID={`aisle-${s.aisle}`}>
              <AisleHeader aisle={s.aisle} done={s.items.filter((i) => i.checked).length} total={s.items.length} />
              <Card variant="plain" padding="sm" radius="lg">
                {s.visible.map((item) => (
                  <ListItemRow
                    key={item.id}
                    item={item}
                    subtitle={itemSubtitle(item)}
                    onToggle={() => toggle(item.id)}
                    onMore={() => {
                      haptics.tap();
                      setEditId(item.id);
                    }}
                    testID={`item-${item.id}`}
                  />
                ))}
              </Card>
            </Animated.View>
          ))}
          {visibleSections.length === 0 ? (
            <Text variant="callout" color="textSecondary" align="center">
              Tous les articles sont cochés. Bravo !
            </Text>
          ) : null}
        </View>

        {progress.done > 0 ? (
          <View style={{ gap: t.spacing.sm, marginTop: t.spacing.md }}>
            {remaining > 0 ? (
              <Button label="Ranger le surplus au placard" leftIcon={Archive} variant="tonal" fullWidth onPress={toPantry} />
            ) : null}
            <Button
              label={`Retirer les ${progress.done} article${progress.done > 1 ? 's' : ''} coché${progress.done > 1 ? 's' : ''}`}
              leftIcon={Trash2}
              variant="ghost"
              fullWidth
              onPress={() => setConfirmClear(true)}
              testID="list-clear-checked"
            />
          </View>
        ) : null}
      </View>

      <ItemEditSheet
        item={editItem}
        recipeTitles={(editItem?.recipeIds ?? []).map((id) => catalog.recipesById[id]?.title).filter((x): x is string => !!x)}
        onClose={() => setEditId(null)}
        onSave={(patch) => {
          if (editItem) useListStore.getState().updateItem(editItem.id, patch, ws);
          setEditId(null);
          haptics.success();
        }}
        onRemove={() => {
          if (!editItem) return;
          const removed = editItem;
          useListStore.getState().removeItem(removed.id, ws);
          setEditId(null);
          toast.show({
            title: `${removed.label} retiré`,
            tone: 'neutral',
            action: {
              label: 'Annuler',
              onPress: () => {
                const cur = useListStore.getState().lists[ws];
                if (cur && !cur.items.some((i) => i.id === removed.id)) {
                  useListStore.getState().setList(ws, { ...cur, items: [...cur.items, removed], updatedAt: new Date().toISOString() });
                }
              },
            },
          });
        }}
      />

      <ConfirmDialog
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          useListStore.getState().clearChecked(ws);
          haptics.success();
        }}
        title="Retirer les articles cochés ?"
        message="Ils disparaissent de la liste de cette semaine. Pense à ranger le surplus au placard avant."
        confirmLabel="Retirer"
        destructive
      />
    </Screen>
  );
}

function AddItemField({
  value,
  onChange,
  onSubmit,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<TextFieldRef | null>;
}) {
  return (
    <TextField
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      placeholder="Ajouter un article (ex. sacs poubelle)"
      accessibilityLabel="Ajouter un article à la liste"
      leftIcon={Plus}
      shape="pill"
      returnKeyType="done"
      submitBehavior="submit"
      maxLength={80}
      right={
        value.trim() ? (
          <IconButton icon={CheckCheck} accessibilityLabel="Ajouter" size="sm" variant="accent" onPress={onSubmit} testID="list-add-submit" />
        ) : null
      }
      testID="list-add"
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
