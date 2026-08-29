import { formatMoney } from '../config.js';
import { requireAccountPage } from './customer-auth.js';
import { updateProfile, listMyOrders } from './account-api.js';

const ORDER_STATUS_LABEL = (status) => String(status).replace(/_/g, ' ');

const renderOrders = async () => {
  const list = document.querySelector('[data-account-orders]');
  const empty = document.querySelector('[data-account-orders-empty]');
  if (!list) return;

  try {
    const { orders } = await listMyOrders();
    list.innerHTML = '';

    if (orders.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    orders.forEach((order) => {
      const row = document.createElement('div');
      row.className = 'account-order-row';

      const left = document.createElement('span');
      left.className = 'account-order-row__number';
      left.textContent = order.order_number;

      const right = document.createElement('span');
      right.className = 'account-order-row__meta';
      right.textContent = `${formatMoney(order.total_amount)} · ${ORDER_STATUS_LABEL(order.order_status)} · ${new Date(order.created_at).toLocaleDateString()}`;

      row.append(left, right);
      list.appendChild(row);
    });
  } catch (error) {
    if (empty) { empty.hidden = false; empty.textContent = error.message; }
  }
};

const populateProfileForm = (customer) => {
  const form = document.querySelector('[data-profile-form]');
  if (!form) return;
  form.querySelector('[name="full_name"]').value = customer.full_name ?? '';
  form.querySelector('[name="phone"]').value = customer.phone ?? '';
  form.querySelector('[name="email"]').value = customer.email ?? '';

  const nameEl = document.querySelector('[data-account-name]');
  if (nameEl) nameEl.textContent = customer.full_name || 'there';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const messageEl = document.querySelector('[data-profile-message]');
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const formData = new FormData(form);
    try {
      await updateProfile({
        full_name: formData.get('full_name')?.toString().trim(),
        phone: formData.get('phone')?.toString().trim(),
        email: formData.get('email')?.toString().trim() || null,
      });
      if (messageEl) {
        messageEl.hidden = false;
        messageEl.className = 'account-message account-message--success';
        messageEl.textContent = 'Profile updated.';
      }
    } catch (error) {
      if (messageEl) {
        messageEl.hidden = false;
        messageEl.className = 'account-message account-message--error';
        messageEl.textContent = error.message;
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }, { once: true });
};

export const initAccountPage = async () => {
  await requireAccountPage((customer) => {
    populateProfileForm(customer);
    renderOrders();
  });
};
