import { SUPABASE_ANON_KEY, formatMoney, functionUrl } from '../config.js';

const MAX_POLLS = 5;
const POLL_INTERVAL_MS = 3000;

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const render = (container, state) => {
  if (state.kind === 'no-reference') {
    container.innerHTML = '<p>If you completed payment, check your phone or email for confirmation shortly.</p>';
    return;
  }

  if (state.kind === 'loading') {
    container.innerHTML = '<p>Checking your order status…</p>';
    return;
  }

  if (state.kind === 'not-found') {
    container.innerHTML = '<p>We couldn\'t find that order. If you completed payment, contact us with your reference.</p>';
    return;
  }

  if (state.kind === 'error') {
    container.innerHTML = '<p>Could not check your order status right now.</p>';
    return;
  }

  const { order } = state;

  if (order.payment_status === 'paid') {
    container.innerHTML = `
      <p>Order <strong>${escapeHtml(order.order_number)}</strong> is confirmed.</p>
      <p>Total paid: ${formatMoney(order.total_amount)}</p>
    `;
    return;
  }

  if (order.payment_status === 'failed') {
    container.innerHTML = `
      <p>Payment for order <strong>${escapeHtml(order.order_number)}</strong> was not successful.</p>
      <a class="text-link" href="checkout.html">Return to checkout -></a>
    `;
    return;
  }

  container.innerHTML = `<p>Confirming payment for order <strong>${escapeHtml(order.order_number)}</strong>…</p>`;
};

const fetchOrderStatus = async (reference) => {
  try {
    const response = await fetch(`${functionUrl('order-status')}?reference=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });

    if (response.status === 404) return { kind: 'not-found' };
    if (!response.ok) return { kind: 'error' };

    const order = await response.json();
    return { kind: 'order', order };
  } catch {
    return { kind: 'error' };
  }
};

const init = () => {
  const container = document.querySelector('[data-order-status]');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const reference = params.get('reference') || params.get('trxref');

  if (!reference) {
    render(container, { kind: 'no-reference' });
    return;
  }

  let pollCount = 0;

  const poll = async () => {
    if (pollCount === 0) render(container, { kind: 'loading' });

    const result = await fetchOrderStatus(reference);
    render(container, result);

    if (result.kind === 'order' && result.order.payment_status === 'pending' && pollCount < MAX_POLLS) {
      pollCount += 1;
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  poll();
};

init();
