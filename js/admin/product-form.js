import {
  listBrands, getProduct, createProduct, updateProduct,
  createColour, deleteColour,
  createVariant, updateVariant, deleteVariant,
  uploadImage, deleteImage,
} from './catalogue.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const previewSlugify = (value = '') => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getIdFromUrl = () => new URLSearchParams(window.location.search).get('id');

const showNotice = (message, isError) => {
  const notice = document.querySelector('[data-product-notice]');
  if (!notice) return;
  notice.textContent = message;
  notice.classList.toggle('form-notice-error', Boolean(isError));
};

const state = {
  productId: null,
  colours: [],
  variants: [],
  images: [],
};

// ---------- Brand select ----------

const populateBrandSelect = (select, brands, currentBrand) => {
  const options = brands.filter((b) => b.is_active).map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`);

  // An already-deactivated brand a product still belongs to must never silently
  // disappear from its own edit form.
  if (currentBrand && !brands.some((b) => b.id === currentBrand.id)) {
    options.unshift(`<option value="${escapeHtml(currentBrand.id)}">${escapeHtml(currentBrand.name)} (inactive)</option>`);
  }

  select.innerHTML = `<option value="">Select brand</option>${options.join('')}`;
  if (currentBrand) select.value = currentBrand.id;
};

// ---------- Colours ----------

const renderColours = () => {
  const list = document.querySelector('#colour-list');
  if (!list) return;

  if (!state.colours.length) {
    list.innerHTML = '<p class="empty-admin">No colours yet. Add one above.</p>';
    return;
  }

  list.innerHTML = state.colours.map((colour) => `
    <div class="colour-chip" data-colour-chip="${escapeHtml(colour.id)}">
      ${colour.hex_code ? `<span class="chip-swatch" style="background:${escapeHtml(colour.hex_code)}"></span>` : ''}
      <span>${escapeHtml(colour.name)}</span>
      <button class="icon-button" type="button" data-delete-colour="${escapeHtml(colour.id)}">Remove</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-delete-colour]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await deleteColour(button.dataset.deleteColour);
        showNotice('', false);
        await reloadProductData();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });
};

