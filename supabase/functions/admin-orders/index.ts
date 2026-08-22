import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/http.ts';
import { verifyAdminRequest } from '../_shared/require-admin.ts';
import * as orders from './orders.ts';
import * as customers from './customers.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getSegments = (req: Request): string[] => {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const marker = parts.lastIndexOf('admin-orders');
  return marker === -1 ? parts : parts.slice(marker + 1);
};

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) return auth.response;
    const { supabase } = auth;

    const segments = getSegments(req);
    const { method } = req;
    const url = new URL(req.url);

    if (segments[0] === 'orders') {
      if (segments.length === 1 && method === 'GET') {
        return await orders.list(supabase, url.searchParams.get('customer_id'));
      }
      if (segments.length === 2 && UUID_RE.test(segments[1])) {
        if (method === 'GET') return await orders.getOne(supabase, segments[1]);
        if (method === 'PATCH') return await orders.updateStatus(supabase, req, segments[1]);
      }
    }

    if (segments[0] === 'customers') {
      if (segments.length === 1 && method === 'GET') return await customers.list(supabase);
    }

    return errorResponse(404, 'not_found', 'Unknown admin-orders route.');
  } catch (error) {
    console.error('admin-orders: unhandled error', error);
    return errorResponse(500, 'server_error', 'Something went wrong. Please try again.');
  }
});
