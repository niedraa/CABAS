# Cabas — Architecture

> Tes courses, de A à Z. Application mobile (iOS + Android, une seule base de code)
> qui planifie les repas, génère la liste de courses, compare les prix entre
> enseignes et prépare la commande drive / livraison — en **France** et en **Espagne**.

## Pays et enseignes

| Pays | Enseignes (catalogue de démo) | Ville |
|---|---|---|
| 🇫🇷 France | E.Leclerc, Carrefour, Auchan, Intermarché, Lidl, Super U, Monoprix | Lyon |
| 🇪🇸 Espagne | Mercadona, Carrefour, Lidl, Dia, Alcampo, Eroski, Consum | Barcelone |

- `Store.country` (`FR` / `ES`) et `Store.hasDrive` (retrait drive / click & collect ;
  sinon courses en magasin, sans minimum de commande).
- Carrefour et Lidl existent dans les deux pays (`carrefour` / `carrefour_es`,
  `lidl` / `lidl_es`) et partagent leurs marques distributeur ; les MDD espagnoles
  (Hacendado, Dia, Alcampo, Eroski, Consum) portent un EAN 84x.
- Le comparateur ne compare que les magasins des **pays** des enseignes choisies
  (`core › comparableStoreIds`) ; un frontalier peut panacher les deux pays.
- **Prix réels** : `src/data/openPrices.ts` contient de vrais produits (codes-barres Open Food Facts)
  et leurs prix **relevés en magasin** (Open Prices, licence ODbL) depuis novembre 2025 — environ
  1 050 relevés sur ~790 produits pour 120 ingrédients, surtout en France (très peu de relevés en
  Espagne). Rafraîchir : `npm run prices:refresh` (scripts/open-prices/).
- **Prix estimés** (le reste) : indice enseigne × niveau de prix du pays (Espagne ≈ −12 %), recalés sur
  le prix au kilo médian relevé pour l'ingrédient (`data/mergeCatalog.ts`). Un relevé remplace
  toujours l'estimation pour le même ingrédient dans le même magasin. L'app affiche la provenance
  (« Relevé le … » / « Prix estimé ») et ouvre chaque produit sur le site de l'enseigne
  (recherche par libellé réel + marque, en espagnol pour les enseignes espagnoles).

## Vue d'ensemble

```
┌───────────────────────── App Expo (React Native, TypeScript) ─────────────────────────┐
│ src/app/            Écrans (expo-router)                                               │
│ src/components/     Design system (ui/) + composants métier (feature/)                 │
│ src/stores/         État client (zustand + persistance AsyncStorage → mode hors-ligne) │
│ src/services/       Accès aux données & SDK (Supabase, RevenueCat, PostHog, Sentry…)   │
│ src/core/           Logique métier PURE (partagée avec les Edge Functions)             │
│ src/data/           Catalogue de démonstration (recettes, produits, prix, enseignes)   │
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
app → components, stores, services, core, theme
components/feature → components/ui, stores, core, theme
components/ui → theme (uniquement)
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
| `priceComparison.ts` | Meilleure offre par enseigne, prix au kilo, alternative MDD moins chère |
| `basketOptimizer.ts` | Panier « le moins cher » (multi-magasins, max 2) ou « un seul magasin » (meilleur total), frais inclus |
| `order.ts` | Transmission de commande : URL drive pré-remplie / redirection, texte de liste |
| `entitlements.ts` | Gratuit vs Premium (3 repas/semaine, panier optimisé, commande 1 clic, alertes prix) |
| `pantry.ts` | (V2) Placard : stock maison, déduction de la liste, recettes « anti-gaspi » |
| `budget.ts` | (V2) Dépenses par semaine / mois, économies réalisées |
| `priceAlerts.ts` | Détection des baisses de prix sur les produits habituels |

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
  liste.tsx                 Liste de courses par rayon (hors-ligne, partage, placard)
  panier.tsx                Comparateur + panier optimisé (un magasin / le moins cher, drive / livraison)
  profil.tsx                Profil & réglages
recette/[id].tsx            Fiche recette + mode cuisine pas à pas
remplacer/[mealId].tsx      Remplacer un plat (feuille modale)
comparateur/[itemId].tsx    Détail des prix d'un article
commande/[storeId].tsx      Commande : panier pré-rempli → drive / livraison
premium.tsx                 Paywall
placard.tsx                 (V2) Placard & anti-gaspi
budget.tsx                  (V2) Suivi du budget
parametres/[section]        Édition du profil : foyer, regime, budget, cuisine, magasins, repas
parametres/notifications    Rappels et alertes prix
parametres/compte           Export et suppression des données (RGPD)
```

## Qualité

- `npm run typecheck`, `npm run lint`, `npm test` (Jest + Testing Library),
  `npm run e2e` (Playwright sur le build web `dist/` : onboarding, semaine, liste, prix,
  commande, Premium, Espagne, placard, mode sombre, suppression du compte — captures dans
  `e2e/screenshots/`), `deno test` pour les fonctions.
- CI GitHub Actions à chaque PR (`.github/workflows/ci.yml`).
- Sentry (erreurs) et PostHog (analytique produit) sont des no-op sans clé.
