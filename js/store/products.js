import { formatMoney } from '../config.js';
import { requireSupabase } from '../supabase.js';
import { addToCart } from './cart.js';

export const products = [];

const PRODUCT_SELECT = `
  id,
  brand_id,
  name,
  slug,
  description,
  price,
  is_active,
  brands (
    id,
    name,
    slug,
    logo_url
  ),
  product_colours (
    id,
    product_id,
    name,
    hex_code
  ),
  product_variants (
    id,
    product_id,
    colour_id,
    size,
    stock_quantity,
    is_preorder_available,
    preorder_delivery_days,
    sku,
    is_active
  ),
  product_images (
    id,
    product_id,
    colour_id,
    image_url,
    alt_text,
    sort_order
  )
`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const bySortOrder = (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0);

const getProductUrl = (product) => `product.html?slug=${encodeURIComponent(product.slug || product.id)}`;

const getImages = (product, colourId = null) => {
  const images = [...(product.product_images || [])].sort(bySortOrder);
  const colourImages = colourId ? images.filter((image) => image.colour_id === colourId) : [];
  return colourImages.length ? colourImages : images;
};

const getPrimaryImage = (product, colourId = null) => {
  const image = getImages(product, colourId)[0];
  return {
    url: image?.image_url || '',
    alt: image?.alt_text || `${product.brands?.name || 'SLIDESOL'} ${product.name}`,
  };
};

const getSecondaryImage = (product, colourId = null) => {
  const image = getImages(product, colourId)[1];
  if (!image) return null;
  return {
    url: image.image_url,
    alt: image.alt_text || `${product.brands?.name || 'SLIDESOL'} ${product.name}, alternate view`,
  };
};

const getActiveVariants = (product) => (product.product_variants || [])
  .filter((variant) => variant.is_active)
  .sort((a, b) => Number(a.size) - Number(b.size));

const getAvailableVariants = (product) => getActiveVariants(product)
  .filter((variant) => Number(variant.stock_quantity || 0) > 0 || variant.is_preorder_available);

