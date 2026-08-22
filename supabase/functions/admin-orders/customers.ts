import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { ORDER_PAYMENT_STATUS } from '../_shared/constants.ts';

export const list = async (supabase: SupabaseClient): Promise<Response> => {
  const [customersRes, ordersRes] = await Promise.all([
    supabase.from('customers').select('id, full_name, phone, email, created_at').order('created_at', { ascending: false }),
    supabase.from('orders').select('customer_id, total_amount, payment_status'),
  ]);

  if (customersRes.error || ordersRes.error) {
    console.error('admin-orders/customers: list failed', { customersError: customersRes.error, ordersError: ordersRes.error });
    return errorResponse(500, 'server_error', 'Could not load customers.');
  }

  // order_count counts every order regardless of outcome; total_spent only counts
  // orders a verified webhook actually marked paid — unpaid/failed orders never
  // generated revenue.
  const stats = new Map<string, { orderCount: number; totalSpent: number }>();
  for (const order of ordersRes.data ?? []) {
    const entry = stats.get(order.customer_id) ?? { orderCount: 0, totalSpent: 0 };
    entry.orderCount += 1;
    if (order.payment_status === ORDER_PAYMENT_STATUS.PAID) entry.totalSpent += Number(order.total_amount) || 0;
    stats.set(order.customer_id, entry);
  }

  const customers = (customersRes.data ?? []).map((customer: any) => {
    const entry = stats.get(customer.id) ?? { orderCount: 0, totalSpent: 0 };
    return { ...customer, order_count: entry.orderCount, total_spent: entry.totalSpent };
  });

  return jsonResponse(200, { customers });
};
