import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import type { CustomerProfile } from '../_shared/require-customer.ts';

const ORDER_LIST_SELECT = `
  id, order_number, total_amount, currency, payment_status, order_status, order_type, created_at,
  order_items ( id )
`;

// customer_id comes from the verified token's resolved customer, never from the request
// — this is what keeps one account from ever seeing another account's orders.
export const listMyOrders = async (supabase: SupabaseClient, customer: CustomerProfile): Promise<Response> => {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_LIST_SELECT)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('customer-account/orders: list failed', error);
    return errorResponse(500, 'server_error', 'Could not load your orders.');
  }

  const orders = (data ?? []).map((row: any) => {
    const { order_items: items, ...rest } = row;
    return { ...rest, item_count: items?.length ?? 0 };
  });

  return jsonResponse(200, { orders });
};
