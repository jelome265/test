// app/(admin)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import React, { useCallback } from 'react';
import { Platform } from 'react-native';

import { colors, typography } from '../../src/theme';
import { AdminGuard } from '../../src/components/layout/AdminGuard';

const ADMIN_ICONS = {
  shipments: {
    focused:   'list'         as const,
    unfocused: 'list-outline' as const,
  },
  stats: {
    focused:   'bar-chart'         as const,
    unfocused: 'bar-chart-outline' as const,
  },
} as const;

export default function AdminLayout() {
  const handleTabPress = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.selectionAsync();
    }
  }, []);

  return (
    <AdminGuard>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.brand.primary,
            borderTopColor:  `${colors.text.inverse}15`,
            borderTopWidth:  0.5,
            height:          Platform.OS === 'ios' ? 80 : 60,
            paddingBottom:   Platform.OS === 'ios' ? 20 : 8,
            paddingTop:      8,
          },
          tabBarActiveTintColor:   '#FFFFFF',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.40)',
          tabBarLabelStyle: {
            ...typography.caption,
            fontSize: 11,
            marginTop: 2,
          },
        }}
        screenListeners={{ tabPress: handleTabPress }}
      >
        <Tabs.Screen
          name="shipments"
          options={{
            title: 'Shipments',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? ADMIN_ICONS.shipments.focused : ADMIN_ICONS.shipments.unfocused}
                size={24}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Analytics',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? ADMIN_ICONS.stats.focused : ADMIN_ICONS.stats.unfocused}
                size={24}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </AdminGuard>
  );
}
