import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { isForeignKeyViolation } from '../_shared/pg-error.ts';
import {
  isBoolean, isNonEmptyString, isOptionalString, parseJsonBody, UUID_RE,
} from './validation.ts';

const VARIANT_SELECT = 'id, product_id, colour_id, size, stock_quantity, is_preorder_available, preorder_delivery_days, sku, is_active, created_at, updated_at';

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
);

export const create = async (supabase: SupabaseClient, req: Request, productId: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  if (typeof body.colour_id !== 'string' || !UUID_RE.test(body.colour_id)) {
    return errorResponse(400, 'validation_error', 'A colour is required.');
  }
  if (!isNonEmptyString(body.size, 20)) {
    return errorResponse(400, 'validation_error', 'Size is required.');
  }
  if (body.stock_quantity !== undefined && !isNonNegativeInteger(body.stock_quantity)) {
    return errorResponse(400, 'validation_error', 'Stock quantity must be a non-negative whole number.');
  }
  if (body.is_preorder_available !== undefined && !isBoolean(body.is_preorder_available)) {
    return errorResponse(400, 'validation_error', 'is_preorder_available must be true or false.');
  }
  if (body.preorder_delivery_days !== undefined && body.preorder_delivery_days !== null && !isNonNegativeInteger(body.preorder_delivery_days)) {
    return errorResponse(400, 'validation_error', 'Pre-order delivery days must be a non-negative whole number.');
  }
  if (!isOptionalString(body.sku, 100)) {
    return errorResponse(400, 'validation_error', 'SKU is invalid.');
  }
  if (body.is_active !== undefined && !isBoolean(body.is_active)) {
    return errorResponse(400, 'validation_error', 'is_active must be true or false.');
  }

  const { data: colour, error: colourError } = await supabase
    .from('product_colours')
    .select('id')
    .eq('id', body.colour_id)
    .eq('product_id', productId)
    .maybeSingle();

  if (colourError) {
    console.error('admin-catalogue/variants: colour lookup failed', colourError);
    return errorResponse(500, 'server_error', 'Could not create variant.');
  }
  if (!colour) {
    return errorResponse(400, 'validation_error', 'That colour does not belong to this product.');
  }

  const { data, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: productId,
      colour_id: body.colour_id,
      size: (body.size as string).trim(),
      stock_quantity: body.stock_quantity ?? 0,
      is_preorder_available: body.is_preorder_available ?? false,
      preorder_delivery_days: body.preorder_delivery_days ?? null,
      sku: isNonEmptyString(body.sku) ? (body.sku as string).trim() : null,
      is_active: body.is_active ?? true,
    })
    .select(VARIANT_SELECT)
    .single();

  if (error || !data) {
    console.error('admin-catalogue/variants: create failed', error);
    return errorResponse(500, 'server_error', 'Could not create variant.');
  }

  return jsonResponse(201, { variant: data });
};

export const update = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.size !== undefined) {
    if (!isNonEmptyString(body.size, 20)) return errorResponse(400, 'validation_error', 'Size cannot be empty.');
    patch.size = (body.size as string).trim();
  }

  if (body.stock_quantity !== undefined) {
    if (!isNonNegativeInteger(body.stock_quantity)) return errorResponse(400, 'validation_error', 'Stock quantity must be a non-negative whole number.');
    patch.stock_quantity = body.stock_quantity;
  }

  if (body.is_preorder_available !== undefined) {
    if (!isBoolean(body.is_preorder_available)) return errorResponse(400, 'validation_error', 'is_preorder_available must be true or false.');
    patch.is_preorder_available = body.is_preorder_available;
  }

  if (body.preorder_delivery_days !== undefined) {
    if (body.preorder_delivery_days !== null && !isNonNegativeInteger(body.preorder_delivery_days)) {
      return errorResponse(400, 'validation_error', 'Pre-order delivery days must be a non-negative whole number.');
    }
    patch.preorder_delivery_days = body.preorder_delivery_days;
  }

  if (body.sku !== undefined) {
    if (!isOptionalString(body.sku, 100)) return errorResponse(400, 'validation_error', 'SKU is invalid.');
    patch.sku = isNonEmptyString(body.sku) ? (body.sku as string).trim() : null;
  }

  if (body.is_active !== undefined) {
    if (!isBoolean(body.is_active)) return errorResponse(400, 'validation_error', 'is_active must be true or false.');
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('product_variants')
    .update(patch)
    .eq('id', id)
    .select(VARIANT_SELECT)
    .maybeSingle();

  if (error) {
    console.error('admin-catalogue/variants: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update variant.');
  }
  if (!data) return errorResponse(404, 'not_found', 'Variant not found.');

  return jsonResponse(200, { variant: data });
};

export const remove = async (supabase: SupabaseClient, id: string): Promise<Response> => {
  const { error } = await supabase.from('product_variants').delete().eq('id', id);

  if (error) {
    if (isForeignKeyViolation(error)) {
      return errorResponse(409, 'in_use', 'This variant has existing orders — deactivate it instead of deleting.');
    }
    console.error('admin-catalogue/variants: delete failed', error);
    return errorResponse(500, 'server_error', 'Could not delete variant.');
  }

  return jsonResponse(200, { deleted: true });
};
