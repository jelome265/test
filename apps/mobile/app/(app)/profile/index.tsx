// app/(app)/profile/index.tsx
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button }           from '../../../src/components/ui/Button';
import { LoadingState }     from '../../../src/components/ui/LoadingState';
import { useMyProfile }     from '../../../src/hooks/use-auth';
import { useLogoutMutation } from '../../../src/hooks/use-auth';
import { useAuthStore }     from '../../../src/stores/auth.store';
import { colors, spacing, typography, radius } from '../../../src/theme';

export default function ProfileScreen() {
  const router      = useRouter();
  const user        = useAuthStore((s) => s.user);
  const { data: freshProfile, isLoading } = useMyProfile();
  const { mutate: logout, isPending: isLoggingOut } = useLogoutMutation();

  const profile = freshProfile ?? user;

  if (isLoading && !profile) return <LoadingState />;

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of all devices?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
      ],
    );
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar block */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
        </Text>
      </View>

      <Text style={styles.name}>{profile?.full_name ?? '—'}</Text>
      <Text style={styles.email}>{profile?.email ?? '—'}</Text>

      {/* Role badge */}
      <View style={styles.roleBadge}>
        <Text style={styles.roleText}>
          {profile?.role === 'super_admin' ? 'Super Admin'
           : profile?.role === 'admin'      ? 'Admin'
           :                                  'Customer'}
        </Text>
      </View>

      {/* Info card */}
      <View style={styles.card}>
        <InfoRow label="Email"  value={profile?.email ?? '—'} />
        <InfoRow label="Phone"  value={profile?.phone_number ?? '—'} />
        <InfoRow label="Status" value={profile?.is_active ? 'Active' : 'Deactivated'} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onPress={() => router.push('/(app)/profile/change-password')}
        >
          Change Password
        </Button>

        <Button
          variant="danger"
          size="md"
          fullWidth
          isLoading={isLoggingOut}
          disabled={isLoggingOut}
          onPress={handleLogout}
        >
          Sign Out
        </Button>
      </View>

      <Text style={styles.version}>CourierApp v1.7.0</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={irStyles.row}>
      <Text style={irStyles.label}>{label}</Text>
      <Text style={irStyles.value}>{value}</Text>
    </View>
  );
}

const irStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  label: { ...typography.body, color: colors.text.secondary },
  value: { ...typography.bodyBold, color: colors.text.primary },
});

const styles = StyleSheet.create({
  scroll:     { flex: 1, backgroundColor: colors.surface.background },
  container:  { padding: spacing.base, gap: spacing.lg, alignItems: 'center', paddingBottom: spacing.xxxl },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.brand.primary,
    alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.xl,
  },
  avatarText: { fontSize: 36, fontWeight: '700', color: colors.text.inverse },
  name:       { ...typography.h2, color: colors.text.primary },
  email:      { ...typography.body, color: colors.text.secondary },
  roleBadge: {
    backgroundColor: `${colors.brand.accent}15`,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  roleText:  { ...typography.label, color: colors.brand.accent, fontWeight: '600' },
  card:      {
    backgroundColor: colors.surface.card, borderRadius: radius.lg,
    padding: spacing.base, gap: spacing.xs, borderWidth: 1,
    borderColor: colors.surface.border, width: '100%',
  },
  actions:   { gap: spacing.sm, width: '100%' },
  version:   { ...typography.caption, color: colors.text.tertiary },
});
