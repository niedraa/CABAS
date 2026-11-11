# Cabas — Architecture

> Tes courses, de A à Z. Application mobile (iOS + Android, une seule base de code)
> qui planifie les repas, génère la liste de courses, compare les prix entre
> enseignes et prépare la commande drive / livraison.

## Vue d'ensemble

```
┌───────────────────────── App Expo (React Native, TypeScript) ─────────────────────────┐
│ src/app/            Écrans (expo-router)                                               │
│ src/components/     Design system (ui/) + composants métier (feature/)                 │
│ src/stores/         État client (zustand + persistance AsyncStorage → mode hors-ligne) │
│ src/services/       Accès aux données & SDK (Supabase, RevenueCat, PostHog, Sentry…)   │
│ src/core/           Logique métier PURE (partagée avec les Edge Functions)             │
│ src/data/           Catalogue embarqué : recettes, produits & prix réels (ODbL)        │
│ src/theme/          Tokens de la direction artistique                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
                │ supabase-js (Auth, PostgREST, Functions)
┌───────────────▼──────────────── Supabase (région UE) ─────────────────────────────────┐
│ supabase/migrations/   Schéma Postgres + RLS                                           │
│ supabase/functions/    Edge Functions Deno : generate-meal-plan, optimize-basket,      │
│                        collect-prices, send-notifications, revenuecat-webhook,         │
│                        account (export / suppression RGPD)                             │
│ supabase/functions/_shared/core/  Copie générée de src/core (npm run sync:shared)      │
└────────────────────────────────────────────────────────────────────────────────────────┘
        │ Claude API (menus)   │ Open Prices / Open Food Facts   │ RevenueCat   │ Expo Push
```

### Deux modes d'exécution

| Mode | Quand | Données | Moteur de repas | Abonnement |
|---|---|---|---|---|
| **Démo / hors-ligne** | `EXPO_PUBLIC_SUPABASE_URL` absent | `src/data` (embarqué) | `core/mealEngine` local (règles) | simulé (essai 7 j) |
| **Production** | variables d'env. présentes | Supabase (+ cache local) | Edge Function `generate-meal-plan` (Claude + validation serveur, repli règles) | RevenueCat |

L'app est donc **toujours utilisable**, même sans réseau (liste de courses hors-ligne exigée par le dossier).

## Règles de dépendance (strictes)

```
app → components, stores, services, core, theme, hooks, lib
components/feature → components/ui, stores, core, theme, lib (haptics, a11y, storage)
                     + `import type` depuis services (types partagés uniquement)
components/ui → theme, lib (haptics, a11y, format)
stores → services, core
services → core, data, lib
core → (rien — TypeScript pur, aucun import RN/Expo/npm)
data → core/types (imports `import type` uniquement)
```

- `src/core` ne doit **jamais** importer React Native, Expo, Supabase ni un module npm :
  il est copié dans les Edge Functions Deno par `scripts/sync-shared.mjs`.
  Imports relatifs uniquement, sans extension (`./units`), le script ajoute `.ts`.
- Montants : **centimes entiers** partout. Dates jour : `YYYY-MM-DD`.
- Les allergènes sont filtrés **côté serveur et côté client** par
  `core/constraints.ts`, indépendamment de l'IA (critère de réussite : aucune
  suggestion contenant un allergène déclaré).

## Modules métier (`src/core`)

| Fichier | Responsabilité |
|---|---|
| `types.ts` | Modèle de domaine (source de vérité) |
| `dates.ts` | Semaines (lundi), jours ISO, libellés FR |
| `money.ts` | Formatage prix `4,99 €`, prix au kilo |
| `units.ts` | Conversion d'unités (g/kg/ml/cl/l/pièce/cs/cc…), formatage FR des quantités |
| `portions.ts` | Portions foyer (adulte = 1, enfant = 0,6), mise à l'échelle des recettes |
| `constraints.ts` | Allergènes / régimes / ingrédients exclus / ustensiles / temps → autorisé ou non + raisons |
| `mealEngine.ts` | Planning hebdo déterministe (variété, temps, budget, goûts), remplacement d'un plat, prompt & validation de la réponse LLM |
| `shoppingList.ts` | Agrégation des ingrédients, conversion, arrondi aux conditionnements réels, fusion avec les ajouts manuels |
| `priceComparison.ts` | Meilleure offre par enseigne, prix au kilo, alternative MDD moins chère ; provenance des prix (relevé > estimation > démo), MDD par `storeChains`, exclusion des produits allergènes |
| `basketOptimizer.ts` | Panier « le moins cher » (multi-magasins, max 2) ou « un seul magasin » (meilleur total), frais inclus |
| `order.ts` | Transmission de commande : URL drive pré-remplie / redirection (gabarit sans `{query}` ouvert tel quel), texte de liste (« (prix estimé) ») |
| `entitlements.ts` | Gratuit vs Premium (3 repas/semaine, panier optimisé, commande 1 clic, alertes prix) |
| `pantry.ts` | (V2) Placard : stock maison, déduction de la liste, recettes « anti-gaspi » |
| `budget.ts` | (V2) Dépenses par semaine / mois, économies réalisées |
| `priceAlerts.ts` | Détection des baisses de prix sur les produits habituels (jamais sur une estimation) |

