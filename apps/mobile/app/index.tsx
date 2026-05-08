import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

export default function IndexScreen(): ReactElement {
  return <Redirect href="/(auth)/login" />;
}
