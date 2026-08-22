import { createApiClient } from './api-client.js';

const { request } = createApiClient('admin-orders');

export const listOrders = (customerId) => request(customerId ? `/orders?customer_id=${encodeURIComponent(customerId)}` : '/orders');
export const getOrder = (id) => request(`/orders/${id}`);
export const updateOrderStatus = (id, orderStatus) => request(`/orders/${id}`, { method: 'PATCH', body: { order_status: orderStatus } });

export const listCustomers = () => request('/customers');
