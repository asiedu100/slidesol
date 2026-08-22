import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { verifyAdminRequest } from '../_shared/require-admin.ts';

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'GET') {
    return errorResponse(405, 'method_not_allowed', 'Only GET is supported.');
  }

  const auth = await verifyAdminRequest(req);

  if (!auth.authorized) {
    // A valid session belonging to a non-admin account is not an error from this
    // endpoint's point of view — the frontend polls it to decide whether to show the
    // login form, so that case is reported as a normal 200 rather than the 401/500
    // the shared helper produces for a genuinely bad token or a lookup failure.
    if (auth.reason === 'forbidden') {
      return jsonResponse(200, { authorized: false });
    }
    return auth.response;
  }

  return jsonResponse(200, {
    authorized: true,
    full_name: auth.profile.full_name,
    role: auth.profile.role,
  });
});
