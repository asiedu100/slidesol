-- Refund audit trail. `refunded` was already a valid payments.status/orders.payment_status
-- value per the existing CHECK constraints — these columns just record when/which Paystack
-- refund made that transition happen.
alter table payments
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reference text;
