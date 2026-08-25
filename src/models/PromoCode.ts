import type { Timestamp } from 'firebase/firestore';

export const PROMO_CODE_STATUSES = ['draft', 'active', 'disabled', 'retired'] as const;

export type PromoCodeStatus = (typeof PROMO_CODE_STATUSES)[number];

export const PROMO_CODE_MIN_LENGTH = 3;
export const PROMO_CODE_MAX_LENGTH = 32;
export const PROMO_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export type PromoCode = {
  id: string;
  promoterId: string;
  status: PromoCodeStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type PromoCodeDocument = Omit<PromoCode, 'id'>;

export function normalizePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidPromoCode(code: string): boolean {
  return code.length >= PROMO_CODE_MIN_LENGTH
    && code.length <= PROMO_CODE_MAX_LENGTH
    && PROMO_CODE_PATTERN.test(code);
}

export function getPromoCodeId(code: string): string {
  const normalizedCode = normalizePromoCode(code);

  if (!isValidPromoCode(normalizedCode)) {
    throw new Error('PromoCode must be 3–32 characters using A–Z, 0–9, and single hyphens.');
  }

  return normalizedCode;
}
