create table if not exists public.inventory (
  product_id text primary key,
  stock integer not null default 0 check (stock >= 0),
  availability_status text not null default 'auto' check (availability_status in ('auto', 'out_of_stock', 'coming_soon', 'limited', 'hidden')),
  enabled boolean not null default true,
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  show_stock_count boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists inventory_expires_at timestamptz;
alter table public.orders add column if not exists inventory_released_at timestamptz;
alter table public.orders add column if not exists inventory_release_reason text;
alter table public.order_items add column if not exists product_id text;
alter table public.order_items add column if not exists option_label text;

create index if not exists orders_inventory_expiry_idx
  on public.orders (inventory_expires_at)
  where payment_status = 'pending' and inventory_released_at is null;

insert into public.inventory (product_id, stock, availability_status, enabled, low_stock_threshold, show_stock_count)
values
  ('slp-3', 1, 'auto', true, 5, false),
  ('slp-2', 10, 'out_of_stock', true, 5, false),
  ('tesamorelin', 10, 'out_of_stock', true, 5, false),
  ('klow-blend', 6, 'auto', true, 5, false),
  ('bpc-157-tb-500', 0, 'out_of_stock', true, 5, false),
  ('mt-1', 5, 'auto', true, 5, false),
  ('nad+', 10, 'out_of_stock', true, 5, false)
on conflict (product_id) do nothing;

alter table public.inventory enable row level security;

drop policy if exists "Admins can read inventory" on public.inventory;
create policy "Admins can read inventory" on public.inventory
  for select to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update inventory" on public.inventory;
create policy "Admins can update inventory" on public.inventory
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.create_order_with_inventory(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_inventory public.inventory%rowtype;
  v_expires_at timestamptz := now() + interval '2 hours';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Order must contain at least one item.';
  end if;

  for v_item in
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer)
    group by x.product_id
    order by x.product_id
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity <= 0 then
      raise exception using errcode = '22023', message = 'Invalid inventory item.';
    end if;

    select * into v_inventory
    from public.inventory
    where product_id = v_item.product_id
    for update;

    if not found or not v_inventory.enabled
       or v_inventory.availability_status in ('out_of_stock', 'coming_soon', 'hidden')
       or v_inventory.stock < v_item.quantity then
      raise exception using errcode = 'P0001', message = 'inventory_unavailable:' || v_item.product_id;
    end if;
  end loop;

  insert into public.orders (
    order_number, user_id, customer_email, customer_name, customer_phone,
    customer_address, order_notes, product_details, total_usd, total_btc,
    bitcoin_address, payment_status, shipping_status, inventory_expires_at
  ) values (
    p_order->>'order_number', nullif(p_order->>'user_id', '')::uuid,
    p_order->>'customer_email', p_order->>'customer_name', nullif(p_order->>'customer_phone', ''),
    p_order->>'customer_address', nullif(p_order->>'order_notes', ''), nullif(p_order->>'product_details', ''),
    (p_order->>'total_usd')::numeric, (p_order->>'total_btc')::numeric,
    p_order->>'bitcoin_address', 'pending', 'not_shipped', v_expires_at
  ) returning * into v_order;

  insert into public.order_items (order_id, product_id, option_label, product_name, quantity, unit_price, line_total)
  select v_order.id, x.product_id, nullif(x.option_label, ''), x.product_name,
         x.quantity, x.unit_price, x.line_total
  from jsonb_to_recordset(p_items) as x(
    product_id text, option_label text, product_name text,
    quantity integer, unit_price numeric, line_total numeric
  );

  update public.inventory i
  set stock = i.stock - q.quantity,
      updated_at = now()
  from (
    select x.product_id, sum(x.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as x(product_id text, quantity integer)
    group by x.product_id
  ) q
  where i.product_id = q.product_id;

  return jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'inventory_expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.create_order_with_inventory(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_inventory(jsonb, jsonb) to service_role;

create or replace function public.admin_update_order(
  p_order_id uuid,
  p_payment_status text,
  p_shipping_status text,
  p_tracking_number text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_payment_status not in ('pending', 'paid', 'cancelled', 'refunded')
     or p_shipping_status not in ('not_shipped', 'processing', 'shipped', 'delivered', 'returned') then
    raise exception using errcode = '22023', message = 'Invalid order status.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found.'; end if;

  if v_order.payment_status = 'cancelled'
     and v_order.inventory_released_at is not null
     and p_payment_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'A cancelled order cannot be reopened after its stock was released.';
  end if;

  if p_payment_status = 'cancelled'
     and v_order.payment_status <> 'cancelled'
     and v_order.inventory_expires_at is not null
     and v_order.inventory_released_at is null then
    update public.inventory i
    set stock = i.stock + q.quantity, updated_at = now()
    from (
      select product_id, sum(quantity)::integer quantity
      from public.order_items
      where order_id = p_order_id and product_id is not null
      group by product_id
    ) q
    where i.product_id = q.product_id;

    update public.orders
    set inventory_released_at = now(), inventory_release_reason = 'cancelled'
    where id = p_order_id;
  end if;

  update public.orders
  set payment_status = p_payment_status,
      shipping_status = p_shipping_status,
      tracking_number = nullif(p_tracking_number, ''),
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_update_order(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_order(uuid, text, text, text) to authenticated;

create or replace function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select id from public.orders
    where payment_status = 'pending'
      and inventory_expires_at <= now()
      and inventory_released_at is null
    order by inventory_expires_at
    for update skip locked
  loop
    update public.inventory i
    set stock = i.stock + q.quantity, updated_at = now()
    from (
      select product_id, sum(quantity)::integer quantity
      from public.order_items
      where order_id = v_order.id and product_id is not null
      group by product_id
    ) q
    where i.product_id = q.product_id;

    update public.orders
    set payment_status = 'cancelled', inventory_released_at = now(),
        inventory_release_reason = 'payment_window_expired', updated_at = now()
    where id = v_order.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_pending_orders() from public, anon, authenticated;
grant execute on function public.expire_pending_orders() to service_role;
