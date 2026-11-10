# Cabas — consignes de développement

App Expo SDK 58 (React Native 0.88, React 19.3, expo-router 58, Reanimated 4, TypeScript strict).
Lire `docs/ARCHITECTURE.md` (règles de dépendance, modules) et `docs/brand/README.md` (direction artistique).

## Règles
- Langue de l'UI : français, tutoiement, ton chaleureux et concis. Code et identifiants en anglais, commentaires en français.
- `src/core` est du TypeScript PUR (aucun import RN/Expo/npm, imports relatifs sans extension) — il est copié dans les Edge Functions Deno.
- Montants en centimes entiers ; dates jour `YYYY-MM-DD`.
- Toute couleur/taille/rayon/animation vient de `src/theme` (`useTheme()`), jamais de valeur en dur dans un écran.
- Animations : Reanimated (ressorts de `motion`), retour haptique via `src/lib/haptics.ts`.
- Accessibilité : `accessibilityRole`/`accessibilityLabel` sur tout élément interactif, cibles ≥ 44 pt, contrastes AA.
- `docs.expo.dev` n'est PAS joignable : vérifier les API dans les `.d.ts` de `node_modules/` (Expo change à chaque SDK).
- Installer une dépendance : `EXPO_OFFLINE=1 npx expo install <pkg>` (l'API Expo est bloquée). Éviter d'en ajouter.
- Ne jamais éditer `ios/` ou `android/` (CNG).

## Commandes
- `npm run typecheck` · `npm run lint` · `npm test` · `npm run build:web` · `npm run e2e`
- `npm run sync:shared` (copie src/core → supabase/functions/_shared/core) · `deno test` dans `supabase/functions`
