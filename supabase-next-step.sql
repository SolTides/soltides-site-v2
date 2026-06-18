-- SolTides: allow guest checkout orders to be inserted from the website.
-- This is insert-only. Public visitors cannot read existing orders.
-- Run this in Supabase SQL Editor before testing the new website zip.

-- Make sure RLS is enabled.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Re-runnable policies.
drop policy if exists "Guest checkout can insert orders" on public.orders;
drop policy if exists "Guest checkout can insert order items" on public.order_items;

create policy "Guest checkout can insert orders"
on public.orders
for insert
to anon, authenticated
with check (
  customer_email is not null
  and customer_name is not null
  and customer_address is not null
  and total_usd >= 0
  and total_btc >= 0
  and payment_status = 'pending'
  and shipping_status = 'not_shipped'
);

create policy "Guest checkout can insert order items"
on public.order_items
for insert
to anon, authenticated
with check (
  product_name is not null
  and quantity > 0
  and unit_price >= 0
  and line_total >= 0
);
