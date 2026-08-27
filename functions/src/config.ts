import { defineSecret, defineString } from 'firebase-functions/params';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
export const checkoutSuccessUrl = defineString('CHECKOUT_SUCCESS_URL');
export const checkoutCancelUrl = defineString('CHECKOUT_CANCEL_URL');
