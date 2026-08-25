create or replace view public.v_valuation_by_category_snapshot
with (security_invoker = true)
as
select
  coalesce(nullif(p.product_type, ''), '(ไม่ระบุ)') as category,
  sum(coalesce(s.total_dcmt_dcmta, 0))::numeric(16, 2) as total_qty,
  count(distinct p.sku) filter (where coalesce(s.total_dcmt_dcmta, 0) <> 0) as sku_count,
  sum(coalesce(s.total_dcmt_dcmta, 0) * coalesce(p.cost_current, 0))::numeric(16, 2) as total_value_fifo
from public.product_inventory_snapshot s
join public.products p on p.sku = s.sku
where coalesce(p.is_active, true)
group by coalesce(nullif(p.product_type, ''), '(ไม่ระบุ)')
order by sum(coalesce(s.total_dcmt_dcmta, 0) * coalesce(p.cost_current, 0)) desc;

drop view if exists public.v_abc_summary;

create view public.v_abc_summary
with (security_invoker = true)
as
with sku_values as (
  select
    p.sku,
    sum(coalesce(s.total_dcmt_dcmta, 0) * coalesce(p.cost_current, 0))::numeric(16, 2) as sku_value
  from public.product_inventory_snapshot s
  join public.products p on p.sku = s.sku
  where coalesce(p.is_active, true)
    and coalesce(s.total_dcmt_dcmta, 0) <> 0
  group by p.sku
), ranked as (
  select
    sku,
    sku_value,
    sum(sku_value) over () as total_value,
    sum(sku_value) over (order by sku_value desc, sku rows between unbounded preceding and current row) as running_value
  from sku_values
  where sku_value > 0
), classified as (
  select
    sku,
    sku_value,
    case
      when total_value <= 0 then 'C'
      when running_value / total_value <= 0.80 then 'A'
      when running_value / total_value <= 0.95 then 'B'
      else 'C'
    end as abc
  from ranked
), total as (
  select coalesce(sum(sku_value), 0) as total_value
  from sku_values
  where sku_value > 0
)
select
  bucket.abc,
  count(classified.sku)::bigint as sku_count,
  coalesce(sum(classified.sku_value), 0)::numeric(16, 2) as value,
  case
    when max(total.total_value) > 0
      then (coalesce(sum(classified.sku_value), 0) / max(total.total_value) * 100)::numeric(8, 2)
    else 0::numeric(8, 2)
  end as pct
from (values ('A'::text), ('B'::text), ('C'::text)) as bucket(abc)
cross join total
left join classified on classified.abc = bucket.abc
group by bucket.abc
order by bucket.abc;

grant select on public.v_valuation_by_category_snapshot to authenticated;
grant select on public.v_abc_summary to authenticated;
