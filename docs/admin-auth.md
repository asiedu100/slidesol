# Admin authentication

Real Supabase Auth login for the `admin/` panel, replacing the old hardcoded-password
demo stub. There is deliberately no public admin signup page.

## How it works

1. `admin/*.html` pages call `requireAdmin(() => { ... })` (from `js/admin/auth.js`) instead of running their page logic directly.
2. If there's no signed-in session, a login form (email + password) is shown.
3. On sign-in, the frontend calls `supabase.auth.signInWithPassword()` — this is a normal Supabase Auth call, no Edge Function involved.
4. The signed-in user's own session token is then sent to `GET /functions/v1/admin-verify`, which checks the `profiles` table (via the service-role key, server-side) for a row matching that user's id with `role = 'admin'` and `is_active = true`.
5. Not authorized → the frontend signs the user back out immediately and shows a rejection message. Authorized → the real admin page content is restored and its own script runs.
6. Every admin page has a "Sign out" button (`[data-admin-logout]`) that calls `supabase.auth.signOut()`.

**Why the extra Edge Function instead of a direct table read**: reading `profiles` straight from the browser after sign-in would need an RLS policy allowing a user to read their own row. Whether that policy exists wasn't known, and adding one wasn't something to do unasked. Routing the check through a service-role Edge Function (the same pattern as `create-order`/`order-status`) sidesteps that entirely — no RLS policy is required either way.

## Provisioning your first admin account (manual — can't be done for you)

1. Supabase Dashboard → Authentication → Users → add a user with an email and password.
2. Supabase Dashboard → Table Editor → `profiles` → insert a row where `id` is that new user's id (copy it from the Users list), `role` is `'admin'`, `is_active` is `true`, and `full_name`/`phone` as you like.
3. Deploy `admin-verify` along with the others: `supabase functions deploy --use-api` deploys everything under `supabase/functions/`, so no separate command is needed if you're redeploying anyway.

## Assumption to confirm

`profiles.role` has no enum/CHECK constraint in the given schema, so the authorized value is a plain string constant: `ADMIN_ROLE = 'admin'` in `supabase/functions/_shared/constants.ts`. Change that one line if your data uses something else (e.g. `'owner'`, `'staff'`), or extend `admin-verify` to accept a list of roles if you want more than one.

## Out of scope for this stage

The dashboard stats, product table, and orders/customers screens still read stale placeholder data (`js/admin/dashboard.js`, `js/admin/orders.js`, `js/admin/products.js` haven't been touched) — only the login gate itself is real now. Those are separate stages.
