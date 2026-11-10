/** Écran provisoire (remplacé par l'écran « Prix » définitif). */
import React from 'react';

import { EmptyState, Screen } from '@/components/ui';

export default function Placeholder() {
  return (
    <Screen title="Prix" bottomInset="none">
      <EmptyState title="Bientôt là" body="Le comparateur de prix arrive ici." />
    </Screen>
  );
}
