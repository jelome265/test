// src/__tests__/shipment-draft.store.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { useDraftStore } from '../stores/shipment-draft.store';

describe('useDraftStore', () => {
  beforeEach(() => useDraftStore.getState().reset());

  it('setSender() updates sender fields without overwriting others', () => {
    useDraftStore.getState().setSender({ full_name: 'Alice', city: 'Lilongwe' });
    useDraftStore.getState().setSender({ phone_number: '+265991234567' });

    const { sender } = useDraftStore.getState();
    expect(sender.full_name).toBe('Alice');
    expect(sender.city).toBe('Lilongwe');
    expect(sender.phone_number).toBe('+265991234567');
  });

  it('reset() clears all fields and generates a new draftId', () => {
    useDraftStore.getState().setSender({ full_name: 'Alice' });
    const oldDraftId = useDraftStore.getState().draftId;

    useDraftStore.getState().reset();

    expect(useDraftStore.getState().sender.full_name).toBe('');
    expect(useDraftStore.getState().draftId).not.toBe(oldDraftId);
  });

  it('setQuotedPrice() stores the price', () => {
    useDraftStore.getState().setQuotedPrice(500_000);
    expect(useDraftStore.getState().quotedPriceMwk).toBe(500_000);
  });
});
