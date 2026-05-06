// src/hooks/use-network.ts
/**
 * Subscribes to NetInfo to detect offline state.
 * Used by the offline banner and to suppress background refetches.
 *
 * Package: @react-native-community/netinfo (already in Expo SDK 51)
 * Install: npx expo install @react-native-community/netinfo
 */

import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { focusManager } from '@tanstack/react-query';

export interface NetworkState {
  isConnected:      boolean | null;
  isInternetReachable: boolean | null;
}

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>({
    isConnected:         null,
    isInternetReachable: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      setState({
        isConnected:         netState.isConnected,
        isInternetReachable: netState.isInternetReachable,
      });

      // Pause React Query background refetches when offline.
      // focusManager controls whether queries consider the window "focused".
      focusManager.setFocused(netState.isConnected === true);
    });

    return unsubscribe;
  }, []);

  return state;
}
