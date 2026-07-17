-- =====================================================================
-- 0013_warehouse_stock_views.sql — สต็อกต่อคลัง (DCMT/DCMTA) + รายชื่อรุ่น
--   สำหรับแดชบอร์ด PWC19 (แสดง SKU + กรองตามรุ่น)
-- =====================================================================
create or replace view public.v_product_warehouse_stock as
select
  p.id as product_id, p.sku, p.name, p.model, p.category, p.size,
  coalesce(sum(m.qty) filter (where w.code = 'DCMT'), 0)::numeric(14,2)  as dcmt,
  coalesce(sum(m.qty) filter (where w.code = 'DCMTA'), 0)::numeric(14,2) as dcmta,
  coalesce(sum(m.qty), 0)::numeric(14,2) as total,
  (coalesce(sum(m.qty),0) * coalesce(p.cost_current,0))::numeric(14,2) as value_current
from public.product p
left join public.stock_movement m on m.product_id = p.id
left join public.warehouse w on w.id = m.warehouse_id
where p.is_active
group by p.id, p.sku, p.name, p.model, p.category, p.size, p.cost_current;
alter view public.v_product_warehouse_stock set (security_invoker = on);

create or replace view public.v_models as
select distinct model
from public.product
where is_active and model is not null and model <> ''
order by model;
alter view public.v_models set (security_invoker = on);

grant select on public.v_product_warehouse_stock, public.v_models to authenticated;
