"use server";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface ProductLookup {
  found: boolean;
  sku?: string;
  name?: string;
  unit?: string;
  box_pack_size?: number | null;
  has_lot?: boolean;
  on_hand?: number;
  balances?: { warehouse_code: string; qty: number }[];
}

/** ค้นสินค้าจาก SKU หรือบาร์โค้ด + คงเหลือรายคลัง */
export async function lookupProduct(key: string): Promise<ProductLookup> {
  const k = key.trim();
  if (!k) return { found: false };
  const supabase = createSupabaseServer();

  const { data: prod } = await supabase
    .from("product")
    .select("id, sku, name, unit, box_pack_size, has_lot")
    .or(`sku.eq.${k},barcode.eq.${k}`)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!prod) return { found: false };

  // คงเหลือรายคลังจาก view
  const { data: bal } = await supabase
    .from("v_stock_balance")
    .select("warehouse_id, qty")
    .eq("product_id", prod.id);
  const { data: whs } = await supabase.from("warehouse").select("id, code");
  const codeById = Object.fromEntries((whs || []).map((w) => [w.id, w.code]));
  const balances = (bal || []).map((b) => ({ warehouse_code: codeById[b.warehouse_id] || "?", qty: Number(b.qty) }));
  const on_hand = balances.reduce((s, b) => s + b.qty, 0);

  return {
    found: true,
    sku: prod.sku,
    name: prod.name,
    unit: prod.unit,
    box_pack_size: prod.box_pack_size,
    has_lot: prod.has_lot,
    on_hand,
    balances,
  };
}
