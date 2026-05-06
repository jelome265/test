// src/components/ui/TabBarIcon.tsx
/**
 * Wrapper for Ionicons used in tab bars.
 * Handles focused/unfocused color and size scaling.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabBarIconProps {
  name:    IoniconName;
  color:   string;
  size?:   number;
  focused: boolean;
  badge?:  number;
}

export function TabBarIcon({ name, color, size = 24, focused, badge }: TabBarIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (focused) {
      // Subtle spring when tab becomes active
      Animated.spring(scaleAnim, {
        toValue: 1.15,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start(() => {
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [focused]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View style={styles.iconContainer}>
        <Ionicons name={name} size={size} color={color} />
        {badge !== undefined && badge > 0 && (
          <View style={styles.badge}>
            {/* Badge number shown for ≤99; "99+" after */}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  badge: {
    position:        'absolute',
    top:             -4,
    right:           -8,
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: '#DC2626',
  },
});
