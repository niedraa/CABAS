/** Écran provisoire (remplacé par l'écran « Liste » définitif). */
import React from 'react';

import { EmptyState, Screen } from '@/components/ui';

export default function Placeholder() {
  return (
    <Screen title="Liste" bottomInset="none">
      <EmptyState title="Bientôt là" body="Ta liste de courses arrive ici." />
    </Screen>
  );
}
