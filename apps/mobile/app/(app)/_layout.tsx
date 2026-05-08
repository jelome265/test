// app/(app)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useNotificationStore } from '../../src/stores/notification.store';
import { colors, typography } from '../../src/theme';

// Icon name map keeps variant switching (outline vs filled) in one place.
// Filled variant is used when the tab is active — matches iOS HIG conventions.
const ICONS = {
  shipments: {
    focused:   'cube'          as const,
    unfocused: 'cube-outline'  as const,
  },
  notifications: {
    focused:   'notifications'         as const,
    unfocused: 'notifications-outline' as const,
  },
  profile: {
    focused:   'person-circle'         as const,
    unfocused: 'person-circle-outline' as const,
  },
} as const;

export default function AppLayout() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const handleTabPress = useCallback(() => {
    // Light haptic on every tab switch — matches native iOS tab bar feel
    if (Platform.OS === 'ios') {
      void Haptics.selectionAsync();
    }
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor:    colors.surface.card,
          borderTopColor:     colors.surface.border,
          borderTopWidth:     0.5,
          height:             Platform.OS === 'ios' ? 80 : 60,
          paddingBottom:      Platform.OS === 'ios' ? 20 : 8,
          paddingTop:         8,
          // Subtle shadow on iOS only
          ...Platform.select({
            ios: {
              shadowColor:   '#000',
              shadowOffset:  { width: 0, height: -1 },
              shadowOpacity: 0.05,
              shadowRadius:  4,
            },
            android: {
              elevation: 8,
            },
          }),
        },
        tabBarActiveTintColor:   colors.brand.accent,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: {
          ...typography.caption,
          fontSize: 11,
          marginTop: 2,
        },
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tabs.Screen
        name="shipments"
        options={{
          title: 'Shipments',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.shipments.focused : ICONS.shipments.unfocused}
              size={24}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.notifications.focused : ICONS.notifications.unfocused}
              size={24}
              color={color}
            />
          ),
          tabBarBadge:       unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarBadgeStyle:  {
            backgroundColor: colors.semantic.danger,
            fontSize:        10,
            fontWeight:      '700',
            minWidth:        18,
            height:          18,
            borderRadius:    9,
            lineHeight:      18,
          },
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? ICONS.profile.focused : ICONS.profile.unfocused}
              size={24}
              color={color}
            />
          ),
        }}
      />

      {/* Hidden from tab bar — accessed via router.push() */}
      <Tabs.Screen name="index"    options={{ href: null }} />
      <Tabs.Screen name="payments" options={{ href: null }} />
    </Tabs>
  );
}
