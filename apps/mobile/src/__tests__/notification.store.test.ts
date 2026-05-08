import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../api/notifications', () => ({
  notificationsApi: {
    getUnreadCount: jest.fn(async () => 0),
  },
}));

import { useNotificationStore } from '../stores/notification.store';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().setUnreadCount(0);
  });

  it('should initialize with 0 unread notifications', () => {
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('should update unread count', () => {
    useNotificationStore.getState().setUnreadCount(5);
    expect(useNotificationStore.getState().unreadCount).toBe(5);
  });

  it('should decrement unread count', () => {
    useNotificationStore.getState().setUnreadCount(5);
    useNotificationStore.getState().decrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(4);
  });

  it('should not decrement below 0', () => {
    useNotificationStore.getState().setUnreadCount(0);
    useNotificationStore.getState().decrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
