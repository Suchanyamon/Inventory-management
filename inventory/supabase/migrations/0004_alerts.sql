-- =====================================================================
-- 0004_alerts.sql — แจ้งเตือน + คู่มือกล่อง + สรุปมูลค่า
-- =====================================================================

-- รายการต้องสั่งเพิ่ม (reorder) — พร้อมจำนวนแนะนำ (ปัดกล่องเต็ม)
create or replace view public.v_reorder_list as
select
  ps.*,
  case when ps.box_pack_size > 0 and ps.suggested_order_qty is not null
       then ceil(ps.suggested_order_qty / ps.box_pack_size) end as suggested_boxes
from public.v_product_stock ps
where ps.stock_status in ('out','reorder','low')
order by
  case ps.stock_status when 'out' then 0 when 'reorder' then 1 else 2 end,
  ps.on_hand asc;

comment on view public.v_reorder_list is 'สินค้าที่ต้องสั่งเพิ่ม เรียงตามความเร่งด่วน';

-- สินค้าใกล้หมดอายุ — ล็อตที่ยังมีของและใกล้ครบกำหนด
create or replace view public.v_near_expiry as
select
  p.sku, p.name, p.unit,
  w.code as warehouse_code,
  l.lot_no, l.expiry_date,
  (l.expiry_date - current_date) as days_left,
  bl.qty as qty
from public.v_stock_balance_lot bl
join public.lot l       on l.id = bl.lot_id
join public.product p   on p.id = bl.product_id
join public.warehouse w on w.id = bl.warehouse_id
where bl.qty > 0 and l.expiry_date is not null
order by l.expiry_date asc;

comment on view public.v_near_expiry is 'ล็อตที่ยังมีของ เรียงตามวันหมดอายุ (กรอง days_left ที่แอป)';

-- สรุปมูลค่าสต๊อก FIFO ต่อคลัง
create or replace view public.v_valuation_by_warehouse as
select
  w.code as warehouse_code,
  w.name as warehouse_name,
  count(distinct v.product_id) as sku_count,
  sum(v.remain_qty)::numeric(14,2)  as total_qty,
  sum(v.fifo_value)::numeric(14,2)  as total_value_fifo
from public.v_stock_valuation v
join public.warehouse w on w.id = v.warehouse_id
group by w.code, w.name
order by w.code;

-- สรุปมูลค่าสต๊อก FIFO ต่อหมวด
create or replace view public.v_valuation_by_category as
select
  coalesce(p.category,'(ไม่ระบุ)') as category,
  count(distinct v.product_id) as sku_count,
  sum(v.remain_qty)::numeric(14,2) as total_qty,
  sum(v.fifo_value)::numeric(14,2) as total_value_fifo
from public.v_stock_valuation v
join public.product p on p.id = v.product_id
group by coalesce(p.category,'(ไม่ระบุ)')
order by total_value_fifo desc;

-- ตัวช่วย: แตกจำนวนเป็น "กล่องเต็ม + เศษ" สำหรับ SKU (ใช้ตอนรับเข้า)
create or replace function public.fn_box_breakdown(p_sku text, p_qty numeric)
returns table(box_pack_size int, full_boxes int, loose_units int)
language sql stable security definer set search_path = public as $$
  select p.box_pack_size,
         case when p.box_pack_size > 0 then floor(p_qty / p.box_pack_size)::int end,
         case when p.box_pack_size > 0 then (p_qty::int % p.box_pack_size) end
  from public.product p where p.sku = p_sku;
$$;
grant execute on function public.fn_box_breakdown(text,numeric) to authenticated;
