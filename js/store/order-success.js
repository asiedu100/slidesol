import { functionUrl, SUPABASE_ANON_KEY, formatMoney } from '../config.js';

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 12; // ~30s of polling before falling back to a "still processing" state

const fetchOrderStatus = async (reference) => {
  const response = await fetch(`${functionUrl('order-status')}?reference=${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Could not find your order.');
  return body;
};

const showState = (name) => {
  ['checking', 'paid', 'pending', 'failed', 'error'].forEach((state) => {
    const el = document.querySelector(`[data-order-state="${state}"]`);
    if (el) el.hidden = state !== name;
  });
};

const populateOrderDetails = (order) => {
  document.querySelectorAll('[data-order-number]').forEach((el) => { el.textContent = order.order_number; });
  document.querySelectorAll('[data-order-total]').forEach((el) => { el.textContent = formatMoney(order.total_amount); });
};

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export const initOrderSuccessPage = async () => {
  const reference = new URLSearchParams(window.location.search).get('reference');

  if (!reference) {
    showState('error');
    return;
  }

  showState('checking');

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const order = await fetchOrderStatus(reference);
      populateOrderDetails(order);

      if (order.payment_status === 'paid') {
        showState('paid');
        return;
      }
      if (order.payment_status === 'failed') {
        showState('failed');
        return;
      }
      // payment_status is still 'pending' -- the Paystack webhook hasn't landed yet, keep polling
    } catch (error) {
      showState('error');
      return;
    }

    await wait(POLL_INTERVAL_MS);
  }

  showState('pending');
};
