// One-off: the Crocs "Classic Clog" product (newest Crocs product, so it's the
// first one shown on the shop page) has no colour and no photo yet, so it's
// currently falling back to a random placeholder image. This creates a colour
// for it and uploads s5.jpeg as its photo.
//
// Run with:
//   node scripts/fix-shop-images.mjs
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

const PRODUCT_ID = '12da3404-bafc-48d4-bb04-fd2b3e46e200'; // Crocs "Classic Clog"
const COLOUR_NAME = 'Dark Brown';
const IMAGE_FILE = 's5.jpeg';

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

console.log(`Creating "${COLOUR_NAME}" colour...`);
const { colour } = await call(`/products/${PRODUCT_ID}/colours`, {
  method: 'POST',
  body: JSON.stringify({ name: COLOUR_NAME }),
});

console.log(`Uploading ${IMAGE_FILE}...`);
const bytes = await readFile(path.join(REPO_ROOT, IMAGE_FILE));
const form = new FormData();
form.set('colour_id', colour.id);
form.set('shot_angle', 'side');
form.set('alt_text', `Crocs Classic Clog, ${COLOUR_NAME} — side view`);
form.set('file', new Blob([bytes], { type: 'image/jpeg' }), IMAGE_FILE);
await call(`/products/${PRODUCT_ID}/images`, { method: 'POST', body: form });

console.log('\nDone. Reload the shop page to see the real photo instead of the placeholder.');
