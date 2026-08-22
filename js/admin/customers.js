import { formatMoney } from '../config.js';
import { listCustomers } from './orders-api.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const renderState = (tbody, message) => {
  tbody.innerHTML = `<tr><td colspan="6" class="empty-admin">${escapeHtml(message)}</td></tr>`;
};

const rowTemplate = (customer) => `
  <tr>
    <td><strong>${escapeHtml(customer.full_name)}</strong></td>
    <td>${escapeHtml(customer.phone)}</td>
    <td>${escapeHtml(customer.email || '')}</td>
    <td>${escapeHtml(customer.order_count)}</td>
    <td>${formatMoney(customer.total_spent)}</td>
    <td><a class="icon-button" href="orders.html?customer_id=${encodeURIComponent(customer.id)}">View orders</a></td>
  </tr>
`;

export const renderAdminCustomers = async (selector = '#admin-customers') => {
  const tbody = document.querySelector(selector);
  if (!tbody) return;

  renderState(tbody, 'Loading customers…');

  try {
    const { customers } = await listCustomers();

    if (!customers.length) {
      renderState(tbody, 'Customer profiles will appear after the first order is received.');
      return;
    }

    tbody.innerHTML = customers.map(rowTemplate).join('');
  } catch (error) {
    renderState(tbody, error.message || 'Could not load customers.');
  }
};
