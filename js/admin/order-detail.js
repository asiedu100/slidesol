import { formatMoney } from '../config.js';
import { getOrder, updateOrderStatus } from './orders-api.js';

const ORDER_STATUS_OPTIONS = ['pending', 'processing', 'shipped', 'fulfilled', 'cancelled'];

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '—');

const getIdFromUrl = () => new URLSearchParams(window.location.search).get('id');

const showNotice = (message, isError) => {
  const notice = document.querySelector('[data-order-detail-notice]');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('form-notice-error', Boolean(isError));
};

const renderCustomer = (customer) => {
  const el = document.querySelector('#order-customer');
  if (!el) return;

  el.innerHTML = `
    <p><strong>${escapeHtml(customer?.full_name || 'Guest')}</strong></p>
    <p>${escapeHtml(customer?.phone || '')}</p>
    <p>${escapeHtml(customer?.email || '')}</p>
  `;
};

const renderFulfilment = (order) => {
  const el = document.querySelector('#order-fulfilment');
  if (!el) return;

  if (order.fulfilment_method === 'delivery') {
    el.innerHTML = `
      <p>Delivery</p>
      <p>${escapeHtml(order.delivery_address || '')}</p>
      <p>${escapeHtml(order.delivery_area || '')}, ${escapeHtml(order.delivery_city || '')}</p>
      <p>${escapeHtml(order.delivery_region || '')}</p>
    `;
  } else {
    el.innerHTML = '<p>Pickup</p>';
  }

  if (order.customer_note) {
    el.innerHTML += `<p><em>${escapeHtml(order.customer_note)}</em></p>`;
  }
};

const renderStatusControl = (order) => {
  const select = document.querySelector('#order-status-select');
  if (!select) return;

  select.innerHTML = ORDER_STATUS_OPTIONS
    .map((value) => `<option value="${value}" ${value === order.order_status ? 'selected' : ''}>${value}</option>`)
    .join('');

  select.addEventListener('change', async () => {
    const previousValue = select.dataset.previousValue || select.value;
    select.disabled = true;

    try {
      await updateOrderStatus(order.id, select.value);
      select.dataset.previousValue = select.value;
      showNotice('Status updated.', false);
    } catch (error) {
      select.value = previousValue;
      showNotice(error.message, true);
    } finally {
      select.disabled = false;
    }
  });
  select.dataset.previousValue = select.value;
};

const renderItems = (items) => {
  const tbody = document.querySelector('#order-items');
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-admin">No line items.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map((item) => `
    <tr>
      <td><strong>${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.brand_name)}</small></td>
      <td>${escapeHtml(item.colour_name)}</td>
      <td>${escapeHtml(item.size)}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${formatMoney(item.unit_price)}</td>
      <td>${formatMoney(item.subtotal)}</td>
    </tr>
  `).join('');
};

const renderPayment = (payment) => {
  const el = document.querySelector('#order-payment');
  if (!el) return;

  if (!payment) {
    el.innerHTML = '<p class="empty-admin">No payment record.</p>';
    return;
  }

  el.innerHTML = `
    <p>Provider: ${escapeHtml(payment.provider)}</p>
    <p>Reference: ${escapeHtml(payment.transaction_reference)}</p>
    <p>Status: <span class="status ${payment.status === 'success' ? '' : 'status-inactive'}">${escapeHtml(payment.status)}</span></p>
    <p>Paid at: ${formatDateTime(payment.paid_at)}</p>
  `;
};

const renderSummary = (order) => {
  const el = document.querySelector('#order-summary-totals');
  if (!el) return;

  el.innerHTML = `
    <p>Subtotal: ${formatMoney(order.subtotal)}</p>
    <p>Delivery: ${formatMoney(order.delivery_fee)}</p>
    <p><strong>Total: ${formatMoney(order.total_amount)}</strong></p>
  `;
};

export const initOrderDetail = async () => {
  const id = getIdFromUrl();
  if (!id) {
    showNotice('No order specified.', true);
    return;
  }

  document.querySelector('#order-heading').textContent = 'Loading order…';

  try {
    const { order, items, payment } = await getOrder(id);

    document.querySelector('#order-heading').textContent = order.order_number;
    document.querySelector('#order-created-at').textContent = formatDateTime(order.created_at);

    renderCustomer(order.customers);
    renderFulfilment(order);
    renderStatusControl(order);
    renderItems(items);
    renderPayment(payment);
    renderSummary(order);
  } catch (error) {
    document.querySelector('#order-heading').textContent = 'Order not found';
    showNotice(error.message, true);
  }
};
