// app/(app)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';

import { colors, typography } from '../../src/theme';
import { useNotificationStore } from '../../src/stores/notification.store';

export default function AppLayout() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:    colors.surface.card,
          borderTopColor:     colors.surface.border,
          height:             60,
          paddingBottom:      8,
          paddingTop:         8,
        },
        tabBarActiveTintColor:   colors.brand.accent,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle:        { ...typography.caption, marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="shipments"
        options={{
          title:      'Shipments',
          tabBarIcon: () => null, // Icons to be added in Phase 9
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title:      'Inbox',
          tabBarIcon: () => null,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.semantic.danger, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title:      'Profile',
          tabBarIcon: () => null,
        }}
      />
      
      {/* Hide internal routes from tab bar */}
      <Tabs.Screen name="index"    options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
    </Tabs>
  );
}
