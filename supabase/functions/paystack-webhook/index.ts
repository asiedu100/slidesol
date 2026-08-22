import postgres from 'npm:postgres@3';
import { jsonResponse } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { verifyTransaction } from '../_shared/paystack.ts';
import { ORDER_PAYMENT_STATUS, ORDER_STATUS, PAYMENT_STATUS } from '../_shared/constants.ts';

// Constant-time-ish comparison for two equal-length hex strings — avoids short-circuiting
// on the first differing character, which is the timing side-channel HMAC comparisons
// are meant to avoid.
const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

const computeSignature = async (rawBody: string, secret: string): Promise<string> => {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  // Read the raw body as text FIRST — the signature is computed over the exact bytes
  // Paystack sent, not a re-serialized JSON.parse(...) round trip.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-paystack-signature') ?? '';
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

  const expectedSignature = await computeSignature(rawBody, secret);
  if (!signatureHeader || !safeEqual(expectedSignature, signatureHeader)) {
    console.error('paystack-webhook: signature mismatch');
    return jsonResponse(401, { error: 'invalid_signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  if (event?.event !== 'charge.success') {
    // Acknowledge and stop — no symmetric charge.failed handling in this MVP.
    return jsonResponse(200, { received: true, ignored: true });
  }

  const reference = event?.data?.reference;
  if (typeof reference !== 'string' || !reference) {
    return jsonResponse(200, { received: true, ignored: true });
  }

  // Never trust event.data.status — independently re-verify with Paystack.
  const verified = await verifyTransaction(reference);
  if (!verified.ok) {
    console.error('paystack-webhook: verify call failed', verified.errorMessage);
    return jsonResponse(500, { error: 'verify_failed' });
  }

  const supabase = createAdminClient();

  const { data: payment, error: paymentLookupError } = await supabase
    .from('payments')
    .select('id, order_id, amount, currency, status')
    .eq('transaction_reference', reference)
    .maybeSingle();

  if (paymentLookupError) {
    console.error('paystack-webhook: payment lookup failed', paymentLookupError);
    return jsonResponse(500, { error: 'lookup_failed' });
  }

  if (!payment) {
    console.error('paystack-webhook: no payment row for reference', reference);
    return jsonResponse(200, { received: true, ignored: true });
  }

  // Idempotency — Paystack redelivers webhooks; never double-process.
  if (payment.status === PAYMENT_STATUS.SUCCESS) {
    return jsonResponse(200, { received: true, already_processed: true });
  }

  const expectedSubunits = Math.round(Number(payment.amount) * 100);
  const amountMatches = verified.amountSubunits === expectedSubunits;
  const currencyMatches = verified.currency === payment.currency;

  if (!amountMatches || !currencyMatches) {
    console.error('paystack-webhook: amount/currency mismatch', {
      reference, expectedSubunits, gotAmount: verified.amountSubunits, expectedCurrency: payment.currency, gotCurrency: verified.currency,
    });
    await supabase.from('payments').update({ status: PAYMENT_STATUS.FAILED }).eq('id', payment.id);
    return jsonResponse(200, { received: true, mismatch: true });
  }

  if (verified.status !== 'success') {
    await supabase.from('payments').update({ status: PAYMENT_STATUS.FAILED }).eq('id', payment.id);
    return jsonResponse(200, { received: true, transaction_status: verified.status });
  }

  try {
    const { error: paymentUpdateError } = await supabase
      .from('payments')
      .update({ status: PAYMENT_STATUS.SUCCESS, paid_at: verified.paidAt ?? new Date().toISOString() })
      .eq('id', payment.id);
    if (paymentUpdateError) throw paymentUpdateError;

    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({ payment_status: ORDER_PAYMENT_STATUS.PAID, order_status: ORDER_STATUS.PROCESSING })
      .eq('id', payment.order_id);
    if (orderUpdateError) throw orderUpdateError;

    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('variant_id, quantity')
      .eq('order_id', payment.order_id);
    if (orderItemsError) throw orderItemsError;

    if (orderItems?.length) {
      const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? '';
      const sql = postgres(dbUrl);
      try {
        for (const item of orderItems) {
          // Atomic, guarded decrement — no schema change needed. Floors at zero rather
          // than going negative; does not fail the whole webhook if oversold (payment
          // already succeeded and can't be undone here — see plan's documented MVP gap).
          // eslint-disable-next-line no-await-in-loop
          await sql`
            UPDATE product_variants
            SET stock_quantity = GREATEST(stock_quantity - ${item.quantity}, 0), updated_at = now()
            WHERE id = ${item.variant_id}
          `;
        }
      } finally {
        await sql.end({ timeout: 5 });
      }
    }
  } catch (error) {
    console.error('paystack-webhook: failed applying confirmed payment', error);
    return jsonResponse(500, { error: 'update_failed' });
  }

  return jsonResponse(200, { received: true });
});
