export const REGISTRATION_PAYMENT_NOT_LAUNCHED_MESSAGE =
  'Payment confirmation has not launched for this Registration.';

export function isRegistrationPaymentsEnabled(value: unknown): boolean {
  return value === 'true';
}

export async function runRegistrationPaymentAction<T>(
  paymentsEnabled: boolean,
  action: () => Promise<T>,
): Promise<T> {
  if (!paymentsEnabled) {
    throw new Error(REGISTRATION_PAYMENT_NOT_LAUNCHED_MESSAGE);
  }

  return action();
}
