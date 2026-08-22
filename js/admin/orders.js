import { formatMoney } from '../config.js';
import { listOrders, updateOrderStatus } from './orders-api.js';

const ORDER_STATUS_OPTIONS = ['pending', 'processing', 'shipped', 'fulfilled', 'cancelled'];

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const renderState = (tbody, message) => {
  tbody.innerHTML = `<tr><td colspan="7" class="empty-admin">${escapeHtml(message)}</td></tr>`;
};

const paymentStatusClass = (status) => {
  if (status === 'paid') return '';
  if (status === 'failed') return 'status-failed';
  return 'status-inactive';
};

const formatDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const rowTemplate = (order) => {
  const customerName = order.customers?.full_name || 'Guest';
  const customerPhone = order.customers?.phone || '';
  const statusOptions = ORDER_STATUS_OPTIONS
    .map((value) => `<option value="${value}" ${value === order.order_status ? 'selected' : ''}>${value}</option>`)
    .join('');

  return `
    <tr data-order-row="${escapeHtml(order.id)}">
      <td><a href="order-detail.html?id=${encodeURIComponent(order.id)}">${escapeHtml(order.order_number)}</a></td>
      <td><strong>${escapeHtml(customerName)}</strong><small>${escapeHtml(customerPhone)}</small></td>
      <td>${escapeHtml(order.item_count)}</td>
      <td>${formatMoney(order.total_amount)}</td>
      <td><span class="status ${paymentStatusClass(order.payment_status)}">${escapeHtml(order.payment_status)}</span></td>
      <td><select data-order-status-select="${escapeHtml(order.id)}">${statusOptions}</select></td>
      <td>${formatDate(order.created_at)}</td>
    </tr>
  `;
};

const wireStatusSelects = (tbody) => {
  tbody.querySelectorAll('[data-order-status-select]').forEach((select) => {
    select.addEventListener('change', async () => {
      const previousValue = select.dataset.previousValue || select.value;
      select.disabled = true;

      try {
        await updateOrderStatus(select.dataset.orderStatusSelect, select.value);
        select.dataset.previousValue = select.value;
      } catch (error) {
        // eslint-disable-next-line no-alert
        window.alert(error.message);
        select.value = previousValue;
      } finally {
        select.disabled = false;
      }
    });
    select.dataset.previousValue = select.value;
  });
};

const renderFilterBanner = (customerId, orders) => {
  const banner = document.querySelector('[data-orders-filter-banner]');
  if (!banner) return;

  if (!customerId) {
    banner.innerHTML = '';
    return;
  }

  const name = orders[0]?.customers?.full_name || 'this customer';
  banner.innerHTML = `<p>Showing orders for <strong>${escapeHtml(name)}</strong> — <a class="text-link" href="orders.html">Clear filter</a></p>`;
};

export const renderAdminOrders = async (selector = '#admin-orders') => {
  const tbody = document.querySelector(selector);
  if (!tbody) return;

  const customerId = new URLSearchParams(window.location.search).get('customer_id');

  renderState(tbody, 'Loading orders…');

  try {
    const { orders } = await listOrders(customerId);

    renderFilterBanner(customerId, orders);

    if (!orders.length) {
      renderState(tbody, customerId ? 'This customer has no orders.' : 'No orders have been placed yet.');
      return;
    }

    tbody.innerHTML = orders.map(rowTemplate).join('');
    wireStatusSelects(tbody);
  } catch (error) {
    renderState(tbody, error.message || 'Could not load orders.');
  }
};
