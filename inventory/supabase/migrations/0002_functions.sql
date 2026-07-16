-- =====================================================================
-- 0002_functions.sql — ธุรกรรมสต๊อก (atomic) + FIFO valuation
-- ทุกการเปลี่ยนสต๊อกต้องผ่านฟังก์ชันเหล่านี้ → ลง stock_movement เท่านั้น
-- SECURITY DEFINER + ตรวจ role (staff/admin) ในตัว
-- =====================================================================

-- role ของผู้ใช้ปัจจุบัน
create or replace function public.current_user_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- บังคับสิทธิ์: ต้องเป็น staff หรือ admin
create or replace function public.fn_require_staff()
returns void language plpgsql stable security definer set search_path = public as $$
declare r user_role;
begin
  r := public.current_user_role();
  if r is null or r not in ('staff','admin') then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (ต้องเป็น staff หรือ admin)';
  end if;
end $$;

-- helper: snapshot ชื่อผู้ทำ
create or replace function public.fn_actor_name()
returns text language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- sp_stock_in — รับเข้า
-- ---------------------------------------------------------------------
create or replace function public.sp_stock_in(
  p_sku          text,
  p_warehouse    text,
  p_qty          numeric,
  p_ref_doc      text default null,
  p_lot_no       text default null,
  p_expiry       date  default null,
  p_unit_cost    numeric default null,
  p_note         text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_prod product;
  v_wh   warehouse;
  v_lot  uuid;
  v_id   bigint;
begin
  perform public.fn_require_staff();
  if p_qty is null or p_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;

  select * into v_prod from product where sku = p_sku and is_active;
  if not found then raise exception 'ไม่พบสินค้า SKU %', p_sku; end if;
  select * into v_wh from warehouse where code = p_warehouse and is_active;
  if not found then raise exception 'ไม่พบคลัง %', p_warehouse; end if;

  if v_prod.has_lot then
    if p_lot_no is null then raise exception 'สินค้านี้ต้องระบุเลขล็อต'; end if;
    insert into lot(product_id, lot_no, expiry_date, unit_cost)
      values (v_prod.id, p_lot_no, p_expiry, coalesce(p_unit_cost, v_prod.cost_current))
      on conflict (product_id, lot_no)
      do update set expiry_date = coalesce(excluded.expiry_date, lot.expiry_date),
                    unit_cost   = coalesce(excluded.unit_cost, lot.unit_cost)
      returning id into v_lot;
  end if;

  insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                             unit_cost, ref_doc, note, actor_id, actor_name)
  values (v_prod.id, v_wh.id, v_lot, p_qty, 'in',
          coalesce(p_unit_cost, v_prod.cost_current), p_ref_doc, p_note,
          auth.uid(), public.fn_actor_name())
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- sp_stock_out — เบิกออก (FEFO/FIFO เมื่อมี lot)
-- ---------------------------------------------------------------------
create or replace function public.sp_stock_out(
  p_sku        text,
  p_warehouse  text,
  p_qty        numeric,
  p_ref_doc    text default null,
  p_note       text default null
) returns setof bigint
language plpgsql security definer set search_path = public as $$
declare
  v_prod product;
  v_wh   warehouse;
  v_avail numeric;
  v_remaining numeric;
  v_take numeric;
  rec record;
  v_id bigint;
