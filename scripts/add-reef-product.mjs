// One-off: Reef has zero products today, so its "Shop By Brand" card on the
// homepage shows a random placeholder instead of a real photo. This creates
// one real Reef product with s48.jpeg as its image, active immediately so it
// shows up there right away. Price is a placeholder (GH₵0) and it gets a
// single zero-stock "One Size" variant — set a real price/size before it's
// actually sellable.
//
// Run with:
//   node scripts/add-reef-product.mjs
// It will ask for your admin email and password when it starts (same login as
// the admin panel). Typed straight into your own terminal — never written to a
// file, never sent anywhere but Supabase's own sign-in endpoint.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import path from 'node:path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const BRAND_NAME = 'Reef';
const PRODUCT_NAME = 'Leather Smoothy';
const COLOUR_NAME = 'Tan';
const IMAGE_FILE = 's48.jpeg';

let email = process.env.SLIDESOL_ADMIN_EMAIL;
let password = process.env.SLIDESOL_ADMIN_PASSWORD;

if (!email || !password) {
  if (!email) email = await ask('Admin email: ');
  if (!password) password = await ask('Admin password: ');
}
rl.close();

if (!email || !password) {
  console.error('An admin email and password are required.');
  process.exit(1);
}

const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const authBody = await authRes.json();
if (!authRes.ok || !authBody.access_token) {
  console.error('Sign-in failed:', authBody.error_description || authBody.msg || authRes.status);
  process.exit(1);
}
const token = authBody.access_token;

const call = async (apiPath, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-catalogue${apiPath}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${apiPath} -> ${res.status}: ${body.message ?? 'unknown error'}`);
  return body;
};

console.log('Looking up Reef brand...');
const { brands } = await call('/brands');
const reef = brands.find((b) => b.name.toLowerCase() === BRAND_NAME.toLowerCase());
if (!reef) throw new Error('Reef brand not found — expected it to already exist.');

console.log(`Creating "${PRODUCT_NAME}"...`);
const { product } = await call('/products', {
  method: 'POST',
  body: JSON.stringify({ brand_id: reef.id, name: PRODUCT_NAME, price: 0, gender: 'unisex', is_active: true }),
});

console.log(`Creating "${COLOUR_NAME}" colour...`);
const { colour } = await call(`/products/${product.id}/colours`, {
  method: 'POST',
  body: JSON.stringify({ name: COLOUR_NAME }),
});

console.log(`Uploading ${IMAGE_FILE}...`);
const bytes = await readFile(path.join(REPO_ROOT, IMAGE_FILE));
const form = new FormData();
form.set('colour_id', colour.id);
form.set('shot_angle', 'side');
form.set('alt_text', `Reef ${PRODUCT_NAME}, ${COLOUR_NAME} — side view`);
form.set('file', new Blob([bytes], { type: 'image/jpeg' }), IMAGE_FILE);
await call(`/products/${product.id}/images`, { method: 'POST', body: form });

console.log('Adding a placeholder size (One Size, 0 stock)...');
await call(`/products/${product.id}/variants`, {
  method: 'POST',
  body: JSON.stringify({ colour_id: colour.id, size: 'One Size', stock_quantity: 0 }),
});

console.log(`\nDone. Reef now has a real product and photo — reload the homepage to see it in "Shop By Brand".`);
console.log(`Set a real price and size/stock in admin/product-form.html?id=${product.id} whenever ready.`);
