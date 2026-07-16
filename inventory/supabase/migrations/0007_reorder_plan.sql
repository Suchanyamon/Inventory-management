-- =====================================================================
-- 0007_reorder_plan.sql — แผนสั่งเพิ่มแยกตาม SIZE
--   sync จากหน้า "สั่งสต๊อก …" (7 ชีต) ในไฟล์ Rev.00 สั่งสต๊อก Product 2026
--   คอลัมน์ต้นทาง: "จำนวนที่ต้องการสั่งเพิ่ม" (เก็บเฉพาะ > 0)
-- =====================================================================
create table if not exists public.reorder_plan (
  id         bigint generated always as identity primary key,
  category   text not null,
  sku        text,
  name       text,
  grade      text,
  size       text,
  qty        integer not null,
  source     text not null default 'Rev.00 สั่งสต๊อก 2026',
  synced_at  timestamptz not null default now()
);
comment on table public.reorder_plan is 'แผนสั่งเพิ่มแยกตาม SIZE จากหน้า "สั่งสต๊อก" (คอลัมน์ จำนวนที่ต้องการสั่งเพิ่ม)';
create index if not exists idx_reorder_plan_cat on public.reorder_plan(category);
create index if not exists idx_reorder_plan_sku on public.reorder_plan(sku);

alter table public.reorder_plan enable row level security;

drop policy if exists p_reorder_read on public.reorder_plan;
create policy p_reorder_read on public.reorder_plan for select using (auth.uid() is not null);

drop policy if exists p_reorder_admin on public.reorder_plan;
create policy p_reorder_admin on public.reorder_plan for all using (public.is_admin()) with check (public.is_admin());

grant select on public.reorder_plan to authenticated;

-- ข้อมูลนำเข้าด้วยสคริปต์ sync (อ่านจากหน้า "สั่งสต๊อก" ผ่าน gviz) — 401 แถว ณ ครั้งแรก
