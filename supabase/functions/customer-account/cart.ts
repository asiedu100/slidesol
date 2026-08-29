import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { parseJsonBody } from './validation.ts';
import type { CustomerProfile } from '../_shared/require-customer.ts';

const CART_SELECT = `
  variant_id, quantity,
  product_variants (
    id, size, stock_quantity, is_preorder_available,
    products ( id, name, slug, price, brands ( name ) ),
    product_colours ( id, name ),
    product_images ( image_url, sort_order, colour_id )
  )
`;

// Shaped to match what js/store/cart.js already stores per item, so the frontend can
// merge/render server cart rows exactly like local ones with no extra transformation.
const toCartItem = (row: any) => {
  const variant = row.product_variants;
  const product = variant?.products;
  const colour = variant?.product_colours;
  const images = (product?.product_images ?? [])
    .filter((img: any) => img.colour_id === colour?.id)
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return {
    variantId: row.variant_id,
    productId: product?.id ?? null,
    slug: product?.slug ?? null,
    name: product?.name ?? 'Unknown product',
    brand: product?.brands?.name ?? '',
    colour: colour?.name ?? '',
    size: variant?.size ?? null,
    price: product?.price ?? 0,
    image: images[0]?.image_url ?? null,
    quantity: row.quantity,
    stock: variant?.stock_quantity ?? 0,
    isPreorder: variant?.is_preorder_available ?? false,
  };
};

export const getCart = async (supabase: SupabaseClient, customer: CustomerProfile): Promise<Response> => {
  const { data, error } = await supabase
    .from('cart_items')
    .select(CART_SELECT)
    .eq('customer_id', customer.id);

  if (error) {
    console.error('customer-account/cart: get failed', error);
    return errorResponse(500, 'server_error', 'Could not load your saved cart.');
  }

  // A variant that's since been deleted leaves product_variants null on the join —
  // drop it rather than show a broken row.
  const items = (data ?? []).filter((row: any) => row.product_variants).map(toCartItem);
  return jsonResponse(200, { items });
};

// Always replaces the full cart with exactly what's sent — the client has already
// resolved any local/server merge by the time it calls this, so there's no incremental
// diffing to get wrong here. Not a checkout: deliberately doesn't re-check stock, same
// trust level as the existing localStorage cart.
export const putCart = async (supabase: SupabaseClient, customer: CustomerProfile, req: Request): Promise<Response> => {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');

  const items = (parsed.body as { items?: unknown }).items;
  if (!Array.isArray(items)) return errorResponse(400, 'validation_error', 'items must be an array.');

  const rows: { customer_id: string; variant_id: string; quantity: number }[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const variantId = (item as Record<string, unknown>).variant_id;
    const quantity = (item as Record<string, unknown>).quantity;
    if (typeof variantId !== 'string' || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) continue;
    rows.push({ customer_id: customer.id, variant_id: variantId, quantity: Math.floor(quantity) });
  }

  const { error: deleteError } = await supabase.from('cart_items').delete().eq('customer_id', customer.id);
  if (deleteError) {
    console.error('customer-account/cart: clearing before replace failed', deleteError);
    return errorResponse(500, 'server_error', 'Could not save your cart.');
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from('cart_items').insert(rows);
    if (insertError) {
      console.error('customer-account/cart: insert failed', insertError);
      return errorResponse(500, 'server_error', 'Could not save your cart.');
    }
  }

  return getCart(supabase, customer);
};
