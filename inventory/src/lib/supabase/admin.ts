import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client แบบ service-role (ข้าม RLS) — ใช้ฝั่ง server เท่านั้น
 * เช่น สร้าง/แก้ผู้ใช้, งาน sync. ห้าม import ในโค้ดฝั่ง client เด็ดขาด
 */
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
