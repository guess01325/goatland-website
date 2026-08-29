import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export type CreateRegistrationCheckoutInput = {
  registrationId: string;
  checkoutRequestId: string;
  promoCode?: string;
};

export type CreateRegistrationCheckoutResult = {
  paymentId: string;
  checkoutUrl: string;
};

const createCheckoutCallable = httpsCallable<
  CreateRegistrationCheckoutInput,
  CreateRegistrationCheckoutResult
>(functions, 'createRegistrationCheckout');

export async function createRegistrationCheckout(
  input: CreateRegistrationCheckoutInput,
): Promise<CreateRegistrationCheckoutResult> {
  const response = await createCheckoutCallable(input);
  const { paymentId, checkoutUrl } = response.data;

  if (typeof paymentId !== 'string' || typeof checkoutUrl !== 'string') {
    throw new Error('Checkout service returned an invalid response.');
  }

  const parsedCheckoutUrl = new URL(checkoutUrl);
  if (parsedCheckoutUrl.protocol !== 'https:') {
    throw new Error('Checkout service returned an invalid destination.');
  }

  return { paymentId, checkoutUrl: parsedCheckoutUrl.toString() };
}
