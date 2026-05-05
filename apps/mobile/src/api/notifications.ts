// src/api/notifications.ts
import type { AppNotification } from '@courier/shared-types';

import { apiClient } from './client';

export interface NotificationListResult {
  data:         AppNotification[];
  next_cursor:  string | null;
  unread_count: number;
}

export const notificationsApi = {
  listNotifications: async (params: {
    cursor?:      string;
    limit?:       number;
    unread_only?: boolean;
  }): Promise<NotificationListResult> => {
    const res = await apiClient.get<NotificationListResult>('/v1/notifications', { params });
    return res.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await apiClient.get<{ data: { count: number } }>('/v1/notifications/unread-count');
    return res.data.data.count;
  },

  markAsRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/v1/notifications/${id}/read`);
  },

  markAllAsRead: async (): Promise<number> => {
    const res = await apiClient.patch<{ data: { marked_count: number } }>('/v1/notifications/read-all');
    return res.data.data.marked_count;
  },
} as const;
