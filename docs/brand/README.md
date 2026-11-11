# Cabas — Direction artistique « Marché frais »

> **Tes courses, de A à Z.**
> Le livre de marque de Cabas : intention, règles et briques. Toute valeur
> citée ici existe dans `src/theme/tokens.ts` ; tout composant cité existe dans
> `src/components/ui` ou `src/components/brand`. Galerie vivante : route
> **`/design-system`** (clair / sombre).

![Logo](./logo.svg)

---

## 1. Concept

Cabas, c'est le **cabas du marché** : le sac qu'on remplit en flânant entre les
étals, qu'on porte fièrement, qui sent la baguette et les tomates. La DA
« Marché frais » traduit cette sensation dans une app moderne :

| Valeur | Ce que ça donne à l'écran |
|---|---|
| **Chaleureux** | Fond **crème papier**, moutarde ensoleillée, emoji gourmands sur pastels, tutoiement. |
| **Généreux** | Grands titres en Bricolage Grotesque, cartes aux coins 20–28 pt, marges larges (20 pt), une idée par écran. |
| **Tactile** | Tout s'enfonce légèrement au toucher (ressort), boutons avec relief en bas, retour haptique sur les gestes qui comptent. |
| **Joyeux mais premium** | Couleurs franches mais profondes (vert forêt, jamais de vert fluo), célébrations ponctuelles, jamais de gadget gratuit. |
| **Honnête** | Les prix sont des chiffres tabulaires lisibles, les économies sont chiffrées, rien n'est caché derrière une animation. |

Les quatre briques du produit — **besoins, repas, prix, commande** — ont chacune
leur motif : le profil (puces), la semaine (vignettes emoji), les prix (ticket
dentelé), la commande (panier).

---

## 2. Voix & ton

On parle à **une personne** qui fait ses courses pour son foyer, souvent pressée.
On la **tutoie**, on est **concis**, **concret**, **bienveillant**. On ne culpabilise
jamais (budget, nutrition), on aide.

| ✅ À faire | ❌ À éviter |
|---|---|
| « Ta semaine est prête ! 10 repas, 63,42 € estimés. » | « Votre planning hebdomadaire a été généré avec succès. » |
| « Coche ce que tu as déjà : on le retire de la commande. » | « Veuillez sélectionner les articles déjà en votre possession. » |
| « Il te reste 6,20 € sur ton budget. » | « Attention ! Budget presque dépassé !!! » |
| « Ce plat contient des fruits à coque : il ne te sera jamais proposé. » | « Erreur : allergène. » |
| « Connexion perdue. Ta liste reste dispo hors-ligne. » | « Network error (code 503). » |
| Boutons à l'infinitif ou à l'impératif court : « Générer ma semaine », « Commander chez Leclerc ». | « OK », « Valider », « Soumettre ». |

Règles d'écriture :
- **Une phrase = une idée.** Titres ≤ 5 mots, corps ≤ 2 phrases.
- **Chiffres d'abord** : « −7,14 € » avant « d'économies ».
- Typographie française : espace fine insécable avant `€ % : ; ? !` (U+202F,
  gérée par `formatCents`), guillemets « », apostrophe typographique ’ dans les textes longs.
- Emoji : **un** emoji pour illustrer un aliment ou une émotion, jamais en remplacement d'un mot.
- Jamais de nom d'enseigne détourné ni de logo officiel : on écrit « Leclerc »,
  on montre un **monogramme** (voir § 8).

---

## 3. Logo

