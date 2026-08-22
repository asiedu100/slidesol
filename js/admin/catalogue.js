import { createApiClient } from './api-client.js';

const { request, uploadRequest } = createApiClient('admin-catalogue');

export const listBrands = () => request('/brands');
export const createBrand = (payload) => request('/brands', { method: 'POST', body: payload });
export const updateBrand = (id, payload) => request(`/brands/${id}`, { method: 'PATCH', body: payload });

export const listProducts = () => request('/products');
export const getProduct = (id) => request(`/products/${id}`);
export const createProduct = (payload) => request('/products', { method: 'POST', body: payload });
export const updateProduct = (id, payload) => request(`/products/${id}`, { method: 'PATCH', body: payload });

export const createColour = (productId, payload) => request(`/products/${productId}/colours`, { method: 'POST', body: payload });
export const updateColour = (id, payload) => request(`/colours/${id}`, { method: 'PATCH', body: payload });
export const deleteColour = (id) => request(`/colours/${id}`, { method: 'DELETE' });

export const createVariant = (productId, payload) => request(`/products/${productId}/variants`, { method: 'POST', body: payload });
export const updateVariant = (id, payload) => request(`/variants/${id}`, { method: 'PATCH', body: payload });
export const deleteVariant = (id) => request(`/variants/${id}`, { method: 'DELETE' });

export const uploadImage = (productId, formData) => uploadRequest(`/products/${productId}/images`, formData);
export const updateImage = (id, payload) => request(`/images/${id}`, { method: 'PATCH', body: payload });
export const deleteImage = (id) => request(`/images/${id}`, { method: 'DELETE' });
