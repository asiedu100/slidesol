// Wishlist — a bookmark, not a purchase intent, so (unlike cart.js) items are saved at
// the product+colour level with no size/variant required. Mirrors cart.js's shape
// exactly: same localStorage-backed read/write pattern, same custom-event broadcast so
// any open tab/badge stays in sync.

const WISHLIST_KEY = 'slidesol-wishlist';
const WISHLIST_EVENT = 'slidesol:wishlist-updated';

const readWishlist = () => {
  try {
    const raw = window.localStorage.getItem(WISHLIST_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('Failed to read wishlist', error);
    return [];
  }
};

const writeWishlist = (items) => {
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save wishlist', error);
  }
  window.dispatchEvent(new CustomEvent(WISHLIST_EVENT));
};

export const keyFor = (productId, colourId) => (colourId ? `${productId}:${colourId}` : productId);

export const getWishlist = () => readWishlist();

export const getWishlistCount = () => readWishlist().length;

export const isWishlisted = (key) => readWishlist().some((item) => item.key === key);

// item: { key, productId, colourId, slug, name, brand, price, image }
export const toggleWishlist = (item) => {
  const items = readWishlist();
  const index = items.findIndex((entry) => entry.key === item.key);

  if (index === -1) {
    items.push(item);
    writeWishlist(items);
    return true; // now wishlisted
  }

  items.splice(index, 1);
  writeWishlist(items);
  return false; // no longer wishlisted
};

export const removeFromWishlist = (key) => {
  writeWishlist(readWishlist().filter((item) => item.key !== key));
};

export const initWishlistBadge = () => {
  const badge = document.querySelector('[data-wishlist-count]');
  if (!badge) return;

  const render = () => {
    const count = getWishlistCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  };

  render();
  window.addEventListener(WISHLIST_EVENT, render);
  window.addEventListener('storage', (event) => { if (event.key === WISHLIST_KEY) render(); });
};
