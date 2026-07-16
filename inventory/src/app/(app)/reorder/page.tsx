import { createSupabaseServer } from "@/lib/supabase/server";
import ReorderBySize, { type ReorderRow } from "@/components/ReorderBySize";

export const dynamic = "force-dynamic";

export default async function ReorderPage() {
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("reorder_plan")
    .select("category, sku, name, grade, size, qty")
    .order("qty", { ascending: false })
    .limit(2000);

  return <ReorderBySize rows={(data as ReorderRow[]) || []} />;
}
