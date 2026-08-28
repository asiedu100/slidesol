// One-off catalogue fix, per user request:
//   - s27/s28/s29/s30.jpeg are a Coach women's bow flip-flop — not in the catalogue yet.
//   - s37/s38.jpeg are a TKEES flip-flop — TKEES isn't even a brand in the catalogue yet.
//   - s68.jpeg is a second angle of the Adidas "Yeezy Slide" that already exists (its sole
//     is stamped with the adidas logo, so it goes under the existing Adidas brand, not a
//     new "Yeezy" brand) — just adds a photo to that existing product/colour.
//
// Both new products are created active (is_active: true), same as the earlier Reef
// product, so they show up right away — but with a placeholder price (GH₵0) and a single
// 0-stock "One Size" variant, same as every other seed script this session. Set a real
// price/size/stock for each in admin/product-form.html before they're actually sellable.
//
// Run with:
//   node scripts/add-coach-tkees-yeezy-images.mjs
// It will ask for your admin email and password when it starts (same login as the admin
// panel). Typed straight into your own terminal — never written to a file, never sent
// anywhere but Supabase's own sign-in endpoint.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import path from 'node:path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// The existing live Adidas "Yeezy Slide" / Slate Grey colour — found by querying the DB,
// not guessed. s68.jpeg is added here, not to a new product.
const YEEZY_SLATE_GREY_COLOUR_ID = '96cacb62-6db8-4682-bdcc-60699404bd25';
const YEEZY_PRODUCT_ID = '58a06f3a-2037-4913-a450-7f6d2c0099aa';

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

const uploadImage = async (productId, colourId, file, angle, altText) => {
  const bytes = await readFile(path.join(REPO_ROOT, file));
  const form = new FormData();
  form.set('colour_id', colourId);
  form.set('shot_angle', angle);
  form.set('alt_text', altText);
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), file);
  await call(`/products/${productId}/images`, { method: 'POST', body: form });
  console.log(`  uploaded ${file} (${angle})`);
};

const findOrCreateBrand = async (name) => {
  const { brands } = await call('/brands');
  const existing = brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  console.log(`Creating "${name}" brand...`);
  const { brand } = await call('/brands', { method: 'POST', body: JSON.stringify({ name }) });
  return brand;
};

// --- Coach: Signature Bow Flip-Flop -----------------------------------------
console.log('\n--- Coach ---');
const coach = await findOrCreateBrand('Coach');

console.log('Creating "Signature Bow Flip-Flop"...');
const { product: coachProduct } = await call('/products', {
  method: 'POST',
  body: JSON.stringify({ brand_id: coach.id, name: 'Signature Bow Flip-Flop', price: 0, gender: 'women', is_active: true }),
});

console.log('Creating "Brown Monogram" colour...');
const { colour: coachColour } = await call(`/products/${coachProduct.id}/colours`, {
  method: 'POST',
  body: JSON.stringify({ name: 'Brown Monogram' }),
});

await uploadImage(coachProduct.id, coachColour.id, 's27.jpeg', 'hero', 'Coach Signature Bow Flip-Flop, Brown Monogram — front');
await uploadImage(coachProduct.id, coachColour.id, 's28.jpeg', 'back', 'Coach Signature Bow Flip-Flop, Brown Monogram — angled');
await uploadImage(coachProduct.id, coachColour.id, 's29.jpeg', 'side', 'Coach Signature Bow Flip-Flop, Brown Monogram — side');
await uploadImage(coachProduct.id, coachColour.id, 's30.jpeg', 'top', 'Coach Signature Bow Flip-Flop, Brown Monogram — top');

console.log('Adding a placeholder size (One Size, 0 stock)...');
await call(`/products/${coachProduct.id}/variants`, {
  method: 'POST',
  body: JSON.stringify({ colour_id: coachColour.id, size: 'One Size', stock_quantity: 0 }),
});

// --- TKEES: Foundation Flip --------------------------------------------------
console.log('\n--- TKEES ---');
const tkees = await findOrCreateBrand('TKEES');

console.log('Creating "Foundation Flip"...');
const { product: tkeesProduct } = await call('/products', {
  method: 'POST',
  body: JSON.stringify({ brand_id: tkees.id, name: 'Foundation Flip', price: 0, gender: 'women', is_active: true }),
});

console.log('Creating "Brown" colour...');
const { colour: tkeesColour } = await call(`/products/${tkeesProduct.id}/colours`, {
  method: 'POST',
  body: JSON.stringify({ name: 'Brown' }),
});

await uploadImage(tkeesProduct.id, tkeesColour.id, 's37.jpeg', 'top', 'TKEES Foundation Flip, Brown — top');
await uploadImage(tkeesProduct.id, tkeesColour.id, 's38.jpeg', 'side', 'TKEES Foundation Flip, Brown — side');

console.log('Adding a placeholder size (One Size, 0 stock)...');
await call(`/products/${tkeesProduct.id}/variants`, {
  method: 'POST',
  body: JSON.stringify({ colour_id: tkeesColour.id, size: 'One Size', stock_quantity: 0 }),
});

// --- Adidas Yeezy Slide: one more photo on the existing product/colour ------
console.log('\n--- Adidas Yeezy Slide ---');
await uploadImage(YEEZY_PRODUCT_ID, YEEZY_SLATE_GREY_COLOUR_ID, 's68.jpeg', 'top', 'Adidas Yeezy Slide, Slate Grey — top');

console.log('\nDone.');
console.log('New: Coach "Signature Bow Flip-Flop" and TKEES "Foundation Flip", both live now with placeholder GH₵0 price and 0 stock.');
console.log('Set real price/size/stock for both in admin/product-form.html before they can actually be bought.');
