import { supabase } from '../supabase.js';
import { formatMoney } from '../config.js';
import { addToCart } from './cart.js';
import { placeholderPhotoFor } from './placeholder-photos.js';
import { keyFor, isWishlisted, toggleWishlist, getWishlist } from './wishlist.js';

const HEART_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/></svg>';

// Shared by every product-card-with-heart across the site — builds the toggle button and
// wires it to wishlist.js, without ever letting the click bubble into the card's own link.
const createWishlistToggle = (item) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wishlist-toggle';
  button.innerHTML = HEART_ICON;
  button.setAttribute('aria-label', 'Save to wishlist');
  button.setAttribute('aria-pressed', String(isWishlisted(item.key)));
  button.classList.toggle('is-active', isWishlisted(item.key));

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nowSaved = toggleWishlist(item);
    button.classList.toggle('is-active', nowSaved);
    button.setAttribute('aria-pressed', String(nowSaved));
    button.setAttribute('aria-label', nowSaved ? 'Remove from wishlist' : 'Save to wishlist');
  });

  return button;
};

const CATEGORY_THEMES = [
  { label: 'Slides', description: 'The everyday slide, done properly.', preferredBrandName: null, image: 's5.jpeg' },
  { label: 'Recovery', description: 'Engineered for the after.', preferredBrandName: 'OOFOS', image: 's42.jpeg' },
  { label: 'Everyday', description: 'Built for wherever the day takes you.', preferredBrandName: null, image: 's52.jpeg' },
  { label: 'Premium', description: 'Considered materials, considered fit.', preferredBrandName: 'Christian Louboutin', image: 's55.jpeg' },
];

const bestImage = (images) => (
  [...(images || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.image_url ?? null
);

// Given images already sorted by sort_order, pick a second, genuinely different image for the
// hover-swap layer — preferring a side/back/top angle over whatever the primary (index 0) is.
const altImageFor = (sortedImages) => {
  if (sortedImages.length < 2) return null;
  const [, ...rest] = sortedImages;
  const byAngle = (angle) => rest.find((image) => image.shot_angle === angle);
  return byAngle('side') || byAngle('back') || byAngle('top') || rest[0] || null;
};

// Each active product becomes one card per colourway that actually has a photo — a two-colour
// product like a Louboutin flip-flop shows as two grid tiles, not one hiding the other colour
// behind swatches on the product page. Products with a single colour just yield a single card,
// same as before.
//
// Exception: colours similar enough in person that splitting them into separate tiles just
// looks like a duplicate listing rather than a genuine choice — merged back to one tile here.
const MERGE_COLOURS_FOR_SLUGS = new Set(['koyoto']);

export const fetchActiveProducts = async () => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('products')
    .select('id, name, slug, price, gender, created_at, brands(name, slug), product_colours(id, name), product_images(image_url, sort_order, shot_angle, colour_id)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load products', error);
    return [];
  }

  const cards = [];

  (data || []).forEach((product) => {
    const allImages = product.product_images || [];
    const colours = product.product_colours || [];

    const makeCard = (colourId, images) => {
      const sortedImages = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return {
        id: product.id,
        colourId,
        name: product.name,
        slug: product.slug,
        price: product.price,
        gender: product.gender ?? 'unisex',
        brand: product.brands?.name ?? '',
        brandSlug: product.brands?.slug ?? '',
        image: sortedImages[0]?.image_url ?? null,
        altImage: altImageFor(sortedImages)?.image_url ?? null,
      };
    };

    const shouldSplitByColour = colours.length > 1 && !MERGE_COLOURS_FOR_SLUGS.has(product.slug);

    if (!shouldSplitByColour) {
      if (allImages.length === 0) return;
      cards.push(makeCard(null, allImages));
      return;
    }

    colours.forEach((colour) => {
      const imagesForColour = allImages.filter((image) => image.colour_id === colour.id);
      if (imagesForColour.length === 0) return;
      cards.push(makeCard(colour.id, imagesForColour));
    });
  });

  return cards;
};

