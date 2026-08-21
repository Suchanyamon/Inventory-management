-- =====================================================================
-- 0019_sync_inventory_snapshot_from_stock_sheet.sql
-- แหล่งจำนวนคงเหลือจาก Google Sheet:
--   "Rev.00 สั่งสต๊อก Product 2026 ยอดขายย้อนหลัง 2025" / tab "คงคลังสินค้า"
-- ใช้เฉพาะคลัง DCMT + DCMTA สำหรับหน้า "สินค้า" และแดชบอร์ด PWC19
-- =====================================================================

create table if not exists public.product_inventory_snapshot (
  id bigserial primary key,
  sku text not null,
  dcmt numeric not null default 0,
  dcmta numeric not null default 0,
  total_dcmt_dcmta numeric not null default 0,
  sheet_total numeric,
  grade text,
  model text,
  source_row integer,
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_inventory_snapshot_sku
  on public.product_inventory_snapshot (sku);

alter table public.product_inventory_snapshot enable row level security;

drop policy if exists p_product_inventory_snapshot_read on public.product_inventory_snapshot;
create policy p_product_inventory_snapshot_read
  on public.product_inventory_snapshot
  for select
  to authenticated
  using (true);

grant select on public.product_inventory_snapshot to authenticated;

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
),
loc as (
  select
    storage_location.code,
    max(storage_location.locations) as locations
  from public.storage_location
  group by storage_location.code
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
left join loc on loc.code = p.sku
where p.is_active;

grant select on public.v_product_stock to authenticated;

create or replace view public.v_product_warehouse_stock_snapshot
with (security_invoker = true)
as
with stock as (
  select
    sku,
    sum(dcmt) as dcmt,
    sum(dcmta) as dcmta,
    sum(total_dcmt_dcmta) as total
  from public.product_inventory_snapshot
  where sku is not null and trim(sku) <> ''
  group by sku
)
select
  p.sku,
  coalesce(p.name_th, p.sku) as name,
  p.model,
  p.size,
  coalesce(stock.dcmt, 0::numeric)::numeric(14,2) as dcmt,
  coalesce(stock.dcmta, 0::numeric)::numeric(14,2) as dcmta,
  coalesce(stock.total, 0::numeric)::numeric(14,2) as total
from public.products p
left join stock on stock.sku = p.sku
where p.is_active;

grant select on public.v_product_warehouse_stock_snapshot to authenticated;

create or replace view public.v_valuation_by_warehouse_snapshot
with (security_invoker = true)
as
select
  wh.warehouse_code,
  wh.warehouse_name,
  sum(wh.qty)::numeric(16,2) as total_qty,
  count(distinct wh.sku) filter (where wh.qty <> 0) as sku_count,
  sum(wh.qty * coalesce(p.cost_current, 0::numeric))::numeric(16,2) as total_value_fifo
from (
  select sku, 'DCMT'::text as warehouse_code, 'DCMT'::text as warehouse_name, dcmt as qty
  from public.product_inventory_snapshot
  union all
  select sku, 'DCMTA'::text as warehouse_code, 'DCMTA'::text as warehouse_name, dcmta as qty
  from public.product_inventory_snapshot
) wh
join public.products p on p.sku = wh.sku
where p.is_active
group by wh.warehouse_code, wh.warehouse_name
order by wh.warehouse_code;

grant select on public.v_valuation_by_warehouse_snapshot to authenticated;

create or replace view public.v_valuation_by_category_snapshot
with (security_invoker = true)
as
select
  coalesce(p.business_group, p.product_type, p.grade, '(ไม่ระบุ)') as category,
  sum(s.total_dcmt_dcmta)::numeric(16,2) as total_qty,
  count(distinct p.sku) filter (where s.total_dcmt_dcmta <> 0) as sku_count,
  sum(s.total_dcmt_dcmta * coalesce(p.cost_current, 0::numeric))::numeric(16,2) as total_value_fifo
from public.product_inventory_snapshot s
join public.products p on p.sku = s.sku
where p.is_active
group by 1
order by total_value_fifo desc;

grant select on public.v_valuation_by_category_snapshot to authenticated;

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
left join (
  select storage_location.code, max(storage_location.locations) as locations
  from public.storage_location
  group by storage_location.code
) loc on loc.code = p.sku
where p.is_active
  and coalesce(s.total_dcmt_dcmta, 0::numeric) > 0;

grant select on public.v_dead_stock_snapshot to authenticated;
