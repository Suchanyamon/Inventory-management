-- =====================================================================
-- 0014_pwc19_stock_insights.sql — views สำหรับแดชบอร์ด PWC19
--   สถานะสต็อก / dead stock / การใช้พื้นที่ตามโซน / ABC analysis
-- =====================================================================

-- 1) สรุปสถานะสต็อก
create or replace view public.v_stock_status_summary as
select stock_status, count(*) as sku_count,
       coalesce(sum(value_current_cost),0)::numeric(16,2) as value
from public.v_product_stock group by stock_status;
alter view public.v_stock_status_summary set (security_invoker = on);

-- 2) สต็อกค้าง — มีของแต่ยังไม่มีการเบิก/โอนออก
create or replace view public.v_dead_stock as
select p.sku, p.name, p.model, p.storage_location,
       b.on_hand::numeric(14,2) as on_hand,
       (b.on_hand * coalesce(p.cost_current,0))::numeric(14,2) as tied_value,
       lm.last_move
from public.product p
join (select product_id, sum(qty) as on_hand from public.stock_movement group by product_id having sum(qty) > 0) b
  on b.product_id = p.id
left join (select product_id, max(created_at) as last_out
           from public.stock_movement where m_type in ('out','transfer_out') group by product_id) o
  on o.product_id = p.id
left join (select product_id, max(created_at) as last_move
           from public.stock_movement group by product_id) lm on lm.product_id = p.id
where p.is_active and o.last_out is null;
alter view public.v_dead_stock set (security_invoker = on);

-- 3) การใช้พื้นที่ตามโซนเก็บ ("A1 01" → โซน "A1")
create or replace view public.v_zone_usage as
select split_part(trim(loc), ' ', 1) as zone, count(*) as slots, count(distinct s.code) as codes
from public.storage_location s, unnest(string_to_array(s.locations, ', ')) as loc
where trim(loc) <> '' group by 1 order by 1;
alter view public.v_zone_usage set (security_invoker = on);

-- 4) ABC analysis (A≤80% / B≤95% / C ที่เหลือ ของมูลค่าสะสม)
create or replace view public.v_abc_summary as
with ranked as (
  select product_id, fifo_value,
         sum(fifo_value) over () as grand,
         sum(fifo_value) over (order by fifo_value desc, product_id rows unbounded preceding) as cum
  from public.v_stock_valuation where fifo_value > 0
), classed as (
  select case when grand = 0 then 'C' when cum/grand <= 0.8 then 'A' when cum/grand <= 0.95 then 'B' else 'C' end as abc,
         fifo_value, grand from ranked
)
select abc, count(*) as sku_count, sum(fifo_value)::numeric(16,2) as value,
       round(100 * sum(fifo_value) / nullif(max(grand),0), 1) as pct
from classed group by abc;
alter view public.v_abc_summary set (security_invoker = on);

grant select on public.v_stock_status_summary, public.v_dead_stock, public.v_zone_usage, public.v_abc_summary to authenticated;