export const fetchProductBySlug = async (slug) => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, slug, description, price, gender,
      brands(name, slug),
      product_colours(id, name, hex_code, is_active),
      product_variants(id, colour_id, size, stock_quantity, is_preorder_available, preorder_delivery_days, is_active),
      product_images(id, colour_id, image_url, alt_text, sort_order, shot_angle)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Failed to load product', error);
    return null;
  }

  return data;
};

export const fetchActiveBrands = async () => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, products(is_active, product_images(image_url, sort_order))')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('Failed to load brands', error);
    return [];
  }

  return (data || []).map((brand) => {
    const images = (brand.products || [])
      .filter((product) => product.is_active)
      .flatMap((product) => product.product_images || []);

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      image: bestImage(images),
    };
  });
};

const createProductCard = (product) => {
  const card = document.createElement('a');
  const isPlaceholder = !product.image;
  card.className = `media-card media-card--photo${isPlaceholder ? ' media-card--placeholder' : ''}`;
  card.href = `product.html?slug=${encodeURIComponent(product.slug)}${product.colourId ? `&colour=${encodeURIComponent(product.colourId)}` : ''}`;

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'media-card__media';
  card.appendChild(mediaWrap);

  const media = document.createElement('div');
  media.className = 'media-card__image';
  media.style.backgroundImage = `url("${product.image || placeholderPhotoFor(product.id)}")`;
  media.setAttribute('role', 'img');
  media.setAttribute('aria-label', `${product.brand} ${product.name}`.trim());
  mediaWrap.appendChild(media);

  if (product.altImage) {
    const altMedia = document.createElement('div');
    altMedia.className = 'media-card__image media-card__image--alt';
    altMedia.style.backgroundImage = `url("${product.altImage}")`;
    altMedia.setAttribute('aria-hidden', 'true');
    mediaWrap.appendChild(altMedia);
  }

  const cta = document.createElement('span');
  cta.className = 'media-card__cta';
  cta.textContent = 'Shop Now';
  cta.setAttribute('aria-hidden', 'true');
  mediaWrap.appendChild(cta);

  mediaWrap.appendChild(createWishlistToggle({
    key: keyFor(product.id, product.colourId),
    productId: product.id,
    colourId: product.colourId ?? null,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    price: product.price,
    image: product.image,
  }));

  const meta = document.createElement('div');
  meta.className = 'media-card__meta';

  const metaBrand = document.createElement('p');
  metaBrand.className = 'media-card__brand';
  metaBrand.textContent = product.brand;

  const metaName = document.createElement('p');
  metaName.className = 'media-card__name';
  metaName.textContent = product.name;

  const metaPrice = document.createElement('p');
  metaPrice.className = 'media-card__price';
  metaPrice.textContent = formatMoney(product.price);

  meta.append(metaBrand, metaName, metaPrice);
  card.appendChild(meta);

  return card;
};

const createBrandCard = (brand) => {
  const card = document.createElement('a');
  const isPlaceholder = !brand.image;
  card.className = `media-card media-card--brand media-card--photo${isPlaceholder ? ' media-card--placeholder' : ''}`;
  card.href = `shop.html?brand=${encodeURIComponent(brand.slug)}`;

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'media-card__media';
  card.appendChild(mediaWrap);

  const media = document.createElement('div');
  media.className = 'media-card__image';
  media.style.backgroundImage = `url("${brand.image || placeholderPhotoFor(brand.slug)}")`;
  media.setAttribute('role', 'img');
  media.setAttribute('aria-label', brand.name);
  mediaWrap.appendChild(media);

  const hoverCta = document.createElement('span');
  hoverCta.className = 'media-card__cta';
  hoverCta.textContent = 'Shop Now';
  hoverCta.setAttribute('aria-hidden', 'true');
  mediaWrap.appendChild(hoverCta);

  const meta = document.createElement('div');
  meta.className = 'media-card__meta';

  const name = document.createElement('p');
  name.className = 'media-card__brand-name';
  name.textContent = brand.name;

  const cta = document.createElement('p');
  cta.className = 'media-card__brand-cta';
  cta.textContent = `Shop ${brand.name}`;

  meta.append(name, cta);
  card.appendChild(meta);

  return card;
};

