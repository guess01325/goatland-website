const CHECKOUT_ATTEMPT_KEY = 'goatland.registrationCheckoutAttempt';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutAttempt = {
  registrationId: string;
  registrationOfferingId: string;
  checkoutRequestId: string;
  registrationPath: string;
};

function isCheckoutAttempt(value: unknown): value is CheckoutAttempt {
  if (!value || typeof value !== 'object') return false;
  const attempt = value as Partial<CheckoutAttempt>;
  return typeof attempt.registrationId === 'string'
    && Boolean(attempt.registrationId)
    && typeof attempt.registrationOfferingId === 'string'
    && Boolean(attempt.registrationOfferingId)
    && typeof attempt.checkoutRequestId === 'string'
    && UUID_PATTERN.test(attempt.checkoutRequestId)
    && typeof attempt.registrationPath === 'string'
    && (attempt.registrationPath === '/register' || attempt.registrationPath.startsWith('/register?'))
    && !attempt.registrationPath.startsWith('//');
}

export function getCheckoutAttempt(): CheckoutAttempt | null {
  try {
    const stored = window.sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isCheckoutAttempt(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getOrCreateCheckoutAttempt(
  registrationId: string,
  registrationOfferingId: string,
  registrationPath: string,
): CheckoutAttempt {
  const existing = getCheckoutAttempt();
  if (
    existing?.registrationId === registrationId
    && existing.registrationOfferingId === registrationOfferingId
  ) return existing;

  const attempt = {
    registrationId,
    registrationOfferingId,
    checkoutRequestId: window.crypto.randomUUID(),
    registrationPath,
  };
  try {
    window.sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // The caller can retain this attempt in memory when storage is unavailable.
  }
  return attempt;
}

export function clearCheckoutAttempt(
  registrationId: string,
  registrationOfferingId: string,
): void {
  try {
    const existing = getCheckoutAttempt();
    if (
      existing?.registrationId === registrationId
      && existing.registrationOfferingId === registrationOfferingId
    ) {
      window.sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
    }
  } catch {
    // Storage may be unavailable; there is no authoritative state to clean up here.
  }
}
