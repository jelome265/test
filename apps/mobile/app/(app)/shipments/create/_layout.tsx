// app/(app)/shipments/create/_layout.tsx
import { Stack } from 'expo-router';

export default function CreateWizardLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="step-1" />
      <Stack.Screen name="step-2" />
      <Stack.Screen name="step-3" />
    </Stack>
  );
}
