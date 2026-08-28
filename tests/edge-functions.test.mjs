// Smoke/regression tests against the LIVE Supabase project (there's no local Supabase
// stack in this setup). Uses the publishable anon key only, same as the real frontend —
// never a service-role or secret key. Admin-gated tests need real credentials passed via
// env vars (SLIDESOL_ADMIN_EMAIL / SLIDESOL_ADMIN_PASSWORD, never hardcoded here) and
// skip themselves cleanly when those aren't set, so `npm test` is still useful to anyone
// without production admin access.
//
// Run: npm test
// Run with admin coverage too: SLIDESOL_ADMIN_EMAIL=... SLIDESOL_ADMIN_PASSWORD=... npm test

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
const ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';
const FN_BASE = `${SUPABASE_URL}/functions/v1`;
const REST_BASE = `${SUPABASE_URL}/rest/v1`;

// Crocs Classic (Espresso) — a real, permanently-active live product. Its "42 (TEST)"
// variant was added while debugging Paystack specifically so there's always at least one
// genuinely purchasable item to exercise the order flow against.
const TEST_PRODUCT_ID = '12da3404-bafc-48d4-bb04-fd2b3e46e200';
const TEST_VARIANT_ID = 'b20ec28c-513b-4b4c-9ccb-ff4fa3323b10';

const anonHeaders = { apikey: ANON_KEY, 'Content-Type': 'application/json' };

let adminHeaders = null;

before(async () => {
  const email = process.env.SLIDESOL_ADMIN_EMAIL;
  const password = process.env.SLIDESOL_ADMIN_PASSWORD;
  if (!email || !password) return;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return;
  const { access_token } = await res.json();
  adminHeaders = { Authorization: `Bearer ${access_token}`, apikey: ANON_KEY, 'Content-Type': 'application/json' };
});

describe('Row-Level Security — the anon key must never see private tables directly', () => {
  for (const table of ['customers', 'orders', 'payments', 'profiles']) {
    test(`${table} returns zero rows to the anon key`, async () => {
      const res = await fetch(`${REST_BASE}/${table}?select=*&limit=1`, { headers: anonHeaders });
      // PostgREST returns 200 + [] when RLS filters every row — not an error status.
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), []);
    });
  }

  test('products IS readable with the anon key (it is meant to be public)', async () => {
    const res = await fetch(`${REST_BASE}/products?select=id&limit=1`, { headers: anonHeaders });
    assert.equal(res.status, 200);
  });

  test('the anon key cannot write to products directly', async () => {
    const before_ = await fetch(`${REST_BASE}/products?select=price&id=eq.${TEST_PRODUCT_ID}`, { headers: anonHeaders }).then((r) => r.json());
    await fetch(`${REST_BASE}/products?id=eq.${TEST_PRODUCT_ID}`, {
      method: 'PATCH', headers: anonHeaders, body: JSON.stringify({ price: 1 }),
    });
    const after = await fetch(`${REST_BASE}/products?select=price&id=eq.${TEST_PRODUCT_ID}`, { headers: anonHeaders }).then((r) => r.json());
    assert.deepEqual(after, before_, 'price must be unchanged — RLS should have silently blocked the write');
  });
});

