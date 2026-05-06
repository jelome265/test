// src/stores/pending-link.store.ts
/**
 * Holds a deep-link URL that arrived before auth was ready.
 * Consumed by AuthGate after _initialize() completes.
 *
 * Flow:
 *   1. App cold-starts from notification tap
 *   2. handleNotificationNavigation() fires → auth not ready → store the URL
 *   3. AuthGate finishes _initialize() → reads pendingLink → navigates → clears
 */

import { create } from 'zustand';

interface PendingLinkState {
  pendingLink: string | null;
  setPendingLink: (url: string) => void;
  clearPendingLink: () => void;
}

export const usePendingLinkStore = create<PendingLinkState>((set) => ({
  pendingLink: null,
  setPendingLink:  (url) => set({ pendingLink: url }),
  clearPendingLink: ()  => set({ pendingLink: null }),
}));
