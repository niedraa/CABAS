/* global __dirname */
// Mocks globaux pour l'environnement de test (jest-expo).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ─── Reanimated 4 + Worklets ────────────────────────────────────────────────
// Les modules natifs n'existent pas sous Jest. Reanimated fournit un resolver
// Jest (`react-native-reanimated/jest/resolver`) qui force certaines sources à
// leur variante « web » ; comme la config Jest vit dans package.json, on
// reproduit ici son effet avec `jest.doMock` (non hissé, donc utilisable en
// boucle) : chaque fichier `.native` listé est remplacé par sa variante web.
// Ensuite on utilise les mocks officiels : `withSpring(x)` renvoie directement
// `x`, les layout animations (`entering`) sont ignorées.
{
  const path = require('path');
  const reanimatedSrc = path.join(__dirname, 'node_modules/react-native-reanimated/src');
  const WEB_ONLY_IN_JEST = [
    'initializers.native.ts',
    'mutables.native.ts',
    'mappers.native.ts',
    'ConfigHelper.native.ts',
    'UpdateLayoutAnimations.native.ts',
    'hook/useAnimatedRef.native.ts',
    'hook/useAnimatedStyle.native.ts',
    'WorkletEventHandler.native.ts',
    'createAnimatedComponent/JSPropsUpdater.native.ts',
    'updateProps/updateProps.native.ts',
    'animation/util.native.ts',
    'css/component/AnimatedComponent.native.tsx',
  ];
  for (const file of WEB_ONLY_IN_JEST) {
    const nativePath = path.join(reanimatedSrc, file);
    const webPath = nativePath.replace('.native.', '.');
    jest.doMock(nativePath, () => jest.requireActual(webPath));
  }
}
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// Gesture Handler : setup officiel (composants & Gesture API simulés).
require('react-native-gesture-handler/jestSetup');

// lucide-react-native : la condition « react-native » pointe vers un build ESM
// (.mjs) non transformé par Jest ; on charge explicitement le build CommonJS.
jest.mock('lucide-react-native', () =>
  jest.requireActual(
    require('path').join(__dirname, 'node_modules/lucide-react-native/dist/cjs/lucide-react-native.js'),
  ),
);
