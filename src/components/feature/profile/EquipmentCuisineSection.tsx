/**
 * Section « Cuisine » : ustensiles disponibles et cuisines préférées.
 * Composant contrôlé.
 */
import React from 'react';

import { ChipGroup, SectionHeader, Stack, Text } from '@/components/ui';
import type { Cuisine, Equipment } from '@/core';

import { CUISINE_CHOICES, EQUIPMENT_CHOICES } from './profileOptions';

export interface EquipmentCuisineValue {
  equipment: Equipment[];
  favoriteCuisines: Cuisine[];
}

export interface EquipmentCuisineSectionProps {
  value: EquipmentCuisineValue;
  onChange: (value: EquipmentCuisineValue) => void;
  testID?: string;
}

export function EquipmentCuisineSection({ value, onChange, testID = 'equipment-cuisine' }: EquipmentCuisineSectionProps) {
  return (
    <Stack gap="xxl" testID={testID}>
      <Stack gap="md">
        <SectionHeader title="Tes ustensiles" subtitle="On ne te proposera que des recettes faisables chez toi." />
        <ChipGroup
          mode="multi"
          options={EQUIPMENT_CHOICES}
          value={value.equipment}
          onChange={(equipment) => onChange({ ...value, equipment })}
          accessibilityLabel="Ustensiles"
          testID={`${testID}-equipment`}
        />
        {value.equipment.length === 0 ? (
          <Text variant="footnote" color="textSecondary">
            Sans ustensile, on misera sur les salades et les plats sans cuisson.
          </Text>
        ) : null}
      </Stack>

      <Stack gap="md">
        <SectionHeader title="Tes cuisines préférées" subtitle="Optionnel : elles reviendront plus souvent." />
        <ChipGroup
          mode="multi"
          options={CUISINE_CHOICES}
          value={value.favoriteCuisines}
          onChange={(favoriteCuisines) => onChange({ ...value, favoriteCuisines })}
          accessibilityLabel="Cuisines préférées"
          testID={`${testID}-cuisines`}
        />
      </Stack>
    </Stack>
  );
}
