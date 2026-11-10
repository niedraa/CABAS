/**
 * Galerie du design system « Marché frais » — route de contrôle visuel
 * (/design-system). Rend CHAQUE composant et état du kit, en clair et en
 * sombre (bascule en haut, ou `?theme=dark`).
 *
 * Écran de développement : il n'est lié depuis aucun parcours utilisateur.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChefHat,
  Clock,
  Crown,
  Heart,
  ListChecks,
  Moon,
  PiggyBank,
  Plus,
  Search,
  Share2,
  ShoppingBasket,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Store,
  Sun,
  SunMoon,
  Trash2,
  Truck,
  User,
  Users,
} from 'lucide-react-native';

import {
  CabasLogo,
  Celebration,
  CircleDecor,
  CookingPot,
  EmptyBasket,
  EmptyList,
  Produce,
  ProduceSet,
  ReceiptCard,
  TAGLINE,
} from '@/components/brand';
import {
  AnimatedPrice,
  AnimatedTabBar,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ChipGroup,
  ConfirmDialog,
  Dialog,
  Divider,
  EmptyState,
  FAB,
  IconButton,
  InfoBanner,
  KeyValueRow,
  ListRow,
  PriceTag,
  ProgressBar,
  ProgressRing,
  Row,
  Screen,
  SearchField,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  SkeletonText,
  Stack,
  StaggeredList,
  Stepper,
  StoreBadge,
  StoreBadgeStack,
  Switch,
  Text,
  TextField,
  ToastProvider,
  ToggleChip,
  TopBar,
  RecipeThumb,
  useToast,
  type ChipOption,
} from '@/components/ui';
import { formatCents } from '@/lib/format';
import {
  contrastRatio,
  ThemeProvider,
  typography,
  useTheme,
  type ColorScheme,
  type ThemePreference,
  type TypographyVariant,
} from '@/theme';

export default function DesignSystemRoute() {
  const params = useLocalSearchParams<{ theme?: string }>();
  const initial: ThemePreference = params.theme === 'dark' || params.theme === 'light' ? params.theme : 'system';
  const [pref, setPref] = useState<ThemePreference>(initial);
  return (
    <ThemeProvider preference={pref}>
      <ToastProvider>
        <Gallery pref={pref} onPref={setPref} />
      </ToastProvider>
    </ThemeProvider>
  );
}

// ─── Données de démonstration ────────────────────────────────────────────────

type DietKey = 'vegetarien' | 'halal' | 'sans_gluten' | 'sans_lactose' | 'pescetarien';
const DIETS: ChipOption<DietKey>[] = [
  { value: 'vegetarien', label: 'Végétarien', emoji: '🥦' },
  { value: 'halal', label: 'Halal', emoji: '🌙' },
  { value: 'sans_gluten', label: 'Sans gluten', emoji: '🌾' },
  { value: 'sans_lactose', label: 'Sans lactose', emoji: '🥛' },
  { value: 'pescetarien', label: 'Pescétarien', emoji: '🐟' },
];
type Mode = 'cheapest' | 'single';
type MealKind = 'dejeuner' | 'diner';

const TABS = [
  { key: 'index', name: 'index', title: 'Semaine', icon: CalendarDays },
  { key: 'liste', name: 'liste', title: 'Liste', icon: ListChecks, badge: 4 },
  { key: 'panier', name: 'panier', title: 'Panier', icon: ShoppingCart },
  { key: 'profil', name: 'profil', title: 'Profil', icon: User },
] as const;

const COLOR_KEYS: (keyof ColorScheme)[] = [
  'background',
  'backgroundAlt',
  'surface',
  'surfaceElevated',
  'border',
  'text',
  'textSecondary',
  'textTertiary',
  'primary',
  'primarySoft',
  'accent',
  'accentSoft',
  'accentText',
  'success',
  'successSoft',
  'danger',
  'dangerSoft',
  'info',
  'infoSoft',
  'priceBest',
  'savings',
  'hero',
];

// ─── Galerie ─────────────────────────────────────────────────────────────────

function Gallery({ pref, onPref }: { pref: ThemePreference; onPref: (p: ThemePreference) => void }) {
  const t = useTheme();
  const toast = useToast();

  const [diets, setDiets] = useState<DietKey[]>(['vegetarien', 'sans_gluten']);
  const [single, setSingle] = useState<DietKey | null>('halal');
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(1);
  const [mode, setMode] = useState<Mode>('cheapest');
  const [meal, setMeal] = useState<MealKind>('diner');
  const [notif, setNotif] = useState(true);
  const [alerts, setAlerts] = useState(false);
  const [checked, setChecked] = useState({ a: true, b: false, c: false });
  const [name, setName] = useState('Camille');
  const [budget, setBudget] = useState('');
  const [query, setQuery] = useState('tomates');
  const [total, setTotal] = useState(6342);
  const [progress, setProgress] = useState(0.62);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [snapSheet, setSnapSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState(0);
  const [celebrate, setCelebrate] = useState(0);
  const [stagger, setStagger] = useState(0);

  const tabState = {
    index: tab,
    routes: TABS.map((r) => ({ key: r.key, name: r.name })),
  };
  const tabDescriptors = Object.fromEntries(
    TABS.map((r) => [
      r.key,
      { options: { title: r.title, tabBarBadge: 'badge' in r ? r.badge : undefined } },
    ]),
  );

  return (
    <View style={styles.flex}>
      <Screen
        title="Design system"
        eyebrow="Marché frais · v1"
        subtitle="Chaque brique de Cabas, dans tous ses états."
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        headerRight={
          <IconButton
            icon={pref === 'dark' ? Moon : pref === 'light' ? Sun : SunMoon}
            accessibilityLabel="Changer de thème"
            variant="tonal"
            onPress={() => onPref(pref === 'system' ? 'dark' : pref === 'dark' ? 'light' : 'system')}
          />
        }
        hero={<HeroBanner />}
        testID="design-system"
      >
        <Stack gap="huge">
          {/* ── Thème ── */}
          <Section title="Thème" subtitle="Clair, sombre ou réglage système.">
            <SegmentedControl<ThemePreference>
              options={[
                { value: 'light', label: 'Clair', icon: Sun },
                { value: 'dark', label: 'Sombre', icon: Moon },
                { value: 'system', label: 'Système', icon: SunMoon },
              ]}
              value={pref}
              onChange={onPref}
              accessibilityLabel="Thème"
            />
          </Section>

          {/* ── Couleurs ── */}
          <Section title="Couleurs" subtitle="Rôles sémantiques + contraste sur le fond.">
            <View style={styles.swatches}>
              {COLOR_KEYS.map((k) => (
                <Swatch key={k} name={k} />
              ))}
            </View>
          </Section>

          {/* ── Typographie ── */}
          <Section title="Typographie" subtitle="Bricolage Grotesque (titres) · DM Sans (texte).">
            <Stack gap="sm">
              {(Object.keys(typography) as TypographyVariant[]).map((v) => (
                <Row key={v} gap="md" style={styles.typeRow}>
                  <Text variant="caption" color="textTertiary" style={styles.typeKey}>
                    {v}
                  </Text>
                  <Text variant={v} style={styles.flex} numberOfLines={1}>
                    {v.startsWith('price')
                      ? formatCents(4299)
                      : v === 'hero' || v === 'title1'
                        ? 'Ma semaine'
                        : 'Tes courses, de A à Z.'}
                  </Text>
                </Row>
              ))}
            </Stack>
          </Section>

          {/* ── Logo ── */}
          <Section title="Logo" subtitle="Panier moutarde, fentes forêt. Couleur · mono · inversé.">
            <Stack gap="md">
              <Card variant="outlined">
                <Row gap="xxl" wrap>
                  <CabasLogo size={44} variant="color" withWordmark />
                  <CabasLogo size={44} variant="mono" withWordmark />
                </Row>
              </Card>
              <Card variant="hero" padding="xl">
                <CabasLogo size={52} variant="reversed" withWordmark withTagline />
              </Card>
              <Row gap="lg">
                <CabasLogo size={24} />
                <CabasLogo size={36} />
                <CabasLogo size={56} />
                <CabasLogo size={56} variant="mono" color={t.colors.accentText} />
              </Row>
            </Stack>
          </Section>

          {/* ── Boutons ── */}
          <Section title="Boutons" subtitle="Un seul primaire (moutarde) par écran.">
            <Stack gap="md">
              <Button label="Générer ma semaine" leftIcon={Sparkles} fullWidth size="lg" onPress={() => toast.show({ title: 'Semaine générée !', message: '10 repas, 63,42 € estimés', tone: 'success' })} />
              <Row gap="sm" wrap>
                <Button label="Primaire" onPress={() => undefined} />
                <Button label="Secondaire" variant="secondary" onPress={() => undefined} />
                <Button label="Tonal" variant="tonal" onPress={() => undefined} />
              </Row>
              <Row gap="sm" wrap>
                <Button label="Discret" variant="ghost" onPress={() => undefined} />
                <Button label="Supprimer" variant="danger" leftIcon={Trash2} onPress={() => setConfirm(true)} />
                <Button label="Désactivé" disabled onPress={() => undefined} />
              </Row>
              <Row gap="sm" wrap>
                <Button label="Petit" size="sm" variant="secondary" rightIcon={ArrowRight} onPress={() => undefined} />
                <Button label="Moyen" size="md" variant="tonal" onPress={() => undefined} />
                <Button
                  label="Commander"
                  size="md"
                  loading={loading}
                  leftIcon={Truck}
                  onPress={() => {
                    setLoading(true);
                    setTimeout(() => setLoading(false), 1600);
                  }}
                />
              </Row>
              <Row gap="sm" wrap>
                <IconButton icon={Heart} accessibilityLabel="Favori" />
                <IconButton icon={Share2} accessibilityLabel="Partager" variant="tonal" />
                <IconButton icon={Bell} accessibilityLabel="Notifications" variant="outlined" dot />
                <IconButton icon={Plus} accessibilityLabel="Ajouter" variant="filled" />
                <IconButton icon={Sparkles} accessibilityLabel="Suggestions" variant="accent" />
                <IconButton icon={Shuffle} accessibilityLabel="Remplacer" variant="tonal" size="sm" />
                <IconButton icon={Search} accessibilityLabel="Rechercher" variant="outlined" size="lg" />
              </Row>
              <Row gap="md">
                <FAB icon={Plus} accessibilityLabel="Ajouter un article" floating={false} onPress={() => toast.show({ title: 'Article ajouté', tone: 'neutral', emoji: '🧺' })} />
                <FAB icon={ShoppingBasket} label="Ma liste" floating={false} tone="primary" onPress={() => undefined} />
              </Row>
            </Stack>
          </Section>

          {/* ── Cartes ── */}
          <Section title="Cartes" subtitle="Papier sur crème, coins 20–28 pt.">
            <Stack gap="md">
              <Card variant="hero" radius="xl" padding="xl">
                <Text variant="overline" style={{ color: t.colors.accent }}>
                  Cette semaine
                </Text>
                <Text variant="title2" style={[styles.mt4, { color: t.colors.heroText }]}>
                  10 repas planifiés
                </Text>
                <Row gap="sm" style={styles.mt12}>
                  <Badge label="−12 % vs. moyenne" tone="premium" icon={PiggyBank} />
                </Row>
              </Card>
              <Card variant="elevated" onPress={() => undefined} accessibilityLabel="Recette, lasagnes">
                <Row gap="md">
                  <RecipeThumb emoji="🍝" size="lg" seed="lasagnes" />
                  <View style={styles.flex}>
                    <Text variant="headline">Lasagnes végé aux épinards</Text>
                    <Row gap="sm" style={styles.mt4}>
                      <Badge label="35 min" icon={Clock} size="sm" />
                      <Badge label="4 pers." icon={Users} size="sm" />
                    </Row>
                  </View>
                </Row>
              </Card>
              <Row gap="md">
                <Card variant="plain" style={styles.flex}>
                  <Text variant="headline">Plain</Text>
                  <Text variant="footnote" color="textSecondary">Papier simple</Text>
                </Card>
                <Card variant="outlined" style={styles.flex}>
                  <Text variant="headline">Outlined</Text>
                  <Text variant="footnote" color="textSecondary">Avec filet</Text>
                </Card>
              </Row>
              <Card variant="accent" decor>
                <Text variant="headline">Accent</Text>
                <Text variant="footnote" color="textSecondary">
                  Mises en avant chaleureuses (premium, astuces).
                </Text>
              </Card>
            </Stack>
          </Section>

          {/* ── Sélection ── */}
          <Section title="Sélection" subtitle="Puces, compteurs, segments, bascules.">
            <Stack gap="lg">
              <Row gap="sm" wrap>
                <Chip label="Sélectionnée" selected onPress={() => undefined} />
                <Chip label="Libre" onPress={() => undefined} />
                <Chip label="Arachides" emoji="🥜" tone="danger" selected onPress={() => undefined} />
                <ToggleChip label="Petite" size="sm" icon={Store} />
                <Chip label="Inactive" disabled />
              </Row>
              <Stack gap="sm">
                <Text variant="subhead" color="textSecondary">
                  Régimes (multi) — {diets.length} choisi{diets.length > 1 ? 's' : ''}
                </Text>
                <ChipGroup mode="multi" options={DIETS} value={diets} onChange={setDiets} accessibilityLabel="Régimes" />
              </Stack>
              <Stack gap="sm">
                <Text variant="subhead" color="textSecondary">
                  Choix unique
                </Text>
                <ChipGroup mode="single" size="sm" options={DIETS.slice(0, 3)} value={single} onChange={setSingle} accessibilityLabel="Choix" />
              </Stack>
              <Row gap="lg" justify="space-between">
                <Stack gap="xs">
                  <Text variant="subhead">Adultes</Text>
                  <Stepper value={adults} onChange={setAdults} min={1} max={8} accessibilityLabel="Adultes" />
                </Stack>
                <Stack gap="xs">
                  <Text variant="subhead">Enfants</Text>
                  <Stepper value={kids} onChange={setKids} min={0} max={6} size="sm" accessibilityLabel="Enfants" />
                </Stack>
              </Row>
              <SegmentedControl<Mode>
                options={[
                  { value: 'cheapest', label: 'Le moins cher' },
                  { value: 'single', label: 'Un seul magasin' },
                ]}
                value={mode}
                onChange={setMode}
                accessibilityLabel="Mode de panier"
              />
              <SegmentedControl<MealKind>
                size="sm"
                options={[
                  { value: 'dejeuner', label: 'Midi', icon: Sun },
                  { value: 'diner', label: 'Soir', icon: Moon },
                ]}
                value={meal}
                onChange={setMeal}
              />
              <Card variant="plain" padding="none">
                <ListRow
                  title="Rappel de planning"
                  subtitle="Le dimanche à 18 h"
                  icon={Bell}
                  right={<Switch value={notif} onValueChange={setNotif} accessibilityLabel="Rappel de planning" />}
                  style={styles.px16}
                />
                <Divider inset={68} />
                <ListRow
                  title="Alertes prix"
                  subtitle="Premium"
                  icon={Sparkles}
                  right={<Switch value={alerts} onValueChange={setAlerts} accessibilityLabel="Alertes prix" />}
                  style={styles.px16}
                />
                <Divider inset={68} />
                <ListRow
                  title="Désactivé"
                  icon={Crown}
                  right={<Switch value disabled onValueChange={() => undefined} accessibilityLabel="Désactivé" />}
                  style={styles.px16}
                />
              </Card>
              <Card variant="plain">
                <Stack gap="xs">
                  <Checkbox label="Tomates grappe" description="1 kg · Fruits & légumes" checked={checked.a} strikeWhenChecked onChange={(v) => setChecked((s) => ({ ...s, a: v }))} />
                  <Checkbox label="Mozzarella di bufala" description="2 × 125 g · Crèmerie" checked={checked.b} strikeWhenChecked onChange={(v) => setChecked((s) => ({ ...s, b: v }))} />
                  <Checkbox label="Basilic frais" checked={checked.c} strikeWhenChecked onChange={(v) => setChecked((s) => ({ ...s, c: v }))} />
                  <Checkbox label="Inactif" checked={false} disabled onChange={() => undefined} />
                </Stack>
              </Card>
            </Stack>
          </Section>

          {/* ── Champs ── */}
          <Section title="Champs" subtitle="Libellé, aide, erreur, effacement.">
            <Stack gap="lg">
              <TextField label="Prénom" value={name} onChangeText={setName} clearable helper="Comment on t'appelle ?" />
              <TextField
                label="Budget hebdo"
                value={budget}
                onChangeText={setBudget}
                keyboardType="numeric"
                placeholder="80"
                right={<Text variant="bodyMedium" color="textSecondary">€</Text>}
                error={budget !== '' && Number(budget) < 20 ? 'Prévois au moins 20 € par semaine.' : null}
              />
              <TextField label="Désactivé" value="Lecture seule" editable={false} />
              <SearchField value={query} onChangeText={setQuery} placeholder="Rechercher un produit" />
            </Stack>
          </Section>

          {/* ── Listes ── */}
          <Section title="Listes" subtitle="Lignes, en-têtes, séparateurs, avatars.">
            <Stack gap="md">
              <SectionHeader title="Fruits & légumes" subtitle="6 articles" action={{ label: 'Tout voir', onPress: () => undefined }} />
              <SectionHeader title="Rayon" kind="overline" right={<Badge label="3" size="sm" />} />
              <Card variant="plain" padding="none">
                <ListRow
                  left={<RecipeThumb emoji="🥗" size="sm" seed="salade" />}
                  title="Salade niçoise"
                  subtitle="Lundi · Déjeuner"
                  chevron
                  onPress={() => undefined}
                  style={styles.px16}
                />
                <Divider inset={72} />
                <ListRow
                  left={<StoreBadge chain="lidl" size="md" />}
                  title="Lidl Montreuil"
                  subtitle="Drive · retrait dès 14 h"
                  right={<PriceTag cents={5890} best size="sm" align="right" />}
                  onPress={() => undefined}
                  style={styles.px16}
                />
                <Divider inset={72} />
                <ListRow icon={Trash2} title="Vider la liste" destructive onPress={() => setConfirm(true)} style={styles.px16} />
              </Card>
              <Row gap="md">
                <Avatar name="Camille Martin" />
                <Avatar name="Léo" size={36} />
                <Avatar name="Foyer" emoji="🏡" size={52} />
              </Row>
              <Divider />
              <Divider variant="dashed" />
              <Divider label="ou" />
            </Stack>
          </Section>

          {/* ── Badges & bandeaux ── */}
          <Section title="Badges & bandeaux">
            <Stack gap="md">
              <Row gap="sm" wrap>
                <Badge label="Neutre" />
                <Badge label="Disponible" tone="success" />
                <Badge label="Promo" tone="accent" icon={Sparkles} />
                <Badge label="Allergène" tone="danger" />
                <Badge label="IA" tone="info" emoji="✨" />
                <Badge label="Premium" tone="premium" icon={Crown} />
              </Row>
              <Row gap="sm" wrap>
                <Badge label="Neutre" variant="solid" />
                <Badge label="OK" tone="success" variant="solid" />
                <Badge label="−20 %" tone="accent" variant="solid" />
                <Badge label="Rupture" tone="danger" variant="solid" />
                <Badge label="Nouveau" tone="info" variant="solid" size="sm" />
                <Badge label="Premium" tone="premium" variant="solid" size="sm" icon={Crown} />
              </Row>
              <InfoBanner tone="tip" title="Astuce" message="Coche les articles déjà dans ton placard : ils disparaissent de la commande." />
              <InfoBanner tone="info" message="Prix relevés il y a 2 jours dans 4 enseignes." />
              <InfoBanner tone="success" message="Ta liste est disponible hors-ligne." />
              <InfoBanner tone="warning" title="Budget presque atteint" message="Il te reste 6,20 € sur ton budget de la semaine." />
              <InfoBanner tone="danger" title="Allergène détecté" message="Ce plat contient des fruits à coque : il ne te sera jamais proposé." />
              <InfoBanner
                tone="premium"
                title="Passe à Premium"
                message="Planning illimité, panier multi-magasins et alertes prix."
                action={{ label: 'Essayer 7 jours', onPress: () => undefined }}
                onClose={() => undefined}
              />
            </Stack>
          </Section>

          {/* ── Prix ── */}
          <Section title="Prix" subtitle="Chiffres tabulaires, centimes surélevés.">
            <Stack gap="lg">
              <Row gap="xl" align="flex-end" wrap>
                <PriceTag cents={4299} size="xl" />
                <PriceTag cents={349} oldCents={399} size="lg" />
                <PriceTag cents={189} size="md" best perUnit={{ cents: 378, unit: 'kg' }} />
                <PriceTag cents={95} size="sm" />
              </Row>
              <ReceiptCard header="Ticket · Panier optimisé" edges="bottom">
                <Row justify="space-between">
                  <Row gap="sm">
                    <StoreBadgeStack chains={['leclerc', 'lidl']} />
                    <Text variant="headline">2 magasins</Text>
                  </Row>
                  <Badge label="Le moins cher" tone="success" />
                </Row>
                <Divider variant="dashed" spacing={6} />
                <KeyValueRow label="Leclerc Drive" value={formatCents(3812)} leader />
                <KeyValueRow label="Lidl" value={formatCents(2530)} leader />
                <KeyValueRow label="Frais de retrait" value="Offerts" valueColor="success" leader />
                <KeyValueRow label="Économie" value={formatCents(-714)} valueColor="savings" leader hint="vs. un seul magasin" />
                <Divider variant="dashed" spacing={6} />
                <KeyValueRow label="Total" emphasis value={<AnimatedPrice cents={total} variant="priceLarge" testID="total" />} />
              </ReceiptCard>
              <Row gap="sm" wrap>
                <Button label="+ 4,99 €" size="sm" variant="tonal" onPress={() => setTotal((v) => v + 499)} />
                <Button label="− 12,30 €" size="sm" variant="tonal" onPress={() => setTotal((v) => Math.max(0, v - 1230))} />
              </Row>
              <Row gap="md" wrap>
                {['leclerc', 'carrefour', 'auchan', 'intermarche', 'lidl', 'monoprix', 'biocoop'].map((ch) => (
                  <StoreBadge key={ch} chain={ch} name={ch === 'biocoop' ? 'Biocoop' : undefined} size="lg" />
                ))}
              </Row>
              <Row gap="md" wrap>
                <StoreBadge chain="carrefour" size="xs" />
                <StoreBadge chain="carrefour" size="sm" />
                <StoreBadge chain="carrefour" size="md" />
                <StoreBadge chain="carrefour" size="lg" />
                <StoreBadge chain="carrefour" size="xl" />
              </Row>
              <StoreBadgeStack chains={['leclerc', 'carrefour', 'auchan', 'lidl', 'monoprix', 'intermarche']} size="md" />
            </Stack>
          </Section>

          {/* ── Recettes ── */}
          <Section title="Vignettes recette" subtitle="Emoji sur pastel déterministe.">
            <Stack gap="md">
              <Row gap="md" align="flex-end" wrap>
                <RecipeThumb emoji="🥘" size="xs" />
                <RecipeThumb emoji="🍲" size="sm" />
                <RecipeThumb emoji="🥗" size="md" />
                <RecipeThumb emoji="🍝" size="lg" />
                <RecipeThumb emoji="🌮" size="xl" />
              </Row>
              <Row gap="md" wrap>
                {(['🍛', '🥞', '🍣', '🥙', '🍕', '🫕', '🥧', '🍜'] as const).map((e) => (
                  <RecipeThumb key={e} emoji={e} shape="circle" size="md" />
                ))}
              </Row>
              <RecipeThumb emoji="🥘" size="hero" tone="abricot" accessibilityLabel="Paëlla" />
            </Stack>
          </Section>

          {/* ── Progression ── */}
          <Section title="Progression & chargement">
            <Stack gap="lg">
              <ProgressBar progress={progress} accessibilityLabel="Liste cochée" />
              <ProgressBar progress={0.86} tone="accent" height={8} />
              <ProgressBar progress={1.1} tone="danger" height={6} accessibilityLabel="Budget dépassé" />
              <Row gap="xl">
                <ProgressRing progress={progress} size={84}>
                  <Text variant="headline" tabular>
                    {Math.round(progress * 100)} %
                  </Text>
                </ProgressRing>
                <ProgressRing progress={0.33} size={64} tone="success" strokeWidth={6}>
                  <ChefHat size={22} color={t.colors.success} />
                </ProgressRing>
                <View>
                  <Button label="Avancer" size="sm" variant="tonal" onPress={() => setProgress((p) => (p >= 1 ? 0.1 : Math.min(1, p + 0.2)))} />
                </View>
              </Row>
              <Card variant="plain">
                <Row gap="md">
                  <Skeleton circle height={44} />
                  <Skeleton width={56} height={56} radius={16} />
                  <View style={styles.flex}>
                    <SkeletonText lines={2} />
                  </View>
                </Row>
                <Skeleton height={120} radius={t.radius.lg} style={styles.mt12} />
              </Card>
            </Stack>
          </Section>

          {/* ── Illustrations ── */}
          <Section title="Illustrations" subtitle="Formes plates, pastilles douces.">
            <Stack gap="md">
              <Row gap="sm" wrap justify="space-between">
                <EmptyBasket size={104} />
                <EmptyList size={104} />
                <CookingPot size={104} />
              </Row>
              <Row gap="sm" wrap justify="space-between">
                <Produce kind="leaf" size={60} />
                <Produce kind="carrot" size={60} />
                <Produce kind="tomato" size={60} />
                <Produce kind="baguette" size={60} />
                <Produce kind="lemon" size={60} />
              </Row>
              <Row gap="md" justify="center">
                <ProduceSet size={150} />
                <Celebration size={150} playKey={celebrate} haptic={celebrate > 0} />
              </Row>
              <Button label="Rejouer la célébration" variant="tonal" leftIcon={Sparkles} onPress={() => setCelebrate((n) => n + 1)} />
            </Stack>
          </Section>

          {/* ── États vides ── */}
          <Section title="État vide">
            <Card variant="plain" padding="none">
              <EmptyState
                compact
                illustration={<EmptyBasket size={120} />}
                title="Ton panier est vide"
                body="Génère ta semaine : Cabas remplit le panier et compare les prix pour toi."
                action={{ label: 'Planifier mes repas', onPress: () => undefined, leftIcon: Sparkles }}
                secondaryAction={{ label: 'Ajouter un article', onPress: () => undefined }}
              />
            </Card>
          </Section>

          {/* ── Surcouches ── */}
          <Section title="Feuilles, dialogues, toasts">
            <Stack gap="sm">
              <Row gap="sm" wrap>
                <Button label="Feuille" variant="secondary" size="sm" onPress={() => setSheet(true)} />
                <Button label="Feuille à crans" variant="secondary" size="sm" onPress={() => setSnapSheet(true)} />
                <Button label="Dialogue" variant="tonal" size="sm" onPress={() => setDialog(true)} />
                <Button label="Confirmation" variant="danger" size="sm" onPress={() => setConfirm(true)} />
              </Row>
              <Row gap="sm" wrap>
                <Button label="Toast succès" size="sm" variant="tonal" onPress={() => toast.show({ title: 'Commande prête', message: 'Panier Leclerc pré-rempli.', tone: 'success' })} />
                <Button label="Toast erreur" size="sm" variant="tonal" onPress={() => toast.show({ title: 'Connexion perdue', message: 'Ta liste reste dispo hors-ligne.', tone: 'danger' })} />
                <Button
                  label="Toast action"
                  size="sm"
                  variant="tonal"
                  onPress={() =>
                    toast.show({
                      title: 'Plat remplacé',
                      tone: 'accent',
                      emoji: '🔁',
                      action: { label: 'Annuler', onPress: () => toast.show({ title: 'Annulé', tone: 'neutral' }) },
                    })
                  }
                />
              </Row>
            </Stack>
          </Section>

          {/* ── Animations ── */}
          <Section title="Apparition en cascade">
            <Stack gap="md">
              <StaggeredList key={stagger} gap="sm">
                {[
                  { e: '🥕', t: 'Carottes', p: 129 },
                  { e: '🧅', t: 'Oignons jaunes', p: 99 },
                  { e: '🍋', t: 'Citrons bio', p: 219 },
                  { e: '🧀', t: 'Comté 12 mois', p: 549 },
                ].map((it) => (
                  <Card key={it.t} variant="plain" padding="md">
                    <Row gap="md">
                      <RecipeThumb emoji={it.e} size="sm" shape="circle" />
                      <Text variant="bodyMedium" style={styles.flex}>
                        {it.t}
                      </Text>
                      <PriceTag cents={it.p} size="sm" />
                    </Row>
                  </Card>
                ))}
              </StaggeredList>
              <Button label="Rejouer" size="sm" variant="ghost" onPress={() => setStagger((n) => n + 1)} />
            </Stack>
          </Section>

          {/* ── Navigation ── */}
          <Section title="Navigation" subtitle="Barre supérieure et barre d'onglets.">
            <Stack gap="md">
              <View style={[styles.frame, { borderColor: t.colors.border }]}>
                <TopBar title="Lasagnes végé" onBack={() => undefined} right={<IconButton icon={Heart} accessibilityLabel="Favori" />} />
              </View>
              <View style={[styles.frame, { borderColor: t.colors.border }]}>
                <TopBar title="Mon panier" tone="hero" onBack={() => undefined} backIcon="close" right={<IconButton icon={Share2} variant="hero" accessibilityLabel="Partager" />} />
              </View>
              <View style={[styles.frame, { borderColor: t.colors.border }]}>
                <AnimatedTabBar
                  state={tabState}
                  descriptors={tabDescriptors}
                  icons={Object.fromEntries(TABS.map((r) => [r.name, r.icon]))}
                  insets={{ bottom: 0 }}
                  navigation={{
                    emit: () => ({ defaultPrevented: false }),
                    navigate: (n: string) => setTab(TABS.findIndex((r) => r.name === n)),
                  }}
                />
              </View>
            </Stack>
          </Section>

          <View style={styles.footer}>
            <CabasLogo size={28} withWordmark />
            <Text variant="footnote" color="textSecondary">
              {TAGLINE}
            </Text>
          </View>
        </Stack>
      </Screen>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Remplacer le plat"
        subtitle="Mardi · Dîner · 4 portions"
        footer={<Button label="Choisir ce plat" fullWidth onPress={() => setSheet(false)} />}
        testID="demo-sheet"
      >
        <Stack gap="xs">
          {[
            { e: '🍛', n: 'Curry de pois chiches', m: '25 min · 1,85 €/pers.' },
            { e: '🥧', n: 'Quiche poireaux-chèvre', m: '45 min · 1,60 €/pers.' },
            { e: '🍜', n: 'Ramen express', m: '20 min · 2,10 €/pers.' },
          ].map((r) => (
            <ListRow key={r.n} left={<RecipeThumb emoji={r.e} size="md" seed={r.n} />} title={r.n} subtitle={r.m} chevron onPress={() => setSheet(false)} />
          ))}
        </Stack>
      </Sheet>

      <Sheet visible={snapSheet} onClose={() => setSnapSheet(false)} title="Comparer les prix" snapPoints={[0.5, 0.9]} scrollable>
        <Stack gap="xs">
          {['leclerc', 'lidl', 'carrefour', 'auchan', 'intermarche', 'monoprix'].map((ch, i) => (
            <ListRow
              key={ch}
              left={<StoreBadge chain={ch} />}
              title={`Tomates grappe · ${['E.Leclerc', 'Lidl', 'Carrefour', 'Auchan', 'Intermarché', 'Monoprix'][i]}`}
              subtitle="1 kg"
              right={<PriceTag cents={239 + i * 23} best={i === 0} size="sm" align="right" />}
            />
          ))}
        </Stack>
      </Sheet>

      <Dialog
        visible={dialog}
        onClose={() => setDialog(false)}
        illustration={<CookingPot size={96} />}
        title="Ta semaine mijote…"
        message="On sélectionne 10 recettes adaptées à ton foyer, sans allergène déclaré."
        actions={<Button label="Super !" fullWidth onPress={() => setDialog(false)} />}
      />

      <ConfirmDialog
        visible={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          toast.show({ title: 'Liste vidée', tone: 'neutral', action: { label: 'Annuler', onPress: () => undefined } });
        }}
        destructive
        title="Vider ta liste ?"
        message="Les 24 articles seront retirés. Tu pourras la régénérer depuis ta semaine."
        confirmLabel="Vider la liste"
      />
    </View>
  );
}

