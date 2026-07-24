import { createSupabaseServer } from "@/lib/supabase/server";
import StockOrderForm, { type SizeRow } from "@/components/StockOrderForm";

export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("order_form_size")
    .select("category, code, name, grade, annual_target, size_raw, current_stock, wip, reorder_point")
    .limit(5000);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD

  return <StockOrderForm rows={(data as SizeRow[]) || []} today={today} />;
}
