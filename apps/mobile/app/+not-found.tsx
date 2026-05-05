// app/+not-found.tsx
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '../src/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen!</Text>
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
    backgroundColor: colors.surface.background,
  },
  title: {
    ...typography.h1,
    color: colors.text.primary,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    ...typography.bodyBold,
    color: colors.brand.accent,
  },
});