const createCategoryPanel = (theme, product) => {
  const panel = document.createElement('article');
  panel.className = `category-panel category-panel--photo${product?.image ? '' : ' category-panel--placeholder'}`;

  const media = document.createElement('div');
  media.className = 'category-panel__media';
  media.style.backgroundImage = `url("${theme.image || product?.image || placeholderPhotoFor(theme.label)}")`;
  media.setAttribute('role', 'img');
  media.setAttribute('aria-label', theme.label);
  panel.appendChild(media);

  const copy = document.createElement('div');
  copy.className = 'category-panel__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Shop the feeling';

  const heading = document.createElement('h3');
  heading.textContent = theme.label;

  const desc = document.createElement('p');
  desc.className = 'category-panel__desc';
  desc.textContent = theme.description;

  const link = document.createElement('a');
  link.className = 'link-underline';
  link.href = product?.brandSlug ? `shop.html?brand=${encodeURIComponent(product.brandSlug)}` : 'shop.html';
  link.textContent = 'Explore';

  copy.append(eyebrow, heading, desc, link);
  panel.appendChild(copy);

  return panel;
};

const renderFeaturedCollection = (products) => {
  const rail = document.querySelector('[data-featured-rail]');
  const emptyState = document.querySelector('[data-featured-empty]');
  if (!rail) return;

  if (products.length === 0) {
    rail.hidden = true;
    if (emptyState) emptyState.hidden = false;
    return;
  }

  products.forEach((product) => rail.appendChild(createProductCard(product)));
};

const FEATURED_PRODUCTS_INITIAL_COUNT = 4;

const renderFeaturedProducts = (products) => {
  const section = document.querySelector('[data-featured-products-section]');
  const grid = document.querySelector('[data-products-grid]');
  const showMoreButton = document.querySelector('[data-products-show-more]');
  if (!section || !grid) return;

  if (products.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  products.forEach((product, index) => {
    const card = createProductCard(product);
    if (index >= FEATURED_PRODUCTS_INITIAL_COUNT) card.classList.add('is-hidden', 'pre-reveal');
    grid.appendChild(card);
  });

  if (showMoreButton) {
    const hasMore = products.length > FEATURED_PRODUCTS_INITIAL_COUNT;
    showMoreButton.hidden = !hasMore;
    if (hasMore) {
      showMoreButton.addEventListener('click', () => {
        const hiddenCards = grid.querySelectorAll('.media-card.is-hidden');
        hiddenCards.forEach((card) => card.classList.remove('is-hidden'));
        // Force a reflow so the browser paints the pre-reveal (faded/offset) state before the
        // next line removes it — otherwise there's no frame for the transition to animate from.
        void grid.offsetHeight;
        hiddenCards.forEach((card) => card.classList.remove('pre-reveal'));
        showMoreButton.hidden = true;
      }, { once: true });
    }
  }
};

const renderCategoryStorytelling = (products) => {
  const container = document.querySelector('[data-category-panels]');
  if (!container) return;

  const used = new Set();

  CATEGORY_THEMES.forEach((theme) => {
    let match = null;

    if (theme.preferredBrandName) {
      match = products.find((product) => product.brand === theme.preferredBrandName && product.image && !used.has(product.id));
    }
    if (!match) {
      match = products.find((product) => product.image && !used.has(product.id));
    }
    if (match) used.add(match.id);

    container.appendChild(createCategoryPanel(theme, match));
  });
};

const renderBrandShowcase = (brands) => {
  const grid = document.querySelector('[data-brand-grid]');
  if (!grid) return;

  brands.forEach((brand) => grid.appendChild(createBrandCard(brand)));
};

export const initHomepageCatalogue = async () => {
  const [products, brands] = await Promise.all([fetchActiveProducts(), fetchActiveBrands()]);

  renderFeaturedCollection(products.slice(0, 6));
  renderFeaturedProducts(products.slice(6));
  renderCategoryStorytelling(products);
  renderBrandShowcase(brands);
};

const SHOP_SORTERS = {
  newest: null, // products already arrive newest-first from fetchActiveProducts()
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  'name-asc': (a, b) => a.name.localeCompare(b.name),
};

const GENDERS = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
];

const readShopStateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    brand: params.get('brand') || '',
    gender: GENDERS.some((g) => g.value === params.get('gender')) ? params.get('gender') : '',
    q: params.get('q') || '',
    sort: SHOP_SORTERS[params.get('sort')] ? params.get('sort') : 'newest',
  };
};

const writeShopStateToUrl = (state) => {
  const params = new URLSearchParams();
  if (state.brand) params.set('brand', state.brand);
  if (state.gender) params.set('gender', state.gender);
  if (state.q) params.set('q', state.q);
  if (state.sort !== 'newest') params.set('sort', state.sort);

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.replaceState({}, '', url);
};

const renderShopGrid = (products) => {
  const grid = document.querySelector('[data-shop-grid]');
  const empty = document.querySelector('[data-shop-empty]');
  if (!grid) return;

  grid.innerHTML = '';

  if (products.length === 0) {
    grid.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }

  grid.hidden = false;
  if (empty) empty.hidden = true;
  products.forEach((product) => grid.appendChild(createProductCard(product)));
};

export const initShopPage = async () => {
  const statusEl = document.querySelector('[data-shop-status]');
  const brandContainer = document.querySelector('[data-brand-filters]');
  const genderContainer = document.querySelector('[data-gender-filters]');
  const brandSearchInput = document.querySelector('[data-brand-search]');
  const searchInput = document.querySelector('[data-search-input]');
  const sortSelect = document.querySelector('[data-sort-select]');
  const filterPanel = document.querySelector('[data-filter-panel]');

  const state = readShopStateFromUrl();

  const [products, brands] = await Promise.all([fetchActiveProducts(), fetchActiveBrands()]);
  if (statusEl) statusEl.hidden = true;

  if (brandContainer) {
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = 'brand-pill';
    allPill.dataset.brand = '';
    allPill.textContent = 'All';
    brandContainer.appendChild(allPill);

    brands.forEach((brand) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'brand-pill';
      pill.dataset.brand = brand.slug;
      pill.textContent = brand.name;
      brandContainer.appendChild(pill);
    });
  }

  // Filters the brand PILLS themselves (not the product grid) — a growing brand list gets
  // hard to scan by eye alone, so typing narrows which pills show. "All" always stays put.
  brandSearchInput?.addEventListener('input', () => {
    const q = brandSearchInput.value.trim().toLowerCase();
    brandContainer?.querySelectorAll('.brand-pill').forEach((pill) => {
      const isAll = pill.dataset.brand === '';
      pill.hidden = !isAll && q.length > 0 && !pill.textContent.toLowerCase().includes(q);
    });
  });

  if (genderContainer) {
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = 'brand-pill';
    allPill.dataset.gender = '';
    allPill.textContent = 'All';
    genderContainer.appendChild(allPill);

    GENDERS.forEach((gender) => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'brand-pill';
      pill.dataset.gender = gender.value;
      pill.textContent = gender.label;
      genderContainer.appendChild(pill);
    });
  }

  const syncActivePill = () => {
    brandContainer?.querySelectorAll('.brand-pill').forEach((pill) => {
      pill.classList.toggle('is-active', pill.dataset.brand === state.brand);
    });
    genderContainer?.querySelectorAll('.brand-pill').forEach((pill) => {
      pill.classList.toggle('is-active', pill.dataset.gender === state.gender);
    });
  };

  const render = () => {
    let list = state.brand ? products.filter((product) => product.brandSlug === state.brand) : products;
    if (state.gender) list = list.filter((product) => product.gender === state.gender);

    if (state.q) {
      const q = state.q.toLowerCase();
      list = list.filter((product) => (
        product.name.toLowerCase().includes(q) || product.brand.toLowerCase().includes(q)
      ));
    }

    const sorter = SHOP_SORTERS[state.sort];
    if (sorter) list = [...list].sort(sorter);

    renderShopGrid(list);
    writeShopStateToUrl(state);
  };

  brandContainer?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-brand]');
    if (!pill) return;

    state.brand = pill.dataset.brand;
    syncActivePill();
    render();
    filterPanel?.classList.remove('is-open');
  });

  genderContainer?.addEventListener('click', (event) => {
    const pill = event.target.closest('[data-gender]');
    if (!pill) return;

    state.gender = pill.dataset.gender;
    syncActivePill();
    render();
    filterPanel?.classList.remove('is-open');
  });

  if (searchInput) {
    searchInput.value = state.q;
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = searchInput.value.trim();
        render();
      }, 200);
    });
  }

  if (sortSelect) {
    sortSelect.value = state.sort;
    sortSelect.addEventListener('change', () => {
      state.sort = sortSelect.value;
      render();
    });
  }

  syncActivePill();
  render();
};

