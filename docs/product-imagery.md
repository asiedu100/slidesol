# Product gender and photo angles

Two small conventions introduced alongside the first batch of real product photography,
so future photo batches follow the same pattern instead of reinventing it.

## `products.gender`

Text column, one of `'men'`, `'women'`, `'unisex'`, defaults to `'unisex'`. No CHECK
constraint in the database (matches the schema's existing loose-typing convention, e.g.
`product_variants.sku`) — validation lives in `supabase/functions/admin-catalogue/products.ts`
(`isGender`) instead. Set via the Gender field on the product form
(`admin/product-form.html`) and used as a shop filter (`shop.html`'s gender pills,
`js/store/products.js`'s `initShopPage`), mirroring the existing brand-pill filter exactly.

There's no per-colour or per-variant gender — gender is a product-level attribute. If a
brand sells the visually-identical shoe as both a men's and women's line with different
sizing, model that as two separate `products` rows, not two colours of one product.

## `product_images.shot_angle`

Nullable text column, one of `'hero'`, `'side'`, `'top'`, `'back'` (also unenforced by a
DB constraint, validated the same way in `supabase/functions/admin-catalogue/images.ts`).
Set via the Angle field on the image-upload form. Not every product has all four — most
have a hero (3/4) shot, a side profile, and a top-down shot; a back/heel shot is
occasional. There's no `'sole'`/bottom-tread angle in use yet; add it to `SHOT_ANGLES` in
both `images.ts` and `admin/product-form.html`'s angle `<select>` if a future batch
includes one.

`shot_angle` is what lets the cart show a second angle on hover
(`js/store/cart.js`'s `createCartRow`, `altImageFor` in `js/store/products.js`): it prefers
whichever image is tagged `side`, then `back`, then `top`, before falling back to whatever
second image exists untagged. An image with no `shot_angle` set still displays fine in the
PDP gallery — the tag only matters for that hover-alt selection and any future
angle-specific UI.

## Seeding a new photo batch

`scripts/seed-catalogue.mjs` is the script used for the first batch (Crocs, Birkenstock,
Reef, Christian Louboutin, lululemon, OOFOS, Coach, Ipanema, TKEES — 13 products, 40
images). It's a plain Node script (no dependencies, no `npm install` needed) that signs in
as an admin and drives the same `admin-catalogue` endpoints the admin panel itself uses —
copy its `CATALOGUE` array structure for a new batch rather than writing directly to
Supabase, so every validation/slug/storage rule already built stays enforced.

Every product it creates starts as `is_active: false` with a single placeholder
`"One Size"` / 0-stock variant — real sizes, stock, and price are always a manual
admin-panel step afterward, deliberately, so nothing unreviewed reaches the storefront.
