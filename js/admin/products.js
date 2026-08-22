import { formatMoney } from '../config.js';
import { listProducts, updateProduct } from './catalogue.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const renderState = (tbody, message) => {
  tbody.innerHTML = `<tr><td colspan="5" class="empty-admin">${escapeHtml(message)}</td></tr>`;
};

const rowTemplate = (product) => {
  const image = product.product_images?.[0]?.image_url || '';
  const brandName = product.brands?.name || '—';

  return `
    <tr data-product-row="${escapeHtml(product.id)}">
      <td><img src="${escapeHtml(image)}" alt=""></td>
      <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(brandName)}</small></td>
      <td>${formatMoney(product.price)}</td>
      <td><span class="status ${product.is_active ? '' : 'status-inactive'}">${product.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <a class="icon-button" href="product-form.html?id=${encodeURIComponent(product.id)}">Edit</a>
        <button class="icon-button" type="button" data-toggle-product="${escapeHtml(product.id)}" data-active="${product.is_active}">
          ${product.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>
  `;
};

const wireToggles = (tbody, products) => {
  tbody.querySelectorAll('[data-toggle-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const isActive = button.dataset.active === 'true';
      button.disabled = true;

      try {
        const { product } = await updateProduct(button.dataset.toggleProduct, { is_active: !isActive });
        const row = button.closest('tr');
        const statusEl = row.querySelector('.status');
        statusEl.textContent = product.is_active ? 'Active' : 'Inactive';
        statusEl.classList.toggle('status-inactive', !product.is_active);
        button.dataset.active = String(product.is_active);
        button.textContent = product.is_active ? 'Deactivate' : 'Activate';
      } catch (error) {
        // eslint-disable-next-line no-alert
        window.alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
};

export const renderAdminProducts = async (selector = '#admin-products') => {
  const tbody = document.querySelector(selector);
  if (!tbody) return;

  renderState(tbody, 'Loading products…');

  try {
    const { products } = await listProducts();

    if (!products.length) {
      renderState(tbody, 'No products yet. Add your first one.');
      return;
    }

    tbody.innerHTML = products.map(rowTemplate).join('');
    wireToggles(tbody, products);
  } catch (error) {
    renderState(tbody, error.message || 'Could not load products.');
  }
};
