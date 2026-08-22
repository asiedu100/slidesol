import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { generateUniqueSlug } from '../_shared/slugify.ts';
import {
  isBoolean, isNonEmptyString, isOptionalString, parseJsonBody,
} from './validation.ts';

export const list = async (supabase: SupabaseClient): Promise<Response> => {
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, logo_url, is_active, created_at')
    .order('name', { ascending: true });

  if (error) {
    console.error('admin-catalogue/brands: list failed', error);
    return errorResponse(500, 'server_error', 'Could not load brands.');
  }

  return jsonResponse(200, { brands: data ?? [] });
};

export const create = async (supabase: SupabaseClient, req: Request): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  if (!isNonEmptyString(body.name, 200)) {
    return errorResponse(400, 'validation_error', 'Brand name is required.');
  }
  if (!isOptionalString(body.slug, 200) || !isOptionalString(body.logo_url, 1000)) {
    return errorResponse(400, 'validation_error', 'Slug or logo URL is invalid.');
  }
  if (body.is_active !== undefined && !isBoolean(body.is_active)) {
    return errorResponse(400, 'validation_error', 'is_active must be true or false.');
  }

  let slug: string;
  try {
    slug = await generateUniqueSlug(supabase, 'brands', isNonEmptyString(body.slug) ? body.slug as string : body.name as string);
  } catch (error) {
    console.error('admin-catalogue/brands: slug generation failed', error);
    return errorResponse(500, 'server_error', 'Could not create brand.');
  }

  const { data, error } = await supabase
    .from('brands')
    .insert({
      name: (body.name as string).trim(),
      slug,
      logo_url: isNonEmptyString(body.logo_url) ? (body.logo_url as string).trim() : null,
      is_active: body.is_active ?? true,
    })
    .select('id, name, slug, logo_url, is_active, created_at')
    .single();

  if (error || !data) {
    console.error('admin-catalogue/brands: create failed', error);
    return errorResponse(500, 'server_error', 'Could not create brand.');
  }

  return jsonResponse(201, { brand: data });
};

export const update = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name, 200)) return errorResponse(400, 'validation_error', 'Brand name cannot be empty.');
    patch.name = (body.name as string).trim();
  }

  if (body.slug !== undefined) {
    if (!isNonEmptyString(body.slug, 200)) return errorResponse(400, 'validation_error', 'Slug cannot be empty.');
    try {
      patch.slug = await generateUniqueSlug(supabase, 'brands', body.slug as string, id);
    } catch (error) {
      console.error('admin-catalogue/brands: slug generation failed', error);
      return errorResponse(500, 'server_error', 'Could not update brand.');
    }
  }

  if (body.logo_url !== undefined) {
    if (!isOptionalString(body.logo_url, 1000)) return errorResponse(400, 'validation_error', 'Logo URL is invalid.');
    patch.logo_url = isNonEmptyString(body.logo_url) ? (body.logo_url as string).trim() : null;
  }

  if (body.is_active !== undefined) {
    if (!isBoolean(body.is_active)) return errorResponse(400, 'validation_error', 'is_active must be true or false.');
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('brands')
    .update(patch)
    .eq('id', id)
    .select('id, name, slug, logo_url, is_active, created_at')
    .maybeSingle();

  if (error) {
    console.error('admin-catalogue/brands: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update brand.');
  }
  if (!data) {
    return errorResponse(404, 'not_found', 'Brand not found.');
  }

  return jsonResponse(200, { brand: data });
};
