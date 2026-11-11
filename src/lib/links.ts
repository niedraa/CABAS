/**
 * Ouverture d'un lien externe (fiche Open Food Facts, licence, source) :
 * navigateur du système. Renvoie `false` si l'URL n'a pas pu être ouverte.
 */
import { Linking } from 'react-native';

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!/^https:\/\//.test(url)) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
