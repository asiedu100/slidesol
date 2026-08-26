// One-time import of the initial real product photography (s1.jpeg-s41.jpg at the repo
// root) into the live catalogue. Everything goes through the same admin-catalogue Edge
// Function endpoints the admin panel itself uses, so slug generation, validation, and
// storage cleanup on failure all stay enforced — this script has no elevated access of
// its own.
//
// Run with:
//   node scripts/seed-catalogue.mjs
// It will ask for your admin email and password when it starts (same login as the admin
// panel). Typed straight into your own terminal — never written to a file, never sent
// anywhere but Supabase's own sign-in endpoint.
//
// If you'd rather not be prompted (e.g. running this from another script), you can still
// set SLIDESOL_ADMIN_EMAIL / SLIDESOL_ADMIN_PASSWORD as environment variables instead and
// it'll skip the prompts. Requires Node 18+ (native fetch/FormData/Blob).
//
// All seeded products are created with is_active: false and a single placeholder
// "One Size" / 0-stock variant. Before activating any of them in admin/product-form.html,
// replace that placeholder with real sizes and stock, and set a real price.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import path from 'node:path';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

const SUPABASE_URL = 'https://huyfpjqgjtihttctdxdc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lKjjB6s-vVzT9VoU2cR6WQ_7fxZSCOi';
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CATALOGUE = [
  {
    brand: 'Crocs',
    product: 'Mellow Recovery Slide',
    gender: 'unisex',
    colours: [
      { name: 'Lavender', images: [
        { file: 's1.jpeg', angle: 'hero' },
        { file: 's2.jpeg', angle: 'side' },
        { file: 's3.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Crocs',
    product: 'Dylan Clog',
    gender: 'unisex',
    colours: [
      { name: 'Dark Brown', images: [
        { file: 's4.jpeg', angle: 'hero' },
        { file: 's5.jpeg', angle: 'side' },
        { file: 's6.jpeg', angle: 'top' },
      ] },
      { name: 'Tan Suede', images: [
        { file: 's10.jpeg', angle: 'hero' },
        { file: 's11.jpeg', angle: 'side' },
        { file: 's12.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Crocs',
    product: 'Pollex Clog',
    gender: 'unisex',
    colours: [
      { name: 'Olive', images: [
        { file: 's7.jpeg', angle: 'hero' },
        { file: 's8.jpeg', angle: 'top' },
        { file: 's9.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Birkenstock',
    product: 'Arizona',
    gender: 'unisex',
    colours: [
      { name: 'Olive Nubuck', images: [
        { file: 's13.jpeg', angle: 'top' },
        { file: 's14.jpeg', angle: 'side' },
        { file: 's15.jpeg', angle: 'hero' },
        { file: 's49.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Reef',
    product: 'Leather Smoothy',
    gender: 'men',
    colours: [
      { name: 'Tan', images: [
        { file: 's16.jpeg', angle: 'hero' },
        { file: 's17.jpeg', angle: 'side' },
        { file: 's18.jpeg', angle: 'top' },
        { file: 's48.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Christian Louboutin',
    product: 'Loubi Flip',
    gender: 'women',
    colours: [
      { name: 'Coral', images: [
        { file: 's19.jpeg', angle: 'hero' },
        { file: 's20.jpeg', angle: 'top' },
        { file: 's21.jpeg', angle: 'side' },
        { file: 's47.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'lululemon',
    product: 'Restfeel Slide',
    gender: 'unisex',
    colours: [
      { name: 'Black', images: [
        { file: 's22.jpeg', angle: 'top' },
        { file: 's23.jpeg', angle: 'side' },
        { file: 's24.jpeg', angle: 'hero' },
        { file: 's46.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'OOFOS',
    product: 'OOahh Slide',
    gender: 'unisex',
    colours: [
      { name: 'Black', images: [
        { file: 's25.jpeg', angle: 'top' },
        { file: 's26.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Coach',
    product: 'Signature Bow Flip-Flop',
    gender: 'women',
    colours: [
      { name: 'Brown Monogram', images: [
        { file: 's27.jpeg', angle: 'hero' },
        { file: 's28.jpeg', angle: 'hero' },
        { file: 's29.jpeg', angle: 'side' },
        { file: 's30.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Crocs',
    product: 'Classic Clog (Marvel Spider-Man)',
    gender: 'unisex',
    colours: [
      { name: 'Red', images: [
        { file: 's33.jpeg', angle: 'hero' },
        { file: 's32.jpeg', angle: 'side' },
        { file: 's31.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Ipanema',
    product: 'Flip Flip-Flop',
    gender: 'women',
    colours: [
      { name: 'Olive Tortoise', images: [
        { file: 's34.jpeg', angle: 'hero' },
        { file: 's35.jpeg', angle: 'side' },
        { file: 's36.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'TKEES',
    product: 'Foundation Flip',
    gender: 'women',
    colours: [
      { name: 'Brown', images: [
        { file: 's37.jpeg', angle: 'top' },
        { file: 's38.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Coach',
    product: 'Jacquard Signature Mary Jane',
    gender: 'women',
    colours: [
      { name: 'Brown Monogram', images: [
        { file: 's39.jpeg', angle: 'hero' },
        { file: 's40.jpg', angle: 'top' },
        { file: 's45.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'adidas',
    product: 'Yeezy Slide',
    gender: 'unisex',
    colours: [
      { name: 'Onyx', images: [
        { file: 's42.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'adidas',
    product: 'Adilette Comfort Slide',
    gender: 'unisex',
    colours: [
      { name: 'Grey/White', images: [
        { file: 's56.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Nike',
    product: 'Benassi JDI Slide',
    gender: 'unisex',
    colours: [
      { name: 'Black/White', images: [
        { file: 's57.jpeg', angle: 'hero' },
        { file: 's44.jpeg', angle: 'top' },
        { file: 's43.jpeg', angle: 'top' },
      ] },
    ],
  },
  {
    brand: 'Havaianas',
    product: 'Top Flip-Flop',
    gender: 'unisex',
    colours: [
      { name: 'Sand/Green', images: [
        { file: 's51.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Teva',
    product: 'Original Universal Sandal',
    gender: 'unisex',
    colours: [
      { name: 'Multi', images: [
        { file: 's54.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Crocs',
    product: 'Crocband Clog',
    gender: 'unisex',
    colours: [
      { name: 'Black/Espresso', images: [
        { file: 's50.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Birkenstock',
    product: 'Kyoto',
    gender: 'unisex',
    colours: [
      { name: 'Cognac Suede', images: [
        { file: 's53.jpeg', angle: 'hero' },
      ] },
    ],
  },
  {
    brand: 'Birkenstock',
    product: 'Boston Clog',
    gender: 'unisex',
    colours: [
      { name: 'Mocha Suede', images: [
        { file: 's55.jpeg', angle: 'side' },
      ] },
    ],
  },
  {
    brand: 'Birkenstock',
    product: 'Amsterdam',
    gender: 'unisex',
    colours: [
      { name: 'Taupe Suede', images: [
        { file: 's52.jpeg', angle: 'side' },
      ] },
    ],
  },
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
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-catalogue${apiPath}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${apiPath} -> ${res.status}: ${body.message ?? 'unknown error'}`);
  return body;
};

console.log('Fetching existing brands and products...');
const { brands: existingBrands } = await call('/brands');
const { products: existingProducts } = await call('/products');

const findOrCreateBrand = async (name) => {
  const existing = existingBrands.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  console.log(`  creating brand: ${name}`);
  const { brand } = await call('/brands', { method: 'POST', body: JSON.stringify({ name }) });
  existingBrands.push(brand);
  return brand;
};

const mimeFor = (file) => (file.endsWith('.png') ? 'image/png' : 'image/jpeg');

const summary = [];

for (const entry of CATALOGUE) {
  if (existingProducts.some((p) => p.name === entry.product && p.brands?.name === entry.brand)) {
    console.log(`Skipping "${entry.product}" (${entry.brand}) — already exists.`);
    continue;
  }

  console.log(`Creating "${entry.product}" (${entry.brand})...`);
  const brand = await findOrCreateBrand(entry.brand);

  const { product } = await call('/products', {
    method: 'POST',
    body: JSON.stringify({
      brand_id: brand.id, name: entry.product, price: 0, gender: entry.gender, is_active: false,
    }),
  });

  for (const colour of entry.colours) {
    const { colour: createdColour } = await call(`/products/${product.id}/colours`, {
      method: 'POST',
      body: JSON.stringify({ name: colour.name }),
    });

    for (const img of colour.images) {
      const bytes = await readFile(path.join(REPO_ROOT, img.file));
      const form = new FormData();
      form.set('colour_id', createdColour.id);
      form.set('shot_angle', img.angle);
      form.set('alt_text', `${entry.brand} ${entry.product}, ${colour.name} — ${img.angle} view`);
      form.set('file', new Blob([bytes], { type: mimeFor(img.file) }), img.file);
      await call(`/products/${product.id}/images`, { method: 'POST', body: form });
    }

    await call(`/products/${product.id}/variants`, {
      method: 'POST',
      body: JSON.stringify({ colour_id: createdColour.id, size: 'One Size', stock_quantity: 0 }),
    });
  }

  summary.push({ name: `${entry.brand} ${entry.product}`, id: product.id });
}

console.log('\nDone. Each product has a placeholder "One Size" / 0-stock variant —');
console.log('replace it with real sizes and set a real price before activating.');
console.log('Review these in admin/product-form.html:');
for (const item of summary) {
  console.log(`  ${item.name} -> admin/product-form.html?id=${item.id}`);
}
