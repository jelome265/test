// app/(app)/shipments/index.tsx
import { useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ShipmentStatus, Shipment } from '@courier/shared-types';

import { EmptyState }   from '../../../src/components/ui/EmptyState';
import { ErrorState }   from '../../../src/components/ui/ErrorState';
import { LoadingState } from '../../../src/components/ui/LoadingState';
import { ShipmentCard } from '../../../src/components/ui/ShipmentCard';
import { Button }       from '../../../src/components/ui/Button';
import { useMyShipments } from '../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../src/theme';

const FILTERS: Array<{ label: string; value?: ShipmentStatus }> = [
  { label: 'All' },
  { label: 'Pending',   value: 'pending_approval' },
  { label: 'Approved',  value: 'approved' },
  { label: 'In Transit',value: 'in_transit' },
  { label: 'Delivered', value: 'delivered' },
];

export default function ShipmentsScreen() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | undefined>();

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMyShipments(statusFilter);

  const shipments = data?.pages.flatMap((p: any) => p.data) ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Shipment }) => <ShipmentCard shipment={item} />,
    [],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Deliveries</Text>
          <Text style={styles.subtitle}>Track your packages</Text>
        </View>
        <Button
          variant="primary"
          size="sm"
          onPress={() => router.push('/(app)/shipments/create/step-1')}
        >
          + New Request
        </Button>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.label}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <View
              style={[
                styles.filterChip,
                statusFilter === item.value && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  statusFilter === item.value && styles.filterTextActive,
                ]}
                onPress={() => setStatusFilter(item.value)}
              >
                {item.label}
              </Text>
            </View>
          )}
        />
      </View>

      {/* List */}
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading && shipments.length === 0 ? (
        <LoadingState />
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <EmptyState
              emoji="📦"
              title="No shipments found"
              description="Start by creating a new delivery request."
              action={{
                label: 'Create Shipment',
                onPress: () => router.push('/(app)/shipments/create/step-1'),
              }}
            />
          }
          refreshControl={
            <RefreshControl
              refreshing={isLoading && shipments.length > 0}
              onRefresh={() => void refetch()}
              tintColor={colors.brand.accent}
            />
          }
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={styles.footerLoader}>
                <LoadingState message="" />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection:     'row',
    alignItems:         'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.base,
    paddingTop:        spacing.xl,
    paddingBottom:     spacing.md,
    backgroundColor:   colors.surface.background,
  },
  greeting: { ...typography.h1, color: colors.text.primary },
  subtitle: { ...typography.body, color: colors.text.secondary },
  filterRow: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.border,
  },
  filterList: { paddingHorizontal: spacing.base, gap: spacing.sm },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.surface.border,
    backgroundColor:   colors.surface.card,
  },
  filterChipActive: {
    borderColor:     colors.brand.accent,
    backgroundColor: `${colors.brand.accent}10`,
  },
  filterText:       { ...typography.label, color: colors.text.secondary },
  filterTextActive: { color: colors.brand.accent, fontWeight: '600' },
  list:             { padding: spacing.base, flexGrow: 1 },
  footerLoader:     { paddingVertical: spacing.lg },
});
