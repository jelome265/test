import { StyleSheet, Text, View } from 'react-native';

export default function LoginScreen(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>CourierApp</Text>
      <Text style={styles.subtitle}>Phase 1 foundation scaffold.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#0A1628',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#475467',
    fontSize: 16,
    textAlign: 'center',
  },
});
