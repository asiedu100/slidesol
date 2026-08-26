// Kept in sync manually with js/config.js's GHANA_REGIONS — there's no shared module
// between the plain-ES-module frontend and these Deno functions to import a single
// source of truth from.
export const GHANA_REGIONS = [
  'Ahafo',
  'Ashanti',
  'Bono',
  'Bono East',
  'Central',
  'Eastern',
  'Greater Accra',
  'North East',
  'Northern',
  'Oti',
  'Savannah',
  'Upper East',
  'Upper West',
  'Volta',
  'Western',
  'Western North',
];

// Placeholder rates — there's no delivery-fee schema or real shipping-rate data anywhere
// in the given DB schema. Two-tier by design: Greater Accra vs. every other region gets
// one blanket "upcountry" rate. Adjust these two numbers once real rates are known;
// nothing else needs to change. Mirrored client-side in js/config.js for the checkout
// preview only — the frontend's number is never trusted, this is the authoritative one.
export const DELIVERY_FEE_GREATER_ACCRA_GHS = 20;
export const DELIVERY_FEE_OTHER_REGIONS_GHS = 40;

export const getDeliveryFee = (fulfilmentMethod: string, region: string | null): number => {
  if (fulfilmentMethod !== 'delivery') return 0;
  return region === 'Greater Accra' ? DELIVERY_FEE_GREATER_ACCRA_GHS : DELIVERY_FEE_OTHER_REGIONS_GHS;
};

export const CURRENCY = 'GHS';

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;

export const ORDER_PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
} as const;

// PENDING/PROCESSING are set automatically by create-order/the webhook. The rest are the
// values an admin can move an order through manually (admin-orders), matching the live
// database's order_status CHECK constraint exactly — it distinguishes delivery orders
// (READY -> OUT_FOR_DELIVERY -> DELIVERED) from pickup orders (READY -> READY_FOR_PICKUP
// -> PICKED_UP).
export const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  READY: 'ready',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  CANCELLED: 'cancelled',
} as const;

export const ADMIN_SETTABLE_ORDER_STATUSES: string[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
  ORDER_STATUS.READY_FOR_PICKUP,
  ORDER_STATUS.PICKED_UP,
  ORDER_STATUS.CANCELLED,
];

export const ORDER_TYPE = {
  STANDARD: 'normal',
  PREORDER: 'preorder',
} as const;

export const MAX_ITEM_QUANTITY = 20;

// No enum was given for profiles.role — this is an assumption, change it here if your
// data uses a different value (or extend admin-verify to accept a list of roles).
export const ADMIN_ROLE = 'admin';
