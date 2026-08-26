import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { isForeignKeyViolation } from '../_shared/pg-error.ts';
import {
  HEX_COLOUR_RE, isBoolean, isNonEmptyString, isOptionalString, parseJsonBody,
} from './validation.ts';

const COLOUR_SELECT = 'id, product_id, name, hex_code, is_active, created_at';

export const create = async (supabase: SupabaseClient, req: Request, productId: string): Promise<Response> => {
  const { data: product, error: productError } = await supabase.from('products').select('id').eq('id', productId).maybeSingle();
  if (productError) {
    console.error('admin-catalogue/colours: product lookup failed', productError);
    return errorResponse(500, 'server_error', 'Could not create colour.');
  }
  if (!product) return errorResponse(404, 'not_found', 'Product not found.');

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  if (!isNonEmptyString(body.name, 100)) {
    return errorResponse(400, 'validation_error', 'Colour name is required.');
  }
  if (!isOptionalString(body.hex_code, 7) || (isNonEmptyString(body.hex_code) && !HEX_COLOUR_RE.test(body.hex_code as string))) {
    return errorResponse(400, 'validation_error', 'Hex code must look like #RRGGBB.');
  }
  if (body.is_active !== undefined && !isBoolean(body.is_active)) {
    return errorResponse(400, 'validation_error', 'is_active must be true or false.');
  }

  const { data, error } = await supabase
    .from('product_colours')
    .insert({
      product_id: productId,
      name: (body.name as string).trim(),
      hex_code: isNonEmptyString(body.hex_code) ? (body.hex_code as string).toUpperCase() : null,
      is_active: body.is_active ?? true,
    })
    .select(COLOUR_SELECT)
    .single();

  if (error || !data) {
    console.error('admin-catalogue/colours: create failed', error);
    return errorResponse(500, 'server_error', 'Could not create colour.');
  }

  return jsonResponse(201, { colour: data });
};

export const update = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 100)) return errorResponse(400, 'validation_error', 'Colour name cannot be empty.');
    patch.name = (body.name as string).trim();
  }

  if (body.hex_code !== undefined) {
    if (!isOptionalString(body.hex_code, 7) || (isNonEmptyString(body.hex_code) && !HEX_COLOUR_RE.test(body.hex_code as string))) {
      return errorResponse(400, 'validation_error', 'Hex code must look like #RRGGBB.');
    }
    patch.hex_code = isNonEmptyString(body.hex_code) ? (body.hex_code as string).toUpperCase() : null;
  }

  if (body.is_active !== undefined) {
    if (!isBoolean(body.is_active)) return errorResponse(400, 'validation_error', 'is_active must be true or false.');
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('product_colours')
    .update(patch)
    .eq('id', id)
    .select(COLOUR_SELECT)
    .maybeSingle();

  if (error) {
    console.error('admin-catalogue/colours: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update colour.');
  }
  if (!data) return errorResponse(404, 'not_found', 'Colour not found.');

  return jsonResponse(200, { colour: data });
};

export const remove = async (supabase: SupabaseClient, id: string): Promise<Response> => {
  const { error } = await supabase.from('product_colours').delete().eq('id', id);

  if (error) {
    if (isForeignKeyViolation(error)) {
      return errorResponse(409, 'in_use', "Remove this colour's variants and images first, then delete it.");
    }
    console.error('admin-catalogue/colours: delete failed', error);
    return errorResponse(500, 'server_error', 'Could not delete colour.');
  }

  return jsonResponse(200, { deleted: true });
};
