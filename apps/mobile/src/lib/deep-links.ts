// src/lib/deep-links.ts
import * as Linking from 'expo-linking';

/**
 * Prefix configuration for deep linking.
 * Supports both custom schemes and universal links.
 */
export const prefix = Linking.createURL('/');

export const config = {
  screens: {
    '(app)': {
      screens: {
        shipments: {
          path: 'shipments',
          screens: {
            '[id]': 'shipments/:id',
            'track/[trackingNumber]': 'track/:trackingNumber',
          },
        },
        notifications: 'notifications',
        profile: 'profile',
        payments: 'payments/:shipmentId',
      },
    },
    '(auth)': {
      screens: {
        login: 'login',
        register: 'register',
      },
    },
    '(admin)': {
      screens: {
        shipments: {
          path: 'admin/shipments',
          screens: {
            '[id]': 'admin/shipments/:id',
          },
        },
      },
    },
  },
};
