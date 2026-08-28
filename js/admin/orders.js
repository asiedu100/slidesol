import { formatMoney } from '../config.js';
import { listOrders, getOrder, updateOrderStatus, refundOrder, listCustomers } from './api-client.js';

const showAlert = (el, message, type = 'error') => {
  if (!el) return;
  el.textContent = message;
  el.className = `admin-alert admin-alert--${type}`;
  el.hidden = false;
};

// Kept in sync manually with supabase/functions/_shared/constants.ts's ORDER_STATUS —
// matches the live database's order_status CHECK constraint, which distinguishes delivery
// orders from pickup orders past the "ready" stage.
const ORDER_STATUSES_BY_FULFILMENT = {
  delivery: ['pending', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
  pickup: ['pending', 'processing', 'ready', 'ready_for_pickup', 'picked_up', 'cancelled'],
};

const formatStatusLabel = (status) => status.replace(/_/g, ' ');

// ==========================================================================
// Orders list — admin/orders.html
// ==========================================================================

export const initOrdersListPage = async () => {
  const tbody = document.querySelector('[data-orders-table]');
  const empty = document.querySelector('[data-orders-empty]');
  const errorEl = document.querySelector('[data-admin-error]');
  const filterNote = document.querySelector('[data-orders-filter-note]');
  const customerId = new URLSearchParams(window.location.search).get('customer_id');

  if (customerId && filterNote) {
    filterNote.hidden = false;
  }

  try {
    const { orders } = await listOrders(customerId || undefined);
    if (orders.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }

    orders.forEach((order) => {
      const row = document.createElement('tr');

      const numberCell = document.createElement('td');
      const link = document.createElement('a');
      link.href = `order-detail.html?id=${encodeURIComponent(order.id)}`;
      link.textContent = order.order_number;
      numberCell.appendChild(link);

      const customerCell = document.createElement('td');
      customerCell.textContent = order.customers?.full_name ?? '—';

      const itemsCell = document.createElement('td');
      itemsCell.textContent = String(order.item_count);

      const totalCell = document.createElement('td');
      totalCell.textContent = formatMoney(order.total_amount);

      const statusCell = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `badge badge--${order.order_status}`;
      statusBadge.textContent = formatStatusLabel(order.order_status);
      statusCell.appendChild(statusBadge);

      const paymentCell = document.createElement('td');
      const paymentBadge = document.createElement('span');
      paymentBadge.className = `badge badge--${order.payment_status}`;
      paymentBadge.textContent = order.payment_status;
      paymentCell.appendChild(paymentBadge);

      const dateCell = document.createElement('td');
      dateCell.textContent = new Date(order.created_at).toLocaleDateString();

      row.append(numberCell, customerCell, itemsCell, totalCell, statusCell, paymentCell, dateCell);
      tbody?.appendChild(row);
    });
  } catch (error) {
    showAlert(errorEl, error.message);
  }
};

// ==========================================================================
// Order detail — admin/order-detail.html
// ==========================================================================

export const initOrderDetailPage = async () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const errorEl = document.querySelector('[data-admin-error]');
  const notFoundEl = document.querySelector('[data-order-not-found]');
  const contentEl = document.querySelector('[data-order-content]');

  if (!id) {
    if (notFoundEl) notFoundEl.hidden = false;
    return;
  }

  let data;
  try {
    data = await getOrder(id);
  } catch (error) {
    if (notFoundEl) notFoundEl.hidden = false;
    return;
  }

  if (contentEl) contentEl.hidden = false;
  const { order, items, payment } = data;

  document.querySelector('[data-order-number]').textContent = order.order_number;
  document.querySelector('[data-order-created]').textContent = new Date(order.created_at).toLocaleString();
  document.querySelector('[data-order-customer-name]').textContent = order.customers?.full_name ?? '—';
  document.querySelector('[data-order-customer-phone]').textContent = order.customers?.phone ?? '—';
  document.querySelector('[data-order-customer-email]').textContent = order.customers?.email ?? '—';
  document.querySelector('[data-order-fulfilment]').textContent = order.fulfilment_method;

  const addressEl = document.querySelector('[data-order-address]');
  if (addressEl) {
    addressEl.textContent = order.fulfilment_method === 'delivery'
      ? [order.delivery_address, order.delivery_area, order.delivery_city, order.delivery_region].filter(Boolean).join(', ')
      : 'Pickup — no delivery address';
  }

  document.querySelector('[data-order-note]').textContent = order.customer_note || '—';
  document.querySelector('[data-order-subtotal]').textContent = formatMoney(order.subtotal);
  document.querySelector('[data-order-delivery-fee]').textContent = formatMoney(order.delivery_fee);
  document.querySelector('[data-order-total]').textContent = formatMoney(order.total_amount);

  const paymentStatusBadge = document.querySelector('[data-order-payment-status]');
  const refundButton = document.querySelector('[data-order-refund]');

  const applyPaymentStatus = (status) => {
    if (paymentStatusBadge) {
      paymentStatusBadge.className = `badge badge--${status}`;
      paymentStatusBadge.textContent = status;
    }
    if (refundButton) refundButton.hidden = status !== 'paid';
  };

  applyPaymentStatus(order.payment_status);

  const paymentRefEl = document.querySelector('[data-order-payment-ref]');
  if (paymentRefEl) paymentRefEl.textContent = payment?.transaction_reference ?? '—';

  refundButton?.addEventListener('click', async () => {
    if (!window.confirm('Refund this order? This calls Paystack and moves real money back to the customer — it cannot be undone from here.')) return;
    refundButton.disabled = true;

    try {
      const result = await refundOrder(id);
      applyPaymentStatus(result.order.payment_status);
      showAlert(errorEl, 'Refunded — Paystack has accepted the request.', 'success');
    } catch (error) {
      showAlert(errorEl, error.message);
      refundButton.disabled = false;
    }
  });

  const itemsBody = document.querySelector('[data-order-items]');
  items.forEach((item) => {
    const row = document.createElement('tr');
    const productCell = document.createElement('td');
    productCell.textContent = `${item.brand_name} ${item.product_name}`;
    const variantCell = document.createElement('td');
    variantCell.textContent = `${item.colour_name}, Size ${item.size}`;
    const qtyCell = document.createElement('td');
    qtyCell.textContent = String(item.quantity);
    const priceCell = document.createElement('td');
    priceCell.textContent = formatMoney(item.unit_price);
    const subtotalCell = document.createElement('td');
    subtotalCell.textContent = formatMoney(item.subtotal);
    row.append(productCell, variantCell, qtyCell, priceCell, subtotalCell);
    itemsBody?.appendChild(row);
  });

  const statusSelect = document.querySelector('[data-order-status-select]');
  if (statusSelect) {
    const statuses = ORDER_STATUSES_BY_FULFILMENT[order.fulfilment_method] ?? ORDER_STATUSES_BY_FULFILMENT.delivery;
    statuses.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = formatStatusLabel(status);
      option.selected = status === order.order_status;
      statusSelect.appendChild(option);
    });
  }

  document.querySelector('[data-order-status-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!statusSelect) return;
    const submitButton = event.target.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await updateOrderStatus(id, statusSelect.value);
      showAlert(errorEl, 'Order status updated.', 'success');
    } catch (error) {
      showAlert(errorEl, error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
};

// ==========================================================================
// Customers — admin/customers.html
// ==========================================================================

export const initCustomersPage = async () => {
  const tbody = document.querySelector('[data-customers-table]');
  const empty = document.querySelector('[data-customers-empty]');
  const errorEl = document.querySelector('[data-admin-error]');

  try {
    const { customers } = await listCustomers();
    if (customers.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }

    customers.forEach((customer) => {
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = customer.full_name;

      const phoneCell = document.createElement('td');
      phoneCell.textContent = customer.phone;

      const emailCell = document.createElement('td');
      emailCell.textContent = customer.email ?? '—';

      const ordersCell = document.createElement('td');
      const ordersLink = document.createElement('a');
      ordersLink.href = `orders.html?customer_id=${encodeURIComponent(customer.id)}`;
      ordersLink.textContent = String(customer.order_count);
      ordersCell.appendChild(ordersLink);

      const spentCell = document.createElement('td');
      spentCell.textContent = formatMoney(customer.total_spent);

      row.append(nameCell, phoneCell, emailCell, ordersCell, spentCell);
      tbody?.appendChild(row);
    });
  } catch (error) {
    showAlert(errorEl, error.message);
  }
};
