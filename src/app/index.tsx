import { Text, View } from 'react-native';

import { useTheme } from '@/theme';

export default function Index() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <Text style={[t.typography.hero, { color: t.colors.text }]}>Cabas</Text>
    </View>
  );
}
