import { formatMoney } from '../config.js';
import { placeholderPhotoFor } from './placeholder-photos.js';

const CART_KEY = 'slidesol-cart';
const CART_EVENT = 'slidesol:cart-updated';

const readCart = () => {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('Failed to read cart', error);
    return [];
  }
};

const writeCart = (items) => {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Failed to save cart', error);
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
};

const maxQuantityFor = (item) => (item.isPreorder ? 10 : item.stock);

export const getCart = () => readCart();

export const getCartCount = () => readCart().reduce((sum, item) => sum + item.quantity, 0);

export const getCartSubtotal = () => readCart().reduce((sum, item) => sum + (item.price * item.quantity), 0);

export const addToCart = (item) => {
  const items = readCart();
  const existing = items.find((entry) => entry.variantId === item.variantId);
  const maxQty = maxQuantityFor(item);

  if (existing) {
    existing.quantity = Math.max(1, Math.min(existing.quantity + item.quantity, maxQty));
  } else {
    items.push({ ...item, quantity: Math.max(1, Math.min(item.quantity, maxQty)) });
  }

  writeCart(items);
};

export const updateCartQuantity = (variantId, quantity) => {
  const items = readCart();
  const entry = items.find((item) => item.variantId === variantId);
  if (!entry) return;

  entry.quantity = Math.max(1, Math.min(quantity, maxQuantityFor(entry)));
  writeCart(items);
};

export const removeFromCart = (variantId) => {
  writeCart(readCart().filter((item) => item.variantId !== variantId));
};

export const clearCart = () => writeCart([]);

export const initCartBadge = () => {
  const badge = document.querySelector('[data-cart-count]');
  if (!badge) return;

  const render = () => {
    const count = getCartCount();
    badge.textContent = String(count);
    badge.hidden = count === 0;
  };

  render();
  window.addEventListener(CART_EVENT, render);
  window.addEventListener('storage', (event) => { if (event.key === CART_KEY) render(); });
};

const createCartRow = (item) => {
  const row = document.createElement('div');
  row.className = 'cart-row';

  const media = document.createElement('div');
  media.className = 'cart-row__media';

  const heroLayer = document.createElement('div');
  heroLayer.className = 'cart-row__media-layer';
  // TEMPORARY placeholder photo when no real image exists yet (see plan §16/§17) —
  // display-only; the stored cart/order data itself keeps item.image as-is (null
  // when there's no real photo), so checkout/admin records stay accurate.
  heroLayer.style.backgroundImage = `url("${item.image || placeholderPhotoFor(item.productId)}")`;
  media.appendChild(heroLayer);

  if (item.altImage) {
    const altLayer = document.createElement('div');
    altLayer.className = 'cart-row__media-layer cart-row__media-layer--alt';
    altLayer.style.backgroundImage = `url("${item.altImage}")`;
    media.appendChild(altLayer);
  }

  const info = document.createElement('div');
  info.className = 'cart-row__info';

  const name = document.createElement('p');
  name.className = 'cart-row__name';
  name.textContent = item.name;

  const variant = document.createElement('p');
  variant.className = 'cart-row__variant';
  variant.textContent = `${item.colour} · Size ${item.size}${item.isPreorder ? ' · Preorder' : ''}`;

  const price = document.createElement('p');
  price.className = 'cart-row__price';
  price.textContent = formatMoney(item.price);

  const qty = document.createElement('div');
  qty.className = 'cart-row__qty';

  const dec = document.createElement('button');
  dec.type = 'button';
  dec.textContent = '−';
  dec.setAttribute('aria-label', 'Decrease quantity');
  dec.dataset.qtyDec = item.variantId;

  const qtyVal = document.createElement('span');
  qtyVal.textContent = String(item.quantity);

  const inc = document.createElement('button');
  inc.type = 'button';
  inc.textContent = '+';
  inc.setAttribute('aria-label', 'Increase quantity');
  inc.dataset.qtyInc = item.variantId;

  qty.append(dec, qtyVal, inc);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'cart-row__remove';
  remove.textContent = 'Remove';
  remove.dataset.remove = item.variantId;

  info.append(name, variant, price, qty, remove);
  row.append(media, info);
  return row;
};

export const initCartDrawer = () => {
  const drawer = document.querySelector('[data-cart-drawer]');
  const trigger = document.querySelector('[data-cart-toggle]');
  const closeButton = document.querySelector('[data-cart-drawer-close]');
  const backdrop = document.querySelector('[data-cart-drawer-backdrop]');
  const itemsEl = document.querySelector('[data-cart-items]');
  const emptyEl = document.querySelector('[data-cart-empty]');
  const footerEl = document.querySelector('[data-cart-footer]');
  const subtotalEl = document.querySelector('[data-cart-subtotal]');
  if (!drawer) return;

  const open = () => drawer.classList.add('is-open');
  const close = () => drawer.classList.remove('is-open');

  trigger?.addEventListener('click', (event) => {
    event.preventDefault();
    open();
  });
  closeButton?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);

  const render = () => {
    if (!itemsEl) return;
    const items = getCart();
    itemsEl.innerHTML = '';

    if (items.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      if (footerEl) footerEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (footerEl) footerEl.hidden = false;
    items.forEach((item) => itemsEl.appendChild(createCartRow(item)));
    if (subtotalEl) subtotalEl.textContent = formatMoney(getCartSubtotal());
  };

  itemsEl?.addEventListener('click', (event) => {
    const removeBtn = event.target.closest('[data-remove]');
    if (removeBtn) {
      removeFromCart(removeBtn.dataset.remove);
      return;
    }

    const decBtn = event.target.closest('[data-qty-dec]');
    if (decBtn) {
      const item = getCart().find((entry) => entry.variantId === decBtn.dataset.qtyDec);
      if (item) updateCartQuantity(item.variantId, item.quantity - 1);
      return;
    }

    const incBtn = event.target.closest('[data-qty-inc]');
    if (incBtn) {
      const item = getCart().find((entry) => entry.variantId === incBtn.dataset.qtyInc);
      if (item) updateCartQuantity(item.variantId, item.quantity + 1);
    }
  });

  window.addEventListener(CART_EVENT, render);
  render();
};
