import { SUPABASE_ANON_KEY, functionUrl, formatMoney, GHANA_REGIONS, estimateDeliveryFee } from '../config.js';
import { getCart, getCartSubtotal, clearCart } from './cart.js';

const buildItemsPayload = (cartItems) => cartItems.map((item) => ({
  product_id: item.productId,
  variant_id: item.variantId,
  quantity: item.quantity,
}));

const renderOrderSummary = (cartItems) => {
  const container = document.querySelector('[data-checkout-items]');
  if (!container) return;
  container.innerHTML = '';

  cartItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'checkout-line';

    const label = document.createElement('span');
    label.textContent = `${item.name} (${item.colour}, ${item.size}) × ${item.quantity}`;

    const price = document.createElement('span');
    price.textContent = formatMoney(item.price * item.quantity);

    row.append(label, price);
    container.appendChild(row);
  });
};

const updateTotals = (fulfilmentMethod, region) => {
  const subtotal = getCartSubtotal();
  const fee = estimateDeliveryFee(fulfilmentMethod, region);

  const subtotalEl = document.querySelector('[data-checkout-subtotal]');
  const feeEl = document.querySelector('[data-checkout-fee]');
  const totalEl = document.querySelector('[data-checkout-total]');

  if (subtotalEl) subtotalEl.textContent = formatMoney(subtotal);
  if (feeEl) feeEl.textContent = fee === null ? '—' : (fee === 0 ? 'Free' : formatMoney(fee));
  if (totalEl) totalEl.textContent = formatMoney(subtotal + (fee || 0));
};

export const initCheckoutPage = () => {
  const cartItems = getCart();
  const emptyEl = document.querySelector('[data-checkout-empty]');
  const formSection = document.querySelector('[data-checkout-form-section]');

  if (cartItems.length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    if (formSection) formSection.hidden = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  if (formSection) formSection.hidden = false;
  renderOrderSummary(cartItems);

  const form = document.querySelector('[data-checkout-form]');
  const regionSelect = document.querySelector('[data-region-select]');
  const deliveryFields = document.querySelector('[data-delivery-fields]');
  const fulfilmentRadios = document.querySelectorAll('input[name="fulfilment_method"]');
  const errorEl = document.querySelector('[data-checkout-error]');
  const submitButton = document.querySelector('[data-checkout-submit]');

  if (regionSelect) {
    GHANA_REGIONS.forEach((region) => {
      const option = document.createElement('option');
      option.value = region;
      option.textContent = region;
      regionSelect.appendChild(option);
    });
  }

  const currentFulfilment = () => document.querySelector('input[name="fulfilment_method"]:checked')?.value ?? 'delivery';

  const syncFulfilmentUI = () => {
    const method = currentFulfilment();
    if (deliveryFields) deliveryFields.hidden = method !== 'delivery';
    updateTotals(method, regionSelect?.value || '');
  };

  fulfilmentRadios.forEach((radio) => radio.addEventListener('change', syncFulfilmentUI));
  regionSelect?.addEventListener('change', syncFulfilmentUI);
  syncFulfilmentUI();

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    const formData = new FormData(form);
    const fulfilmentMethod = formData.get('fulfilment_method');

    const payload = {
      customer: {
        full_name: formData.get('full_name')?.toString().trim() ?? '',
        phone: formData.get('phone')?.toString().trim() ?? '',
        email: formData.get('email')?.toString().trim() || null,
      },
      fulfilment_method: fulfilmentMethod,
      delivery: fulfilmentMethod === 'delivery' ? {
        region: formData.get('region')?.toString() ?? '',
        city: formData.get('city')?.toString().trim() ?? '',
        area: formData.get('area')?.toString().trim() ?? '',
        address: formData.get('address')?.toString().trim() ?? '',
      } : null,
      customer_note: formData.get('customer_note')?.toString().trim() || null,
      items: buildItemsPayload(getCart()),
      currency: 'GHS',
    };

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Placing Order…';
    }

    try {
      const response = await fetch(functionUrl('create-order'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Something went wrong. Please try again.');
      }

      clearCart();
      window.location.href = result.authorization_url;
    } catch (error) {
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Place Order';
      }
    }
  });
};
