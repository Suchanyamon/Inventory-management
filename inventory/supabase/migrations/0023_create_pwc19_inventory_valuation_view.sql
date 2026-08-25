create or replace view public.v_pwc19_inventory_valuation_by_sku
with (security_invoker = true)
as
select
  p.sku,
  coalesce(nullif(p.name_th, ''), p.sku) as name,
  loc.locations as storage_location,
  coalesce(nullif(p.product_type, ''), '(ไม่ระบุ)') as product_type,
  coalesce(nullif(p.model, ''), nullif(s.model, ''), '(ไม่ระบุ)') as fabric,
  coalesce(nullif(p.grade, ''), nullif(s.grade, '')) as grade,
  coalesce(s.dcmt, 0)::numeric(14, 2) as dcmt_qty,
  case
    when coalesce(p.units_per_carton, 0) > 0 then floor(coalesce(s.dcmt, 0) / p.units_per_carton)
    else null
  end as dcmt_full_boxes,
  case
    when coalesce(p.units_per_carton, 0) > 0 then mod(coalesce(s.dcmt, 0), p.units_per_carton)
    else coalesce(s.dcmt, 0)
  end as dcmt_loose_units,
  (coalesce(s.dcmt, 0) * coalesce(p.cost_current, 0))::numeric(16, 2) as dcmt_value,
  coalesce(s.dcmta, 0)::numeric(14, 2) as dcmta_qty,
  case
    when coalesce(p.units_per_carton, 0) > 0 then floor(coalesce(s.dcmta, 0) / p.units_per_carton)
    else null
  end as dcmta_full_boxes,
  case
    when coalesce(p.units_per_carton, 0) > 0 then mod(coalesce(s.dcmta, 0), p.units_per_carton)
    else coalesce(s.dcmta, 0)
  end as dcmta_loose_units,
  (coalesce(s.dcmta, 0) * coalesce(p.cost_current, 0))::numeric(16, 2) as dcmta_value,
  coalesce(p.units_per_carton, 0)::numeric(14, 2) as units_per_carton,
  coalesce(p.cost_current, 0)::numeric(14, 2) as cost_current,
  s.source_updated_at
from public.product_inventory_snapshot s
join public.products p on p.sku = s.sku
left join lateral (
  select sl.locations
  from public.storage_location sl
  where p.sku like sl.code || '%'
  order by length(sl.code) desc, sl.code
  limit 1
) loc on true
where coalesce(p.is_active, true)
  and (coalesce(s.dcmt, 0) <> 0 or coalesce(s.dcmta, 0) <> 0);

grant select on public.v_pwc19_inventory_valuation_by_sku to authenticated;
