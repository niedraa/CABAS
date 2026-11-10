/** Écran provisoire (remplacé par l'écran « Profil » définitif). */
import React from 'react';

import { EmptyState, Screen } from '@/components/ui';

export default function Placeholder() {
  return (
    <Screen title="Profil" bottomInset="none">
      <EmptyState title="Bientôt là" body="Ton profil arrive ici." />
    </Screen>
  );
}
