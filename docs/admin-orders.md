# Admin orders & customers

Read access to real orders/payments/customers data, plus the one write an operations
view needs: moving an order through its fulfilment lifecycle.

## Endpoints (`admin-orders` Edge Function)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | list, newest first; `?customer_id=` filters to one customer |
| GET | `/orders/:id` | order + customer + line items + payment |
| PATCH | `/orders/:id` | `{order_status}` only — see below |
| GET | `/customers` | list with `order_count` (all orders) and `total_spent` (paid orders only) |

Same auth model as every other admin function: `Authorization: Bearer <admin session
token>`, verified via the shared `_shared/require-admin.ts` helper, service-role reads
server-side since none of these tables are publicly readable.

## Why `PATCH /orders/:id` can't touch `payment_status`

Only `order_status` (the fulfilment lifecycle) is writable here. `payment_status` stays
under the exclusive control of the Paystack webhook's verified-transaction flow — an
admin marking an order "paid" by hand would undercut the "never trust payment status
except from a verified webhook" rule this project has held since the Paystack stage. If
manual payment reconciliation (bank transfer, refund) is ever needed, that's a separate,
deliberately-scoped feature — not a side effect of an orders list.

## Assumptions

`order_status` has no enum in the given schema. This stage extends it beyond the
`pending`/`processing` values `create-order`/the webhook already set, adding `shipped`,
`fulfilled`, `cancelled` as the values an admin can move an order through
(`supabase/functions/_shared/constants.ts`'s `ORDER_STATUS` / `ADMIN_SETTABLE_ORDER_STATUSES`,
mirrored in `js/admin/orders.js` and `js/admin/order-detail.js`'s `ORDER_STATUS_OPTIONS`
— kept in sync manually, same as `GHANA_REGIONS`). `total_spent` only counts orders with
`payment_status = 'paid'`; `order_count` counts every order regardless of outcome.

## Out of scope for this stage

`admin/index.html`'s dashboard stats still read a dead `localStorage` key — real numbers
there is a natural follow-on, not done here since it wasn't the scope picked for this stage.
