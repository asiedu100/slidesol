import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse } from '../_shared/http.ts';
import { verifyAdminRequest } from '../_shared/require-admin.ts';
import * as brands from './brands.ts';
import * as products from './products.ts';
import * as colours from './colours.ts';
import * as variants from './variants.ts';
import * as images from './images.ts';
import { UUID_RE } from './validation.ts';

const getSegments = (req: Request): string[] => {
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const marker = parts.lastIndexOf('admin-catalogue');
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

    if (segments[0] === 'brands') {
      if (segments.length === 1 && method === 'GET') return await brands.list(supabase);
      if (segments.length === 1 && method === 'POST') return await brands.create(supabase, req);
      if (segments.length === 2 && UUID_RE.test(segments[1])) {
        if (method === 'PATCH') return await brands.update(supabase, req, segments[1]);
        if (method === 'DELETE') {
          return errorResponse(405, 'delete_not_supported', 'Brands cannot be permanently deleted — set is_active to false instead.');
        }
      }
    }

    if (segments[0] === 'products') {
      if (segments.length === 1 && method === 'GET') return await products.list(supabase);
      if (segments.length === 1 && method === 'POST') return await products.create(supabase, req);

      if (segments.length === 2 && UUID_RE.test(segments[1])) {
        if (method === 'GET') return await products.getOne(supabase, segments[1]);
        if (method === 'PATCH') return await products.update(supabase, req, segments[1]);
        if (method === 'DELETE') {
          return errorResponse(405, 'delete_not_supported', 'Products cannot be permanently deleted — set is_active to false instead.');
        }
      }

      if (segments.length === 3 && UUID_RE.test(segments[1])) {
        const productId = segments[1];
        if (segments[2] === 'colours' && method === 'POST') return await colours.create(supabase, req, productId);
        if (segments[2] === 'variants' && method === 'POST') return await variants.create(supabase, req, productId);
        if (segments[2] === 'images' && method === 'POST') return await images.create(supabase, req, productId);
      }
    }

    if (segments[0] === 'colours' && segments.length === 2 && UUID_RE.test(segments[1])) {
      if (method === 'PATCH') return await colours.update(supabase, req, segments[1]);
      if (method === 'DELETE') return await colours.remove(supabase, segments[1]);
    }

    if (segments[0] === 'variants' && segments.length === 2 && UUID_RE.test(segments[1])) {
      if (method === 'PATCH') return await variants.update(supabase, req, segments[1]);
      if (method === 'DELETE') return await variants.remove(supabase, segments[1]);
    }

    if (segments[0] === 'images' && segments.length === 2 && UUID_RE.test(segments[1])) {
      if (method === 'PATCH') return await images.update(supabase, req, segments[1]);
      if (method === 'DELETE') return await images.remove(supabase, segments[1]);
    }

    return errorResponse(404, 'not_found', 'Unknown admin-catalogue route.');
  } catch (error) {
    console.error('admin-catalogue: unhandled error', error);
    return errorResponse(500, 'server_error', 'Something went wrong. Please try again.');
  }
});
