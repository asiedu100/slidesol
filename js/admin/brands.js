import { listBrands, createBrand, updateBrand } from './catalogue.js';

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

// Cosmetic preview only — the server always derives the authoritative slug.
const previewSlugify = (value = '') => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const showNotice = (message, isError) => {
  const notice = document.querySelector('[data-brands-notice]');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('form-notice-error', Boolean(isError));
};

const rowTemplate = (brand) => `
  <tr data-brand-row="${escapeHtml(brand.id)}">
    <td>${escapeHtml(brand.name)}</td>
    <td>${escapeHtml(brand.slug)}</td>
    <td><span class="status ${brand.is_active ? '' : 'status-inactive'}">${brand.is_active ? 'Active' : 'Inactive'}</span></td>
    <td>
      <button class="icon-button" type="button" data-edit-brand="${escapeHtml(brand.id)}">Edit</button>
      <button class="icon-button" type="button" data-toggle-brand="${escapeHtml(brand.id)}" data-active="${brand.is_active}">
        ${brand.is_active ? 'Deactivate' : 'Activate'}
      </button>
    </td>
  </tr>
`;

const editRowTemplate = (brand) => `
  <tr data-brand-row="${escapeHtml(brand.id)}">
    <td><input type="text" data-edit-name value="${escapeHtml(brand.name)}"></td>
    <td><input type="text" data-edit-slug value="${escapeHtml(brand.slug)}"></td>
    <td><span class="status ${brand.is_active ? '' : 'status-inactive'}">${brand.is_active ? 'Active' : 'Inactive'}</span></td>
    <td>
      <button class="icon-button" type="button" data-save-brand="${escapeHtml(brand.id)}">Save</button>
      <button class="icon-button" type="button" data-cancel-edit="${escapeHtml(brand.id)}">Cancel</button>
    </td>
  </tr>
`;

let cachedBrands = [];
let editingId = null;

const render = () => {
  const tbody = document.querySelector('#admin-brands');
  if (!tbody) return;

  if (!cachedBrands.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-admin">No brands yet. Add your first one above.</td></tr>';
    return;
  }

  tbody.innerHTML = cachedBrands
    .map((brand) => (brand.id === editingId ? editRowTemplate(brand) : rowTemplate(brand)))
    .join('');

  tbody.querySelectorAll('[data-edit-brand]').forEach((button) => {
    button.addEventListener('click', () => {
      editingId = button.dataset.editBrand;
      render();
    });
  });

  tbody.querySelectorAll('[data-cancel-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      editingId = null;
      render();
    });
  });

  tbody.querySelectorAll('[data-toggle-brand]').forEach((button) => {
    button.addEventListener('click', async () => {
      const isActive = button.dataset.active === 'true';
      button.disabled = true;
      try {
        const { brand } = await updateBrand(button.dataset.toggleBrand, { is_active: !isActive });
        cachedBrands = cachedBrands.map((b) => (b.id === brand.id ? brand : b));
        render();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });

  tbody.querySelectorAll('[data-save-brand]').forEach((button) => {
    button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const name = row.querySelector('[data-edit-name]').value.trim();
      const slug = row.querySelector('[data-edit-slug]').value.trim();

      if (!name) {
        showNotice('Brand name cannot be empty.', true);
        return;
      }

      button.disabled = true;
      try {
        const { brand } = await updateBrand(button.dataset.saveBrand, { name, slug });
        cachedBrands = cachedBrands.map((b) => (b.id === brand.id ? brand : b));
        editingId = null;
        showNotice('', false);
        render();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });
};

const loadBrands = async () => {
  const tbody = document.querySelector('#admin-brands');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-admin">Loading brands…</td></tr>';

  try {
    const { brands } = await listBrands();
    cachedBrands = brands;
    render();
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="empty-admin">${escapeHtml(error.message)}</td></tr>`;
  }
};

const initCreateForm = () => {
  const form = document.querySelector('#brand-create-form');
  if (!form) return;

  const nameInput = form.querySelector('[name="name"]');
  const slugInput = form.querySelector('[name="slug"]');
  let slugTouched = false;

  slugInput.addEventListener('input', () => { slugTouched = true; });
  nameInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = previewSlugify(nameInput.value);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
      showNotice('Brand name is required.', true);
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const { brand } = await createBrand({ name, slug: slugInput.value.trim() || undefined });
      cachedBrands = [...cachedBrands, brand].sort((a, b) => a.name.localeCompare(b.name));
      form.reset();
      slugTouched = false;
      showNotice('', false);
      render();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
};

export const initBrandsPage = () => {
  initCreateForm();
  loadBrands();
};
