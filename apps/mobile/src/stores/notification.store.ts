// src/stores/notification.store.ts
/**
 * Manages the badge count and real-time notification state.
 * The actual notification list lives in React Query cache.
 */

import { create } from 'zustand';

import { notificationsApi } from '../api/notifications';

interface NotificationState {
  unreadCount:       number;
  setUnreadCount:    (count: number) => void;
  decrementUnread:   (by?: number) => void;
  refreshUnreadCount: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,

  setUnreadCount: (count) => set({ unreadCount: Math.max(0, count) }),

  decrementUnread: (by = 1) =>
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - by) })),

  refreshUnreadCount: async () => {
    try {
      const count = await notificationsApi.getUnreadCount();
      set({ unreadCount: count });
    } catch {
      // Non-fatal: badge may lag
    }
  },
}));
