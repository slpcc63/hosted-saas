import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTcmDeliveryAllowed, isTcmDeliveryOff } from '../lib/tcm-delivery-policy.ts';

test('dedicated Preview delivery lock overrides delivery configuration', () => {
  const env = { VERCEL_ENV: 'preview', TCM_PREVIEW_DELIVERY_OFF: 'true', RESEND_API_KEY: 'synthetic-configured', TIME_CARD_TEXTING_LIVE: 'true' };
  assert.equal(isTcmDeliveryOff(env), true);
  assert.throws(() => assertTcmDeliveryAllowed(env), /External delivery is disabled/);
});
test('lock is explicitly scoped and does not alter other environments', () => {
  for (const env of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'production', TCM_PREVIEW_DELIVERY_OFF: 'true' }]) {
    assert.equal(isTcmDeliveryOff(env), false);
    assert.doesNotThrow(() => assertTcmDeliveryAllowed(env));
  }
});
