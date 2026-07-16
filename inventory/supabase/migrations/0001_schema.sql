-- =====================================================================
-- 0001_schema.sql — ระบบจัดการคลังสินค้า (Inventory Management)
-- หลักการ: ยอดคงเหลือทุกจุด = SUM(stock_movement.qty) เสมอ
--          ไม่มีคอลัมน์ balance ที่แก้ได้ (single source of truth = ledger)
-- Timezone ข้อมูลแสดงผล: Asia/Bangkok (เก็บเป็น timestamptz = UTC)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'staff', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum (
    'opening',       -- ยอดยกมา (ตั้งต้นจากการ sync Bplus)
    'in',            -- รับเข้า (stock-in)
    'out',           -- เบิกออก (stock-out)
    'transfer_out',  -- โอนออก (ต้นทาง)
    'transfer_in',   -- โอนเข้า (ปลายทาง)
    'adjust'         -- ปรับปรุง (นับสต๊อก / แก้ไข)
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles — ผูกกับ auth.users, เก็บ role
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        user_role not null default 'viewer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.profiles is 'ผู้ใช้ระบบ + บทบาท (admin/staff/viewer)';

-- ---------------------------------------------------------------------
-- warehouse — คลัง (multi-warehouse) เช่น DCMT, DCMTA
-- ---------------------------------------------------------------------
create table if not exists public.warehouse (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,           -- 'DCMT', 'DCMTA'
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.warehouse is 'คลังสินค้า';

-- ---------------------------------------------------------------------
-- product — สินค้า (sync จาก Bplus) + ค่ามาตรฐานกล่อง + reorder
-- ---------------------------------------------------------------------
create table if not exists public.product (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,          -- รหัสสินค้า (Bplus)
  name           text not null,
  category       text,                          -- หมวด
  color          text,                          -- สีสินค้า
  size           text,                          -- ขนาด
  model          text,                          -- รุ่นสินค้า
  unit           text not null default 'ตัว',
  barcode        text,                          -- บาร์โค้ดสินค้า (EAN/รหัส)
  box_pack_size  integer,                       -- ขนาดบรรจุ/กล่อง (ชิ้น/กล่อง)
  cost_current   numeric(14,2),                 -- ทุนปัจจุบัน (fallback valuation)
  reorder_point  numeric(14,2),                 -- ROP: on_hand <= นี้ = ต้องสั่ง
  par_level      numeric(14,2),                 -- ระดับเป้าหมาย (max)
  reorder_is_auto boolean not null default false,-- ROP มาจากยอดขายจริงหรือยัง
  has_lot        boolean not null default false,-- ติดตาม lot/expiry?
  is_active      boolean not null default true,
  source         text not null default 'bplus',
  bplus_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.product.box_pack_size is 'ขนาดบรรจุ/กล่อง — ใช้คำนวณจำนวนกล่อง + ปัดจำนวนสั่งเป็นกล่องเต็ม';
create index if not exists idx_product_category on public.product(category);
create index if not exists idx_product_barcode on public.product(barcode);
create index if not exists idx_product_active on public.product(is_active);

-- ---------------------------------------------------------------------
-- lot — ล็อต/วันหมดอายุ (เฉพาะสินค้าที่ has_lot)
-- ---------------------------------------------------------------------
create table if not exists public.lot (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.product(id) on delete cascade,
  lot_no       text not null,
  expiry_date  date,
  received_at  timestamptz not null default now(),
  unit_cost    numeric(14,2),                 -- ทุนของล็อตนี้ (FIFO)
  created_at   timestamptz not null default now(),
  unique (product_id, lot_no)
);
comment on table public.lot is 'ล็อตสินค้า + วันหมดอายุ (สำหรับ FIFO และแจ้งเตือนใกล้หมดอายุ)';
create index if not exists idx_lot_product on public.lot(product_id);
create index if not exists idx_lot_expiry on public.lot(expiry_date);

-- ---------------------------------------------------------------------
-- stock_movement — LEDGER (append-only). หัวใจของระบบ + audit trail
--   qty > 0 = เข้า, qty < 0 = ออก
--   โอนย้าย = 2 แถว (transfer_out + transfer_in) ผูกด้วย transfer_group_id
-- ---------------------------------------------------------------------
create table if not exists public.stock_movement (
  id                bigint generated always as identity primary key,
  product_id        uuid not null references public.product(id),
  warehouse_id      uuid not null references public.warehouse(id),
  lot_id            uuid references public.lot(id),
  qty               numeric(14,2) not null check (qty <> 0),
  m_type            movement_type not null,
  unit_cost         numeric(14,2),             -- ทุน/หน่วย ณ ตอนเคลื่อนไหว (สำหรับ FIFO)
  ref_doc           text,                      -- เลขเอกสารอ้างอิง
  transfer_group_id uuid,                      -- ผูกคู่โอนย้าย
  note              text,
  actor_id          uuid references public.profiles(id),
  actor_name        text,                      -- snapshot ชื่อผู้ทำ (audit)
  created_at        timestamptz not null default now(),

  -- ทิศทางต้องสอดคล้องกับชนิด
  constraint chk_dir check (
    (m_type in ('out','transfer_out') and qty < 0) or
    (m_type in ('opening','in','transfer_in') and qty > 0) or
    (m_type = 'adjust')            -- adjust เป็นได้ทั้ง +/-
  )
);
comment on table public.stock_movement is 'บัญชีเดินสต๊อก (append-only) = ยอดคงเหลือ + audit trail';
create index if not exists idx_mv_product_wh on public.stock_movement(product_id, warehouse_id);
create index if not exists idx_mv_wh on public.stock_movement(warehouse_id);
create index if not exists idx_mv_lot on public.stock_movement(lot_id);
create index if not exists idx_mv_created on public.stock_movement(created_at);
create index if not exists idx_mv_transfer on public.stock_movement(transfer_group_id);
create index if not exists idx_mv_ref on public.stock_movement(ref_doc);

-- immutability: ห้าม UPDATE/DELETE ledger (แก้ = ต้องลง movement 'adjust' ใหม่)
create or replace function public.fn_block_ledger_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'stock_movement เป็น append-only: ห้าม % (แก้ไขด้วยการลง movement ประเภท adjust แทน)', tg_op;
end $$;

drop trigger if exists trg_block_update on public.stock_movement;
create trigger trg_block_update before update on public.stock_movement
  for each row execute function public.fn_block_ledger_mutation();

drop trigger if exists trg_block_delete on public.stock_movement;
create trigger trg_block_delete before delete on public.stock_movement
  for each row execute function public.fn_block_ledger_mutation();

-- ---------------------------------------------------------------------
-- VIEWS — ยอดคงเหลือคำนวณจาก ledger เสมอ
-- ---------------------------------------------------------------------

-- ยอดคงเหลือ ต่อ (สินค้า x คลัง)
create or replace view public.v_stock_balance as
select
  m.product_id,
  m.warehouse_id,
  sum(m.qty)::numeric(14,2) as qty
from public.stock_movement m
group by m.product_id, m.warehouse_id;

-- ยอดคงเหลือ ต่อ (สินค้า x คลัง x ล็อต) — สำหรับ FIFO/expiry
create or replace view public.v_stock_balance_lot as
select
  m.product_id,
  m.warehouse_id,
  m.lot_id,
  sum(m.qty)::numeric(14,2) as qty
from public.stock_movement m
where m.lot_id is not null
group by m.product_id, m.warehouse_id, m.lot_id;

-- ยอดคงเหลือรวมทุกคลัง ต่อสินค้า + สถานะ reorder + คำนวณกล่อง
create or replace view public.v_product_stock as
select
  p.id                as product_id,
  p.sku,
  p.name,
  p.category,
  p.color,
  p.size,
  p.model,
  p.unit,
  p.barcode,
  p.box_pack_size,
  p.cost_current,
  p.reorder_point,
  p.par_level,
  p.has_lot,
  coalesce(b.on_hand, 0)                    as on_hand,
  -- จำนวนกล่องเต็ม + เศษ (ตามขนาดบรรจุ/กล่อง)
  case when p.box_pack_size > 0
       then floor(coalesce(b.on_hand,0) / p.box_pack_size) end   as full_boxes,
  case when p.box_pack_size > 0
       then (coalesce(b.on_hand,0)::int % p.box_pack_size) end    as loose_units,
  -- มูลค่าคงเหลือแบบง่าย (ทุนปัจจุบัน) — FIFO จริงดูที่ v_stock_valuation
  (coalesce(b.on_hand,0) * coalesce(p.cost_current,0))::numeric(14,2) as value_current_cost,
  -- สถานะสต๊อก
  case
    when p.reorder_point is null then 'unknown'
    when coalesce(b.on_hand,0) <= 0 then 'out'
    when coalesce(b.on_hand,0) <= p.reorder_point then 'reorder'
    when coalesce(b.on_hand,0) <= p.reorder_point * 1.3 then 'low'
    else 'ok'
  end as stock_status,
  -- จำนวนแนะนำให้สั่ง (ปัดขึ้นเป็นกล่องเต็ม)
  case
    when p.reorder_point is not null
     and coalesce(b.on_hand,0) <= p.reorder_point
     and p.box_pack_size > 0
    then ceil( greatest(coalesce(p.par_level, p.reorder_point) - coalesce(b.on_hand,0), 0)
               / p.box_pack_size ) * p.box_pack_size
  end as suggested_order_qty
from public.product p
left join (
  select product_id, sum(qty) as on_hand
  from public.stock_movement group by product_id
) b on b.product_id = p.id
where p.is_active;

-- ---------------------------------------------------------------------
-- updated_at trigger สำหรับ product
-- ---------------------------------------------------------------------
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_product_touch on public.product;
create trigger trg_product_touch before update on public.product
  for each row execute function public.fn_touch_updated_at();
