const CART_KEY = 'slidesol-cart';
const LEGACY_CART_KEY = 'solace-cart';

const readCart = () => {
  const cart = localStorage.getItem(CART_KEY) || localStorage.getItem(LEGACY_CART_KEY) || '[]';

  try {
    return JSON.parse(cart);
  } catch {
    return [];
  }
};

export const getCart = () => readCart();

export const saveCart = (cart) => {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  localStorage.removeItem(LEGACY_CART_KEY);
  updateCartCount(true);
  window.dispatchEvent(new CustomEvent('cart-updated'));
};

// Known stock is captured on the item at add-time (see product.html's add-to-cart call).
// Preorder items have no physical stock ceiling, so they get a sane placeholder cap instead of 0.
export const getMaxQuantity = (item) => {
  const stock = Number(item?.stock || 0);
  if (stock > 0) return stock;
  return item?.isPreorder ? 20 : 1;
};

export const getSubtotal = (cart = getCart()) => cart.reduce(
  (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
  0,
);

export const clearCart = () => saveCart([]);

export const addToCart = (product, quantity = 1) => {
  const cart = getCart();
  const itemId = product.variantId || product.id;
  const item = cart.find((entry) => entry.id === itemId);

  if (item) {
    const max = getMaxQuantity(item);
    item.quantity = Math.min(item.quantity + quantity, max);
  } else {
    const newItem = { ...product, id: itemId, quantity };
    newItem.quantity = Math.min(Math.max(1, quantity), getMaxQuantity(newItem));
    cart.push(newItem);
  }

  saveCart(cart);
};

export const removeFromCart = (id) => {
  saveCart(getCart().filter((item) => item.id !== id));
};

export const updateQuantity = (id, quantity) => {
  const cart = getCart();
  const item = cart.find((entry) => entry.id === id);

  if (item) {
    const max = getMaxQuantity(item);
    item.quantity = Math.min(Math.max(1, Math.round(Number(quantity) || 1)), max);
  }

  saveCart(cart);
};

export const increaseQuantity = (id) => {
  const item = getCart().find((entry) => entry.id === id);
  if (item) updateQuantity(id, Number(item.quantity || 1) + 1);
};

export const decreaseQuantity = (id) => {
  const item = getCart().find((entry) => entry.id === id);
  if (item) updateQuantity(id, Number(item.quantity || 1) - 1);
};

export const updateCartCount = (pulse = false) => {
  const total = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  document.querySelectorAll('[data-cart-count]').forEach((element) => {
    element.textContent = total;

    if (!pulse) return;
    element.classList.remove('pulse');
    void element.offsetWidth; // force reflow so the animation restarts on repeated pulses
    element.classList.add('pulse');
  });
};

updateCartCount();
