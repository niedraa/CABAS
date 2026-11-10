/* eslint-env jest */
// Mocks globaux pour l'environnement de test (jest-expo).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
