import { products } from '../store/products.js';
import { getCart } from '../store/cart.js';
export const dashboardStats = () => { const orders = JSON.parse(localStorage.getItem('solace-last-order') || 'null'); return { products: products.length, orders: orders ? 1 : 0, customers: orders ? 1 : 0, bagItems: getCart().length }; };
