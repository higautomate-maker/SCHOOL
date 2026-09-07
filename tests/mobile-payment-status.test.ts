import assert from 'node:assert/strict';
import test from 'node:test';
import {fetchRazorpayOrderState} from '../server/payments/razorpay.ts';

test('payment retry requires authoritative failed attempts and an unpaid order', async (t) => {
  let paymentStatus = 'failed';
  let orderStatus = 'attempted';
  t.mock.method(globalThis, 'fetch', async (url: string) => new Response(JSON.stringify(
    url.endsWith('/payments') ? {count:1,items:[{order_id:'order_test123',status:paymentStatus}]} :
      {id:'order_test123',amount:240000,currency:'INR',receipt:'school-test',status:orderStatus}
  ), {status:200,headers:{'content-type':'application/json'}}));
  const credentials = {keyId:'rzp_test_example',keySecret:'test-only-secret',webhookSecret:'test-only-webhook'};
  assert.equal((await fetchRazorpayOrderState(credentials,'order_test123')).retryAllowed,true);
  for (const status of ['created','authorized','captured','unknown']) {
    paymentStatus=status;
    assert.equal((await fetchRazorpayOrderState(credentials,'order_test123')).retryAllowed,false);
  }
  paymentStatus='failed';orderStatus='paid';
  assert.equal((await fetchRazorpayOrderState(credentials,'order_test123')).retryAllowed,false);
  await assert.rejects(fetchRazorpayOrderState(credentials,'../../invalid'));
});
