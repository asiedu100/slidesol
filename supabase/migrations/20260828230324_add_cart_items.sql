-- Saved cart for signed-in customers. customers.auth_user_id already exists (added when
-- the schema was first designed, never wired up until now) — this is the only new table
-- customer accounts actually need.
create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  quantity integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, variant_id)
);
