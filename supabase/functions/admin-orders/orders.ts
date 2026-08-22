import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { ADMIN_SETTABLE_ORDER_STATUSES } from '../_shared/constants.ts';

const ORDER_LIST_SELECT = `
  id, order_number, customer_id, fulfilment_method, total_amount, currency,
  payment_status, order_status, order_type, created_at,
  customers ( full_name, phone ),
  order_items ( id )
`;

export const list = async (supabase: SupabaseClient, customerId: string | null): Promise<Response> => {
  let query = supabase.from('orders').select(ORDER_LIST_SELECT).order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;

  if (error) {
    console.error('admin-orders/orders: list failed', error);
    return errorResponse(500, 'server_error', 'Could not load orders.');
  }

  const orders = (data ?? []).map((row: any) => {
    const { order_items: items, ...rest } = row;
    return { ...rest, item_count: items?.length ?? 0 };
  });

  return jsonResponse(200, { orders });
};

export const getOne = async (supabase: SupabaseClient, id: string): Promise<Response> => {
  const [orderRes, itemsRes, paymentRes] = await Promise.all([
    supabase.from('orders').select('*, customers ( id, full_name, phone, email )').eq('id', id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    supabase.from('payments').select('*').eq('order_id', id).maybeSingle(),
  ]);

  if (orderRes.error || itemsRes.error || paymentRes.error) {
    console.error('admin-orders/orders: getOne failed', {
      orderError: orderRes.error, itemsError: itemsRes.error, paymentError: paymentRes.error,
    });
    return errorResponse(500, 'server_error', 'Could not load order.');
  }

  if (!orderRes.data) {
    return errorResponse(404, 'not_found', 'Order not found.');
  }

  return jsonResponse(200, {
    order: orderRes.data,
    items: itemsRes.data ?? [],
    payment: paymentRes.data ?? null,
  });
};

export const updateStatus = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  if (typeof body.order_status !== 'string' || !ADMIN_SETTABLE_ORDER_STATUSES.includes(body.order_status)) {
    return errorResponse(400, 'validation_error', `order_status must be one of: ${ADMIN_SETTABLE_ORDER_STATUSES.join(', ')}.`);
  }

  // Deliberately the only field this endpoint can ever touch — payment_status stays
  // exclusively controlled by the verified Paystack webhook, never an admin action.
  const { data, error } = await supabase
    .from('orders')
    .update({ order_status: body.order_status })
    .eq('id', id)
    .select('id, order_status')
    .maybeSingle();

  if (error) {
    console.error('admin-orders/orders: updateStatus failed', error);
    return errorResponse(500, 'server_error', 'Could not update order status.');
  }
  if (!data) {
    return errorResponse(404, 'not_found', 'Order not found.');
  }

  return jsonResponse(200, { order: data });
};
