/**
 * « Ma liste » — étape 3 du parcours : la liste de courses de la semaine,
 * 100 % hors-ligne (tout est calculé et enregistré sur l'appareil).
 *
 * Rayons dans l'ordre de parcours du magasin, non cochés d'abord ; cocher au
 * toucher (case au ressort, vibration, l'article glisse en bas de son rayon) ;
 * ajout rapide (« 2 baguettes »), édition en feuille, glisser pour retirer
 * (annulable) ; partage / copie en texte ; tout coché → célébration, surplus
 * rangé au placard. Suites : comparer les prix (onglet Prix), placard.
 */
import { router, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { CalendarDays, ChevronDown, ChevronUp, CloudOff, Ellipsis, Share2 } from 'lucide-react-native';

import { EmptyList, ProduceSet } from '@/components/brand';
import {
  AisleSection,
  applyFrozenOrder,
  itemView,
  leftoversState,
  leftoversToast,
  listPhase,
  ListActionsSheet,
  ListDoneCard,
  ListItemRow,
  ListItemSheet,
  ListProgressCard,
  progressSubtitle,
  QuickAddBar,
  reviewCheckedLabel,
  shareTitle,
  type ListPhase,
  type QuickAdd,
} from '@/components/feature/list';
import { Button, EmptyState, IconButton, Screen, Skeleton, Text, useToast } from '@/components/ui';
import type { ShoppingListItem } from '@/core';
import { AISLE_LABELS, formatShoppingListAsText } from '@/core';
import { useCurrentWeek, useHydrated } from '@/hooks';
import { haptics } from '@/lib/haptics';
import { useCatalog } from '@/services/catalog';
import { copyListToClipboard } from '@/services/order';
import {
  useListProgress,
  useListSections,
  useListStore,
  usePantryStore,
  usePlanStore,
  useWeekList,
  useWeekPlan,
  type ListItemPatch,
} from '@/stores';
import { useTheme } from '@/theme';

/** Temps pendant lequel un article (dé)coché garde sa place avant de glisser. */
const SETTLE_MS = 650;

export default function ListScreen() {
  const t = useTheme();
  const c = t.colors;
  const toast = useToast();
  const hydrated = useHydrated();
  const week = useCurrentWeek();
  const ws = week.activeWeekStart;
  const plan = useWeekPlan(ws);
  const list = useWeekList(ws);
  const sections = useListSections(ws);
  const progress = useListProgress(ws);
  const catalog = useCatalog();
  const pantry = usePantryStore((s) => s.items);
  // Surplus déjà rangé au placard (persisté : survit au redémarrage et aux décoches).
  const leftoversRecord = useListStore((s) => s.leftovers[ws]);

  // Planning sans liste (jamais générée) : on la construit.
  useEffect(() => {
    if (hydrated && plan && !list) usePlanStore.getState().syncList(ws);
  }, [hydrated, plan, list, ws]);

  // ── Ordre « gelé » le temps de l'animation de coche ───────────────────────
  const [frozen, setFrozen] = useState<Record<string, boolean>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((tm) => clearTimeout(tm));
  }, []);
  const displaySections = useMemo(() => applyFrozenOrder(sections, frozen), [sections, frozen]);

  // ── Tout coché : célébration seulement si on vient de finir ───────────────
  const phase = listPhase(progress.total, progress.done);
  const complete = phase === 'complete';
  // Plus d'article en transit : la liste peut se replier sous la carte « bravo ».
  const settled = Object.keys(frozen).length === 0;
  const [seen, setSeen] = useState<{ ws: string; phase: ListPhase } | null>(null);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const [showChecked, setShowChecked] = useState(false);
  if (hydrated && (seen?.ws !== ws || seen.phase !== phase)) {
    const sameWeek = seen?.ws === ws;
    if (sameWeek && seen.phase === 'todo' && complete) setCelebrateKey((k) => k + 1);
    if (!sameWeek) setCelebrateKey(0);
    if (phase !== 'complete' && showChecked) setShowChecked(false);
    setSeen({ ws, phase });
  }
  const showDone = complete && settled;
  const collapsed = showDone && !showChecked;

  // ── Feuilles ──────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Action à lancer une fois la feuille « … » refermée : sur iOS, la feuille de
  // partage ne peut pas s'ouvrir par-dessus une Modal en train de se fermer.
  const afterActions = useRef<(() => void) | null>(null);
  const items = useMemo(() => list?.items ?? [], [list]);
  const editing = editingId ? (items.find((i) => i.id === editingId) ?? null) : null;
  const leftovers = leftoversState(items, leftoversRecord);

  // ── Navigation ────────────────────────────────────────────────────────────
  const openPantry = () => {
    setActionsOpen(false);
    router.push('/placard' as Href);
  };
  const comparePrices = () => router.navigate('/panier' as Href);
  const goToWeek = () => router.navigate('/' as Href);

  // ── Actions ───────────────────────────────────────────────────────────────
  const store = () => useListStore.getState();

  const toggle = (item: ShoppingListItem) => {
    const prev = timers.current.get(item.id);
    if (prev) clearTimeout(prev);
    setFrozen((f) => (item.id in f ? f : { ...f, [item.id]: item.checked }));
    timers.current.set(
      item.id,
      setTimeout(() => {
        timers.current.delete(item.id);
        setFrozen(({ [item.id]: _done, ...rest }) => rest);
      }, SETTLE_MS),
    );
    store().toggleItem(item.id, ws);
  };

  /** Remet des articles retirés (annulation). */
  const restore = (restored: ShoppingListItem[]) => {
    if (restored.length === 0) return;
    haptics.select();
    store().restoreItems(restored, ws);
  };

  const remove = (item: ShoppingListItem) => {
    setEditingId(null);
    store().removeItem(item.id, ws);
    toast.show({
      title: 'Retiré de la liste',
      message: item.label,
      tone: 'neutral',
      action: { label: 'Annuler', onPress: () => restore([item]) },
    });
  };

  const save = (item: ShoppingListItem, patch: ListItemPatch) => {
    setEditingId(null);
    if (Object.keys(patch).length === 0) return;
    haptics.success();
    store().updateItem(item.id, patch, ws);
  };

  const add = (entry: QuickAdd) => {
    const created = store().addManualItem(entry.label, entry.quantity, entry.unit, ws);
    if (!created) return;
    toast.show({
      title: 'Ajouté à ta liste',
      message: `${created.label} · ${AISLE_LABELS[created.aisle]}`,
      tone: 'success',
      duration: 2600,
      action: { label: 'Modifier', onPress: () => setEditingId(created.id) },
    });
  };

  const clearChecked = () => {
    setActionsOpen(false);
    const checked = items.filter((i) => i.checked);
    if (checked.length === 0) return;
    store().clearChecked(ws);
    toast.show({
      title: checked.length > 1 ? `${checked.length} articles retirés` : 'Article retiré',
      message: 'Ta liste fait peau neuve.',
      tone: 'neutral',
      action: { label: 'Annuler', onPress: () => restore(checked) },
    });
  };

  const uncheckAll = () => {
    setActionsOpen(false);
    const ids = items.filter((i) => i.checked).map((i) => i.id);
    if (ids.length === 0) return;
    store().uncheckAll(ws);
    toast.show({
      title: 'Tout est décoché',
      tone: 'neutral',
      action: {
        label: 'Annuler',
        onPress: () => {
          haptics.select();
          for (const id of ids) store().setChecked(id, true, ws);
        },
      },
    });
  };

  const storeLeftovers = () => {
    // Seuls les articles pas encore rangés partent au placard (listStore › storeLeftovers).
    const n = store().storeLeftovers(ws);
    toast.show(
      n > 0
        ? { ...leftoversToast(n), tone: 'success', action: { label: 'Voir', onPress: openPantry } }
        : { ...leftoversToast(0), tone: 'neutral' },
    );
  };

  const listText = () =>
    formatShoppingListAsText(items, { title: shareTitle(week.rangeLabel), includeChecked: progress.done === progress.total });

  const copy = async (text: string = listText()) => {
    setActionsOpen(false);
    const ok = await copyListToClipboard(text);
    toast.show(
      ok
        ? { title: 'Liste copiée', message: 'Colle-la où tu veux.', tone: 'success' }
        : { title: 'Copie impossible', message: 'Réessaie dans un instant.', tone: 'danger' },
    );
  };

  const share = async () => {
    const message = listText();
    try {
      await Share.share({ message, title: 'Ma liste Cabas' });
    } catch (err) {
      // Partage annulé : rien à faire. Indisponible (web) : on copie.
      if (err instanceof Error && err.name === 'AbortError') return;
      await copy(message);
    }
  };

  /** « Partager » depuis la feuille « … » : le partage s'ouvre une fois la feuille refermée. */
  const shareFromActions = () => {
    afterActions.current = () => void share();
    setActionsOpen(false);
  };
  const onActionsDismissed = () => {
    const next = afterActions.current;
    afterActions.current = null;
    next?.();
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  if (!hydrated) return <ListSkeleton />;

  const hasItems = items.length > 0;
  // Rang de la première ligne de chaque rayon : la cascade d'entrée se poursuit d'un rayon à l'autre.
  const starts = displaySections.map((_, i) => displaySections.slice(0, i).reduce((n, s) => n + s.items.length, 0));

  return (
    // Clavier ouvert : iOS ramène le champ focalisé au-dessus du clavier
    // (`automaticallyAdjustKeyboardInsets`) ; Android (edge-to-edge) réduit l'écran.
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      enabled={Platform.OS === 'android'}
      testID="list-screen"
    >
      <Screen
        title="Ma liste"
        eyebrow={week.isNextWeek ? `Semaine prochaine · ${week.rangeLabel}` : `Semaine du ${week.rangeLabel}`}
        bottomInset="tabBar"
        scrollProps={KEYBOARD_SCROLL}
        headerRight={
          hasItems ? (
            <>
              <IconButton icon={Share2} accessibilityLabel="Partager la liste" onPress={() => void share()} testID="list-share" />
              <IconButton
                icon={Ellipsis}
                accessibilityLabel="Plus d’actions sur la liste"
                onPress={() => setActionsOpen(true)}
                testID="list-more"
              />
            </>
          ) : undefined
        }
      >
        {!hasItems ? (
          <View style={{ gap: t.spacing.lg }}>
            <EmptyState
              illustration={plan ? <ProduceSet size={140} /> : <EmptyList size={140} />}
              title={plan ? 'Rien à acheter' : 'Ta liste t’attend'}
              body={
                plan
                  ? 'Tout est déjà au placard ou rayé. Ajoute un article si besoin.'
                  : 'Planifie tes repas : Cabas en tire la liste, rayon par rayon.'
              }
              action={plan ? undefined : { label: 'Planifier ma semaine', leftIcon: CalendarDays, onPress: goToWeek }}
              secondaryAction={plan ? { label: 'Voir mon placard', onPress: openPantry } : undefined}
            />
            <QuickAddBar placeholder={plan ? undefined : 'Ou ajoute un article (lessive…)'} onAdd={add} testID="list-add" />
          </View>
        ) : (
          <View style={{ gap: t.spacing.xxl }}>
            {/* Changement de carte (avancement ⇄ bravo) : la nouvelle arrive au ressort. */}
            <Animated.View
              key={showDone ? 'done' : 'progress'}
              entering={FadeInDown.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
              layout={LinearTransition.springify().damping(t.motion.spring.damping)}
            >
              {showDone ? (
                <ListDoneCard
                  total={progress.total}
                  celebrateKey={celebrateKey}
                  leftovers={leftovers}
                  onStoreLeftovers={storeLeftovers}
                  onOpenPantry={openPantry}
                  onClearChecked={clearChecked}
                  testID="list-done"
                />
              ) : (
                <ListProgressCard
                  done={progress.done}
                  total={progress.total}
                  subtitle={progressSubtitle(sections)}
                  onComparePrices={comparePrices}
                  onOpenPantry={openPantry}
                  testID="list-progress"
                />
              )}
            </Animated.View>

            <QuickAddBar onAdd={add} testID="list-add" />

            {showDone ? (
              <Button
                label={showChecked ? 'Masquer les articles cochés' : reviewCheckedLabel(progress.done)}
                variant="ghost"
                size="sm"
                rightIcon={showChecked ? ChevronUp : ChevronDown}
                onPress={() => setShowChecked((v) => !v)}
                accessibilityState={{ expanded: showChecked }}
                hitSlop={(t.layout.minTouchTarget - t.controlHeight.sm) / 2}
                style={styles.center}
                testID="list-toggle-checked"
              />
            ) : null}

            {collapsed ? null : displaySections.map((section, si) => {
              return (
                <AisleSection
                  key={section.aisle}
                  aisle={section.aisle}
                  items={section.items}
                  startIndex={starts[si]}
                  testID={`aisle-${section.aisle}`}
                  renderItem={(item, i) => (
                    <ListItemRow
                      item={item}
                      view={itemView(item, catalog.recipesById, pantry)}
                      divider={i > 0}
                      onToggle={() => toggle(item)}
                      onEdit={() => setEditingId(item.id)}
                      onRemove={() => remove(item)}
                      testID={`item-${item.id}`}
                    />
                  )}
                />
              );
            })}

            <View style={[styles.offline, { gap: t.spacing.sm, paddingHorizontal: t.spacing.xs }]}>
              <CloudOff size={t.iconSize.sm} color={c.textTertiary} style={styles.offlineIcon} />
              <Text variant="footnote" color="textSecondary" style={styles.flex}>
                {collapsed
                  ? 'Ta liste vit sur ton téléphone : elle marche même sans réseau.'
                  : 'Ta liste vit sur ton téléphone : elle marche même sans réseau. Glisse un article vers la gauche pour le retirer.'}
              </Text>
            </View>
          </View>
        )}
      </Screen>

      <ListItemSheet
        visible={!!editing}
        item={editing}
        recipesById={catalog.recipesById}
        onClose={() => setEditingId(null)}
        onSave={(patch) => editing && save(editing, patch)}
        onRemove={() => editing && remove(editing)}
      />
      <ListActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        checkedCount={progress.done}
        totalCount={progress.total}
        onShare={shareFromActions}
        onDismissed={onActionsDismissed}
        onCopy={() => void copy()}
        onUncheckAll={uncheckAll}
        onClearChecked={clearChecked}
        onOpenPantry={openPantry}
      />
    </KeyboardAvoidingView>
  );
}

const KEYBOARD_SCROLL = { automaticallyAdjustKeyboardInsets: true } as const;

function ListSkeleton() {
  const t = useTheme();
  return (
    <Screen title="Ma liste" bottomInset="tabBar" scroll={false}>
      <View style={{ gap: t.spacing.md }} accessibilityLabel="Chargement de ta liste">
        <Skeleton height={150} radius={t.radius.xl} />
        <Skeleton height={52} radius={t.radius.pill} />
        <Skeleton width={140} height={16} />
        <Skeleton height={220} radius={t.radius.lg} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { alignSelf: 'center' },
  offline: { flexDirection: 'row', alignItems: 'flex-start' },
  offlineIcon: { marginTop: 1 },
});
