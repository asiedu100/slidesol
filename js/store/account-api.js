import { functionUrl } from '../config.js';
import { getAccessToken } from './customer-auth.js';

const request = async (path, { method = 'GET', body } = {}) => {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in.');

  const response = await fetch(`${functionUrl('customer-account')}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Something went wrong. Please try again.');
  return result;
};

export const updateProfile = (patch) => request('/me', { method: 'PATCH', body: patch });
export const listMyOrders = () => request('/orders');
export const getServerCart = () => request('/cart');
export const putServerCart = (items) => request('/cart', { method: 'PUT', body: { items } });