const renderRelatedProducts = async (currentProductId) => {
  const section = document.querySelector('[data-related-section]');
  const container = document.querySelector('[data-related-products]');
  if (!section || !container) return;

  const products = await fetchActiveProducts();
  const related = products.filter((product) => product.id !== currentProductId).slice(0, 4);

  if (related.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  related.forEach((product) => container.appendChild(createProductCard(product)));
};

// Google's indexer renders the page and reads JS-injected content (unlike the static OG-tag
// fallback above, which exists specifically because social-preview crawlers don't run JS) — so
// injecting the canonical link and Product structured data here, once the real product has
// loaded, is a genuine fix rather than a partial one.
const injectProductSeoTags = (product) => {
  const canonicalUrl = `https://slidesol.com/product.html?slug=${encodeURIComponent(product.slug)}`;

  let canonicalLink = document.querySelector('link[rel="canonical"]');
  if (!canonicalLink) {
    canonicalLink = document.createElement('link');
    canonicalLink.rel = 'canonical';
    document.head.appendChild(canonicalLink);
  }
  canonicalLink.href = canonicalUrl;

  const images = product.product_images || [];
  const imageUrls = [...new Set(images.map((image) => image.image_url))];
  const variants = (product.product_variants || []).filter((variant) => variant.is_active);
  const inStock = variants.some((variant) => variant.stock_quantity > 0 || variant.is_preorder_available);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `${product.brands?.name ?? ''} ${product.name}`.trim(),
    image: imageUrls,
    brand: { '@type': 'Brand', name: product.brands?.name ?? 'SLIDESOL' },
    offers: {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'GHS',
      price: String(product.price),
      availability: `https://schema.org/${inStock ? 'InStock' : 'OutOfStock'}`,
      itemCondition: 'https://schema.org/NewCondition',
    },
  };

  document.querySelector('script[data-product-jsonld]')?.remove();
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.dataset.productJsonld = 'true';
  script.textContent = JSON.stringify(jsonLd);
  document.head.appendChild(script);
};

