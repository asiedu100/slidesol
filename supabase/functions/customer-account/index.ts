import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/http.ts';
import { verifyCustomerRequest } from '../_shared/require-customer.ts';
import { getMe, updateMe } from './me.ts';
import { listMyOrders } from './orders.ts';
import { getCart, putCart } from './cart.ts';

const getSegments = (req: Request): string[] => {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const marker = parts.lastIndexOf('customer-account');
  return marker === -1 ? parts : parts.slice(marker + 1);
};

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await verifyCustomerRequest(req);
    if (!auth.authorized) return auth.response;
    const { supabase, customer } = auth;

    const segments = getSegments(req);
    const { method } = req;

    if (segments[0] === 'me') {
      if (segments.length === 1 && method === 'GET') return await getMe(customer);
      if (segments.length === 1 && method === 'PATCH') return await updateMe(supabase, customer, req);
    }

    if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
      return await listMyOrders(supabase, customer);
    }

    if (segments[0] === 'cart' && segments.length === 1) {
      if (method === 'GET') return await getCart(supabase, customer);
      if (method === 'PUT') return await putCart(supabase, customer, req);
    }

    return errorResponse(404, 'not_found', 'Unknown customer-account route.');
  } catch (error) {
    console.error('customer-account: unhandled error', error);
    return errorResponse(500, 'server_error', 'Something went wrong. Please try again.');
  }
});
