-- SolTides customer accounts support
-- Run this in Supabase SQL Editor if profiles/order history do not work.

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  default_shipping_name text,
  default_shipping_address text,
  default_shipping_city text,
  default_shipping_state text,
  default_shipping_zip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Users can view their profile" on public.profiles;
drop policy if exists "Users can insert their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;

create policy "Users can view their profile"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "Users can insert their profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "Users can update their profile"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

-- Recreate order viewing policies to support customer order history.
drop policy if exists "Users and admins can view orders" on public.orders;
create policy "Users and admins can view orders"
on public.orders
for select
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "Users and admins can view order items" on public.order_items;
create policy "Users and admins can view order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin(auth.uid()))
  )
);

create index if not exists idx_orders_user_id on public.orders(user_id);
