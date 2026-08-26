import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { generateUniqueSlug } from '../_shared/slugify.ts';
import {
  isBoolean, isFiniteNonNegativeNumber, isNonEmptyString, isOptionalString, parseJsonBody, UUID_RE,
} from './validation.ts';

const GENDERS = ['men', 'women', 'unisex'];
const isGender = (value: unknown): value is string => typeof value === 'string' && GENDERS.includes(value);

const PRODUCT_LIST_SELECT = `
  id, name, slug, price, gender, is_active, created_at,
  brands ( id, name ),
  product_images ( image_url, sort_order )
`;

const PRODUCT_DETAIL_SELECT = `
  id, brand_id, name, slug, description, price, gender, is_active, created_at, updated_at,
  brands ( id, name, slug, is_active )
`;

export const list = async (supabase: SupabaseClient): Promise<Response> => {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_LIST_SELECT)
    .order('sort_order', { foreignTable: 'product_images', ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('admin-catalogue/products: list failed', error);
    return errorResponse(500, 'server_error', 'Could not load products.');
  }

  return jsonResponse(200, { products: data ?? [] });
};

export const getOne = async (supabase: SupabaseClient, id: string): Promise<Response> => {
  const [productRes, coloursRes, variantsRes, imagesRes] = await Promise.all([
    supabase.from('products').select(PRODUCT_DETAIL_SELECT).eq('id', id).maybeSingle(),
    supabase.from('product_colours').select('id, product_id, name, hex_code, is_active, created_at').eq('product_id', id).order('name', { ascending: true }),
    supabase.from('product_variants').select('id, product_id, colour_id, size, stock_quantity, is_preorder_available, preorder_delivery_days, sku, is_active, created_at, updated_at').eq('product_id', id).order('size', { ascending: true }),
    supabase.from('product_images').select('id, product_id, colour_id, image_url, alt_text, sort_order, created_at').eq('product_id', id).order('sort_order', { ascending: true }),
  ]);

  if (productRes.error || coloursRes.error || variantsRes.error || imagesRes.error) {
    console.error('admin-catalogue/products: getOne failed', {
      productError: productRes.error, coloursError: coloursRes.error, variantsError: variantsRes.error, imagesError: imagesRes.error,
    });
    return errorResponse(500, 'server_error', 'Could not load product.');
  }

  if (!productRes.data) {
    return errorResponse(404, 'not_found', 'Product not found.');
  }

  return jsonResponse(200, {
    product: productRes.data,
    colours: coloursRes.data ?? [],
    variants: variantsRes.data ?? [],
    images: imagesRes.data ?? [],
  });
};

const brandExists = async (supabase: SupabaseClient, brandId: string): Promise<boolean> => {
  const { data, error } = await supabase.from('brands').select('id').eq('id', brandId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
};

export const create = async (supabase: SupabaseClient, req: Request): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  if (typeof body.brand_id !== 'string' || !UUID_RE.test(body.brand_id)) {
    return errorResponse(400, 'validation_error', 'A brand is required.');
  }
  if (!isNonEmptyString(body.name, 300)) {
    return errorResponse(400, 'validation_error', 'Product name is required.');
  }
  if (!isFiniteNonNegativeNumber(body.price)) {
    return errorResponse(400, 'validation_error', 'Price must be a non-negative number.');
  }
  if (!isOptionalString(body.slug, 300) || !isOptionalString(body.description, 5000)) {
    return errorResponse(400, 'validation_error', 'Slug or description is invalid.');
  }
  if (body.is_active !== undefined && !isBoolean(body.is_active)) {
    return errorResponse(400, 'validation_error', 'is_active must be true or false.');
  }
  if (body.gender !== undefined && !isGender(body.gender)) {
    return errorResponse(400, 'validation_error', 'gender must be one of men, women, unisex.');
  }

  try {
    if (!(await brandExists(supabase, body.brand_id))) {
      return errorResponse(400, 'validation_error', 'That brand does not exist.');
    }
  } catch (error) {
    console.error('admin-catalogue/products: brand lookup failed', error);
    return errorResponse(500, 'server_error', 'Could not create product.');
  }

  let slug: string;
  try {
    slug = await generateUniqueSlug(supabase, 'products', isNonEmptyString(body.slug) ? body.slug as string : body.name as string);
  } catch (error) {
    console.error('admin-catalogue/products: slug generation failed', error);
    return errorResponse(500, 'server_error', 'Could not create product.');
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      brand_id: body.brand_id,
      name: (body.name as string).trim(),
      slug,
      description: isNonEmptyString(body.description) ? (body.description as string).trim() : null,
      price: body.price,
      gender: body.gender ?? 'unisex',
      is_active: body.is_active ?? true,
    })
    .select(PRODUCT_DETAIL_SELECT)
    .single();

  if (error || !data) {
    console.error('admin-catalogue/products: create failed', error);
    return errorResponse(500, 'server_error', 'Could not create product.');
  }

  return jsonResponse(201, { product: data });
};

export const update = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.brand_id !== undefined) {
    if (typeof body.brand_id !== 'string' || !UUID_RE.test(body.brand_id)) {
      return errorResponse(400, 'validation_error', 'Invalid brand.');
    }
    try {
      if (!(await brandExists(supabase, body.brand_id))) {
        return errorResponse(400, 'validation_error', 'That brand does not exist.');
      }
    } catch (error) {
      console.error('admin-catalogue/products: brand lookup failed', error);
      return errorResponse(500, 'server_error', 'Could not update product.');
    }
    patch.brand_id = body.brand_id;
  }

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 300)) return errorResponse(400, 'validation_error', 'Product name cannot be empty.');
    patch.name = (body.name as string).trim();
  }

  if (body.slug !== undefined) {
    if (!isNonEmptyString(body.slug, 300)) return errorResponse(400, 'validation_error', 'Slug cannot be empty.');
    try {
      patch.slug = await generateUniqueSlug(supabase, 'products', body.slug as string, id);
    } catch (error) {
      console.error('admin-catalogue/products: slug generation failed', error);
      return errorResponse(500, 'server_error', 'Could not update product.');
    }
  }

  if (body.description !== undefined) {
    if (!isOptionalString(body.description, 5000)) return errorResponse(400, 'validation_error', 'Description is invalid.');
    patch.description = isNonEmptyString(body.description) ? (body.description as string).trim() : null;
  }

  if (body.price !== undefined) {
    if (!isFiniteNonNegativeNumber(body.price)) return errorResponse(400, 'validation_error', 'Price must be a non-negative number.');
    patch.price = body.price;
  }

  if (body.is_active !== undefined) {
    if (!isBoolean(body.is_active)) return errorResponse(400, 'validation_error', 'is_active must be true or false.');
    patch.is_active = body.is_active;
  }

  if (body.gender !== undefined) {
    if (!isGender(body.gender)) return errorResponse(400, 'validation_error', 'gender must be one of men, women, unisex.');
    patch.gender = body.gender;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select(PRODUCT_DETAIL_SELECT)
    .maybeSingle();

  if (error) {
    console.error('admin-catalogue/products: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update product.');
  }
  if (!data) {
    return errorResponse(404, 'not_found', 'Product not found.');
  }

  return jsonResponse(200, { product: data });
};
