// One-time cleanup: renames a fixed list of products (by their database id, so
// it's unambiguous and safe to re-run) to proper display names. Doesn't touch
// brand, photos, price, or anything else — names only. Goes through the same
// admin-catalogue Edge Function endpoint the admin panel itself uses.
//
// Run with:
//   node scripts/rename-products.mjs
// It will ask for your admin email and password when it starts (same login as
// the admin panel). Typed straight into your own terminal — never written to a
// file, never sent anywhere but Supabase's own sign-in endpoint.

import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';

const RENAMES = [
  { id: '669489ba-3015-4a46-8af5-6ffd9f54ec8c', from: 'spider', to: 'Classic Clog (Marvel Spider-Man)' },
  { id: '036eb41a-c388-4473-96b6-aa370d85066e', from: 'adilette', to: 'Adilette Slide' },
  { id: '3d4a9a9d-df6f-4d3d-8a28-08a2f52cd8e0', from: 'koyoto', to: 'Kyoto' },
  { id: 'cd12d3ba-4e1a-400e-91ec-dd4544789dc3', from: 'boston', to: 'Boston Clog' },
  { id: '542e3096-d931-440b-92ac-5126a9999154', from: 'pool fun', to: 'Pool Fun' },
  { id: '319186d8-a261-40e4-8d2c-9d802ae49cbb', from: 'echo', to: 'Echo Clog' },
  { id: '1b993235-63f5-4d7f-8dc1-a1a23a554f3d', from: 'ooahh', to: 'OOahh Slide' },
  { id: 'f695a8d1-23a2-4466-88a1-76e2e246f3a7', from: 'restfill', to: 'Restfeel Slide' },
  { id: '40a17f99-a936-400f-99f1-ee8cc50b6d78', from: 'meusol', to: 'Tortoise Flip-Flop' },
  { id: '0b95a38e-0aa7-4aeb-a858-c3c0b9efce28', from: 'top', to: 'Top' },
  { id: '10564000-d944-46f5-9bb4-637738fa40e9', from: 'arizona', to: 'Arizona' },
  { id: '2e384ac9-e0b3-459c-a42d-3e5a28b1920e', from: 'benassi', to: 'Benassi Slide' },
  { id: '8d0d930f-23de-42bb-b1ac-50d224d2164d', from: 'slide', to: 'Jacquard Signature Mary Jane' },
  { id: '12da3404-bafc-48d4-bb04-fd2b3e46e200', from: 'classic', to: 'Classic Clog' },
  { id: 'ecae3bcc-3c94-404a-8dda-554e8abb938f', from: 'hurricane', to: 'Hurricane' },
];

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
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-catalogue${apiPath}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${apiPath} -> ${res.status}: ${body.message ?? 'unknown error'}`);
  return body;
};

for (const item of RENAMES) {
  try {
    const { product } = await call(`/products/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: item.to }),
    });
    console.log(`"${item.from}" -> "${product.name}"`);
  } catch (error) {
    console.error(`FAILED "${item.from}" (${item.id}): ${error.message}`);
  }
}

console.log('\nDone. Reload the shop page to see the updated names.');
