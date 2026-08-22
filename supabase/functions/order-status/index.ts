import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', 'Only GET is supported.');
  }

  const url = new URL(req.url);
  const reference = url.searchParams.get('reference');

  if (!reference) {
    return errorResponse(400, 'missing_reference', 'A reference query parameter is required.');
  }

  const supabase = createAdminClient();

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('order_id')
    .eq('transaction_reference', reference)
    .maybeSingle();

  if (paymentError) {
    console.error('order-status: payment lookup failed', paymentError);
    return errorResponse(500, 'server_error', 'Could not look up your order.');
  }

  if (!payment) {
    return errorResponse(404, 'not_found', 'No order found for that reference.');
  }

  // Deliberately narrow: only what's needed to show a confirmation state. The reference
  // travels in a URL with no auth gate, so this endpoint never returns PII (name, phone,
  // delivery address) even though the requester is presumably the customer who ordered.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('order_number, payment_status, order_status, total_amount, currency')
    .eq('id', payment.order_id)
    .maybeSingle();

  if (orderError || !order) {
    console.error('order-status: order lookup failed', orderError);
    return errorResponse(404, 'not_found', 'No order found for that reference.');
  }

  return jsonResponse(200, order);
});