## État client (`src/stores`)

Zustand + `persist` (AsyncStorage). Un store par domaine :
`profileStore`, `planStore`, `listStore`, `basketStore`, `orderStore`,
`subscriptionStore`, `settingsStore`, `pantryStore`, `budgetStore`.

## Navigation (`src/app`)

```
_layout.tsx                 Providers, polices, splash, garde d'onboarding
(onboarding)/               Bienvenue → foyer → régimes & allergies (consentement RGPD)
                            → budget & temps → ustensiles → magasins → créneaux → génération
(tabs)/                     Barre d'onglets personnalisée
  index.tsx                 Ma semaine (planning midi/soir)
  liste.tsx                 Liste de courses (hors-ligne)
  panier.tsx                Comparateur + panier optimisé
  profil.tsx                Profil & réglages
recette/[id].tsx            Fiche recette + mode cuisine pas à pas
remplacer/[mealId].tsx      Remplacer un plat (feuille modale)
comparateur/[itemId].tsx    Détail des prix d'un article
commande/[storeId].tsx      Commande : panier pré-rempli → drive / livraison
premium.tsx                 Paywall
placard.tsx                 (V2) Placard & anti-gaspi
budget.tsx                  (V2) Suivi du budget
parametres/profil/[section]  Édition d'une section du profil (foyer, regime, budget-temps,
                            cuisine, magasins, creneaux) — consentement RGPD exigé
parametres/notifications    Rappels (planification, commande), baisses de prix (Premium)
parametres/apparence        Thème (auto / clair / sombre), retour haptique
parametres/abonnement       Statut, restauration, gestion de l'abonnement
parametres/compte           Compte & données (RGPD) : consentements, export JSON, suppression
parametres/sources          Sources et licences : Open Food Facts, Open Prices, OpenStreetMap (ODbL),
                            instantané, couverture et indice de prix par enseigne, méthode des estimations
dev/seed, design-system     Outils de développement (état de démo, galerie de la DA)
```

Composants métier par écran : `src/components/feature/<domaine>/` (onboarding,
profile, planning, recipe, list, pantry, basket, order, premium, account,
budget, sources), chacun avec sa logique de présentation pure (`*View.ts`,
testée) et ses tests dans `__tests__/`.

### Données réelles dans l'interface

- **10 enseignes** (`STORE_CHAINS`, ordre d'affichage) groupées par famille
  (`STORE_CHAIN_GROUPS` : Hypers & supers / Discount / Proximité). Nom affiché :
  **un seul helper**, `storeDisplayName(store, { short? })` (`core/labels.ts`).
  Monogrammes (`STORE_MONOGRAMS`, initiales uniques) et `storeColors` couvrent
  les 10 (tests d'exhaustivité). Services depuis `Store.pickup` et les frais
  indicatifs : « Drive gratuit », « Click & collect », « Courses en magasin »,
  « Livraison ≈ 6,90 € » ; sans retrait en ligne (`pickup: 'none'`), la
  commande devient « Ma liste pour Lidl ».
- **Provenance des prix** : `core/priceComparison` copie sur chaque `StoreOffer`
  les champs de vue OPTIONNELS `priceSource`, `priceUpdatedAt`,
  `observationCount`, `estimateMethod` ; `BasketLine.priceSource` suit le
  panier jusqu'à la commande (« dont N prix estimés », « (prix estimé) » dans
  le texte copié). Présentation : `components/feature/basket/provenanceView.ts`.
  `isPreferredPrice` classe par fiabilité (relevé > estimation > démo) puis par
  date ; les alertes prix ignorent les estimations.
- **MDD** : `Product.storeChains` (une MDD des Mousquetaires est vendue chez
  Intermarché ET Netto) ; une MDD n'est proposée que dans ses enseignes.
- **Allergènes** : un produit dont `allergens` (ingrédient ∪ Open Food Facts)
  croise ceux du profil n'est jamais proposé — index filtré
  (`services/catalog › catalogIndexWithoutAllergens`), option
  `excludeAllergens` de `compareList` / `allOffersForItem`, et filtre de
  `productChoices` (défense en profondeur). Le panier est recalculé si les
  allergies du profil changent.
- **Transparence** : pied de l'onglet Prix (`priceDataNotice(meta)`, même texte
  que `PRICE_DATA_NOTICE` pour l'instantané embarqué) et écran
  `parametres/sources` (`components/feature/sources`), qui lisent `CatalogMeta`
  de l'instantané courant (`useCatalog().meta`).

## Qualité

- `npm run typecheck`, `npm run lint`, `npm test` (Jest + Testing Library),
  `npm run e2e` (Playwright sur le build web : parcours complet en 13 étapes, de
  l'onboarding à la suppression du compte, dans 4 configurations clair / sombre ×
  390 / 360 pt ; horloge du navigateur fixée à un mercredi, ou à `E2E_NOW`,
  pour couvrir le milieu de semaine sans dépendre du jour ; voir `e2e/`),
  `deno test` pour les fonctions.
- CI GitHub Actions à chaque PR (`.github/workflows/ci.yml`).
- Sentry (erreurs) et PostHog (analytique produit) sont des no-op sans clé.