begin
  perform public.fn_require_staff();
  if p_qty is null or p_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;

  select * into v_prod from product where sku = p_sku and is_active;
  if not found then raise exception 'ไม่พบสินค้า SKU %', p_sku; end if;
  select * into v_wh from warehouse where code = p_warehouse and is_active;
  if not found then raise exception 'ไม่พบคลัง %', p_warehouse; end if;

  select coalesce(sum(qty),0) into v_avail
  from stock_movement where product_id = v_prod.id and warehouse_id = v_wh.id;
  if v_avail < p_qty then
    raise exception 'สต๊อกไม่พอ: คงเหลือ % ที่คลัง % (ขอเบิก %)', v_avail, p_warehouse, p_qty;
  end if;

  if v_prod.has_lot then
    v_remaining := p_qty;
    for rec in
      select bl.lot_id, bl.qty, l.unit_cost, l.expiry_date, l.received_at
      from v_stock_balance_lot bl
      join lot l on l.id = bl.lot_id
      where bl.product_id = v_prod.id and bl.warehouse_id = v_wh.id and bl.qty > 0
      order by l.expiry_date asc nulls last, l.received_at asc   -- FEFO → FIFO
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, rec.qty);
      insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                                 unit_cost, ref_doc, note, actor_id, actor_name)
      values (v_prod.id, v_wh.id, rec.lot_id, -v_take, 'out',
              rec.unit_cost, p_ref_doc, p_note, auth.uid(), public.fn_actor_name())
      returning id into v_id;
      return next v_id;
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then
      raise exception 'สต๊อกในล็อตไม่พอสำหรับเบิก (ขาด %)', v_remaining;
    end if;
  else
    insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                               unit_cost, ref_doc, note, actor_id, actor_name)
    values (v_prod.id, v_wh.id, null, -p_qty, 'out',
            v_prod.cost_current, p_ref_doc, p_note, auth.uid(), public.fn_actor_name())
    returning id into v_id;
    return next v_id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- sp_transfer — โอนย้ายข้ามคลัง (out ต้นทาง + in ปลายทาง ผูก group เดียว)
-- ยอดรวมทุกคลังไม่มีทางเพี้ยน: ผลรวม qty ของทั้ง group = 0
-- ---------------------------------------------------------------------
create or replace function public.sp_transfer(
  p_sku        text,
  p_from       text,
  p_to         text,
  p_qty        numeric,
  p_ref_doc    text default null,
  p_note       text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_prod product;
  v_from warehouse;
  v_to   warehouse;
  v_avail numeric;
  v_remaining numeric;
  v_take numeric;
  v_group uuid := gen_random_uuid();
  v_actor text := public.fn_actor_name();
  rec record;
begin
  perform public.fn_require_staff();
  if p_qty is null or p_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
  if p_from = p_to then raise exception 'คลังต้นทางและปลายทางต้องต่างกัน'; end if;

  select * into v_prod from product where sku = p_sku and is_active;
  if not found then raise exception 'ไม่พบสินค้า SKU %', p_sku; end if;
  select * into v_from from warehouse where code = p_from and is_active;
  if not found then raise exception 'ไม่พบคลังต้นทาง %', p_from; end if;
  select * into v_to from warehouse where code = p_to and is_active;
  if not found then raise exception 'ไม่พบคลังปลายทาง %', p_to; end if;

  select coalesce(sum(qty),0) into v_avail
  from stock_movement where product_id = v_prod.id and warehouse_id = v_from.id;
  if v_avail < p_qty then
    raise exception 'สต๊อกต้นทางไม่พอ: คงเหลือ % ที่ % (ขอโอน %)', v_avail, p_from, p_qty;
  end if;

  if v_prod.has_lot then
    v_remaining := p_qty;
    for rec in
      select bl.lot_id, bl.qty, l.unit_cost, l.expiry_date, l.received_at
      from v_stock_balance_lot bl
      join lot l on l.id = bl.lot_id
      where bl.product_id = v_prod.id and bl.warehouse_id = v_from.id and bl.qty > 0
      order by l.expiry_date asc nulls last, l.received_at asc
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, rec.qty);
      -- ออกจากต้นทาง
      insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                                 unit_cost, ref_doc, transfer_group_id, note, actor_id, actor_name)
      values (v_prod.id, v_from.id, rec.lot_id, -v_take, 'transfer_out',
              rec.unit_cost, p_ref_doc, v_group, p_note, auth.uid(), v_actor);
      -- เข้าปลายทาง (คง lot เดิม → FIFO/expiry ตามล็อตข้ามคลังได้)
      insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                                 unit_cost, ref_doc, transfer_group_id, note, actor_id, actor_name)
      values (v_prod.id, v_to.id, rec.lot_id, v_take, 'transfer_in',
              rec.unit_cost, p_ref_doc, v_group, p_note, auth.uid(), v_actor);
      v_remaining := v_remaining - v_take;
    end loop;
    if v_remaining > 0 then raise exception 'ล็อตต้นทางไม่พอโอน (ขาด %)', v_remaining; end if;
  else
    insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                               unit_cost, ref_doc, transfer_group_id, note, actor_id, actor_name)
    values (v_prod.id, v_from.id, null, -p_qty, 'transfer_out',
            v_prod.cost_current, p_ref_doc, v_group, p_note, auth.uid(), v_actor);
    insert into stock_movement(product_id, warehouse_id, lot_id, qty, m_type,
                               unit_cost, ref_doc, transfer_group_id, note, actor_id, actor_name)
    values (v_prod.id, v_to.id, null, p_qty, 'transfer_in',
            v_prod.cost_current, p_ref_doc, v_group, p_note, auth.uid(), v_actor);
  end if;

  return v_group;
