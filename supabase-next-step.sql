-- SolTides: keep order writes behind the Netlify create-order function.
-- First configure SUPABASE_SERVICE_ROLE_KEY in Netlify, then run this file.

-- Make sure RLS is enabled.
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Remove the legacy public-write policies. The service role used by the server
-- function bypasses RLS; browsers must never receive that key.
drop policy if exists "Guest checkout can insert orders" on public.orders;
drop policy if exists "Guest checkout can insert order items" on public.order_items;
