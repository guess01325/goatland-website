import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE,
  isRegistrationPaymentsEnabled,
  runRegistrationPaymentAction,
} from '../src/lib/registrationPaymentGate.ts';

test('true enables the existing registration payment action', async () => {
  let invocationCount = 0;

  const result = await runRegistrationPaymentAction(
    isRegistrationPaymentsEnabled('true'),
    async () => {
      invocationCount += 1;
      return 'checkout-created';
    },
  );

  assert.equal(result, 'checkout-created');
  assert.equal(invocationCount, 1);
});

test('false disables registration payment without invoking the action', async () => {
  let invocationCount = 0;

  await assert.rejects(
    runRegistrationPaymentAction(isRegistrationPaymentsEnabled('false'), async () => {
      invocationCount += 1;
      return 'checkout-created';
    }),
    { message: REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE },
  );

  assert.equal(invocationCount, 0);
});

test('a missing flag disables registration payment without invoking the action', async () => {
  let invocationCount = 0;

  await assert.rejects(
    runRegistrationPaymentAction(isRegistrationPaymentsEnabled(undefined), async () => {
      invocationCount += 1;
      return 'checkout-created';
    }),
    { message: REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE },
  );

  assert.equal(invocationCount, 0);
});

test('only the exact true value permits payment action invocation', async () => {
  for (const disabledValue of ['TRUE', '1', '', null, false]) {
    let invoked = false;

    await assert.rejects(
      runRegistrationPaymentAction(isRegistrationPaymentsEnabled(disabledValue), async () => {
        invoked = true;
      }),
      { message: REGISTRATION_PAYMENT_UNAVAILABLE_MESSAGE },
    );

    assert.equal(invoked, false);
  }
});
