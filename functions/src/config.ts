import { defineSecret, defineString } from 'firebase-functions/params';

export {
  CURRENT_COMPETITION_RULES_VERSION,
  CURRENT_REFUND_POLICY_VERSION,
} from './registrationPolicies.js';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
export const checkoutSuccessUrl = defineString('CHECKOUT_SUCCESS_URL');
export const checkoutCancelUrl = defineString('CHECKOUT_CANCEL_URL');
export const registrationPaymentLaunchStatus = defineString(
  'REGISTRATION_PAYMENT_LAUNCH_STATUS',
  { default: 'unavailable' },
);
