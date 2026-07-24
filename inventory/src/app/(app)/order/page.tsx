import { createSupabaseServer } from "@/lib/supabase/server";
import StockOrderForm, { type OrderRow } from "@/components/StockOrderForm";

export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("stock_order_plan")
    .select("category, code, name, grade, annual_target, current_stock, wip, stock_wip, reorder_point, order_qty")
    .order("reorder_point", { ascending: false })
    .limit(2000);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD

  return <StockOrderForm rows={(data as OrderRow[]) || []} today={today} />;
}
