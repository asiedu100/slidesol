import { handleCorsPreflight } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase-admin.ts';
import { initializeTransaction } from '../_shared/paystack.ts';
import {
  CURRENCY, GHANA_REGIONS, MAX_ITEM_QUANTITY, ORDER_STATUS, ORDER_TYPE,
  ORDER_PAYMENT_STATUS, PAYMENT_STATUS, getDeliveryFee,
} from '../_shared/constants.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface OrderItemInput {
  product_id: string;
  variant_id: string;
  quantity: number;
}

interface OrderPayload {
  customer: { full_name: string; phone: string; email: string | null };
  fulfilment_method: 'delivery' | 'pickup';
  delivery: { region: string; city: string; area: string; address: string } | null;
  customer_note: string | null;
  items: OrderItemInput[];
  currency: string;
}

const isNonEmptyString = (value: unknown, maxLength = 255): value is string => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
);

const validatePayload = (body: unknown): { ok: true; payload: OrderPayload } | { ok: false; message: string } => {
  if (typeof body !== 'object' || body === null) return { ok: false, message: 'Request body must be a JSON object.' };
  const b = body as Record<string, unknown>;

  const customer = b.customer as Record<string, unknown> | undefined;
  if (!customer || !isNonEmptyString(customer.full_name, 200)) {
    return { ok: false, message: 'Full name is required.' };
  }
  if (!isNonEmptyString(customer.phone, 30)) {
    return { ok: false, message: 'Phone number is required.' };
  }
  if (customer.email !== null && customer.email !== undefined && customer.email !== '') {
    if (typeof customer.email !== 'string' || !EMAIL_RE.test(customer.email)) {
      return { ok: false, message: 'Email address is not valid.' };
    }
  }

  if (b.fulfilment_method !== 'delivery' && b.fulfilment_method !== 'pickup') {
    return { ok: false, message: 'Fulfilment method must be "delivery" or "pickup".' };
  }

  let delivery: OrderPayload['delivery'] = null;
  if (b.fulfilment_method === 'delivery') {
    const d = b.delivery as Record<string, unknown> | undefined;
    if (!d
      || !isNonEmptyString(d.region, 50) || !GHANA_REGIONS.includes(d.region as string)
      || !isNonEmptyString(d.city, 100)
      || !isNonEmptyString(d.area, 100)
      || !isNonEmptyString(d.address, 500)) {
      return { ok: false, message: 'Complete delivery information is required.' };
    }
    delivery = {
      region: d.region as string,
      city: (d.city as string).trim(),
      area: (d.area as string).trim(),
      address: (d.address as string).trim(),
    };
  }

  let customerNote: string | null = null;
  if (b.customer_note !== null && b.customer_note !== undefined && b.customer_note !== '') {
    if (typeof b.customer_note !== 'string' || b.customer_note.length > 1000) {
      return { ok: false, message: 'Order note is too long.' };
    }
    customerNote = b.customer_note.trim();
  }

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, message: 'Your bag is empty.' };
  }

  const items: OrderItemInput[] = [];
  for (const raw of b.items) {
    const item = raw as Record<string, unknown>;
    if (
      typeof item.product_id !== 'string' || !UUID_RE.test(item.product_id)
      || typeof item.variant_id !== 'string' || !UUID_RE.test(item.variant_id)
      || typeof item.quantity !== 'number' || !Number.isInteger(item.quantity)
      || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY
    ) {
      return { ok: false, message: 'One or more items in your bag are invalid.' };
    }
    items.push({ product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity });
  }

  if (b.currency !== CURRENCY) {
    return { ok: false, message: `Only ${CURRENCY} is supported.` };
  }

  return {
    ok: true,
    payload: {
      customer: {
        full_name: (customer.full_name as string).trim(),
        phone: (customer.phone as string).trim(),
        email: customer.email ? (customer.email as string).trim() : null,
      },
      fulfilment_method: b.fulfilment_method,
      delivery,
      customer_note: customerNote,
      items,
      currency: CURRENCY,
    },
  };
};

