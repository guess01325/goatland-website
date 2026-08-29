import { defineSecret, defineString } from 'firebase-functions/params';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
export const checkoutSuccessUrl = defineString('CHECKOUT_SUCCESS_URL');
export const checkoutCancelUrl = defineString('CHECKOUT_CANCEL_URL');

export const CURRENT_COMPETITION_RULES_VERSION = 'competition-rules-2026-08-29-v1';
export const CURRENT_REFUND_POLICY_VERSION = 'refund-policy-2026-08-29-v1';
