"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import type { Role } from "@/lib/auth";

const ROLES: Role[] = ["admin", "staff", "viewer"];

async function requireAdmin() {
  const { profile } = await getSessionProfile();
  if (profile?.role !== "admin") throw new Error("เฉพาะผู้ดูแลระบบเท่านั้น");
  return profile;
}

export type ActionResult = { ok: boolean; message: string };

/** สร้างผู้ใช้ใหม่ (admin เท่านั้น) */
export async function createUser(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("full_name") || "").trim();
    const role = String(formData.get("role") || "viewer") as Role;

    if (!email || !email.includes("@")) return { ok: false, message: "กรุณากรอกอีเมลให้ถูกต้อง" };
    if (password.length < 6) return { ok: false, message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" };
    if (!ROLES.includes(role)) return { ok: false, message: "บทบาทไม่ถูกต้อง" };

    const admin = createSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || email },
    });
    if (error) return { ok: false, message: error.message };

    // trigger fn_handle_new_user จะสร้าง profile ให้ — อัปเดต role/ชื่อ ตามที่เลือก
    const { error: upErr } = await admin
      .from("profiles")
      .update({ full_name: fullName || email, role, is_active: true })
      .eq("id", data.user!.id);
    if (upErr) return { ok: false, message: "สร้างบัญชีแล้ว แต่ตั้งบทบาทไม่สำเร็จ: " + upErr.message };

    revalidatePath("/settings");
    return { ok: true, message: `เพิ่มผู้ใช้ ${email} (${role}) สำเร็จ` };
  } catch (e: any) {
    return { ok: false, message: e?.message || "เกิดข้อผิดพลาด" };
  }
}

/** เปลี่ยนบทบาทผู้ใช้ */
export async function setRole(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const role = String(formData.get("role") || "") as Role;
  if (!id || !ROLES.includes(role)) return;
  const admin = createSupabaseAdmin();
  await admin.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/settings");
}

/** เปิด/ปิดการใช้งานบัญชี (ban ใน auth + is_active ใน profile) */
export async function toggleActive(formData: FormData): Promise<void> {
  const me = await requireAdmin();
  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "true"; // สถานะปัจจุบัน → จะสลับ
  if (!id || id === me.id) return; // กันปิดบัญชีตัวเอง
  const admin = createSupabaseAdmin();
  const next = !active;
  await admin.from("profiles").update({ is_active: next }).eq("id", id);
  await admin.auth.admin.updateUserById(id, { ban_duration: next ? "none" : "876000h" });
  revalidatePath("/settings");
}
