"use server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface OpResult {
  ok: boolean;
  message: string;
}

async function guardWrite(): Promise<string | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "กรุณาเข้าสู่ระบบ";
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!data || (data.role !== "admin" && data.role !== "staff")) return "ไม่มีสิทธิ์ทำรายการ (ต้องเป็น staff/admin)";
  return null;
}

function revalidateAll() {
  ["/", "/products", "/reorder", "/reports", "/movements"].forEach((p) => revalidatePath(p));
}

export async function doStockIn(_prev: OpResult | null, fd: FormData): Promise<OpResult> {
  const err = await guardWrite();
  if (err) return { ok: false, message: err };
  const supabase = createSupabaseServer();
  const { error } = await supabase.rpc("sp_stock_in", {
    p_sku: String(fd.get("sku") || "").trim(),
    p_warehouse: String(fd.get("warehouse") || ""),
    p_qty: Number(fd.get("qty")),
    p_ref_doc: String(fd.get("ref_doc") || "") || null,
    p_lot_no: String(fd.get("lot_no") || "") || null,
    p_expiry: String(fd.get("expiry") || "") || null,
    p_unit_cost: fd.get("unit_cost") ? Number(fd.get("unit_cost")) : null,
    p_note: String(fd.get("note") || "") || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateAll();
  return { ok: true, message: "รับเข้าสำเร็จ" };
}

export async function doStockOut(_prev: OpResult | null, fd: FormData): Promise<OpResult> {
  const err = await guardWrite();
  if (err) return { ok: false, message: err };
  const supabase = createSupabaseServer();
  const { error } = await supabase.rpc("sp_stock_out", {
    p_sku: String(fd.get("sku") || "").trim(),
    p_warehouse: String(fd.get("warehouse") || ""),
    p_qty: Number(fd.get("qty")),
    p_ref_doc: String(fd.get("ref_doc") || "") || null,
    p_note: String(fd.get("note") || "") || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateAll();
  return { ok: true, message: "เบิกออกสำเร็จ" };
}

export async function doTransfer(_prev: OpResult | null, fd: FormData): Promise<OpResult> {
  const err = await guardWrite();
  if (err) return { ok: false, message: err };
  const supabase = createSupabaseServer();
  const { error } = await supabase.rpc("sp_transfer", {
    p_sku: String(fd.get("sku") || "").trim(),
    p_from: String(fd.get("from_wh") || ""),
    p_to: String(fd.get("to_wh") || ""),
    p_qty: Number(fd.get("qty")),
    p_ref_doc: String(fd.get("ref_doc") || "") || null,
    p_note: String(fd.get("note") || "") || null,
  });
  if (error) return { ok: false, message: error.message };
  revalidateAll();
  return { ok: true, message: "โอนย้ายสำเร็จ" };
}
