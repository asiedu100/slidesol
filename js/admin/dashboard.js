import { formatMoney } from '../config.js';
import { listProducts, listBrands, listOrders, listCustomers } from './api-client.js';

const ORDER_STATUS_BADGE = {
  pending: 'pending',
  processing: 'processing',
  shipped: 'shipped',
  fulfilled: 'fulfilled',
  cancelled: 'cancelled',
};

const escapeText = (value) => String(value ?? '');

const renderRecentOrders = (orders) => {
  const tbody = document.querySelector('[data-recent-orders]');
  const empty = document.querySelector('[data-recent-orders-empty]');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (orders.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  orders.slice(0, 8).forEach((order) => {
    const row = document.createElement('tr');

    const numberCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `order-detail.html?id=${encodeURIComponent(order.id)}`;
    link.textContent = order.order_number;
    numberCell.appendChild(link);

    const customerCell = document.createElement('td');
    customerCell.textContent = order.customers?.full_name ?? '—';

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(order.total_amount);

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge--${ORDER_STATUS_BADGE[order.order_status] ?? 'pending'}`;
    badge.textContent = order.order_status;
    statusCell.appendChild(badge);

    const paymentCell = document.createElement('td');
    const paymentBadge = document.createElement('span');
    paymentBadge.className = `badge badge--${order.payment_status}`;
    paymentBadge.textContent = order.payment_status;
    paymentCell.appendChild(paymentBadge);

    row.append(numberCell, customerCell, totalCell, statusCell, paymentCell);
    tbody.appendChild(row);
  });
};

export const initDashboard = async () => {
  const errorEl = document.querySelector('[data-admin-error]');

  try {
    const [products, brands, orders, customers] = await Promise.all([
      listProducts(),
      listBrands(),
      listOrders(),
      listCustomers(),
    ]);

    document.querySelector('[data-stat-products]').textContent = escapeText(products.products.length);
    document.querySelector('[data-stat-brands]').textContent = escapeText(brands.brands.length);
    document.querySelector('[data-stat-orders]').textContent = escapeText(orders.orders.length);
    document.querySelector('[data-stat-customers]').textContent = escapeText(customers.customers.length);

    renderRecentOrders(orders.orders);
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.hidden = false;
    }
  }
};