export const initProductPage = async () => {
  const pageParams = new URLSearchParams(window.location.search);
  const slug = pageParams.get('slug');
  const requestedColourId = pageParams.get('colour');
  const loadingEl = document.querySelector('[data-product-loading]');
  const notFoundEl = document.querySelector('[data-product-not-found]');
  const pageEl = document.querySelector('[data-product-page]');

  const product = slug ? await fetchProductBySlug(slug) : null;
  if (loadingEl) loadingEl.hidden = true;

  if (!product) {
    if (notFoundEl) notFoundEl.hidden = false;
    return;
  }

  if (pageEl) pageEl.hidden = false;
  document.title = `${product.name} — SLIDESOL`;
  injectProductSeoTags(product);

  const colours = product.product_colours || [];
  const variants = (product.product_variants || []).filter((variant) => variant.is_active);
  const images = product.product_images || [];

  const isColourActive = (colourId) => colours.find((colour) => colour.id === colourId)?.is_active !== false;
  const isColourAvailable = (colourId) => isColourActive(colourId) && variants.some((variant) => (
    variant.colour_id === colourId && (variant.stock_quantity > 0 || variant.is_preorder_available)
  ));
  const displayColours = colours;
  // Arriving from a specific colourway's grid tile should land on that exact colourway, not
  // whichever one this product would normally default to.
  const requestedColour = requestedColourId && displayColours.find((colour) => colour.id === requestedColourId);

  const state = {
    colourId: requestedColour?.id ?? displayColours.find((colour) => isColourAvailable(colour.id))?.id ?? displayColours[0]?.id ?? null,
    size: null,
    quantity: 1,
  };
  let activeImages = [];

  const brandEl = document.querySelector('[data-product-brand]');
  const nameEl = document.querySelector('[data-product-name]');
  const priceEl = document.querySelector('[data-product-price]');
  const descriptionEl = document.querySelector('[data-product-description]');
  const swatchContainer = document.querySelector('[data-colour-swatches]');
  const sizeContainer = document.querySelector('[data-size-options]');
  const galleryMain = document.querySelector('[data-gallery-main]');
  const galleryThumbs = document.querySelector('[data-gallery-thumbs]');
  const addButton = document.querySelector('[data-add-to-cart]');
  const stockNote = document.querySelector('[data-stock-note]');
  const qtyValue = document.querySelector('[data-qty-value]');
  const wishlistButton = document.querySelector('[data-wishlist-toggle]');

  if (brandEl) brandEl.textContent = product.brands?.name ?? '';
  if (nameEl) nameEl.textContent = product.name;
  if (priceEl) priceEl.textContent = formatMoney(product.price);
  if (descriptionEl) descriptionEl.textContent = product.description ?? '';

  const imagesForColour = (colourId) => {
    const tagged = images.filter((image) => image.colour_id === colourId);
    const pool = tagged.length > 0 ? tagged : images;
    return [...pool].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  };

  const currentVariant = () => variants.find((variant) => variant.colour_id === state.colourId && variant.size === state.size);

  const renderGallery = () => {
    activeImages = imagesForColour(state.colourId);
    if (galleryMain) galleryMain.innerHTML = '';
    if (galleryThumbs) galleryThumbs.innerHTML = '';

    if (activeImages.length === 0) {
      // TEMPORARY placeholder photo (see plan §16/§17) — a single deterministic
      // image, not a fabricated multi-angle gallery, since this is one specific
      // real product and a fake "gallery" of unrelated shoes would be confusing.
      if (galleryMain) {
        const slide = document.createElement('div');
        slide.className = 'pdp-gallery__slide pdp-gallery__slide--placeholder';
        slide.style.backgroundImage = `url("${placeholderPhotoFor(product.id)}")`;
        slide.setAttribute('role', 'img');
        slide.setAttribute('aria-label', product.name);
        galleryMain.appendChild(slide);
      }
      return;
    }

    activeImages.forEach((image, index) => {
      const angleLabel = image.shot_angle ? `, ${image.shot_angle} view` : ` — photo ${index + 1}`;
      const label = `${product.name}${angleLabel}`;

      const slide = document.createElement('div');
      slide.className = 'pdp-gallery__slide';
      slide.style.backgroundImage = `url("${image.image_url}")`;
      slide.setAttribute('role', 'img');
      slide.setAttribute('aria-label', label);
      galleryMain?.appendChild(slide);

      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = `pdp-gallery__thumb ${index === 0 ? 'is-active' : ''}`;
      thumb.style.backgroundImage = `url("${image.image_url}")`;
      thumb.dataset.index = String(index);
      thumb.setAttribute('aria-label', `View ${label}`);
      galleryThumbs?.appendChild(thumb);
    });
  };

  const renderSwatches = () => {
    if (!swatchContainer) return;
    swatchContainer.innerHTML = '';

    displayColours.forEach((colour) => {
      const available = isColourAvailable(colour.id);
      const label = available ? colour.name : `${colour.name} — Out of Stock`;
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = `colour-swatch ${colour.id === state.colourId ? 'is-active' : ''} ${!available ? 'is-disabled' : ''}`;
      swatch.style.backgroundColor = colour.hex_code;
      swatch.dataset.colourId = colour.id;
      swatch.title = label;
      swatch.setAttribute('aria-label', label);
      swatchContainer.appendChild(swatch);
    });
  };

  const renderSizes = () => {
    if (!sizeContainer) return;
    sizeContainer.innerHTML = '';

    const colourActive = isColourActive(state.colourId);
    const sizeVariants = variants
      .filter((variant) => variant.colour_id === state.colourId)
      .sort((a, b) => a.size - b.size);

    sizeVariants.forEach((variant) => {
      const available = colourActive && (variant.stock_quantity > 0 || variant.is_preorder_available);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `size-option ${state.size === variant.size ? 'is-active' : ''} ${!available ? 'is-disabled' : ''}`;
      button.textContent = String(variant.size);
      button.disabled = !available;
      button.dataset.size = String(variant.size);
      sizeContainer.appendChild(button);
    });

    if (!sizeVariants.some((variant) => variant.size === state.size && colourActive && (variant.stock_quantity > 0 || variant.is_preorder_available))) {
      state.size = null;
    }
  };

  const updateAddState = () => {
    if (!addButton) return;

    if (!isColourActive(state.colourId)) {
      addButton.disabled = true;
      addButton.textContent = 'Out of Stock';
      if (stockNote) stockNote.textContent = '';
      return;
    }

    if (!state.size) {
      addButton.disabled = true;
      addButton.textContent = 'Select a Size';
      if (stockNote) stockNote.textContent = '';
      return;
    }

    const variant = currentVariant();
    if (!variant || (variant.stock_quantity <= 0 && !variant.is_preorder_available)) {
      addButton.disabled = true;
      addButton.textContent = 'Out of Stock';
      if (stockNote) stockNote.textContent = '';
      return;
    }

    addButton.disabled = false;

    if (variant.stock_quantity <= 0 && variant.is_preorder_available) {
      addButton.textContent = 'Preorder';
      stockNote && (stockNote.textContent = variant.preorder_delivery_days
        ? `Ships in ~${variant.preorder_delivery_days} days`
        : 'Available for preorder');
    } else {
      addButton.textContent = 'Add to Cart';
      stockNote && (stockNote.textContent = variant.stock_quantity <= 5 ? `Only ${variant.stock_quantity} left` : '');
    }
  };

  const resetQuantity = () => {
    state.quantity = 1;
    if (qtyValue) qtyValue.textContent = '1';
  };

  // Saved at the currently-selected colour, not the product as a whole — matches how the
  // shop grid already treats each colourway as its own tile.
  const wishlistItemForCurrentColour = () => {
    const colourName = displayColours.find((colour) => colour.id === state.colourId)?.name ?? null;
    return {
      key: keyFor(product.id, state.colourId),
      productId: product.id,
      colourId: state.colourId,
      slug: product.slug,
      name: colourName ? `${product.name} (${colourName})` : product.name,
      brand: product.brands?.name ?? '',
      price: product.price,
      image: activeImages[0]?.image_url ?? null,
    };
  };

  const updateWishlistButton = () => {
    if (!wishlistButton) return;
    const saved = isWishlisted(keyFor(product.id, state.colourId));
    wishlistButton.classList.toggle('is-active', saved);
    wishlistButton.setAttribute('aria-pressed', String(saved));
    wishlistButton.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Save to wishlist');
  };

  wishlistButton?.addEventListener('click', () => {
    toggleWishlist(wishlistItemForCurrentColour());
    updateWishlistButton();
  });

  const renderAll = () => {
    renderGallery();
    renderSwatches();
    renderSizes();
    resetQuantity();
    updateAddState();
    updateWishlistButton();
  };

  swatchContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-colour-id]');
    if (!button) return;
    state.colourId = button.dataset.colourId;
    renderAll();
  });

  sizeContainer?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-size]');
    if (!button || button.disabled) return;
    state.size = Number(button.dataset.size);
    renderSizes();
    updateAddState();
  });

  galleryThumbs?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-index]');
    if (!button || !galleryMain) return;
    const index = Number(button.dataset.index);
    galleryMain.scrollTo({ left: galleryMain.clientWidth * index, behavior: 'smooth' });
    galleryThumbs.querySelectorAll('.pdp-gallery__thumb').forEach((thumb) => thumb.classList.remove('is-active'));
    button.classList.add('is-active');
  });

  document.querySelector('[data-qty-dec]')?.addEventListener('click', () => {
    state.quantity = Math.max(1, state.quantity - 1);
    if (qtyValue) qtyValue.textContent = String(state.quantity);
  });

  document.querySelector('[data-qty-inc]')?.addEventListener('click', () => {
    const variant = currentVariant();
    const max = variant ? (variant.stock_quantity > 0 ? variant.stock_quantity : 10) : 1;
    state.quantity = Math.min(max, state.quantity + 1);
    if (qtyValue) qtyValue.textContent = String(state.quantity);
  });

  addButton?.addEventListener('click', () => {
    const variant = currentVariant();
    if (!variant) return;

    addToCart({
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      name: product.name,
      brand: product.brands?.name ?? '',
      colour: displayColours.find((colour) => colour.id === state.colourId)?.name ?? '',
      size: variant.size,
      price: product.price,
      image: activeImages[0]?.image_url ?? null,
      altImage: altImageFor(activeImages)?.image_url ?? null,
      quantity: state.quantity,
      stock: variant.stock_quantity,
      isPreorder: variant.is_preorder_available,
    });

    const previousLabel = addButton.textContent;
    addButton.textContent = 'Added ✓';
    setTimeout(() => { if (!addButton.disabled) addButton.textContent = previousLabel; }, 1200);

    document.querySelector('[data-cart-toggle]')?.dispatchEvent(new MouseEvent('click'));
  });

  renderAll();
  renderRelatedProducts(product.id);
};

// ==========================================================================
// Wishlist page — wishlist.html. Items are already fully denormalized in
// localStorage (see wishlist.js), so this needs no network fetch at all —
// what's shown is exactly what was saved, price included.
// ==========================================================================

export const initWishlistPage = () => {
  const grid = document.querySelector('[data-wishlist-grid]');
  const empty = document.querySelector('[data-wishlist-empty]');
  if (!grid) return;

  const render = () => {
    const items = getWishlist();
    grid.innerHTML = '';

    if (items.length === 0) {
      grid.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }

    grid.hidden = false;
    if (empty) empty.hidden = true;

    items.forEach((item) => {
      grid.appendChild(createProductCard({
        id: item.productId,
        slug: item.slug,
        colourId: item.colourId,
        name: item.name,
        brand: item.brand,
        price: item.price,
        image: item.image,
      }));
    });
  };

  render();
  window.addEventListener('slidesol:wishlist-updated', render);
};
