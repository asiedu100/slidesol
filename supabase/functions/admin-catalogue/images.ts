import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { isForeignKeyViolation } from '../_shared/pg-error.ts';
import { isNonEmptyString, parseJsonBody, UUID_RE } from './validation.ts';

const IMAGE_SELECT = 'id, product_id, colour_id, image_url, alt_text, sort_order, shot_angle, created_at';
const SHOT_ANGLES = ['hero', 'side', 'top', 'back'];
const isShotAngle = (value: unknown): value is string => typeof value === 'string' && SHOT_ANGLES.includes(value);
const BUCKET = 'product-images';
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
);

export const create = async (supabase: SupabaseClient, req: Request, productId: string): Promise<Response> => {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(400, 'invalid_content_type', 'Expected a multipart/form-data upload.');
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, 'invalid_form_data', 'Could not read the uploaded form.');
  }

  const colourId = form.get('colour_id');
  if (typeof colourId !== 'string' || !UUID_RE.test(colourId)) {
    return errorResponse(400, 'validation_error', 'A colour is required.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return errorResponse(400, 'validation_error', 'A file is required.');
  }

  // Server-side-only guards — a client-side check is a UX nicety, never the real gate.
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(400, 'file_too_large', 'Image must be 5MB or smaller.');
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return errorResponse(400, 'invalid_file_type', 'Image must be JPEG, PNG, WEBP, or GIF.');
  }

  const altTextRaw = form.get('alt_text');
  const altText = typeof altTextRaw === 'string' && altTextRaw.trim() ? altTextRaw.trim().slice(0, 300) : null;

  const sortOrderRaw = form.get('sort_order');
  let sortOrder: number | null = null;
  if (typeof sortOrderRaw === 'string' && sortOrderRaw !== '') {
    const parsed = Number(sortOrderRaw);
    if (!isNonNegativeInteger(parsed)) return errorResponse(400, 'validation_error', 'Sort order must be a non-negative whole number.');
    sortOrder = parsed;
  }

  const shotAngleRaw = form.get('shot_angle');
  if (shotAngleRaw !== null && shotAngleRaw !== '' && !isShotAngle(shotAngleRaw)) {
    return errorResponse(400, 'validation_error', 'shot_angle must be one of hero, side, top, back.');
  }
  const shotAngle = isShotAngle(shotAngleRaw) ? shotAngleRaw : null;

  const { data: colour, error: colourError } = await supabase
    .from('product_colours')
    .select('id')
    .eq('id', colourId)
    .eq('product_id', productId)
    .maybeSingle();

  if (colourError) {
    console.error('admin-catalogue/images: colour lookup failed', colourError);
    return errorResponse(500, 'server_error', 'Could not upload image.');
  }
  if (!colour) {
    return errorResponse(400, 'validation_error', 'That colour does not belong to this product.');
  }

  if (sortOrder === null) {
    const { count, error: countError } = await supabase
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)
      .eq('colour_id', colourId);

    if (countError) {
      console.error('admin-catalogue/images: sort order lookup failed', countError);
      return errorResponse(500, 'server_error', 'Could not upload image.');
    }
    sortOrder = count ?? 0;
  }

  const path = `products/${productId}/${colourId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error('admin-catalogue/images: upload failed', uploadError);
    return errorResponse(500, 'server_error', 'Could not upload image.');
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      colour_id: colourId,
      image_url: publicUrlData.publicUrl,
      alt_text: altText,
      sort_order: sortOrder,
      shot_angle: shotAngle,
    })
    .select(IMAGE_SELECT)
    .single();

  if (error || !data) {
    console.error('admin-catalogue/images: insert failed', error);
    // Compensating cleanup — never leave a file in storage with no DB row pointing at it silently orphaned without at least trying to remove it.
    await supabase.storage.from(BUCKET).remove([path]);
    return errorResponse(500, 'server_error', 'Could not save the uploaded image.');
  }

  return jsonResponse(201, { image: data });
};

export const update = async (supabase: SupabaseClient, req: Request, id: string): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  const { body } = parsed;

  const patch: Record<string, unknown> = {};

  if (body.alt_text !== undefined) {
    if (body.alt_text !== null && (typeof body.alt_text !== 'string' || body.alt_text.length > 300)) {
      return errorResponse(400, 'validation_error', 'Alt text is invalid.');
    }
    patch.alt_text = isNonEmptyString(body.alt_text) ? (body.alt_text as string).trim() : null;
  }

  if (body.sort_order !== undefined) {
    if (!isNonNegativeInteger(body.sort_order)) return errorResponse(400, 'validation_error', 'Sort order must be a non-negative whole number.');
    patch.sort_order = body.sort_order;
  }

  if (body.shot_angle !== undefined) {
    if (body.shot_angle !== null && !isShotAngle(body.shot_angle)) {
      return errorResponse(400, 'validation_error', 'shot_angle must be one of hero, side, top, back.');
    }
    patch.shot_angle = body.shot_angle;
  }

  if (Object.keys(patch).length === 0) {
    return errorResponse(400, 'validation_error', 'No fields to update.');
  }

  const { data, error } = await supabase
    .from('product_images')
    .update(patch)
    .eq('id', id)
    .select(IMAGE_SELECT)
    .maybeSingle();

  if (error) {
    console.error('admin-catalogue/images: update failed', error);
    return errorResponse(500, 'server_error', 'Could not update image.');
  }
  if (!data) return errorResponse(404, 'not_found', 'Image not found.');

  return jsonResponse(200, { image: data });
};

const extractStoragePath = (imageUrl: string): string | null => {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) return null;
  return imageUrl.slice(index + marker.length);
};

export const remove = async (supabase: SupabaseClient, id: string): Promise<Response> => {
  const { data: image, error: fetchError } = await supabase
    .from('product_images')
    .select('image_url')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) {
    console.error('admin-catalogue/images: fetch before delete failed', fetchError);
    return errorResponse(500, 'server_error', 'Could not delete image.');
  }
  if (!image) return errorResponse(404, 'not_found', 'Image not found.');

  const { error } = await supabase.from('product_images').delete().eq('id', id);

  if (error) {
    if (isForeignKeyViolation(error)) {
      return errorResponse(409, 'in_use', 'This image could not be removed.');
    }
    console.error('admin-catalogue/images: delete failed', error);
    return errorResponse(500, 'server_error', 'Could not delete image.');
  }

  // A dangling storage object is a harmless leak; a DB row pointing at a deleted file is
  // not — so the DB delete above is authoritative and this cleanup is best-effort only.
  const path = extractStoragePath(image.image_url);
  if (path) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
    if (removeError) console.error('admin-catalogue/images: storage cleanup failed', removeError);
  }

  return jsonResponse(200, { deleted: true });
};
