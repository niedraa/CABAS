# Cabas

> **Tes courses, de A à Z.** Cabas planifie tes repas de la semaine, génère la
> liste de courses, compare les prix entre enseignes et prépare ta commande
> drive ou livraison. Une seule base de code pour iOS, Android (et le web).

<p align="center"><img src="docs/brand/logo.svg" alt="Logo Cabas" width="220" /></p>

## Ce que fait l'app

| Brique | Écrans | Ce qui se passe |
|---|---|---|
| **Besoins** | Onboarding en 7 étapes, Profil | Foyer (portions adulte/enfant), régimes, allergies (consentement RGPD), ingrédients exclus, budget, temps de cuisine, ustensiles, cuisines, enseignes, créneaux midi/soir. |
| **Repas** | Ma semaine, Fiche recette, Mode cuisine, Remplacer un plat | Planning hebdo généré en quelques secondes (IA côté serveur, moteur de règles hors-ligne), **aucun plat avec un allergène déclaré** (vérifié côté serveur et côté téléphone), verrouillage, remplacement, minuteurs. |
| **Liste** | Liste de courses, Placard | Ingrédients agrégés, convertis et arrondis aux vrais conditionnements, rangés par rayon, **100 % hors-ligne** ; le placard est déduit de la liste et suggère des recettes anti-gaspi. |
| **Prix** | Comparateur, Détail d'un article | ≥ 3 enseignes par produit, prix au kilo, alternative MDD moins chère, panier « un seul magasin » ou « le moins cher » (2 magasins max, frais inclus). |
| **Commande** | Commande | Panier pré-rempli vers le drive / la livraison de l'enseigne, liste à copier, dépense ajoutée au budget. |
| **Premium** | Paywall, Abonnement, Budget | 4,99 €/mois ou 39,99 €/an, 7 jours d'essai : planning illimité, panier optimisé, commande en un clic, alertes prix, suivi du budget. |

## Démarrer

```bash
npm ci
```

```bash
npx expo start
```

Sans variables d'environnement, l'app tourne en **mode démo** : catalogue
embarqué (`src/data`), moteur de repas local, abonnement simulé. Tout est
utilisable sans réseau. Pour brancher la production, copie `.env.example` en
`.env.local` et renseigne Supabase, RevenueCat, PostHog et Sentry.

Outils de développement (build de dev ou `EXPO_PUBLIC_DEV_TOOLS=1`) :
- `/dev/seed?variant=fresh|onboarded|premium` remplit l'app avec un état de démonstration ;
- `/design-system` affiche la galerie vivante de la direction artistique.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (config Expo) |
| `npm test` | Jest + Testing Library (cœur métier, stores, services, composants) |
| `npm run build:web` puis `npm run e2e` | Parcours complet dans Chromium (Playwright), 4 configurations thème × largeur, captures dans `e2e/screenshots/` |
| `npm run test:backend` | Tests SQL sur PGlite (schéma, RLS, RPC), scripts, Edge Functions (Deno) |
| `npm run sync:shared` | Recopie `src/core` dans les Edge Functions (à lancer après toute modification du cœur) |

`E2E_BASE_URL=http://localhost:8081 npm run e2e` rejoue les parcours contre le
serveur de développement ; `E2E_ONLY=dark-390` limite à une configuration.
L'horloge du navigateur démarre un mercredi matin (jours déjà passés compris) ;
`E2E_NOW=2026-11-15T18:00:00+01:00` simule une autre date, ici un dimanche soir.

## Architecture

```
src/app/         Écrans (expo-router)
src/components/  Kit UI (ui/), marque (brand/), composants métier (feature/)
src/stores/      État client (zustand + persistance → hors-ligne)
src/services/    Supabase, RevenueCat, notifications, analytique, RGPD
src/core/        Logique métier PURE, partagée avec les Edge Functions
src/data/        Catalogue de démonstration
src/theme/       Tokens de la direction artistique
supabase/        Migrations Postgres + RLS, Edge Functions Deno, seed
e2e/             Tests de bout en bout (Playwright)
```

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — modules, règles de dépendance, navigation.
- [`docs/BACKEND.md`](docs/BACKEND.md) — schéma, RLS, API des fonctions, tâches planifiées, RGPD, déploiement.
- [`docs/brand/README.md`](docs/brand/README.md) — direction artistique « Marché frais » : logo, couleurs, typographie, mouvement, voix.

## Données

Produits, prix et enseignes viennent de **données ouvertes** sous licence
ODbL, créditées dans l'app :

- [Open Food Facts](https://world.openfoodfacts.org) : fiches produit (nom, contenance, Nutri-Score, allergènes) ;
- [Open Prices](https://prices.openfoodfacts.org) : prix relevés en magasin par la communauté ;
- [OpenStreetMap](https://www.openstreetmap.org/copyright) : magasins et enseignes.

Le prix d'une enseigne est **national** : médiane de ses relevés en France
métropolitaine sur 365 jours, hors promotions. Sans relevé, le prix est
**estimé** (indice de prix de l'enseigne, MDD équivalente, médiane du vrac) et
toujours signalé « Estimé ». Les produits retenus pour chaque ingrédient sont
listés à la main dans `src/data/productSources.ts`.

| Commande | Rôle |
|---|---|
| `npm run data:fetch` | Télécharge les exports Open Prices et les fiches Open Food Facts dans `.cache/open-data/` |
| `npm run data:snapshot` | Construit l'instantané versionné `src/data/openData/snapshot.json` (+ rapport de relecture) |
| `npm run data:generate` | Régénère `src/data/products.ts`, `prices.ts`, `meta.ts` (un test vérifie qu'ils sont à jour) |
| `npm run data:all` | Les trois à la suite |

- [`docs/OPEN_DATA.md`](docs/OPEN_DATA.md) — pipeline, filtres, méthodes d'estimation, rafraîchissement.
- [`DATA_LICENSE.md`](DATA_LICENSE.md) — licence ODbL, attribution, contenu de l'instantané.

## Livrer

- Back-end : voir [`docs/BACKEND.md` § Déploiement](docs/BACKEND.md#7-déploiement) (`supabase db push`, `supabase functions deploy`).
- App : profils EAS `development`, `preview`, `beta`, `production` (`eas build --profile production`, puis `eas submit`). Les identifiants App Store Connect / Google Play sont à renseigner dans `eas.json`.
- CI GitHub Actions à chaque PR : types, lint, tests, synchronisation du cœur, back-end, e2e.
