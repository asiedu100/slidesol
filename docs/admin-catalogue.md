# Admin catalogue management

Real product/brand/colour/variant/stock/image management for the admin panel, replacing
the old flat-schema demo stub.

## Architecture

One Edge Function, `admin-catalogue`, path-routed (`/functions/v1/admin-catalogue/brands`,
`/products/:id/variants`, etc.) — see the endpoint table below. Every request requires
`Authorization: Bearer <the signed-in admin's session token>`; the function verifies that
token belongs to an active admin (same check `admin-verify` uses, now shared via
`supabase/functions/_shared/require-admin.ts`) before doing anything else. Writes use the
service-role key server-side — the same reasoning as every other Edge Function in this
project: no RLS policy on these tables could be verified or created, so elevated trust is
scoped to the server, never the browser.

## Endpoints

All JSON except image upload (`multipart/form-data`). Error shape is always `{error, message}`.

| Method | Path | Notes |
|---|---|---|
| GET / POST | `/brands` | list (includes inactive) / create |
| PATCH | `/brands/:id` | partial update, incl. `is_active` |
| DELETE | `/brands/:id` | **405** — brands can't be hard-deleted, deactivate instead |
| GET / POST | `/products` | list (with brand + first image) / create |
| GET | `/products/:id` | `{product, colours, variants, images}` — powers the edit page |
| PATCH | `/products/:id` | partial update, incl. `is_active`, `gender` |
| DELETE | `/products/:id` | **405**, same reasoning as brands |
| POST | `/products/:id/colours` | create |
| PATCH / DELETE | `/colours/:id` | PATCH incl. `is_active` (per-colour "mark out of stock"); delete may 409 if variants/images still reference it |
| POST | `/products/:id/variants` | create (`colour_id`, `size`, `stock_quantity`, ...) |
| PATCH / DELETE | `/variants/:id` | PATCH also does the quick active-toggle; delete may 409 if ordered |
| POST | `/products/:id/images` | multipart upload: `file`, `colour_id`, `alt_text?`, `sort_order?`, `shot_angle?` |
| PATCH / DELETE | `/images/:id` | PATCH = metadata + `shot_angle` only, no re-upload |

## Deleting things

`brands` and `products` have `is_active` but hard-deleting either risks orphaning
historical `order_items` — so those routes explicitly refuse deletion (`405`) rather than
silently 404ing. `product_variants` also has `is_active` (used for the everyday
deactivate action) but real deletion is still offered for correcting mistakes; if a
variant has already been ordered, the delete fails with a `409` and a specific message
instead of a raw error. `product_colours` also gained an `is_active` flag (added for the
"mark this whole colour out of stock" admin action — see `docs/admin-catalogue.md`'s
sibling docs and the storefront's `isColourAvailable` logic in `js/store/products.js`),
but deletion is still its only *removal* path — deleting a colour that still has variants
or images pointing at it gets the same clear `409` treatment. `product_images` still has
no `is_active` column, so deletion remains its only removal path too.

## Image upload

Sent as `multipart/form-data` (the browser sets this automatically via `fetch` + `FormData`
— no manual `Content-Type` header, unlike every other endpoint here). Server-side guards
(never trust a client-side check): rejects files over 5MB, and anything outside
JPEG/PNG/WEBP/GIF (SVG excluded — it can carry inline script). Stored at
`products/{product_id}/{colour_id}/{uuid}.{ext}` in the existing `product-images` bucket
(assumed public, same as the storefront already assumes when it renders `image_url`
directly). If the database insert fails after a successful upload, the uploaded file is
removed so nothing orphaned is left behind.

## Deploying

`supabase functions deploy --use-api` deploys everything under `supabase/functions/`,
including this one — no separate command needed if you're already redeploying for
another stage.

## Assumptions to confirm

- **Slugs** are always server-generated (via `slugify()` + a uniqueness check that
  auto-suffixes on collision: `name`, `name-2`, `name-3`, ...) even if the client sends
  one — the client's slug field is a live preview only.
- **File-size limit (5MB)** and **allowed image types** are reasonable defaults, not
  given by the schema — change them in one place, `supabase/functions/admin-catalogue/images.ts`.
- **SKU uniqueness isn't enforced** — no unique constraint was given in the schema.
- **Product images always require a colour** — matches how `product.html` already shows
  images per selected colour. A product needs at least one colour before any image can
  be uploaded to it.

## Out of scope for this stage

The admin orders and customers screens still don't query real data — that's a separate
stage. Delivery-fee calculation is still a flat placeholder in `create-order`.
