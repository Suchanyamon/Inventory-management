-- =====================================================================
-- 0006_security_hardening.sql — แก้ผลตรวจ Supabase security advisor
--   - view ทั้งหมดเป็น security_invoker (เคารพ RLS ผู้เรียก)
--   - trigger functions ตั้ง search_path
--   - ปิดสิทธิ์ anon/public เรียกฟังก์ชันภายใน/ธุรกรรม
-- =====================================================================

alter view public.v_stock_balance          set (security_invoker = on);
alter view public.v_stock_balance_lot       set (security_invoker = on);
alter view public.v_product_stock           set (security_invoker = on);
alter view public.v_stock_valuation         set (security_invoker = on);
alter view public.v_reorder_list            set (security_invoker = on);
alter view public.v_near_expiry             set (security_invoker = on);
alter view public.v_valuation_by_warehouse  set (security_invoker = on);
alter view public.v_valuation_by_category   set (security_invoker = on);

alter function public.fn_block_ledger_mutation() set search_path = public;
alter function public.fn_touch_updated_at()      set search_path = public;

revoke execute on function public.current_user_role()                                        from public, anon;
revoke execute on function public.fn_actor_name()                                            from public, anon, authenticated;
revoke execute on function public.fn_require_staff()                                         from public, anon, authenticated;
revoke execute on function public.is_admin()                                                 from public, anon;
revoke execute on function public.fn_box_breakdown(text,numeric)                             from public, anon;
revoke execute on function public.fn_handle_new_user()                                       from public, anon, authenticated;
revoke execute on function public.sp_stock_in(text,text,numeric,text,text,date,numeric,text) from public, anon;
revoke execute on function public.sp_stock_out(text,text,numeric,text,text)                  from public, anon;
revoke execute on function public.sp_transfer(text,text,text,numeric,text,text)              from public, anon;
revoke execute on function public.sp_adjust(text,text,numeric,text,text)                     from public, anon;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.fn_box_breakdown(text,numeric) to authenticated;
grant execute on function public.sp_stock_in(text,text,numeric,text,text,date,numeric,text) to authenticated;
grant execute on function public.sp_stock_out(text,text,numeric,text,text) to authenticated;
grant execute on function public.sp_transfer(text,text,text,numeric,text,text) to authenticated;
grant execute on function public.sp_adjust(text,text,numeric,text,text) to authenticated;

-- หมายเหตุ: WARN ที่เหลือ (authenticated เรียก sp_*/is_admin ได้) เป็นการออกแบบที่ตั้งใจ
-- ฟังก์ชัน sp_* ตรวจ role ภายในผ่าน fn_require_staff และ is_admin ใช้โดย RLS
