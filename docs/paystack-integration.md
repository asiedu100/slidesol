# Paystack payment integration

How checkout payment works, what's deployed, and how to set it up. Written for whoever
next touches this — including future-you.

## Architecture

```
checkout.js  --POST-->  create-order   --calls-->  Paystack (initialize)
                              |
                          writes: customers, orders, order_items, payments (all pending)
                              |
                         returns authorization_url
                              |
browser redirects to Paystack's hosted checkout page, customer pays
                              |
Paystack  --POST-->  paystack-webhook  --calls-->  Paystack (verify)
                              |
                    marks payment/order paid, decrements stock
                              |
browser redirected back to order-success.html?reference=...
                              |
order-success.js  --GET-->  order-status  -->  shows confirmation
```

The frontend never talks to Paystack directly and never contains a Paystack key of any
kind — it only ever calls the three Supabase Edge Functions below. Prices, stock, and
totals are only ever trusted from the database, recomputed server-side on every order.
Stock is only ever decremented after the webhook independently verifies a successful
payment with Paystack — never at order-creation time, never on the browser's say-so.

## The three functions

### `POST /functions/v1/create-order`

Called by `checkout.js` on form submit. Body:

```json
{
  "customer": { "full_name": "...", "phone": "...", "email": "..." },
  "fulfilment_method": "delivery",
  "delivery": { "region": "...", "city": "...", "area": "...", "address": "..." },
  "customer_note": "...",
  "items": [{ "product_id": "uuid", "variant_id": "uuid", "quantity": 1 }],
  "currency": "GHS"
}
```

- `200` → `{ "order_number": "SLS-...", "reference": "sls-...", "authorization_url": "https://checkout.paystack.com/..." }` — redirect the browser here.
- `400` / `409` → `{ "error": "...", "message": "..." }` — validation or stock failure, nothing written to the DB.
- `500` / `502` → server or Paystack-call failure. Order rows may exist as `pending`/`failed` (kept as an audit trail; no cleanup job exists for these yet).

### `POST /functions/v1/paystack-webhook`

Registered in the Paystack dashboard, not called by the frontend. Verifies
`x-paystack-signature` (HMAC-SHA512 of the raw body, keyed with the Paystack secret key),
then independently calls Paystack's verify-transaction endpoint — the webhook payload's
own status field is never trusted. On confirmed `charge.success`, marks the payment and
order paid and decrements `product_variants.stock_quantity` (floored at zero, guarded,
atomic). Idempotent — Paystack redelivers events, and a second delivery of an
already-processed reference is a no-op.

### `GET /functions/v1/order-status?reference=...`

Called by `order-success.js`. Returns `{ order_number, payment_status, order_status,
total_amount, currency }` or `404`. Deliberately returns nothing else (no name, phone,
address) — the reference travels in a URL with no auth behind this endpoint.

## Required secrets

Set these via the Supabase CLI (or dashboard → Edge Functions → Secrets) before deploying:

| Secret | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Server-side only. Used to call Paystack's API and to verify webhook signatures. Never sent to the browser. Use `sk_test_...` until you're ready to go live. |
| `SITE_URL` | Your deployed site's base URL (e.g. `https://slidesol.netlify.app`), used to build Paystack's `callback_url`. If unset, `create-order` still works but omits `callback_url`, so Paystack falls back to whatever default callback URL is configured in your Paystack dashboard. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL`
are auto-injected by Supabase into every Edge Function — you don't set these yourself.

## Deploying (manual steps)

Docker isn't required — this project's CLI version supports server-side bundling via
`--use-api`.

```bash
# 1. Point the CLI at the real SLIDESOL project (it may currently be linked elsewhere —
#    check with `supabase projects list` first, under the account that owns this project).
supabase link --project-ref huyfpjqgjtihttctdxdc

# 2. Set secrets (use your real Paystack test-mode key)
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxxxxxxx
supabase secrets set SITE_URL=https://your-deployed-site.example

# 3. Deploy all three functions
supabase functions deploy --use-api
```

Then, in the Paystack dashboard (Settings → API Keys & Webhooks), register the webhook URL:

```
https://huyfpjqgjtihttctdxdc.supabase.co/functions/v1/paystack-webhook
```

Test the full flow with Paystack's published test cards in test mode before ever
switching `PAYSTACK_SECRET_KEY` to a live (`sk_live_...`) key — and re-register the
webhook URL against the live-mode dashboard when you do.

## Assumptions baked into this implementation (override freely)

None of these come from the given database schema's constraints (no enum/CHECK values
were specified) — they're reasonable defaults chosen to keep this stage shippable:

- **Delivery fee**: two-tier — `getDeliveryFee()` in `supabase/functions/_shared/constants.ts` charges `DELIVERY_FEE_GREATER_ACCRA_GHS` for Greater Accra and `DELIVERY_FEE_OTHER_REGIONS_GHS` for every other region; pickup is always free. There's no real shipping-rate data anywhere in the schema, so both amounts are placeholders — change the two constants once real rates are known, nothing else needs to change. Mirrored client-side in `js/config.js`'s `estimateDeliveryFee()` for the checkout preview only; the amount actually charged always comes from `create-order`'s own calculation.
- **`order_type`**: `'standard'` or `'preorder'` — set to `'preorder'` if any line in the order needed the existing `is_preorder_available` allowance to pass stock validation.
- **`order_number` format**: `SLS-YYYYMMDD-XXXXXX` (random 6-char suffix), generated in the function since there's no sequence column in the schema.
- **Customer matching**: guests are matched to an existing `customers` row by `phone` (required field). An existing match is reused as-is, not overwritten, so a typo can't corrupt another customer's stored name.
- **Guest email fallback**: Paystack requires an email; when the optional checkout email field is blank, a synthetic `guest+<reference>@guest.slidesol.app` address is used **only** for the Paystack API call — never written to `customers.email`.

## Known MVP limitations (not solved here, on purpose)

- **No stock reservation.** Stock is validated but not held at order-creation time, only decremented after payment confirms. Two guests can both pass validation for the last unit; whoever's webhook lands second gets floored at zero rather than a negative number, but isn't blocked from "succeeding" at payment. A reservation system would need schema changes and is out of scope.
- **No cross-request DB transaction.** `create-order`'s several inserts are separate calls (Supabase's REST layer doesn't span a transaction across them without a Postgres function, which would be a schema change). Failures mid-sequence trigger best-effort compensating deletes, not a guaranteed rollback.
- **No `charge.failed` handling.** The webhook acknowledges and ignores any event other than `charge.success`.
- **Cart clears before payment is confirmed**, right before the redirect to Paystack (the order snapshot is already safely stored server-side by then). If payment then fails on Paystack's page, the customer returns to an empty cart and has to rebuild it.
