import { functionUrl } from '../config.js';
import { getAccessToken } from './auth.js';

const request = async (functionName, path, { method = 'GET', body, isFormData = false } = {}) => {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${functionUrl(functionName)}${path}`, {
    method,
    headers,
    body: isFormData ? body : (body !== undefined ? JSON.stringify(body) : undefined),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Something went wrong. Please try again.');
  }
  return result;
};

// Brands
export const listBrands = () => request('admin-catalogue', '/brands');
export const createBrand = (payload) => request('admin-catalogue', '/brands', { method: 'POST', body: payload });
export const updateBrand = (id, payload) => request('admin-catalogue', `/brands/${id}`, { method: 'PATCH', body: payload });

// Products
export const listProducts = () => request('admin-catalogue', '/products');
export const createProduct = (payload) => request('admin-catalogue', '/products', { method: 'POST', body: payload });
export const getProduct = (id) => request('admin-catalogue', `/products/${id}`);
export const updateProduct = (id, payload) => request('admin-catalogue', `/products/${id}`, { method: 'PATCH', body: payload });

// Colours
export const createColour = (productId, payload) => request('admin-catalogue', `/products/${productId}/colours`, { method: 'POST', body: payload });
export const updateColour = (id, payload) => request('admin-catalogue', `/colours/${id}`, { method: 'PATCH', body: payload });
export const deleteColour = (id) => request('admin-catalogue', `/colours/${id}`, { method: 'DELETE' });

// Variants
export const createVariant = (productId, payload) => request('admin-catalogue', `/products/${productId}/variants`, { method: 'POST', body: payload });
export const updateVariant = (id, payload) => request('admin-catalogue', `/variants/${id}`, { method: 'PATCH', body: payload });
export const deleteVariant = (id) => request('admin-catalogue', `/variants/${id}`, { method: 'DELETE' });

// Images
export const uploadImage = (productId, formData) => request('admin-catalogue', `/products/${productId}/images`, { method: 'POST', body: formData, isFormData: true });
export const updateImage = (id, payload) => request('admin-catalogue', `/images/${id}`, { method: 'PATCH', body: payload });
export const deleteImage = (id) => request('admin-catalogue', `/images/${id}`, { method: 'DELETE' });

// Orders
export const listOrders = (customerId) => request('admin-orders', customerId ? `/orders?customer_id=${encodeURIComponent(customerId)}` : '/orders');
export const getOrder = (id) => request('admin-orders', `/orders/${id}`);
export const updateOrderStatus = (id, orderStatus) => request('admin-orders', `/orders/${id}`, { method: 'PATCH', body: { order_status: orderStatus } });

// Customers
export const listCustomers = () => request('admin-orders', '/customers');