const initColourForm = () => {
  const form = document.querySelector('#colour-create-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const name = form.name.value.trim();
    const hexCode = form.hex_code.value.trim();

    if (!name) {
      showNotice('Colour name is required.', true);
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await createColour(state.productId, { name, hex_code: hexCode || undefined });
      form.reset();
      showNotice('', false);
      await reloadProductData();
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
};

// ---------- Variants ----------

const variantRow = (variant) => `
  <div class="variant-row" data-variant-row="${escapeHtml(variant.id)}">
    <span>Size ${escapeHtml(variant.size)}</span>
    <span>Stock: ${escapeHtml(variant.stock_quantity)}</span>
    <span>${variant.is_preorder_available ? `Pre-order (${escapeHtml(variant.preorder_delivery_days ?? '?')}d)` : ''}</span>
    <span>${variant.sku ? escapeHtml(variant.sku) : ''}</span>
    <span class="status ${variant.is_active ? '' : 'status-inactive'}">${variant.is_active ? 'Active' : 'Inactive'}</span>
    <button class="icon-button" type="button" data-toggle-variant="${escapeHtml(variant.id)}" data-active="${variant.is_active}">
      ${variant.is_active ? 'Deactivate' : 'Activate'}
    </button>
    <button class="icon-button" type="button" data-delete-variant="${escapeHtml(variant.id)}">Delete</button>
  </div>
`;

const variantAddRow = (colourId) => `
  <form class="inline-form" data-variant-form="${escapeHtml(colourId)}">
    <label>Size<input type="text" name="size" required placeholder="42"></label>
    <label>Stock<input type="number" name="stock_quantity" min="0" step="1" value="0"></label>
    <label class="checkbox-label"><input type="checkbox" name="is_preorder_available">Pre-order</label>
    <label data-preorder-days hidden>Delivery days<input type="number" name="preorder_delivery_days" min="0" step="1"></label>
    <label>SKU<input type="text" name="sku" placeholder="optional"></label>
    <button class="button button-dark" type="submit">Add variant</button>
  </form>
`;

const wireVariantAddForm = (form) => {
  const preorderCheckbox = form.querySelector('[name="is_preorder_available"]');
  const daysField = form.querySelector('[data-preorder-days]');

  preorderCheckbox.addEventListener('change', () => {
    daysField.hidden = !preorderCheckbox.checked;
    daysField.querySelector('input').required = preorderCheckbox.checked;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const colourId = form.dataset.variantForm;
    const size = form.size.value.trim();
    if (!size) {
      showNotice('Size is required.', true);
      return;
    }

    const payload = {
      colour_id: colourId,
      size,
      stock_quantity: Number(form.stock_quantity.value || 0),
      is_preorder_available: preorderCheckbox.checked,
      preorder_delivery_days: preorderCheckbox.checked ? Number(form.preorder_delivery_days.value || 0) : null,
      sku: form.sku.value.trim() || undefined,
    };

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await createVariant(state.productId, payload);
      showNotice('', false);
      await reloadProductData();
    } catch (error) {
      showNotice(error.message, true);
      submitButton.disabled = false;
    }
  });
};

const renderVariants = () => {
  const container = document.querySelector('#variants-by-colour');
  if (!container) return;

  if (!state.colours.length) {
    container.innerHTML = '<p class="empty-admin">Add a colour first.</p>';
    return;
  }

  container.innerHTML = state.colours.map((colour) => {
    const rows = state.variants.filter((v) => v.colour_id === colour.id);
    return `
      <div class="section-heading">${escapeHtml(colour.name)}</div>
      <div data-variant-list="${escapeHtml(colour.id)}">
        ${rows.length ? rows.map(variantRow).join('') : '<p class="empty-admin">No variants yet.</p>'}
      </div>
      ${variantAddRow(colour.id)}
    `;
  }).join('');

  container.querySelectorAll('[data-variant-form]').forEach(wireVariantAddForm);

  container.querySelectorAll('[data-toggle-variant]').forEach((button) => {
    button.addEventListener('click', async () => {
      const isActive = button.dataset.active === 'true';
      button.disabled = true;
      try {
        await updateVariant(button.dataset.toggleVariant, { is_active: !isActive });
        showNotice('', false);
        await reloadProductData();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-delete-variant]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await deleteVariant(button.dataset.deleteVariant);
        showNotice('', false);
        await reloadProductData();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });
};

// ---------- Images ----------

const imageThumb = (image) => `
  <div class="image-thumb" data-image-thumb="${escapeHtml(image.id)}">
    <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.alt_text || '')}">
    <button class="icon-button" type="button" data-delete-image="${escapeHtml(image.id)}">Remove</button>
  </div>
`;

const imageUploadForm = (colourId) => `
  <form class="inline-form" data-image-form="${escapeHtml(colourId)}">
    <label>File<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label>
    <label>Alt text<input type="text" name="alt_text" placeholder="optional"></label>
    <button class="button button-dark" type="submit">Upload</button>
  </form>
`;

const wireImageForm = (form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const colourId = form.dataset.imageForm;
    const file = form.file.files[0];

    if (!file) {
      showNotice('Choose a file to upload.', true);
      return;
    }
    // Client-side pre-check for fast feedback — the server enforces the real limit.
    if (file.size > MAX_IMAGE_BYTES) {
      showNotice('Image must be 5MB or smaller.', true);
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showNotice('Image must be JPEG, PNG, WEBP, or GIF.', true);
      return;
    }

    const formData = new FormData();
    formData.set('colour_id', colourId);
    formData.set('file', file);
    if (form.alt_text.value.trim()) formData.set('alt_text', form.alt_text.value.trim());

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await uploadImage(state.productId, formData);
      showNotice('', false);
      await reloadProductData();
    } catch (error) {
      showNotice(error.message, true);
      submitButton.disabled = false;
    }
  });
};