Le logo est le **panier** du dossier fondateur : corps trapézoïdal **moutarde**
(#E8A33D), **3 fentes** verticales vert forêt (#173A2C), **anse** arrondie.
Le mot-symbole « Cabas » est composé en Bricolage Grotesque ExtraBold.

| Variante | Fichier | Usage |
|---|---|---|
| Couleur (anse forêt) | `docs/brand/logo.svg`, `<CabasLogo variant="color" />` | Fonds clairs (crème, papier, blanc). |
| Inversée (anse crème) | `docs/brand/logo-reversed.svg`, `<CabasLogo variant="reversed" />` | Fonds forêt / mode sombre / splash. |
| Monochrome | `docs/brand/logo-mono.svg`, `<CabasLogo variant="mono" color=… />` | Une seule encre : gravure, notifications, icône thématique Android. Les fentes sont ajourées. |
| Icône d'app | `docs/brand/icon.svg` → `assets/images/icon.png` | Forêt + cercles doux + panier inversé. |

Sans `variant`, `<CabasLogo />` choisit seul : couleur en clair, inversée en sombre.

**Zone de protection** : autour du pictogramme, laisser au moins **la largeur
d'une fente × 2** (≈ 10 % de la hauteur du panier) ; autour du logo complet,
au moins la **hauteur de l'anse**.
**Taille minimale** : pictogramme 20 pt (favicon 16 px toléré) ; logo complet 24 pt de haut.

**Interdits** : déformer, incliner (sauf illustration `EmptyBasket`), changer la
couleur du corps, ajouter une ombre portée, poser la version couleur sur un
fond forêt (l'anse disparaît), mettre le panier dans un cercle tiers, réécrire
« Cabas » dans une autre police.

Géométrie (viewBox 120) : `src/components/brand/basket.ts`, recopiée dans
`scripts/generate-brand-assets.mjs` — les deux doivent rester identiques.

---

## 4. Couleurs

### 4.1 Palette (`palette`)

| Famille | Teintes | Rôle |
|---|---|---|
| **Forêt** | 900 `#0E241B` · 800 `#173A2C` · 700 `#1F4A38` · 600 `#2F6E50` · 500 `#3F8A66` · 300 `#8DBEA3` · 100 `#DCEBDF` · 50 `#EEF5EF` | Identité, en-têtes héros, boutons secondaires, succès, « meilleur prix ». |
| **Moutarde** | 800 `#8C5B14` · 700 `#B97A1E` · 600 `#D38E2B` · 500 `#E8A33D` · 300 `#F3C982` · 100 `#FBEBCB` · 50 `#FDF6E7` | CTA principal, premium, chaleur. 800 = moutarde **texte**. |
| **Crème / papier** | `#F6F1E7` · 200 `#EDE5D5` · 300 `#E1D6C1` · papier `#FFFCF6` | Fonds et cartes. |
| **Tomate** | 700 `#B23A22` · 600 `#C9452B` · 500 `#E0573A` · 100 `#FBE1D8` | Promos, économies, allergènes, suppression. 700 = texte. |
| **Prune** | 600 `#6B4B8A` · 100 `#EEE6F5` | Informations, IA. |
| **Encre** | 900 `#14231C` · 700 `#33433B` · 500 `#5B6B62` · 400 `#76847C` · 300 `#93A099` | Textes (300 réservé au décor). |
| **Nuit** | `#0B1712` … `#5E7A6C`, lin `#F3EEE3` | Mode sombre. |

> Ne jamais utiliser `palette` dans un écran : passer par les **rôles**
> (`useTheme().colors`) qui s'adaptent au mode sombre.

### 4.2 Rôles (`ColorScheme`)

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `background` | crème `#F6F1E7` | `#0F1E17` | Fond d'écran. |
| `backgroundAlt` | `#EDE5D5` | `#0B1712` | Pistes (segments, barres de progression), zones en retrait. |
| `surface` | papier `#FFFCF6` | `#16291F` | Cartes, champs, tickets. |
| `surfaceElevated` | `#FFFFFF` | `#1D3428` | Feuilles, dialogues, pastille active. |
| `text` / `textSecondary` / `textTertiary` | encre 900 / 500 / 400 | lin / `#B4C2B9` / `#7F988A` | Hiérarchie de texte. Tertiaire = **non essentiel** (placeholder, méta). |
| `primary` (+`onPrimary`, `primarySoft`) | forêt 800 | forêt 300 | Identité, bouton secondaire, sélection. |
| `accent` (+`onAccent`, `accentSoft`, `accentText`) | moutarde 500 | `#F0B14F` | CTA principal, premium. **Jamais** `accent` comme couleur de texte sur fond clair → `accentText`. |
| `success` / `priceBest` | forêt 600 | `#6FBF93` | Validation, meilleur prix. |
| `danger` / `savings` (+`onDanger`) | tomate 700 | `#F07A5E` | Erreurs, suppression, économies, remises. |
| `info` | prune 600 | `#B79BD6` | Informations, IA. |
| `hero` / `heroText` / `heroCircle` | forêt 800 / lin / forêt 600 | forêt 800 / lin / forêt 700 | Bandeaux héros et leurs cercles. |

Couleurs des **enseignes** (`storeColors`) et des **rayons** (`aisleColors`) :
réservées aux monogrammes et aux pastilles de rayon, jamais à l'interface.

#### Monogrammes des 10 enseignes

Un repère de couleur et d'initiales, **jamais un logo** (droit des marques).
Initiales uniques ; texte / fond ≥ 4,5:1 ; un fond clair porte un filet
(`border`) pour rester visible sur le papier. Vérifié par
`src/theme/__tests__/contrast.test.ts` (exhaustivité contre `STORE_CHAINS`)
et `src/components/ui/__tests__/display.test.tsx` (initiales, noms).

| Famille | Enseigne | Initiales | Fond | Texte | Filet |
|---|---|---|---|---|---|
| Hypers & supers | E.Leclerc | `L` | `#0058A6` | `#FFFFFF` | — |
| | Carrefour | `C` | `#E3ECF8` | `#B3121E` | `#8FA9D6` |
| | Auchan | `A` | `#C8102E` | `#FFFFFF` | — |
| | Intermarché | `I` | `#1E1E1E` | `#FF6B5E` | — |
| | Super U | `U` | `#38308C` | `#FFFFFF` | — |
| Discount | Lidl | `Li` | `#FFE500` | `#0050AA` | `#C9B200` |
| | Aldi | `Al` | `#0B1F4D` | `#FFB21E` | — |
| | Netto | `N` | `#E09B00` | `#1A1A1A` | — |
| Proximité | Monoprix | `M` | `#F2EEE6` | `#1A1A1A` | `#BFB5A3` |
| | Franprix | `F` | `#C2410C` | `#FFFFFF` | — |
| (inconnue) | 1re lettre du nom | | forêt 600 | lin | — |

Nom d'une enseigne dans l'interface : **un seul helper**, `storeDisplayName`
(`src/core/labels.ts`) — nom officiel dans les titres et listes (« E.Leclerc »),
`{ short: true }` dans une phrase (« Commander chez Leclerc »).

#### Provenance des prix

Les prix viennent de relevés en magasin (Open Prices) ; faute de relevé, ils
sont **estimés** et toujours signalés :

- relevé : légende `caption` `textSecondary` « Relevé le 5 nov. · 3 relevés » ;
- estimé : `Badge` « Estimé » (ton `neutral`) + la méthode en légende
  (« D'après les prix relevés ailleurs ») ; au panier et à la commande
  « dont 2 prix estimés », dans le texte copié « (prix estimé) » ;
- lecteurs d'écran : « prix relevé en magasin le 5 novembre, 3 relevés » /
  « prix estimé, faute de relevé dans cette enseigne » ;
- « Pas de prix connu chez X » (jamais « pas en rayon » : on ne sait pas) ;
- Nutri-Score en lettre texte, jamais le logo officiel ; fiche produit :
  lien vers Open Food Facts (bouton ⓘ, ≥ 44 pt).

### 4.3 Contrastes (WCAG 2.1)

Tous les couples texte/fond utilisés sont **AA** (≥ 4,5:1), sauf `textTertiary`
réservé au texte non essentiel / grand et aux icônes (≥ 3:1). Vérifié
automatiquement par `src/theme/__tests__/contrast.test.ts`.

| Texte | Fond | Clair | Sombre |
|---|---|---|---|
| `text` | `background` | **14,50:1** | **14,90:1** |
| `text` | `surface` | 15,93:1 | 13,24:1 |
| `textSecondary` | `background` | 5,01:1 | 9,32:1 |
| `textSecondary` | `surface` | 5,51:1 | 8,28:1 |
| `textTertiary` | `background` | 3,48:1 *(≥ 3:1, non essentiel)* | 5,55:1 |
| `textTertiary` | `surface` | 3,82:1 *(idem)* | 4,93:1 |
| `primary` | `background` | 11,12:1 | 8,23:1 |
| `onPrimary` | `primary` | 10,82:1 | 7,79:1 |
| `onAccent` | `accent` (bouton principal) | 7,57:1 | 8,63:1 |
| `accentText` | `accentSoft` | 4,93:1 | 6,94:1 |
| `accentText` | `background` | 5,15:1 | 9,12:1 |
| `onDanger` | `danger` (bouton destructif) | 5,96:1 | 6,53:1 |
| `danger` | `background` | 5,30:1 | 6,28:1 |
| `danger` | `dangerSoft` | 4,79:1 | 5,30:1 |
| `success` / `priceBest` | `surface` | 5,91:1 | 6,96:1 |
| `success` | `successSoft` | 4,90:1 | 5,62:1 |
| `savings` | `surface` | 5,82:1 | 5,58:1 |
| `info` | `infoSoft` | 5,76:1 | 6,26:1 |
| `heroText` | `hero` | 10,82:1 | 10,82:1 |
| `accent` | `hero` | 5,80:1 | 6,62:1 |
| `primary` | `primarySoft` | 10,13:1 | 5,90:1 |

Choix faits pour l'AA : `danger`/`savings` en clair passent de tomate 500
(3,3:1 sur crème) à **tomate 700** ; ajout de `accentText` (moutarde 800) ;
`textTertiary` foncé (encre 400 au lieu de 300, qui ne faisait que 2,4:1).

---

## 5. Typographie

| Famille | Usage |
|---|---|
| **Bricolage Grotesque** 600 / 700 / 800 | Titres, prix, monogrammes : caractère « enseigne de marché », chaleureux et graphique. |
| **DM Sans** 400 / 500 / 600 / 700 | Texte courant, boutons, libellés : très lisible en petit. |

Échelle (`typography`, `variant` de `<Text>`) :

| Variant | Police | Taille / interligne | Usage |
|---|---|---|---|
| `hero` | Bricolage 800 | 40 / 44, −1,2 | Onboarding, paywall. |
| `title1` | Bricolage 800 | 30 / 34 | Grand titre d'écran (repliable). |
| `title2` | Bricolage 700 | 24 / 29 | Titres d'état vide, de carte héros. |
| `title3` | Bricolage 700 | 19 / 24 | Titres de section, de feuille. |
| `headline` | DM Sans 700 | 16 / 22 | Titres de carte, boutons. |
| `body` / `bodyMedium` | DM Sans 400 / 500 | 16 / 23 | Texte courant / libellés de liste. |
| `callout` | DM Sans 400 | 15 / 21 | Sous-titres d'écran. |
| `subhead` | DM Sans 500 | 14 / 19 | Libellés de champ. |
| `footnote` | DM Sans 400 | 13 / 18 | Méta, aides. |
| `caption` | DM Sans 600 | 12 / 16 | Badges, onglets. |
| `overline` | DM Sans 700 | 11 / 14, +1,2, MAJ | Surtitres (« CETTE SEMAINE »). |
| `price` / `priceLarge` | Bricolage 700 / 800 | 17 / 34 | Prix, **chiffres tabulaires** obligatoires. |

Règles : un seul `title1` par écran ; pas plus de 3 niveaux visibles à la fois ;
`maxFontSizeMultiplier` 1,6 (texte agrandi accepté sans casser la mise en page) ;
prix en `<PriceTag>` / `<AnimatedPrice>` (centimes surélevés au-delà de 26 pt).

---

## 6. Iconographie

- **lucide-react-native**, trait **2** (2,2–2,5 pour les petites icônes dans les
  boutons et la coche), extrémités arrondies. Taille par défaut 20 (`iconSize`).
- Les icônes reprennent la couleur du texte qu'elles accompagnent ; jamais
  multicolores (la couleur, c'est le rôle des emoji et des illustrations).
- Une icône seule = `IconButton` avec `accessibilityLabel` obligatoire.
- Correspondances : Semaine `CalendarDays`, Liste `ListChecks`, Panier
  `ShoppingCart`, Profil `User`, Remplacer `Shuffle`, IA `Sparkles`, Premium
  `Crown`, Budget `PiggyBank`, Livraison `Truck`, Magasin `Store`, Temps `Clock`,
  Portions `Users`.

---

## 7. Formes & espace

- **Grille 4 pt** (`spacing`) ; marge d'écran **20 pt** (`spacing.screen`) ; largeur max 560 pt (tablette, web).
- **Rayons** (`radius`) : `xs` 6 (remises) · `sm` 10 (icônes) · `md` 14 (champs) ·
  `lg` 20 (cartes) · `xl` 28 (héros, feuilles, dialogues) · `pill` (boutons, puces).
- **Ombres** douces et teintées forêt (`boxShadow(level, colors.shadow)`),
  jamais noires ; en sombre, la hiérarchie vient surtout des surfaces.
- **Relief tactile** des boutons pleins : liseré intérieur plus sombre de 3 pt en bas.
- Cibles tactiles **≥ 44 pt** (`layout.minTouchTarget`, `hitSlop` automatique sur les petits contrôles).

---

## 8. Motifs

| Motif | Composant | Où |
|---|---|---|
| **Cercles doux superposés** (forêt 600 sur forêt 800, petite pastille moutarde) | `CircleDecor`, `Card variant="hero"` | Bandeaux héros, onboarding, paywall, icône d'app. Toujours débordant d'un coin, jamais centré. |
| **Ticket dentelé** | `ReceiptEdge`, `ReceiptCard`, `Divider variant="dashed"`, `KeyValueRow leader` | Tout ce qui parle d'argent : récapitulatif du panier, commande, détail de prix. |
| **Panier** | `BasketMark`, `EmptyBasket`, `Celebration` | Marque, états vides, réussite. |
| **Monogrammes d'enseigne** | `StoreBadge`, `StoreBadgeStack` | Cercle aux couleurs de la chaîne + initiale(s) (`L`, `C`, `A`, `I`, `U`, `Li`, `Al`, `N`, `M`, `F` — voir § 4). **Aucun logo officiel.** La pile se lit comme une image : « Enseignes : E.Leclerc, Lidl et Aldi » (ou un libellé de contexte : « 4 enseignes comparées »). |
| **Emoji sur pastel** | `RecipeThumb`, `Avatar` | Vignettes de recettes / produits : pastel déterministe dérivé du nom (8 pastels, version sombre dédiée). |

---

## 9. Mouvement

Tout est **ressort** (Reanimated 4), rien n'est linéaire (`motion`) :

| Ressort | Valeurs | Usage |
|---|---|---|
| `spring` | d 18, k 220 | Par défaut : apparitions, barres, anneaux. |
| `springSnappy` | d 22, k 380, m 0,8 | Enfoncement au toucher (`pressScale` 0,97). |
| `springBouncy` | d 12, k 180 | Coches, puces, FAB, dialogues, célébration. |
| `springIndicator` | d 20, k 300, m 0,9 | Pastille d'onglet, segment, interrupteur. |
| `springSheet` | d 26, k 260 | Feuilles modales. |
| `springToast` | d 17, k 240, m 0,9 | Toasts. |

Principes :
1. **Le toucher répond tout de suite** : `PressableScale` enfonce (0,97) puis relâche au ressort.
2. **Les listes arrivent en cascade** : `StaggeredList` / `staggerEntering(i)` — `FadeInDown` + ressort, décalage `motion.stagger` = 45 ms, plafonné à 600 ms.
3. **Les nombres comptent** : `AnimatedPrice` défile vers le nouveau total (sans rebond : un prix ne « rebondit » pas).
4. **On célèbre rarement** : `Celebration` (gerbe de confettis 900 ms + haptique succès) seulement pour la semaine générée, la commande prête, un objectif d'économie atteint.
5. **Sorties plus rapides que les entrées** (`duration.fast` 160 ms).
6. **Réduire les animations** respecté partout (`useReducedMotion`, `ReduceMotion.System`) : pas d'échelle, pas de shimmer, valeurs finales directes.

---

## 10. Haptique (`src/lib/haptics.ts`)

| Fonction | Retour | Déclencheurs |
|---|---|---|
| `tap()` | impact léger | Boutons secondaires, cartes, lignes de liste. |
| `impact()` | impact moyen | Bouton primaire, FAB. |
| `select()` | sélection | Puce, segment, onglet, interrupteur, stepper, cran de feuille. |
| `success()` | notification succès | Article coché, toast succès, célébration, confirmation. |
| `warning()` | notification avertissement | Stepper en butée, maximum de puces atteint, limite gratuite. |
| `error()` | notification erreur | Toast d'erreur, validation échouée. |

No-op sur le web et quand l'utilisateur coupe les vibrations
(`setHapticsEnabled(false)`, branché sur le réglage « Retour haptique »).

---

## 11. Illustration

Formes **plates**, sans contour, sans dégradé, posées sur une **pastille ronde**
douce (`primarySoft`, `accentSoft`, `dangerSoft`), ombre portée = ellipse
`colors.shadow`. Palette produits fixe (`produceColors` : feuille, carotte,
tomate, citron, pain). Composants : `EmptyBasket`, `EmptyList`, `CookingPot`,
`Produce` (`leaf | carrot | tomato | baguette | lemon`), `ProduceSet`,
`Celebration`. Décoratives par défaut (masquées aux lecteurs d'écran).
Pas de photo d'aliment générique : l'emoji sur pastel est la signature.

---

## 12. Mode sombre

« Nuit au marché » : fonds vert nuit (`#0F1E17`), surfaces qui s'éclaircissent
avec l'élévation, textes lin, forêt devient forêt 300 (sélection), moutarde
légèrement plus claire (`#F0B14F`). Les bandeaux héros restent forêt 800, les
pastels ont une version sombre dédiée, le logo passe en version inversée.
Le thème suit le système par défaut (`ThemeProvider preference="system"`),
modifiable dans Réglages → Apparence.

---

## 13. Accessibilité

- Contrastes AA vérifiés par test (§ 4.3).
- `accessibilityRole` / `accessibilityLabel` / `accessibilityState` sur tout élément interactif (fournis par le kit).
- Cibles ≥ 44 pt ; `Stepper` = contrôle **ajustable** (gestes haut/bas) ; `Chip` = case à cocher ou radio.
- Prix lus en clair : `formatPriceForA11y(499)` → « 4 euros 99 », prix barré → « … au lieu de … ».
- Toasts annoncés (`announce`) ; erreurs de champ en région « live ».
- Texte agrandi supporté (×1,6) ; animations réduites respectées.
- Jamais d'information portée par la couleur seule (badge + texte, coche + barré).

---

## 14. Stores (App Store / Google Play)

- **Icône** : `assets/images/icon.png` (1024, opaque) ; Android adaptatif :
  avant-plan transparent dans la zone sûre de 66 %, fond forêt uni, icône
  monochrome blanche (Android 13+).
- **Écran de lancement** : fond forêt `#173A2C`, panier inversé centré (`splash-icon.png`).
- **Captures** (6,7″ et 6,1″) : fond crème, une phrase par capture en Bricolage
  800 forêt (« Tes repas de la semaine, en 10 secondes »), appareil incliné de 0°
  (pas de mockup 3D), cercles doux en arrière-plan, une capture en mode sombre.
  Ordre : 1. Semaine planifiée · 2. Liste par rayon · 3. Comparateur (ticket) ·
  4. Panier optimisé · 5. Commande drive · 6. Profil (allergies, RGPD).
- **Notification** : `notification-icon.png` (96, blanc sur transparent), couleur d'accent moutarde.
- Pas de logos d'enseignes dans les visuels marketing (monogrammes uniquement).

Régénérer tous les visuels : `node scripts/generate-brand-assets.mjs`
(Playwright/Chromium ; écrit aussi `docs/brand/*.svg`).

---

## 15. Kit UI — inventaire

`import { … } from '@/components/ui'` (thème uniquement, `useTheme()`) :

- **Structure** : `Screen` (zone sûre, défilement, grand titre repliable, réserve barre d'onglets, pied collé), `TopBar`/`Header`, `Stack`/`Row`, `SectionHeader`, `Divider`.
- **Actions** : `Button` (primary · secondary · tonal · ghost · danger ; sm · md · lg ; icônes ; chargement), `IconButton`, `FAB`, `PressableScale` (primitive de tout ce qui se touche).
- **Sélection** : `Chip`, `ToggleChip`, `ChipGroup` (single/multi, max), `Stepper`, `SegmentedControl`, `Switch`, `Checkbox`.
- **Saisie** : `TextField`, `SearchField`.
- **Contenu** : `Card` (plain · elevated · outlined · hero · accent), `ListRow`, `KeyValueRow`, `Badge`, `InfoBanner`, `Avatar`, `RecipeThumb`, `StoreBadge`/`StoreBadgeStack`.
- **Prix** : `PriceTag` (barré, remise, €/kg, meilleur prix), `AnimatedPrice`/`AnimatedNumber`.
- **Progression** : `ProgressBar`, `ProgressRing`, `Skeleton`/`SkeletonText`.
- **États** : `EmptyState`, `StaggeredList`.
- **Surcouches** : `Sheet` (glisser pour fermer, crans), `Dialog`/`ConfirmDialog`, `ToastProvider` + `useToast()`.
- **Navigation** : `AnimatedTabBar` (compatible `tabBar` d'expo-router).

`import { … } from '@/components/brand'` : `CabasLogo`, `BasketMark`,
`CircleDecor`, `ReceiptEdge`, `ReceiptCard`, illustrations, `Celebration`.

Racine de l'app : `GestureHandlerRootView` › `SafeAreaProvider` › `ThemeProvider`
› **`ToastProvider`** (à ajouter par le layout racine).
