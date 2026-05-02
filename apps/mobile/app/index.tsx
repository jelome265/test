import { Redirect } from 'expo-router';

export default function IndexScreen(): JSX.Element {
  return <Redirect href="/(auth)/login" />;
}
