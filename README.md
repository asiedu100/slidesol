# SLIDESOL

A multi-brand slides/sandals storefront — plain static HTML/JS on the frontend, Supabase
(Postgres + Edge Functions + Storage + Auth) on the backend, Paystack for payment.

## Tech stack

- **Frontend**: plain HTML + vanilla JS ES modules (`<script type="module">`), no
  framework, no bundler, no build step. Pages import local `js/*.js` files directly and
  the Supabase JS client from a CDN (`@supabase/supabase-js@2` via jsdelivr).
- **Backend**: Supabase — Postgres for data, Edge Functions (Deno, in `supabase/functions/`)
  for every privileged write and any read that needs the service-role key, Storage for
  product images, Auth for admin login.
- **Payments**: Paystack, via `create-order` (initializes a transaction) and
  `paystack-webhook` (verifies and confirms it).

## Project structure

```
index.html, shop.html, product.html, checkout.html, order-success.html, contact.html
  — the public storefront pages
admin/
  — the admin panel (products, brands, orders, customers), gated by admin login
js/
  store/     — storefront logic (product fetching/rendering, cart, checkout)
  admin/     — admin panel logic (auth, catalogue CRUD, orders)
  config.js  — Supabase URL/anon key, shared constants (delivery fees, quantity caps)
  supabase.js — Supabase client setup
css/
  — one stylesheet per page/area (style.css is the shared base + design tokens)
supabase/
  migrations/ — tracked schema changes, applied with `supabase db push`
  functions/  — Edge Functions (Deno), one directory per function
scripts/
  — one-off Node scripts (e.g. bulk catalogue seeding); no dependencies, no npm install
docs/
  — feature-level notes on how specific backend pieces work (see below)
```

There is deliberately no `package.json` — nothing here needs installing to run.

## Running it locally

Serve the repo root with any static file server and open it in a browser — for example:

```
npx serve .
# or
python3 -m http.server 8000
```

No build step. The Supabase URL/anon key are already set in `js/config.js` (the anon key
is a public, read-scoped key — safe to have client-side).

## Supabase setup

- **Schema**: tracked as SQL files in `supabase/migrations/`. Apply pending ones with
  `supabase db push` (after `supabase link --project-ref <ref>` once, per project).
- **Edge Functions**: one directory per function under `supabase/functions/`. Deploy with
  `supabase functions deploy <name> --use-api` (or omit the name to deploy everything).
  Every function that needs elevated access uses the service-role key server-side
  (`supabase/functions/_shared/supabase-admin.ts`) — the browser only ever holds the
  public anon key.
- **Storage**: product images live in the `product-images` bucket, uploaded via the
  `admin-catalogue` function (never directly from the browser).

## Documentation

Feature-level notes, written for whoever next touches that piece:

- [`docs/admin-auth.md`](docs/admin-auth.md) — how admin login/authorization works
- [`docs/admin-catalogue.md`](docs/admin-catalogue.md) — the products/brands/colours/variants/images API
- [`docs/admin-orders.md`](docs/admin-orders.md) — the admin orders/customers API
- [`docs/paystack-integration.md`](docs/paystack-integration.md) — the checkout/payment flow
- [`docs/product-imagery.md`](docs/product-imagery.md) — the gender + photo-angle conventions and how catalogue seeding works

## Known gaps

- Admin orders/customers screens are read-mostly (order status is the only write).
- Delivery fee calculation is a flat placeholder, not real courier-rate integration.
- Seeded/imported products (via `scripts/seed-catalogue.mjs`) start inactive with a
  placeholder size/price — always reviewed and priced in `admin/product-form.html` before
  going live.