const dedupeItems = (items: OrderItemInput[]): OrderItemInput[] => {
  const byVariant = new Map<string, OrderItemInput>();
  for (const item of items) {
    const existing = byVariant.get(item.variant_id);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + item.quantity, MAX_ITEM_QUANTITY);
    } else {
      byVariant.set(item.variant_id, { ...item });
    }
  }
  return [...byVariant.values()];
};

const generateOrderNumber = (): string => {
  const date = new Date();
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
  return `SLS-${stamp}-${suffix}`;
};

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Only POST is supported.');
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.');
  }

  const validation = validatePayload(rawBody);
  if (!validation.ok) {
    return errorResponse(400, 'validation_error', validation.message);
  }

  const payload = validation.payload;
  const items = dedupeItems(payload.items);
  const variantIds = items.map((item) => item.variant_id);

  const supabase = createAdminClient();

  const { data: variants, error: variantsError } = await supabase
    .from('product_variants')
    .select(`
      id, product_id, colour_id, size, stock_quantity, is_preorder_available, is_active,
      products ( id, name, slug, price, is_active, brand_id, brands ( id, name, is_active ) ),
      product_colours ( id, name, is_active )
    `)
    .in('id', variantIds);

  if (variantsError) {
    console.error('create-order: failed to fetch variants', variantsError);
    return errorResponse(500, 'server_error', 'Could not validate your bag. Please try again.');
  }

  const variantById = new Map((variants ?? []).map((v: any) => [v.id, v]));

  let hasPreorderLine = false;
  const validatedLines: {
    productId: string;
    variantId: string;
    productName: string;
    brandName: string;
    colourName: string;
    size: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }[] = [];

  for (const item of items) {
    const variant = variantById.get(item.variant_id);
    const product = variant?.products;
    const brand = product?.brands;

    if (!variant || !product || !brand) {
      return errorResponse(400, 'item_unavailable', 'One or more items in your bag are no longer available.');
    }
    if (variant.product_id !== item.product_id) {
      return errorResponse(400, 'item_mismatch', 'One or more items in your bag could not be verified.');
    }
    if (!variant.is_active || !product.is_active || !brand.is_active || variant.product_colours?.is_active === false) {
      return errorResponse(400, 'item_unavailable', `${product.name} is no longer available.`);
    }

    const stock = Number(variant.stock_quantity || 0);
    const isPreorderLine = item.quantity > stock;
    if (isPreorderLine && !variant.is_preorder_available) {
      return errorResponse(
        409,
        'insufficient_stock',
        `Insufficient stock for ${product.name} (size ${variant.size}). Only ${stock} left.`,
      );
    }
    if (isPreorderLine) hasPreorderLine = true;

    const unitPrice = Number(product.price);
    const subtotal = unitPrice * item.quantity;

    validatedLines.push({
      productId: product.id,
      variantId: variant.id,
      productName: product.name,
      brandName: brand.name,
      colourName: variant.product_colours?.name ?? '',
      size: String(variant.size),
      unitPrice,
      quantity: item.quantity,
      subtotal,
    });
  }

  const subtotal = validatedLines.reduce((sum, line) => sum + line.subtotal, 0);
  const deliveryFee = getDeliveryFee(payload.fulfilment_method, payload.delivery?.region ?? null);
  const totalAmount = subtotal + deliveryFee;
  const orderType = hasPreorderLine ? ORDER_TYPE.PREORDER : ORDER_TYPE.STANDARD;

  // Find-or-create the guest customer, matched by phone (required; closer to a natural
  // key than the optional email). An existing match is reused as-is rather than
  // overwritten, so one guest's typo can't silently corrupt another customer's record.
  let customerId: string;
  const { data: existingCustomer, error: findCustomerError } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', payload.customer.phone)
    .maybeSingle();

  if (findCustomerError) {
    console.error('create-order: failed to look up customer', findCustomerError);
    return errorResponse(500, 'server_error', 'Could not process your order. Please try again.');
  }

  if (existingCustomer) {
    customerId = existingCustomer.id;
  } else {
    const { data: newCustomer, error: createCustomerError } = await supabase
      .from('customers')
      .insert({
        full_name: payload.customer.full_name,
        phone: payload.customer.phone,
        email: payload.customer.email,
      })
      .select('id')
      .single();

    if (createCustomerError || !newCustomer) {
      console.error('create-order: failed to create customer', createCustomerError);
      return errorResponse(500, 'server_error', 'Could not process your order. Please try again.');
    }
    customerId = newCustomer.id;
  }

  const orderNumber = generateOrderNumber();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_number: orderNumber,
      customer_id: customerId,
      fulfilment_method: payload.fulfilment_method,
      delivery_region: payload.delivery?.region ?? null,
      delivery_city: payload.delivery?.city ?? null,
      delivery_area: payload.delivery?.area ?? null,
      delivery_address: payload.delivery?.address ?? null,
      customer_note: payload.customer_note,
      subtotal,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      currency: CURRENCY,
      payment_status: ORDER_PAYMENT_STATUS.PENDING,
      order_status: ORDER_STATUS.PENDING,
      order_type: orderType,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('create-order: failed to create order', orderError);
    return errorResponse(500, 'server_error', 'Could not process your order. Please try again.');
  }

  const { error: orderItemsError } = await supabase
    .from('order_items')
    .insert(validatedLines.map((line) => ({
      order_id: order.id,
      product_id: line.productId,
      variant_id: line.variantId,
      product_name: line.productName,
      brand_name: line.brandName,
      colour_name: line.colourName,
      size: line.size,
      unit_price: line.unitPrice,
      quantity: line.quantity,
      subtotal: line.subtotal,
    })));

  if (orderItemsError) {
    console.error('create-order: failed to create order items', orderItemsError);
    await supabase.from('orders').delete().eq('id', order.id);
    return errorResponse(500, 'server_error', 'Could not process your order. Please try again.');
  }

  const reference = `sls-${crypto.randomUUID()}`;

  const { error: paymentError } = await supabase
    .from('payments')
    .insert({
      order_id: order.id,
      provider: 'paystack',
      transaction_reference: reference,
      amount: totalAmount,
      currency: CURRENCY,
      status: PAYMENT_STATUS.PENDING,
    });

  if (paymentError) {
    console.error('create-order: failed to create payment record', paymentError);
    await supabase.from('order_items').delete().eq('order_id', order.id);
    await supabase.from('orders').delete().eq('id', order.id);
    return errorResponse(500, 'server_error', 'Could not process your order. Please try again.');
  }

  const siteUrl = Deno.env.get('SITE_URL');
  const callbackUrl = siteUrl
    ? `${siteUrl.replace(/\/$/, '')}/order-success.html?reference=${encodeURIComponent(reference)}`
    : '';

  // Paystack requires an email; the checkout form's email field is optional. A synthetic
  // fallback is used only for this API call and is never written to customers.email.
  const paystackEmail = payload.customer.email
    ?? `guest+${reference}@guest.slidesol.app`;

  const initResult = await initializeTransaction({
    email: paystackEmail,
    amountSubunits: Math.round(totalAmount * 100),
    currency: CURRENCY,
    reference,
    callbackUrl,
    metadata: { order_id: order.id, order_number: orderNumber },
  });

  if (!initResult.ok) {
    console.error('create-order: paystack initialize failed', initResult.errorMessage);
    await supabase
      .from('payments')
      .update({ status: PAYMENT_STATUS.FAILED })
      .eq('transaction_reference', reference);
    return errorResponse(502, 'payment_init_failed', 'Could not start payment. Please try again.');
  }

  return jsonResponse(200, {
    order_number: orderNumber,
    reference,
    authorization_url: initResult.authorizationUrl,
  });
});
