-- =====================================================================
-- 0003_rls.sql — Row Level Security (admin / staff / viewer)
-- นโยบาย:
--   viewer : อ่านทุกอย่างได้ / เขียนสต๊อกไม่ได้
--   staff  : อ่านได้ + ทำรายการสต๊อกผ่าน sp_* (รับ/เบิก/โอน/ปรับ)
--   admin  : ทุกอย่าง + จัดการ master (product/warehouse) + role ผู้ใช้
-- การเขียน stock_movement ทำได้ผ่านฟังก์ชัน SECURITY DEFINER เท่านั้น
-- (ฟังก์ชันรันด้วยสิทธิ owner → bypass RLS ; ผู้ใช้ตรงๆ ถูกปฏิเสธ)
-- =====================================================================

alter table public.profiles       enable row level security;
alter table public.warehouse       enable row level security;
alter table public.product         enable row level security;
alter table public.lot             enable row level security;
alter table public.stock_movement  enable row level security;

-- helper: เป็น admin ไหม
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------------- profiles ----------------
drop policy if exists p_profiles_self_read on public.profiles;
create policy p_profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists p_profiles_admin_all on public.profiles;
create policy p_profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists p_profiles_self_update on public.profiles;
create policy p_profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
  -- ผู้ใช้แก้ชื่อตัวเองได้ แต่เปลี่ยน role ตัวเองไม่ได้

-- ---------------- warehouse ----------------
drop policy if exists p_wh_read on public.warehouse;
create policy p_wh_read on public.warehouse for select using (auth.uid() is not null);

drop policy if exists p_wh_admin on public.warehouse;
create policy p_wh_admin on public.warehouse for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- product ----------------
drop policy if exists p_prod_read on public.product;
create policy p_prod_read on public.product for select using (auth.uid() is not null);

drop policy if exists p_prod_admin on public.product;
create policy p_prod_admin on public.product for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------- lot ----------------
drop policy if exists p_lot_read on public.lot;
create policy p_lot_read on public.lot for select using (auth.uid() is not null);
-- เขียน lot: ผ่าน sp_stock_in (SECURITY DEFINER) เท่านั้น → ไม่มี policy insert สำหรับผู้ใช้

-- ---------------- stock_movement ----------------
drop policy if exists p_mv_read on public.stock_movement;
create policy p_mv_read on public.stock_movement for select using (auth.uid() is not null);
-- ไม่มี insert/update/delete policy → ผู้ใช้เขียนตรงไม่ได้ (ต้องผ่าน sp_*)

-- ---------------------------------------------------------------------
-- auto-create profile เมื่อมี auth user ใหม่ (role เริ่มต้น = viewer)
-- ---------------------------------------------------------------------
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'viewer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();
