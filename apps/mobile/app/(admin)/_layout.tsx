// app/(admin)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';

import { colors, typography } from '../../src/theme';
import { AdminGuard } from '../../src/components/layout/AdminGuard';

export default function AdminLayout() {
  return (
    <AdminGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor:    colors.brand.primary,
            borderTopColor:     `${colors.text.inverse}20`,
            height:             60,
            paddingBottom:      8,
            paddingTop:         8,
          },
          tabBarActiveTintColor:   '#FFFFFF',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarLabelStyle:        { ...typography.caption, marginTop: 2 },
        }}
      >
        <Tabs.Screen name="shipments" options={{ title: 'Shipments', tabBarIcon: () => null }} />
        <Tabs.Screen name="stats"     options={{ title: 'Stats',    tabBarIcon: () => null }} />
      </Tabs>
    </AdminGuard>
  );
}
