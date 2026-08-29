const LEGACY_CHECKOUT_ATTEMPT_KEY = 'goatland.registrationCheckoutAttempt';
const CHECKOUT_ATTEMPT_KEY_PREFIX = 'goatland.registrationCheckoutAttempt:';
const CURRENT_CHECKOUT_REGISTRATION_KEY_PREFIX = 'goatland.registrationCheckoutRegistration:';
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

function getPlayerId(registrationId: string): string | null {
  const separatorIndex = registrationId.indexOf('|');
  return separatorIndex > 0 ? registrationId.slice(0, separatorIndex) : null;
}

function attemptKey(registrationId: string): string {
  return `${CHECKOUT_ATTEMPT_KEY_PREFIX}${registrationId}`;
}

function currentRegistrationKey(playerId: string): string {
  return `${CURRENT_CHECKOUT_REGISTRATION_KEY_PREFIX}${playerId}`;
}

function removeLegacyAttempt(): void {
  window.sessionStorage.removeItem(LEGACY_CHECKOUT_ATTEMPT_KEY);
}

export function getCheckoutAttempt(registrationId: string): CheckoutAttempt | null {
  try {
    removeLegacyAttempt();
    const stored = window.sessionStorage.getItem(attemptKey(registrationId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!isCheckoutAttempt(parsed) || parsed.registrationId !== registrationId) {
      window.sessionStorage.removeItem(attemptKey(registrationId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCurrentCheckoutAttempt(playerId: string): CheckoutAttempt | null {
  try {
    removeLegacyAttempt();
    const registrationId = window.sessionStorage.getItem(currentRegistrationKey(playerId));
    if (!registrationId || getPlayerId(registrationId) !== playerId) return null;
    return getCheckoutAttempt(registrationId);
  } catch {
    return null;
  }
}

function saveCheckoutAttempt(attempt: CheckoutAttempt): void {
  const playerId = getPlayerId(attempt.registrationId);
  if (!playerId || !isCheckoutAttempt(attempt)) return;
  removeLegacyAttempt();
  window.sessionStorage.setItem(attemptKey(attempt.registrationId), JSON.stringify(attempt));
  window.sessionStorage.setItem(currentRegistrationKey(playerId), attempt.registrationId);
}

export function getOrCreateCheckoutAttempt(
  registrationId: string,
  registrationOfferingId: string,
  registrationPath: string,
): CheckoutAttempt {
  const existing = getCheckoutAttempt(registrationId);
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
    saveCheckoutAttempt(attempt);
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
    const existing = getCheckoutAttempt(registrationId);
    if (
      existing?.registrationId === registrationId
      && existing.registrationOfferingId === registrationOfferingId
    ) {
      window.sessionStorage.removeItem(attemptKey(registrationId));
      const playerId = getPlayerId(registrationId);
      if (
        playerId
        && window.sessionStorage.getItem(currentRegistrationKey(playerId)) === registrationId
      ) {
        window.sessionStorage.removeItem(currentRegistrationKey(playerId));
      }
    }
  } catch {
    // Storage may be unavailable; there is no authoritative state to clean up here.
  }
}
