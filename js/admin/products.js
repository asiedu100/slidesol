import { formatMoney } from '../config.js';
import {
  listProducts, listBrands, createBrand, updateBrand,
  createProduct, getProduct, updateProduct,
  createColour, updateColour, deleteColour,
  createVariant, updateVariant, deleteVariant,
  uploadImage, deleteImage,
} from './api-client.js';

// Resizes/re-encodes a photo client-side before it ever leaves the browser, so
// storage never fills up with full-resolution camera photos. Falls back to the
// original file on any decode failure or if compression didn't actually help.
const compressImageFile = (file, { maxDim = 1600, quality = 0.8 } = {}) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    let width = img.naturalWidth;
    let height = img.naturalHeight;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob || blob.size >= file.size) { resolve(file); return; }
      resolve(new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' }));
    }, 'image/webp', quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

const showAlert = (el, message, type = 'error') => {
  if (!el) return;
  el.textContent = message;
  el.className = `admin-alert admin-alert--${type}`;
  el.hidden = false;
};

const hideAlert = (el) => { if (el) el.hidden = true; };

// ==========================================================================
// Products list — admin/products.html
// ==========================================================================

export const initProductsListPage = async () => {
  const tbody = document.querySelector('[data-products-table]');
  const empty = document.querySelector('[data-products-empty]');
  const errorEl = document.querySelector('[data-admin-error]');

  const renderRow = (product) => {
    const row = document.createElement('tr');

    const thumbCell = document.createElement('td');
    const image = product.product_images?.[0];
    if (image) {
      const thumb = document.createElement('img');
      thumb.className = 'admin-thumb';
      thumb.src = image.image_url;
      thumb.alt = '';
      thumbCell.appendChild(thumb);
    }

    const nameCell = document.createElement('td');
    const link = document.createElement('a');
    link.href = `product-form.html?id=${encodeURIComponent(product.id)}`;
    link.textContent = product.name;
    nameCell.appendChild(link);

    const brandCell = document.createElement('td');
    brandCell.textContent = product.brands?.name ?? '—';

    const priceCell = document.createElement('td');
    priceCell.textContent = formatMoney(product.price);

    const genderCell = document.createElement('td');
    const genderBadge = document.createElement('span');
    genderBadge.className = 'badge badge--pending';
    genderBadge.textContent = product.gender ? product.gender[0].toUpperCase() + product.gender.slice(1) : 'Unisex';
    genderCell.appendChild(genderBadge);

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge--${product.is_active ? 'active' : 'inactive'}`;
    badge.textContent = product.is_active ? 'Active' : 'Inactive';
    statusCell.appendChild(badge);

    const actionsCell = document.createElement('td');
    const editLink = document.createElement('a');
    editLink.className = 'button-secondary';
    editLink.href = `product-form.html?id=${encodeURIComponent(product.id)}`;
    editLink.textContent = 'Edit';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'button-secondary';
    toggleButton.textContent = product.is_active ? 'Deactivate' : 'Activate';
    toggleButton.addEventListener('click', async () => {
      toggleButton.disabled = true;
      try {
        const { product: updated } = await updateProduct(product.id, { is_active: !product.is_active });
        row.replaceWith(renderRow({ ...updated, product_images: product.product_images }));
      } catch (error) {
        showAlert(errorEl, error.message);
        toggleButton.disabled = false;
      }
    });
    actionsCell.append(editLink, toggleButton);

    row.append(thumbCell, nameCell, brandCell, priceCell, genderCell, statusCell, actionsCell);
    return row;
  };

  const loadProducts = async () => {
    if (!tbody) return;
    tbody.innerHTML = '';
    const { products } = await listProducts();
    if (products.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    products.forEach((product) => tbody.appendChild(renderRow(product)));
  };

  try {
    await loadProducts();
  } catch (error) {
    showAlert(errorEl, error.message);
  }
};

// ==========================================================================
// Brands — admin/brands.html
// ==========================================================================

export const initBrandsPage = async () => {
  const tbody = document.querySelector('[data-brands-table]');
  const errorEl = document.querySelector('[data-admin-error]');
  const createForm = document.querySelector('[data-create-brand-form]');

  const renderRow = (brand) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    const nameEdit = document.createElement('div');
    nameEdit.className = 'admin-table-name-edit';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = brand.name;
    nameInput.maxLength = 200;
    nameInput.setAttribute('aria-label', `Name for ${brand.name}`);

    const nameSaveButton = document.createElement('button');
    nameSaveButton.type = 'button';
    nameSaveButton.className = 'button-secondary';
    nameSaveButton.textContent = 'Save';
    nameSaveButton.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name || name === brand.name) return;

      nameSaveButton.disabled = true;
      try {
        const { brand: updated } = await updateBrand(brand.id, { name });
        row.replaceWith(renderRow(updated));
      } catch (error) {
        showAlert(errorEl, error.message);
        nameSaveButton.disabled = false;
      }
    });

    nameEdit.append(nameInput, nameSaveButton);
    nameCell.appendChild(nameEdit);

    const slugCell = document.createElement('td');
    slugCell.textContent = brand.slug;

    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `badge badge--${brand.is_active ? 'active' : 'inactive'}`;
    badge.textContent = brand.is_active ? 'Active' : 'Inactive';
    statusCell.appendChild(badge);

    const actionsCell = document.createElement('td');
    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'button-secondary';
    toggleButton.textContent = brand.is_active ? 'Deactivate' : 'Activate';
    toggleButton.addEventListener('click', async () => {
      toggleButton.disabled = true;
      try {
        const { brand: updated } = await updateBrand(brand.id, { is_active: !brand.is_active });
        row.replaceWith(renderRow(updated));
      } catch (error) {
        showAlert(errorEl, error.message);
        toggleButton.disabled = false;
      }
    });
    actionsCell.appendChild(toggleButton);

    row.append(nameCell, slugCell, statusCell, actionsCell);
    return row;
  };

  const loadBrands = async () => {
    if (!tbody) return;
    tbody.innerHTML = '';
    const { brands } = await listBrands();
    brands.forEach((brand) => tbody.appendChild(renderRow(brand)));
  };

  try {
    await loadBrands();
  } catch (error) {
    showAlert(errorEl, error.message);
  }

  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert(errorEl);
    const formData = new FormData(createForm);
    const submitButton = createForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      await createBrand({
        name: formData.get('name')?.toString().trim(),
        logo_url: formData.get('logo_url')?.toString().trim() || undefined,
      });
      createForm.reset();
      await loadBrands();
    } catch (error) {
      showAlert(errorEl, error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
};

// ==========================================================================
// Product form — admin/product-form.html (create + edit, colours/variants/images)
// ==========================================================================

export const initProductFormPage = async () => {
  const id = new URLSearchParams(window.location.search).get('id');
  const errorEl = document.querySelector('[data-admin-error]');
  const form = document.querySelector('[data-product-form]');
  const brandSelect = document.querySelector('[data-brand-select]');
  const catalogueSection = document.querySelector('[data-catalogue-section]');
  const pageTitle = document.querySelector('[data-form-title]');

  if (pageTitle) pageTitle.textContent = id ? 'Edit Product' : 'New Product';

  try {
    const { brands } = await listBrands();
    brands.filter((brand) => brand.is_active).forEach((brand) => {
      const option = document.createElement('option');
      option.value = brand.id;
      option.textContent = brand.name;
      brandSelect?.appendChild(option);
    });
  } catch (error) {
    showAlert(errorEl, error.message);
  }

  const populateForm = (product) => {
    if (!form) return;
    form.querySelector('[name="name"]').value = product.name;
    form.querySelector('[name="brand_id"]').value = product.brand_id;
    form.querySelector('[name="price"]').value = product.price;
    form.querySelector('[name="gender"]').value = product.gender ?? 'unisex';
    form.querySelector('[name="description"]').value = product.description ?? '';
    form.querySelector('[name="is_active"]').checked = product.is_active;
  };

  const coloursContainer = document.querySelector('[data-colours-list]');
  const imagesGrid = document.querySelector('[data-images-grid]');
  const variantColourSelect = document.querySelector('[data-variant-colour-select]');
  const imageColourSelect = document.querySelector('[data-image-colour-select]');
  const addColourForm = document.querySelector('[data-add-colour-form]');
  const addVariantForm = document.querySelector('[data-add-variant-form]');
  const imageUploadForm = document.querySelector('[data-upload-image-form]');

  const syncColourSelects = (colours) => {
    [variantColourSelect, imageColourSelect].forEach((select) => {
      if (!select) return;
      select.innerHTML = '';
      colours.forEach((colour) => {
        const option = document.createElement('option');
        option.value = colour.id;
        option.textContent = colour.name;
        select.appendChild(option);
      });
    });
    const hasColours = colours.length > 0;
    if (addVariantForm) addVariantForm.hidden = !hasColours;
    if (imageUploadForm) imageUploadForm.hidden = !hasColours;
  };

  const renderColours = (colours, variants) => {
    if (!coloursContainer) return;
    coloursContainer.innerHTML = '';

    if (colours.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'admin-empty';
      empty.textContent = 'No colours yet — add one below, then add sizes and photos.';
      coloursContainer.appendChild(empty);
      return;
    }

    colours.forEach((colour) => {
      const card = document.createElement('div');
      card.className = 'admin-card';

      const head = document.createElement('div');
      head.className = 'admin-toolbar';

      const swatch = document.createElement('span');
      swatch.style.cssText = `display:inline-block;width:18px;height:18px;border-radius:50%;background:${colour.hex_code || '#cccccc'};border:1px solid rgba(0,0,0,0.2);flex-shrink:0;`;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = colour.name;
      nameInput.maxLength = 100;
      nameInput.style.width = '140px';
      nameInput.setAttribute('aria-label', `Name for ${colour.name}`);

      const hexInput = document.createElement('input');
      hexInput.type = 'text';
      hexInput.value = colour.hex_code || '';
      hexInput.placeholder = '#000000';
      hexInput.maxLength = 7;
      hexInput.style.width = '90px';
      hexInput.setAttribute('aria-label', `Hex code for ${colour.name}`);

      const nameSaveButton = document.createElement('button');
      nameSaveButton.type = 'button';
      nameSaveButton.className = 'button-secondary';
      nameSaveButton.textContent = 'Save';
      nameSaveButton.addEventListener('click', async () => {
        const newName = nameInput.value.trim();
        if (!newName) return;
        nameSaveButton.disabled = true;
        try {
          await updateColour(colour.id, { name: newName, hex_code: hexInput.value.trim() || undefined });
          await refreshCatalogue();
        } catch (error) {
          showAlert(errorEl, error.message);
          nameSaveButton.disabled = false;
        }
      });

      const badge = document.createElement('span');
      badge.className = `badge badge--${colour.is_active ? 'active' : 'inactive'}`;
      badge.style.marginLeft = 'auto';
      badge.textContent = colour.is_active ? 'In Stock' : 'Out of Stock';

      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'button-secondary';
      toggleButton.textContent = colour.is_active ? 'Mark Out of Stock' : 'Mark In Stock';
      toggleButton.addEventListener('click', async () => {
        toggleButton.disabled = true;
        try {
          await updateColour(colour.id, { is_active: !colour.is_active });
          await refreshCatalogue();
        } catch (error) {
          showAlert(errorEl, error.message);
          toggleButton.disabled = false;
        }
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'button-danger';
      deleteButton.textContent = 'Delete Colour';
      deleteButton.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${colour.name}"? This only works if it has no sizes or photos yet.`)) return;
        try {
          await deleteColour(colour.id);
          await refreshCatalogue();
        } catch (error) {
          showAlert(errorEl, error.message);
        }
      });

      head.append(swatch, nameInput, hexInput, nameSaveButton, badge, toggleButton, deleteButton);
      card.appendChild(head);

      const sizeList = document.createElement('div');
      sizeList.className = 'admin-inline-list';

      variants
        .filter((variant) => variant.colour_id === colour.id)
        .sort((a, b) => a.size - b.size)
        .forEach((variant) => {
          const row = document.createElement('div');
          row.className = 'admin-inline-row';

          const sizeInput = document.createElement('input');
          sizeInput.type = 'text';
          sizeInput.value = String(variant.size);
          sizeInput.maxLength = 20;
          sizeInput.style.width = '60px';
          sizeInput.setAttribute('aria-label', `Size value (currently ${variant.size})`);

          const stockInput = document.createElement('input');
          stockInput.type = 'number';
          stockInput.min = '0';
          stockInput.value = String(variant.stock_quantity);
          stockInput.style.width = '70px';
          stockInput.setAttribute('aria-label', `Stock for size ${variant.size}`);

          const preorderLabel = document.createElement('label');
          const preorderCheckbox = document.createElement('input');
          preorderCheckbox.type = 'checkbox';
          preorderCheckbox.checked = variant.is_preorder_available;
          preorderLabel.append(preorderCheckbox, document.createTextNode(' Preorder'));

          const activeLabel = document.createElement('label');
          const activeCheckbox = document.createElement('input');
          activeCheckbox.type = 'checkbox';
          activeCheckbox.checked = variant.is_active;
          activeLabel.append(activeCheckbox, document.createTextNode(' Active'));

          const saveButton = document.createElement('button');
          saveButton.type = 'button';
          saveButton.className = 'button-secondary';
          saveButton.textContent = 'Save';
          saveButton.addEventListener('click', async () => {
            const size = sizeInput.value.trim();
            if (!size) return;
            saveButton.disabled = true;
            try {
              await updateVariant(variant.id, {
                size,
                stock_quantity: Number(stockInput.value),
                is_preorder_available: preorderCheckbox.checked,
                is_active: activeCheckbox.checked,
              });
              showAlert(errorEl, 'Size updated.', 'success');
            } catch (error) {
              showAlert(errorEl, error.message);
            } finally {
              saveButton.disabled = false;
            }
          });

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'button-danger';
          removeButton.textContent = 'Remove';
          removeButton.addEventListener('click', async () => {
            if (!window.confirm(`Remove size ${variant.size}?`)) return;
            try {
              await deleteVariant(variant.id);
              await refreshCatalogue();
            } catch (error) {
              showAlert(errorEl, error.message);
            }
          });

          row.append(sizeInput, stockInput, preorderLabel, activeLabel, saveButton, removeButton);
          sizeList.appendChild(row);
        });

      card.appendChild(sizeList);
      coloursContainer.appendChild(card);
    });
  };

  const renderImages = (images) => {
    if (!imagesGrid) return;
    imagesGrid.innerHTML = '';

    images.forEach((image) => {
      const tile = document.createElement('div');
      tile.className = 'admin-image-tile';

      const img = document.createElement('img');
      img.src = image.image_url;
      img.alt = image.alt_text ?? '';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.setAttribute('aria-label', 'Delete image');
      removeButton.addEventListener('click', async () => {
        if (!window.confirm('Delete this image?')) return;
        try {
          await deleteImage(image.id);
          await refreshCatalogue();
        } catch (error) {
          showAlert(errorEl, error.message);
        }
      });

      tile.append(img, removeButton);
      imagesGrid.appendChild(tile);
    });
  };

  const refreshCatalogue = async () => {
    if (!id) return;
    const data = await getProduct(id);
    syncColourSelects(data.colours);
    renderColours(data.colours, data.variants);
    renderImages(data.images);
  };

  if (id) {
    try {
      const data = await getProduct(id);
      populateForm(data.product);
      if (catalogueSection) catalogueSection.hidden = false;
      syncColourSelects(data.colours);
      renderColours(data.colours, data.variants);
      renderImages(data.images);
    } catch (error) {
      showAlert(errorEl, error.message);
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert(errorEl);

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name')?.toString().trim(),
      brand_id: formData.get('brand_id')?.toString(),
      price: Number(formData.get('price')),
      gender: formData.get('gender')?.toString() || 'unisex',
      description: formData.get('description')?.toString().trim() || undefined,
      is_active: formData.get('is_active') === 'on',
    };

    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      if (id) {
        await updateProduct(id, payload);
        showAlert(errorEl, 'Product saved.', 'success');
      } else {
        const { product } = await createProduct(payload);
        window.location.href = `product-form.html?id=${encodeURIComponent(product.id)}`;
        return;
      }
    } catch (error) {
      showAlert(errorEl, error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  addColourForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!id) return;
    hideAlert(errorEl);

    const formData = new FormData(addColourForm);
    try {
      await createColour(id, {
        name: formData.get('name')?.toString().trim(),
        hex_code: formData.get('hex_code')?.toString() || undefined,
      });
      addColourForm.reset();
      await refreshCatalogue();
    } catch (error) {
      showAlert(errorEl, error.message);
    }
  });

  addVariantForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!id) return;
    hideAlert(errorEl);

    const formData = new FormData(addVariantForm);
    try {
      await createVariant(id, {
        colour_id: formData.get('colour_id')?.toString(),
        size: formData.get('size')?.toString().trim(),
        stock_quantity: Number(formData.get('stock_quantity') || 0),
        is_preorder_available: formData.get('is_preorder_available') === 'on',
      });
      addVariantForm.reset();
      await refreshCatalogue();
    } catch (error) {
      showAlert(errorEl, error.message);
    }
  });

  imageUploadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!id) return;
    hideAlert(errorEl);

    const formData = new FormData(imageUploadForm);
    const submitButton = imageUploadForm.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    const originalFile = formData.get('file');
    if (originalFile instanceof File && originalFile.size > 0) {
      const compressed = await compressImageFile(originalFile);
      formData.set('file', compressed, compressed.name);
    }

    try {
      await uploadImage(id, formData);
      imageUploadForm.reset();
      await refreshCatalogue();
    } catch (error) {
      showAlert(errorEl, error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
};
