create or replace view public.v_product_stock
with (security_invoker = true)
as
with stock as (
  select
    sku,
    sum(dcmt) as dcmt,
    sum(dcmta) as dcmta,
    sum(total_dcmt_dcmta) as on_hand
  from public.product_inventory_snapshot
  where sku is not null and trim(sku) <> ''
  group by sku
)
select
  p.sku,
  coalesce(p.name_th, p.sku) as name,
  coalesce(p.business_group, p.product_type, p.grade) as category,
  p.size,
  null::text as color,
  p.units_per_carton as box_pack_size,
  loc.locations as storage_location,
  coalesce(stock.on_hand, 0::numeric) as on_hand,
  case
    when p.units_per_carton > 0
      then floor(coalesce(stock.on_hand, 0::numeric) / p.units_per_carton)
    else null::numeric
  end as full_boxes,
  case
    when p.units_per_carton > 0
      then mod(coalesce(stock.on_hand, 0::numeric), p.units_per_carton)
    else null::numeric
  end as loose_units,
  (coalesce(stock.on_hand, 0::numeric) * coalesce(p.cost_current, 0::numeric))::numeric as value_current_cost,
  case
    when coalesce(stock.on_hand, 0::numeric) <= 0 then 'out'::text
    when coalesce(stock.on_hand, 0::numeric) <= p.reorder_point then 'reorder'::text
    when coalesce(stock.on_hand, 0::numeric) <= (p.reorder_point * 1.25) then 'low'::text
    else 'ok'::text
  end as stock_status
from public.products p
left join stock on stock.sku = p.sku
left join lateral (
  select sl.locations
  from public.storage_location sl
  where p.sku like sl.code || '%'
  order by length(sl.code) desc, sl.code
  limit 1
) loc on true
where p.is_active;

grant select on public.v_product_stock to authenticated;

create or replace view public.v_dead_stock_snapshot
with (security_invoker = true)
as
select
  p.sku,
  coalesce(p.name_th, p.sku) as name,
  p.model,
  loc.locations as storage_location,
  coalesce(s.total_dcmt_dcmta, 0::numeric)::numeric(14,2) as on_hand,
  (coalesce(s.total_dcmt_dcmta, 0::numeric) * coalesce(p.cost_current, 0::numeric))::numeric(14,2) as tied_value
from public.products p
join public.product_inventory_snapshot s on s.sku = p.sku
left join lateral (
  select sl.locations
  from public.storage_location sl
  where p.sku like sl.code || '%'
  order by length(sl.code) desc, sl.code
  limit 1
) loc on true
where p.is_active
  and coalesce(s.total_dcmt_dcmta, 0::numeric) > 0;

grant select on public.v_dead_stock_snapshot to authenticated;