describe('create-order — validation', () => {
  const basePayload = () => ({
    customer: { full_name: 'Automated Test', phone: '0550000099' },
    fulfilment_method: 'pickup',
    delivery: null,
    items: [{ product_id: TEST_PRODUCT_ID, variant_id: TEST_VARIANT_ID, quantity: 1 }],
    currency: 'GHS',
  });

  test('rejects an invalid fulfilment_method', async () => {
    const res = await fetch(`${FN_BASE}/create-order`, {
      method: 'POST', headers: anonHeaders,
      body: JSON.stringify({ ...basePayload(), fulfilment_method: 'teleport' }),
    });
    assert.equal(res.status, 400);
  });

  test('rejects a missing customer name', async () => {
    const payload = basePayload();
    delete payload.customer.full_name;
    const res = await fetch(`${FN_BASE}/create-order`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(payload) });
    assert.equal(res.status, 400);
  });

  test('rejects a nonexistent variant', async () => {
    const payload = basePayload();
    payload.items = [{ product_id: TEST_PRODUCT_ID, variant_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }];
    const res = await fetch(`${FN_BASE}/create-order`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(payload) });
    assert.equal(res.status, 400);
  });

  test('a valid pickup order succeeds and returns a Paystack authorization_url', async () => {
    const payload = basePayload();
    payload.customer_note = 'Automated test order from tests/edge-functions.test.mjs — safe to ignore/delete.';
    const res = await fetch(`${FN_BASE}/create-order`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(payload) });
    const body = await res.json();
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert.match(body.authorization_url, /^https:\/\/checkout\.paystack\.com\//);
    assert.match(body.order_number, /^SLS-/);
  });
});

describe('admin-catalogue — requires authentication', () => {
  test('rejects a request with no bearer token', async () => {
    const res = await fetch(`${FN_BASE}/admin-catalogue/products`, { headers: { apikey: ANON_KEY } });
    assert.equal(res.status, 401);
  });
});

describe('admin-orders updateStatus — order_status vocabulary (regression test)', () => {
  // Guards against the exact bug fixed this session: the code once allowed setting
  // order_status to values ('shipped', 'fulfilled') the database's own CHECK constraint
  // rejects, which passed this function's validation and then failed with a raw 500.
  //
  // Creates its own fresh order rather than depending on one hardcoded ID persisting —
  // test orders get cleaned up externally from time to time (that's what the "safe to
  // ignore/delete" note on their customer_note is for).
  let orderId = null;

  before(async (t) => {
    if (!process.env.SLIDESOL_ADMIN_EMAIL || !process.env.SLIDESOL_ADMIN_PASSWORD) return;
    const res = await fetch(`${FN_BASE}/create-order`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({
        customer: { full_name: 'Automated Test', phone: '0550000098' },
        fulfilment_method: 'pickup',
        delivery: null,
        customer_note: 'Automated test order from tests/edge-functions.test.mjs — safe to ignore/delete.',
        items: [{ product_id: TEST_PRODUCT_ID, variant_id: TEST_VARIANT_ID, quantity: 1 }],
        currency: 'GHS',
      }),
    });
    if (!res.ok) return;
    const { order_number } = await res.json();
    // orders is RLS-locked from anon reads (see above), so look the new order up through
    // the admin-orders list endpoint (service-role-backed) instead of the REST API directly.
    const { orders } = await fetch(`${FN_BASE}/admin-orders/orders`, { headers: adminHeaders }).then((r) => r.json());
    orderId = orders.find((o) => o.order_number === order_number)?.id ?? null;
  });

  test('rejects a legacy status value that no longer exists in the DB constraint', async (t) => {
    if (!adminHeaders || !orderId) return t.skip('SLIDESOL_ADMIN_EMAIL / SLIDESOL_ADMIN_PASSWORD not set, or setup order failed');
    const res = await fetch(`${FN_BASE}/admin-orders/orders/${orderId}`, {
      method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ order_status: 'shipped' }),
    });
    assert.equal(res.status, 400);
  });

  test('accepts every valid status along the pickup path', async (t) => {
    if (!adminHeaders || !orderId) return t.skip('SLIDESOL_ADMIN_EMAIL / SLIDESOL_ADMIN_PASSWORD not set, or setup order failed');
    for (const status of ['processing', 'ready', 'ready_for_pickup', 'picked_up']) {
      const res = await fetch(`${FN_BASE}/admin-orders/orders/${orderId}`, {
        method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ order_status: status }),
      });
      assert.equal(res.status, 200, `expected 200 for status "${status}", got ${res.status}`);
    }
  });
});