// ─── Sous-composants de la galerie ───────────────────────────────────────────

function HeroBanner() {
  const t = useTheme();
  return (
    <View style={[styles.hero, { backgroundColor: t.colors.hero, borderRadius: t.radius.xl, marginHorizontal: t.spacing.screen }]}>
      <CircleDecor tone="hero" placement="topRight" scale={0.9} />
      <CabasLogo size={44} variant="reversed" withWordmark withTagline />
      <Text variant="callout" style={[styles.mt12, { color: t.colors.heroText, opacity: 0.86, maxWidth: 260 }]}>
        Direction artistique « Marché frais » : chaleureuse, généreuse, tactile.
      </Text>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Stack gap="md">
      <SectionHeader title={title} subtitle={subtitle} />
      {children}
    </Stack>
  );
}

function Swatch({ name }: { name: keyof ColorScheme }) {
  const t = useTheme();
  const color = t.colors[name];
  const ratio = /^#/.test(color) && /^#/.test(t.colors.background) ? contrastRatio(color, t.colors.background) : null;
  return (
    <View style={styles.swatch}>
      <View style={[styles.swatchChip, { backgroundColor: color, borderColor: t.colors.border, borderRadius: t.radius.md }]} />
      <Text variant="caption" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="caption" color="textSecondary" tabular numberOfLines={1} style={styles.swatchMeta}>
        {color.toUpperCase()}
        {ratio ? ` · ${ratio.toFixed(1)}:1` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mt4: { marginTop: 4 },
  mt12: { marginTop: 12 },
  px16: { paddingHorizontal: 16 },
  hero: { padding: 24, paddingVertical: 28, overflow: 'hidden', marginBottom: 24 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: '30%', flexGrow: 1, gap: 2 },
  swatchChip: { height: 52, borderWidth: 1, marginBottom: 4 },
  swatchMeta: { fontSize: 10 },
  typeRow: { minHeight: 28 },
  typeKey: { width: 92 },
  frame: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  footer: { alignItems: 'center', gap: 6, paddingTop: 8 },
});
