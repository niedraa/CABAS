/**
 * Point d'entrée : redirige vers l'onboarding (premier lancement) ou vers
 * l'app (profil créé). Le layout racine n'affiche cet écran qu'une fois les
 * stores relus : pas de « flash » d'onboarding pour un utilisateur connu.
 */
import { Redirect } from 'expo-router';

import { entryHref } from '@/components/feature/onboarding';
import { useProfileStore } from '@/stores';

export default function Index() {
  const onboarded = useProfileStore((s) => s.onboardingCompleted);
  return <Redirect href={entryHref(onboarded)} />;
}
