export const STORE_NAME = 'SLIDESOL';
export const CURRENCY = 'GHS';

export const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';

export const functionUrl = (name) => `${SUPABASE_URL}/functions/v1/${name}`;

export const isSupabaseConfigured = () => (
  SUPABASE_URL.startsWith('https://')
  && SUPABASE_ANON_KEY.length > 30
);

export const formatMoney = (amount) => new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: CURRENCY,
}).format(Number(amount || 0));

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

export const MAX_ITEM_QUANTITY = 20;

// Mirrors supabase/functions/_shared/constants.ts's getDeliveryFee() for the checkout
// preview only — kept in sync manually since there's no shared module between this
// plain-JS frontend and the Deno Edge Functions. The fee charged always comes from
// create-order's response; this number is never trusted as final.
const DELIVERY_FEE_GREATER_ACCRA_GHS = 20;
const DELIVERY_FEE_OTHER_REGIONS_GHS = 40;

export const estimateDeliveryFee = (fulfilmentMethod, region) => {
  if (fulfilmentMethod !== 'delivery') return 0;
  if (!region) return null;
  return region === 'Greater Accra' ? DELIVERY_FEE_GREATER_ACCRA_GHS : DELIVERY_FEE_OTHER_REGIONS_GHS;
};