const renderImages = () => {
  const container = document.querySelector('#images-by-colour');
  if (!container) return;

  if (!state.colours.length) {
    container.innerHTML = '<p class="empty-admin">Add a colour first.</p>';
    return;
  }

  container.innerHTML = state.colours.map((colour) => {
    const items = state.images.filter((img) => img.colour_id === colour.id);
    return `
      <div class="section-heading">${escapeHtml(colour.name)}</div>
      <div class="image-grid" data-image-list="${escapeHtml(colour.id)}">
        ${items.map(imageThumb).join('')}
      </div>
      ${imageUploadForm(colour.id)}
    `;
  }).join('');

  container.querySelectorAll('[data-image-form]').forEach(wireImageForm);

  container.querySelectorAll('[data-delete-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await deleteImage(button.dataset.deleteImage);
        showNotice('', false);
        await reloadProductData();
      } catch (error) {
        showNotice(error.message, true);
        button.disabled = false;
      }
    });
  });
};

// ---------- Orchestration ----------

const reloadProductData = async () => {
  const { product, colours, variants, images } = await getProduct(state.productId);
  state.colours = colours;
  state.variants = variants;
  state.images = images;
  renderColours();
  renderVariants();
  renderImages();
  return product;
};

const initCoreForm = async () => {
  const form = document.querySelector('#product-core-form');
  const nameInput = form.querySelector('[name="name"]');
  const slugInput = form.querySelector('[name="slug"]');
  const brandSelect = form.querySelector('[name="brand_id"]');
  const submitButton = document.querySelector('#product-save-button');
  const heading = document.querySelector('#product-form-heading');
  const sections = document.querySelector('#product-sections');

  let slugTouched = false;
  slugInput.addEventListener('input', () => { slugTouched = true; });
  nameInput.addEventListener('input', () => {
    if (!slugTouched) slugInput.value = previewSlugify(nameInput.value);
  });

  let brands = [];
  try {
    ({ brands } = await listBrands());
  } catch (error) {
    showNotice(error.message, true);
  }

  const existingId = getIdFromUrl();

  if (existingId) {
    state.productId = existingId;
    heading.textContent = 'Edit product';
    submitButton.textContent = 'Save changes';

    let product;
    try {
      product = await reloadProductData();
    } catch (error) {
      showNotice(error.message, true);
      return;
    }

    nameInput.value = product.name;
    slugInput.value = product.slug;
    slugTouched = true;
    form.description.value = product.description || '';
    form.price.value = product.price;
    form.is_active.checked = product.is_active;
    populateBrandSelect(brandSelect, brands, product.brands);

    sections.hidden = false;
    initColourForm();
  } else {
    populateBrandSelect(brandSelect, brands, null);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const payload = {
      brand_id: brandSelect.value,
      name: nameInput.value.trim(),
      slug: slugInput.value.trim() || undefined,
      description: form.description.value.trim() || undefined,
      price: Number(form.price.value),
      is_active: form.is_active.checked,
    };

    if (!payload.brand_id) {
      showNotice('Choose a brand.', true);
      return;
    }
    if (!payload.name) {
      showNotice('Product name is required.', true);
      return;
    }
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      showNotice('Price must be a non-negative number.', true);
      return;
    }

    submitButton.disabled = true;

    try {
      if (state.productId) {
        await updateProduct(state.productId, payload);
        showNotice('Saved.', false);
      } else {
        const { product } = await createProduct(payload);
        window.location.href = `product-form.html?id=${encodeURIComponent(product.id)}`;
        return;
      }
    } catch (error) {
      showNotice(error.message, true);
    } finally {
      submitButton.disabled = false;
    }
  });
};

export const initProductForm = () => {
  initCoreForm();
};
