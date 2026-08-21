-- =====================================================================
-- 0017_restore_product_stock_values.sql
-- คืนค่าคอลัมน์ในหน้า "สินค้า":
--   - บรรจุ/กล่อง
--   - กล่อง+เศษ
--   - มูลค่า
--
-- หมายเหตุ:
-- public.products ใช้ units_per_carton เป็นจำนวนบรรจุต่อกล่อง
-- และใช้ cost_current สำหรับคำนวณมูลค่าคงคลัง
-- =====================================================================

alter table public.products
  add column if not exists cost_current numeric(14,2);

comment on column public.products.units_per_carton is
  'จำนวนบรรจุต่อกล่อง ใช้แสดงคอลัมน์ บรรจุ/กล่อง และคำนวณ กล่อง+เศษ';

comment on column public.products.cost_current is
  'ต้นทุนปัจจุบันต่อชิ้น ใช้คำนวณมูลค่าคงคลังในหน้า สินค้า';

create or replace view public.v_product_stock
with (security_invoker = true)
as
with stock as (
  select
    stock_order_plan.code as sku,
    max(stock_order_plan.current_stock) as on_hand
  from public.stock_order_plan
  where stock_order_plan.code is not null
    and trim(stock_order_plan.code) <> ''
  group by stock_order_plan.code
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
left join loc on loc.code = p.sku;

grant select on public.v_product_stock to authenticated;