const getAvailableColours = (product) => {
  const availableColourIds = new Set(getAvailableVariants(product).map((variant) => variant.colour_id));
  return (product.product_colours || [])
    .filter((colour) => availableColourIds.has(colour.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getBrandOptions = (products) => {
  const brands = new Map();

  products.forEach((product) => {
    if (product.brands?.slug && product.brands?.name) {
      brands.set(product.brands.slug, product.brands.name);
    }
  });

  return [...brands.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const VALID_SORTS = new Set(['newest', 'price-asc', 'price-desc']);

const sortProducts = (list, order) => {
  if (order === 'price-asc') return [...list].sort((a, b) => Number(a.price) - Number(b.price));
  if (order === 'price-desc') return [...list].sort((a, b) => Number(b.price) - Number(a.price));
  return list;
};

const syncUrlParam = (key, value, defaultValue) => {
  const nextUrl = new URL(window.location.href);
  if (!value || value === defaultValue) nextUrl.searchParams.delete(key);
  else nextUrl.searchParams.set(key, value);
  window.history.replaceState({}, '', nextUrl);
};

export const fetchActiveProducts = async () => {
  const client = requireSupabase();
  const { data, error } = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const fetchActiveProduct = async (identifier) => {
  const client = requireSupabase();

  const bySlug = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('slug', identifier)
    .maybeSingle();

  if (bySlug.error) throw bySlug.error;
  if (bySlug.data) return bySlug.data;

  if (!uuidPattern.test(identifier)) return null;

  const byId = await client
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_active', true)
    .eq('id', identifier)
    .maybeSingle();

  if (byId.error) throw byId.error;
  return byId.data;
};

const renderState = (element, type, message, action = '') => {
  element.innerHTML = `
    <div class="catalogue-state catalogue-state-${type}">
      <p>${escapeHtml(message)}</p>
      ${action}
    </div>
  `;
};

const renderSkeletonGrid = (element, count = 3) => {
  element.innerHTML = Array.from({ length: count })
    .map(() => '<div class="product-card skeleton-card"></div>')
    .join('');
};

const renderBrandFilters = (products, activeBrand) => {
  const filters = document.querySelector('[data-brand-filters]');
  if (!filters) return;

  const brands = getBrandOptions(products);
  filters.innerHTML = `
    <button class="filter ${activeBrand === 'all' ? 'active' : ''}" data-brand-filter="all">All</button>
    ${brands.map((brand) => `
      <button class="filter ${activeBrand === brand.slug ? 'active' : ''}" data-brand-filter="${escapeHtml(brand.slug)}">
        ${escapeHtml(brand.name)}
      </button>
    `).join('')}
  `;
};

const renderCardImages = (product) => {
  const image = getPrimaryImage(product);
  const secondaryImage = getSecondaryImage(product);

  if (!image.url) return '<span>No image yet</span>';

  const secondaryMarkup = secondaryImage
    ? `<img class="product-img-secondary" src="${escapeHtml(secondaryImage.url)}" alt="${escapeHtml(secondaryImage.alt)}" loading="lazy">`
    : '';

  return `
    <img class="product-img-primary" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}" loading="lazy">
    ${secondaryMarkup}
  `;
};

const renderProductCard = (product, index = 0) => {
  const brandName = product.brands?.name || 'SLIDESOL';
  const availableVariants = getAvailableVariants(product);
  const availableColours = getAvailableColours(product);
  const hasStock = availableVariants.some((variant) => Number(variant.stock_quantity || 0) > 0);
  const hasPreorder = availableVariants.some((variant) => variant.is_preorder_available);

  return `
    <article class="product-card" style="animation-delay:${Math.min(index, 8) * 70}ms">
      <a href="${getProductUrl(product)}" class="product-image" aria-label="View ${escapeHtml(product.name)}">
        ${renderCardImages(product)}
      </a>
      <div class="product-meta">
        <div>
          <p class="category">${escapeHtml(brandName)}</p>
          <h2><a href="${getProductUrl(product)}">${escapeHtml(product.name)}</a></h2>
          <p class="product-options">${availableColours.length} colour${availableColours.length === 1 ? '' : 's'} / sizes 38-45</p>
        </div>
        <strong>${formatMoney(product.price)}</strong>
      </div>
      <div class="product-card-footer">
        <span>${hasStock ? 'In stock' : hasPreorder ? 'Pre-order' : 'Unavailable'}</span>
        <a href="${getProductUrl(product)}">Choose size</a>
      </div>
    </article>
  `;
};

const renderHomeProductCard = (product, index = 0) => {
  const brandName = product.brands?.name || 'SLIDESOL';

  return `
    <article class="product-card" style="animation-delay:${Math.min(index, 8) * 70}ms">
      <a class="product-image" href="${getProductUrl(product)}" aria-label="View ${escapeHtml(product.name)}">
        ${renderCardImages(product)}
      </a>
      <div class="product-info">
        <p>${escapeHtml(brandName)}</p>
        <h3>${escapeHtml(product.name)}</h3>
        <span>${formatMoney(product.price)}</span>
      </div>
      <a class="product-button" href="${getProductUrl(product)}">View Product</a>
    </article>
  `;
};

const initHomePage = async () => {
  const grid = document.querySelector('#featured-product-grid');
  if (!grid) return;

  renderSkeletonGrid(grid, 3);

  try {
    const allProducts = await fetchActiveProducts();
    const featured = allProducts.slice(0, 3);

    if (!featured.length) {
      renderState(grid, 'empty', 'New arrivals are on the way. Check back soon.');
      return;
    }

    grid.innerHTML = featured.map((product, index) => renderHomeProductCard(product, index)).join('');
  } catch (error) {
    renderState(
      grid,
      'error',
      error.message || 'We could not load the collection.',
      '<a class="text-link" href="shop.html">Browse the shop</a>',
    );
  }
};

const initShopPage = async () => {
  const grid = document.querySelector('#product-grid');
  const count = document.querySelector('#product-count');
  if (!grid) return;

  const searchInput = document.querySelector('#product-search');
  const sortSelect = document.querySelector('#product-sort');

  const params = new URLSearchParams(window.location.search);
  let activeBrand = params.get('brand') || 'all';
  let searchTerm = params.get('q') || '';
  let sortOrder = VALID_SORTS.has(params.get('sort')) ? params.get('sort') : 'newest';

  if (searchInput) searchInput.value = searchTerm;
  if (sortSelect) sortSelect.value = sortOrder;

  renderSkeletonGrid(grid, 6);

  try {
    const products = await fetchActiveProducts();
    const render = () => {
      renderBrandFilters(products, activeBrand);

      let visibleProducts = products.filter((product) => (
        activeBrand === 'all' || product.brands?.slug === activeBrand
      ));

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        visibleProducts = visibleProducts.filter((product) => (
          product.name.toLowerCase().includes(term)
          || (product.brands?.name || '').toLowerCase().includes(term)
        ));
      }

      visibleProducts = sortProducts(visibleProducts, sortOrder);

      if (count) {
        count.textContent = `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'}`;
      }

      if (!visibleProducts.length) {
        const message = searchTerm
          ? `No products match "${searchTerm}".`
          : 'No active products found for this brand yet.';
        renderState(grid, 'empty', message);
        return;
      }

      grid.innerHTML = visibleProducts.map((product, index) => renderProductCard(product, index)).join('');
    };

    render();

    document.querySelector('[data-brand-filters]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-brand-filter]');
      if (!button) return;

      activeBrand = button.dataset.brandFilter;
      syncUrlParam('brand', activeBrand, 'all');
      render();
    });

    searchInput?.addEventListener('input', (event) => {
      searchTerm = event.target.value.trim();
      syncUrlParam('q', searchTerm, '');
      render();
    });

    sortSelect?.addEventListener('change', (event) => {
      sortOrder = event.target.value;
      syncUrlParam('sort', sortOrder, 'newest');
      render();
    });
  } catch (error) {
    renderState(
      grid,
      'error',
      error.message || 'We could not load the product catalogue.',
      '<a class="text-link" href="shop.html">Try again</a>',
    );
  }
};

const renderGallery = (product, activeColourId) => {
  const gallery = document.querySelector('[data-product-gallery]');
  if (!gallery) return;

  const images = getImages(product, activeColourId);

  if (!images.length) {
    gallery.innerHTML = '<div class="detail-image detail-image-empty">No product images yet</div>';
    return;
  }

  gallery.innerHTML = images.map((image) => `
    <figure class="detail-image">
      <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.alt_text || product.name)}">
    </figure>
  `).join('');
};

const renderColourButtons = (product, activeColourId) => getAvailableColours(product).map((colour) => `
  <button
    class="swatch ${colour.id === activeColourId ? 'active' : ''}"
    type="button"
    data-colour-id="${escapeHtml(colour.id)}"
    aria-label="Select ${escapeHtml(colour.name)}"
  >
    <span style="background:${escapeHtml(colour.hex_code || '#d8d2c4')}"></span>
    ${escapeHtml(colour.name)}
  </button>
`).join('');

const renderSizeButtons = (product, activeColourId, activeVariantId) => {
  const variants = getActiveVariants(product).filter((variant) => variant.colour_id === activeColourId);

  return variants.map((variant) => {
    const stockQuantity = Number(variant.stock_quantity || 0);
    const isPreorder = variant.is_preorder_available && stockQuantity <= 0;
    const available = stockQuantity > 0 || variant.is_preorder_available;
    const label = isPreorder ? `${variant.size} Pre-order` : variant.size;
    const ariaLabel = !available
      ? `Size ${variant.size}, out of stock`
      : isPreorder
        ? `Size ${variant.size}, pre-order`
        : `Size ${variant.size}`;

    return `
      <button
        class="size-option ${variant.id === activeVariantId ? 'active' : ''}"
        type="button"
        data-variant-id="${escapeHtml(variant.id)}"
        aria-label="${escapeHtml(ariaLabel)}"
        ${available ? '' : 'disabled'}
      >
        ${escapeHtml(label)}
      </button>
    `;
  }).join('');
};

const getVariantNote = (variant) => {
  if (!variant) return 'Select a colour and size.';
  if (Number(variant.stock_quantity || 0) > 0) return `${variant.stock_quantity} available now.`;
  if (variant.is_preorder_available) return `Pre-order ships in ${variant.preorder_delivery_days || 'a few'} days.`;
  return 'This size is currently unavailable.';
};

const initProductPage = async () => {
  const detail = document.querySelector('#product-detail');
  if (!detail) return;

  const params = new URLSearchParams(window.location.search);
  const identifier = params.get('slug') || params.get('id');

  if (!identifier) {
    renderState(detail, 'error', 'No product was selected.', '<a class="text-link" href="shop.html">Back to shop</a>');
    return;
  }

  renderState(detail, 'loading', 'Loading product details...');

  try {
    const product = await fetchActiveProduct(identifier);

    if (!product) {
      renderState(detail, 'empty', 'This product is not available.', '<a class="text-link" href="shop.html">Back to shop</a>');
      return;
    }

    const colours = getAvailableColours(product);
    let activeColourId = colours[0]?.id || null;
    let activeVariant = getAvailableVariants(product).find((variant) => variant.colour_id === activeColourId) || null;

    const render = () => {
      const brandName = product.brands?.name || 'SLIDESOL';
      const stockQuantity = Number(activeVariant?.stock_quantity || 0);
      const effectiveMax = !activeVariant
        ? 1
        : stockQuantity > 0 ? stockQuantity : (activeVariant.is_preorder_available ? 20 : 1);

      detail.innerHTML = `
        <div class="product-gallery" data-product-gallery></div>
        <section class="detail-copy">
          <a class="back-link" href="shop.html">Back to shop</a>
          <p class="eyebrow">${escapeHtml(brandName)}</p>
          <h1>${escapeHtml(product.name)}</h1>
          <p class="price">${formatMoney(product.price)}</p>
          <p class="description">${escapeHtml(product.description || '')}</p>

          <form class="product-purchase" data-product-form>
            <fieldset>
              <legend>Colour</legend>
              <div class="swatch-list">${renderColourButtons(product, activeColourId)}</div>
            </fieldset>

            <fieldset>
              <legend>Size</legend>
              <div class="size-list">${renderSizeButtons(product, activeColourId, activeVariant?.id)}</div>
            </fieldset>

            <p class="variant-note" data-variant-note>${escapeHtml(getVariantNote(activeVariant))}</p>

            <div class="purchase-row">
              <label>
                Qty
                <input id="quantity" type="number" min="1" max="${effectiveMax}" value="1">
              </label>
              <button class="button button-dark" type="submit" ${activeVariant ? '' : 'disabled'}>Add to bag</button>
            </div>
          </form>
        </section>
      `;

      renderGallery(product, activeColourId);

      detail.querySelector('[data-product-form]').addEventListener('click', (event) => {
        const colourButton = event.target.closest('[data-colour-id]');
        const sizeButton = event.target.closest('[data-variant-id]');

        if (colourButton) {
          activeColourId = colourButton.dataset.colourId;
          activeVariant = getAvailableVariants(product).find((variant) => variant.colour_id === activeColourId) || null;
          render();
        }

        if (sizeButton) {
          activeVariant = getActiveVariants(product).find((variant) => variant.id === sizeButton.dataset.variantId) || activeVariant;
          render();
        }
      });

      detail.querySelector('#quantity')?.addEventListener('input', (event) => {
        const clamped = Math.min(Math.max(Number(event.target.value || 1), 1), effectiveMax);
        event.target.value = clamped;
      });

      detail.querySelector('[data-product-form]').addEventListener('submit', (event) => {
        event.preventDefault();
        if (!activeVariant) return;

        const colour = colours.find((item) => item.id === activeVariant.colour_id);
        const image = getPrimaryImage(product, activeVariant.colour_id);
        const quantity = Math.min(Math.max(Number(detail.querySelector('#quantity').value || 1), 1), effectiveMax);

        addToCart({
          id: activeVariant.id,
          productId: product.id,
          variantId: activeVariant.id,
          sku: activeVariant.sku,
          name: product.name,
          slug: product.slug,
          brand: brandName,
          colour: colour?.name || '',
          size: activeVariant.size,
          price: Number(product.price),
          image: image.url,
          stock: Number(activeVariant.stock_quantity || 0),
          isPreorder: activeVariant.is_preorder_available && Number(activeVariant.stock_quantity || 0) <= 0,
        }, quantity);

        window.location.href = 'checkout.html';
      });
    };

    render();
  } catch (error) {
    renderState(
      detail,
      'error',
      error.message || 'We could not load this product.',
      '<a class="text-link" href="shop.html">Back to shop</a>',
    );
  }
};

initHomePage();
initShopPage();
initProductPage();
