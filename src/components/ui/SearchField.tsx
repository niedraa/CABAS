/**
 * Champ de recherche en pilule (loupe à gauche, effacement à droite).
 */
import React, { forwardRef } from 'react';
import { Search } from 'lucide-react-native';

import { TextField, type TextFieldProps, type TextFieldRef } from './TextField';

export type SearchFieldProps = Omit<TextFieldProps, 'leftIcon' | 'shape' | 'label'>;

export const SearchField = forwardRef<TextFieldRef, SearchFieldProps>(function SearchField(
  { placeholder = 'Rechercher', accessibilityLabel, ...rest },
  ref,
) {
  return (
    <TextField
      ref={ref}
      leftIcon={Search}
      shape="pill"
      clearable
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel ?? placeholder}
      returnKeyType="search"
      autoCorrect={false}
      autoCapitalize="none"
      {...rest}
    />
  );
});
