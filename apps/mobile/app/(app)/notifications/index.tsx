// app/(app)/notifications/index.tsx
import React, { useCallback } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';

import type { AppNotification } from '@courier/shared-types';

import { EmptyState }   from '../../../src/components/ui/EmptyState';
import { LoadingState } from '../../../src/components/ui/LoadingState';
import { Button }       from '../../../src/components/ui/Button';
import { notificationsApi } from '../../../src/api/notifications';
import { useNotificationStore } from '../../../src/stores/notification.store';
import { queryClient } from '../../../src/hooks/query-client';
import { colors, spacing, typography } from '../../../src/theme';

export default function NotificationsScreen() {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationsApi.listNotifications({ limit: 30 }),
  });

  // Effect to update unread count when data changes
  React.useEffect(() => {
    if (data) {
      setUnreadCount(data.unread_count);
    }
  }, [data?.unread_count]);

  const { mutate: markAllRead, isPending: isMarkingAll } = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnreadCount(0);
    },
  });

  const { mutate: markOneRead } = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnreadCount(Math.max(0, (data?.unread_count ?? 1) - 1));
    },
  });

  const notifications = data?.data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationItem
        notification={item}
        onPress={() => !item.is_read && markOneRead(item.id)}
      />
    ),
    [markOneRead],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {(data?.unread_count ?? 0) > 0 && (
          <Button
            variant="ghost"
            size="sm"
            isLoading={isMarkingAll}
            disabled={isMarkingAll}
            onPress={() => markAllRead()}
          >
            Mark all read
          </Button>
        )}
      </View>

      {isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              emoji="🔔"
              title="No notifications"
              description="You'll be notified when your shipments update."
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => void refetch()}
              tintColor={colors.brand.accent}
            />
          }
        />
      )}
    </View>
  );
}

function NotificationItem({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress:      () => void;
}) {
  const timeAgo = formatTimeAgo(notification.created_at);

  return (
    <Pressable
      style={[styles.item, !notification.is_read && styles.itemUnread]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.itemDot}>
        {!notification.is_read && <View style={styles.dot} />}
      </View>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={1}>{notification.title}</Text>
        <Text style={styles.itemBody}  numberOfLines={2}>{notification.body}</Text>
        <Text style={styles.itemTime}>{timeAgo}</Text>
      </View>
    </Pressable>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now  = Date.now();
  const then = new Date(dateStr).getTime();
  const secs = Math.floor((now - then) / 1000);

  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString('en-MW', { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.surface.border,
    backgroundColor: colors.surface.background,
  },
  title: { ...typography.h1, color: colors.text.primary },
  list:  { flexGrow: 1 },
  item: {
    flexDirection: 'row', gap: spacing.md, padding: spacing.base,
    borderBottomWidth: 1, borderBottomColor: colors.surface.divider,
    backgroundColor: colors.surface.card,
  },
  itemUnread:   { backgroundColor: `${colors.brand.accent}06` },
  itemDot:      { width: 10, paddingTop: spacing.xs, alignItems: 'center' },
  dot:          { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand.accent },
  itemContent:  { flex: 1, gap: 2 },
  itemTitle:    { ...typography.bodyBold, color: colors.text.primary },
  itemBody:     { ...typography.body, color: colors.text.secondary },
  itemTime:     { ...typography.caption, color: colors.text.tertiary },
});
