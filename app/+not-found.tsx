import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/useTheme';

export default function NotFoundScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={[styles.linkText, { color: colors.brand }]}>Go to Today</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
