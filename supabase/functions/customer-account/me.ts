import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { isNonEmptyString, isOptionalString, parseJsonBody } from './validation.ts';
import type { CustomerProfile } from '../_shared/require-customer.ts';

export const getMe = async (customer: CustomerProfile): Promise<Response> => jsonResponse(200, { customer });

export const updateMe = async (supabase: SupabaseClient, customer: CustomerProfile, req: Request): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.full_name !== undefined) {
    if (!isNonEmptyString(body.full_name, 200)) return errorResponse(400, 'validation_error', 'Name cannot be empty.');
    patch.full_name = (body.full_name as string).trim();
  }

  if (body.phone !== undefined) {
    if (!isNonEmptyString(body.phone, 30)) return errorResponse(400, 'validation_error', 'Phone cannot be empty.');
    patch.phone = (body.phone as string).trim();
  }

  if (body.email !== undefined) {
    if (!isOptionalString(body.email, 255)) return errorResponse(400, 'validation_error', 'Email is invalid.');
    patch.email = isNonEmptyString(body.email) ? (body.email as string).trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', customer.id)
    .select('id, full_name, phone, email')
    .single();

  if (error || !data) {
    console.error('customer-account/me: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update your profile.');
  }

  return jsonResponse(200, { customer: data });
};
