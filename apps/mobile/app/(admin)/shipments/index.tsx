// app/(admin)/shipments/index.tsx
import { useState, useCallback } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ShipmentStatus, Shipment } from '@courier/shared-types';

import { EmptyState }      from '../../../src/components/ui/EmptyState';
import { ErrorState }      from '../../../src/components/ui/ErrorState';
import { LoadingState }    from '../../../src/components/ui/LoadingState';
import { ShipmentCard }    from '../../../src/components/ui/ShipmentCard';
import { useAdminShipments } from '../../../src/hooks/use-shipments';
import { colors, spacing, typography, radius } from '../../../src/theme';

const STATUS_FILTERS: Array<{ label: string; value?: ShipmentStatus }> = [
  { label: 'All' },
  { label: 'Pending',   value: 'pending_approval' },
  { label: 'Approved',  value: 'approved' },
  { label: 'In Transit',value: 'in_transit' },
  { label: 'Delivered', value: 'delivered' },
];

export default function AdminShipmentsScreen() {
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | undefined>();
  const [search, setSearch] = useState('');

  const {
    data, isLoading, isError, refetch, fetchNextPage, hasNextPage,
  } = useAdminShipments({ status: statusFilter, search: search.length >= 3 ? search : undefined });

  const shipments = data?.pages.flatMap((p: any) => p.data) ?? [];

  const renderItem = useCallback(
    ({ item }: { item: Shipment }) => <ShipmentCard shipment={item} adminMode />,
    [],
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>All Shipments</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search phone, name, tracking…"
          placeholderTextColor={colors.text.tertiary}
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <View
            key={f.label}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
          >
            <Text
              style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Text>
          </View>
        ))}
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
          ListEmptyComponent={<EmptyState emoji="📋" title="No shipments found" />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && shipments.length > 0}
              onRefresh={() => void refetch()}
              tintColor={colors.brand.accent}
            />
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
    paddingHorizontal: spacing.base, paddingTop: spacing.xl, paddingBottom: spacing.sm,
    backgroundColor: colors.surface.background,
  },
  title:     { ...typography.h1, color: colors.text.primary },
  searchRow: { paddingHorizontal: spacing.base, paddingBottom: spacing.sm },
  searchInput: {
    backgroundColor: colors.surface.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.surface.border,
    padding: spacing.md, ...typography.body, color: colors.text.primary,
  },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: spacing.base,
    paddingBottom: spacing.md, gap: spacing.sm, flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
  },
  filterChipActive: { borderColor: colors.brand.accent, backgroundColor: `${colors.brand.accent}10` },
  filterText:       { ...typography.label, color: colors.text.secondary },
  filterTextActive: { color: colors.brand.accent, fontWeight: '600' },
  list:             { padding: spacing.base, flexGrow: 1 },
});
