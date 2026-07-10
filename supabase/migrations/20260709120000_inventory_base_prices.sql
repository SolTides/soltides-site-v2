alter table public.inventory
  add column if not exists price numeric(10, 2)
  check (price is null or price >= 0);

update public.inventory
set price = case product_id
  when 'slp-3' then 200
  when 'slp-2' then 65
  when 'tesamorelin' then 50
  when 'klow-blend' then 90
  when 'bpc-157-tb-500' then 80
  when 'mt-1' then 40
  else price
end
where product_id in ('slp-3', 'slp-2', 'tesamorelin', 'klow-blend', 'bpc-157-tb-500', 'mt-1')
  and price is null;
