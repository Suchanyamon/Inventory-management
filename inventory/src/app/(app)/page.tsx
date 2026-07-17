import { createSupabaseServer } from "@/lib/supabase/server";
import MonthlyFlow, { type FlowRow } from "@/components/MonthlyFlow";
import InvTurnover, { type InvRow } from "@/components/InvTurnover";
import SyncButton from "@/components/SyncButton";
import { getSessionProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPolomaker() {
  const supabase = createSupabaseServer();
  const { profile } = await getSessionProfile();
  const isAdmin = profile?.role === "admin";

  const [{ data: flow }, { data: turnover }] = await Promise.all([
    supabase.from("monthly_flow").select("business,category,month,month_idx,input_value,output_value,inventory_value").limit(2000),
    supabase.from("inv_turnover").select("sheet,business,month,month_idx,inv_ratio,dsi").limit(500),
  ]);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">แดชบอร์ด POLOMAKER</h1>
        {isAdmin && <SyncButton />}
      </div>

      {/* 1) มูลค่าคงคลัง · Input vs Output รายเดือน */}
      <MonthlyFlow rows={(flow as FlowRow[]) || []} />

      {/* 2) Inventory Turnover — Inv.Ratio & DSI */}
      <InvTurnover rows={(turnover as InvRow[]) || []} />
    </div>
  );
}