end $$;

-- ---------------------------------------------------------------------
-- sp_adjust — ปรับปรุงยอด (นับสต๊อก) : ลง movement ส่วนต่าง
-- ---------------------------------------------------------------------
create or replace function public.sp_adjust(
  p_sku       text,
  p_warehouse text,
  p_counted   numeric,          -- ยอดที่นับได้จริง
  p_ref_doc   text default null,
  p_note      text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_prod product; v_wh warehouse; v_cur numeric; v_diff numeric; v_id bigint;
begin
  perform public.fn_require_staff();
  select * into v_prod from product where sku = p_sku and is_active;
  if not found then raise exception 'ไม่พบสินค้า SKU %', p_sku; end if;
  select * into v_wh from warehouse where code = p_warehouse and is_active;
  if not found then raise exception 'ไม่พบคลัง %', p_warehouse; end if;

  select coalesce(sum(qty),0) into v_cur
  from stock_movement where product_id = v_prod.id and warehouse_id = v_wh.id;
  v_diff := p_counted - v_cur;
  if v_diff = 0 then return null; end if;

  insert into stock_movement(product_id, warehouse_id, qty, m_type, unit_cost,
                             ref_doc, note, actor_id, actor_name)
  values (v_prod.id, v_wh.id, v_diff, 'adjust', v_prod.cost_current, p_ref_doc,
          coalesce(p_note,'') || format(' [นับได้ %s / ระบบ %s]', p_counted, v_cur),
          auth.uid(), public.fn_actor_name())
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- FIFO valuation — เดินชั้น inbound เก่าสุดก่อน
-- ---------------------------------------------------------------------
create or replace view public.v_stock_valuation as
with inb as (
  select product_id, warehouse_id, id, created_at,
         qty as qty_in, coalesce(unit_cost,0) as unit_cost,
         sum(qty) over (partition by product_id, warehouse_id
                        order by created_at, id
                        rows between unbounded preceding and current row) as cum_in
  from stock_movement where qty > 0
),
outb as (
  select product_id, warehouse_id, sum(-qty) as total_out
  from stock_movement where qty < 0 group by product_id, warehouse_id
),
layers as (
  select i.product_id, i.warehouse_id, i.unit_cost,
         greatest(0, least(i.qty_in, i.cum_in - coalesce(o.total_out,0))) as remain_qty
  from inb i
  left join outb o on o.product_id = i.product_id and o.warehouse_id = i.warehouse_id
)
select product_id, warehouse_id,
       sum(remain_qty)::numeric(14,2)              as remain_qty,
       sum(remain_qty * unit_cost)::numeric(14,2)  as fifo_value
from layers
group by product_id, warehouse_id
having sum(remain_qty) > 0;

comment on view public.v_stock_valuation is 'มูลค่าสต๊อกคงเหลือแบบ FIFO ต่อ (สินค้า x คลัง)';

-- grant execute เฉพาะ authenticated
grant execute on function public.sp_stock_in(text,text,numeric,text,text,date,numeric,text) to authenticated;
grant execute on function public.sp_stock_out(text,text,numeric,text,text) to authenticated;
grant execute on function public.sp_transfer(text,text,text,numeric,text,text) to authenticated;
grant execute on function public.sp_adjust(text,text,numeric,text,text) to authenticated;
