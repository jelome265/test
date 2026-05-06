// src/components/ui/OfflineBanner.tsx
/**
 * Persistent banner shown at the top of the screen when the device
 * loses internet connectivity. Animates in/out smoothly.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNetworkStatus } from '../../hooks/use-network';
import { typography } from '../../theme';

export function OfflineBanner() {
  const { isInternetReachable } = useNetworkStatus();
  const isOffline = isInternetReachable === false;
  const insets    = useSafeAreaInsets();

  const translateY = useRef(new Animated.Value(-60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const [shouldRender, setShouldRender] = React.useState(false);

  useEffect(() => {
    if (isOffline) {
      setShouldRender(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue:         0,
          friction:        8,
          tension:         80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:         1,
          duration:        200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue:         -60,
          friction:        8,
          tension:         80,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:         0,
          duration:        200,
          useNativeDriver: true,
        }),
      ]).start(() => setShouldRender(false));
    }
  }, [isOffline]);

  if (!shouldRender) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          paddingTop:  insets.top + 8,
          transform:   [{ translateY }],
          opacity,
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={styles.text}>⚠ No internet connection</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    zIndex:          9999,
    backgroundColor: '#92400E',
    paddingHorizontal: 16,
    paddingBottom:   8,
    alignItems:      'center',
  },
  text: { ...typography.label, color: '#FEF3C7' },
});
