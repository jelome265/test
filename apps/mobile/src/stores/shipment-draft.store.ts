// src/stores/shipment-draft.store.ts
/**
 * Ephemeral state for the 3-step shipment creation wizard.
 * Cleared on success or explicit reset.
 * NOT persisted to SecureStore — deliberate: incomplete drafts should not
 * survive app kills (payment amounts could have changed).
 */

import type { SupportedCity, PackageSize } from '@courier/shared-types';
import { create } from 'zustand';

export interface SenderDraft {
  full_name:    string;
  phone_number: string;
  email?:       string;
  address:      string;
  city:         SupportedCity | '';
  latitude?:    number;
  longitude?:   number;
}

export interface ReceiverDraft extends SenderDraft {}

export interface PackageDraft {
  weight_kg:    number | '';
  size:         PackageSize | '';
  description:  string;
  is_fragile:   boolean;
  declared_value_mwk?: number;
}

interface DraftState {
  sender:        SenderDraft;
  receiver:      ReceiverDraft;
  package:       PackageDraft;
  delivery_notes?: string;

  // Idempotency key generated once per draft — reused on retry
  draftId:       string;

  // Quote result (fetched after step 2 completion)
  quotedPriceMwk: number | null;

  setSender:      (sender: Partial<SenderDraft>)   => void;
  setReceiver:    (receiver: Partial<ReceiverDraft>) => void;
  setPackage:     (pkg: Partial<PackageDraft>)      => void;
  setDeliveryNotes: (notes: string)                 => void;
  setQuotedPrice: (price: number)                   => void;
  reset:          ()                                => void;
}

const emptyParty = (): SenderDraft => ({
  full_name: '', phone_number: '', address: '', city: '',
});

const emptyPackage = (): PackageDraft => ({
  weight_kg: '', size: '', description: '', is_fragile: false,
});

function generateDraftId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const useDraftStore = create<DraftState>((set) => ({
  sender:        emptyParty(),
  receiver:      emptyParty(),
  package:       emptyPackage(),
  delivery_notes: undefined,
  draftId:       generateDraftId(),
  quotedPriceMwk: null,

  setSender:   (s)     => set((st) => ({ sender:   { ...st.sender,   ...s } })),
  setReceiver: (r)     => set((st) => ({ receiver: { ...st.receiver, ...r } })),
  setPackage:  (p)     => set((st) => ({ package:  { ...st.package,  ...p } })),
  setDeliveryNotes: (n) => set({ delivery_notes: n }),
  setQuotedPrice:   (price) => set({ quotedPriceMwk: price }),

  reset: () => set({
    sender:         emptyParty(),
    receiver:       emptyParty(),
    package:        emptyPackage(),
    delivery_notes: undefined,
    draftId:        generateDraftId(),
    quotedPriceMwk: null,
  }),
}));
