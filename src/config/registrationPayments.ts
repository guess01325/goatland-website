import { isRegistrationPaymentsEnabled } from '../lib/registrationPaymentGate';

export const registrationPaymentsEnabled = isRegistrationPaymentsEnabled(
  import.meta.env.VITE_REGISTRATION_PAYMENTS_ENABLED,
);
