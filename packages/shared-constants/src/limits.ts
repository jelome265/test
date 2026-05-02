// ─── Package limits ────────────────────────────────────────────────
export const MAX_WEIGHT_KG        = 10.0;
export const MIN_WEIGHT_KG        = 0.1;
export const MAX_DECLARED_VALUE_MWK = 100_000_000;  // 1,000,000 MWK in tambala

// ─── Monetary ─────────────────────────────────────────────────────
// All amounts stored in tambala (MWK × 100) to avoid floating point
export const TAMBALA_PER_MWK = 100;

export function mkwToTambala(mwk: number): number {
  return Math.round(mwk * TAMBALA_PER_MWK);
}

export function tambalaToMwk(tambala: number): number {
  return tambala / TAMBALA_PER_MWK;
}

export function formatMwk(tambala: number): string {
  return `MWK ${tambalaToMwk(tambala).toLocaleString('en-MW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Payment ──────────────────────────────────────────────────────
export const PAYMENT_EXPIRY_MINUTES = 30;

// ─── Rate limiting ────────────────────────────────────────────────
export const GLOBAL_RATE_LIMIT_PER_15MIN  = 100;
export const AUTH_RATE_LIMIT_PER_15MIN    = 10;
export const PAYMENT_RATE_LIMIT_PER_HOUR  = 20;

// ─── Pagination ───────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE     = 100;

// ─── File uploads ─────────────────────────────────────────────────
export const MAX_PROOF_OF_DELIVERY_SIZE_BYTES = 5 * 1024 * 1024;   // 5MB
export const MAX_DISPUTE_EVIDENCE_SIZE_BYTES  = 10 * 1024 * 1024;  // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
