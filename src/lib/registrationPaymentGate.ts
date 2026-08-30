export const REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE =
  'Registration payment is temporarily unavailable. Please check back shortly.';

export function isRegistrationPaymentsEnabled(value: unknown): boolean {
  return value === 'true';
}

export async function runRegistrationPaymentAction<T>(
  paymentsEnabled: boolean,
  action: () => Promise<T>,
): Promise<T> {
  if (!paymentsEnabled) {
    throw new Error(REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE);
  }

  return action();
}
