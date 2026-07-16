-- =====================================================================
-- 0010_product_stock_add_location.sql — เพิ่ม storage_location เข้า view
--   (คอลัมน์ต่อท้าย เพื่อให้ create-or-replace ได้ โดยไม่กระทบ v_reorder_list)
-- =====================================================================
create or replace view public.v_product_stock as
select
  p.id as product_id, p.sku, p.name, p.category, p.color, p.size, p.model,
  p.unit, p.barcode, p.box_pack_size, p.cost_current, p.reorder_point, p.par_level, p.has_lot,
  coalesce(b.on_hand, 0) as on_hand,
  case when p.box_pack_size > 0 then floor(coalesce(b.on_hand,0) / p.box_pack_size) end as full_boxes,
  case when p.box_pack_size > 0 then (coalesce(b.on_hand,0)::int % p.box_pack_size) end as loose_units,
  (coalesce(b.on_hand,0) * coalesce(p.cost_current,0))::numeric(14,2) as value_current_cost,
  case
    when p.reorder_point is null then 'unknown'
    when coalesce(b.on_hand,0) <= 0 then 'out'
    when coalesce(b.on_hand,0) <= p.reorder_point then 'reorder'
    when coalesce(b.on_hand,0) <= p.reorder_point * 1.3 then 'low'
    else 'ok'
  end as stock_status,
  case
    when p.reorder_point is not null and coalesce(b.on_hand,0) <= p.reorder_point and p.box_pack_size > 0
    then ceil( greatest(coalesce(p.par_level, p.reorder_point) - coalesce(b.on_hand,0), 0) / p.box_pack_size ) * p.box_pack_size
  end as suggested_order_qty,
  p.storage_location
from public.product p
left join (
  select product_id, sum(qty) as on_hand from public.stock_movement group by product_id
) b on b.product_id = p.id
where p.is_active;
