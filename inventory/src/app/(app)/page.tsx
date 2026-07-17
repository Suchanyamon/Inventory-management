import { createSupabaseServer } from "@/lib/supabase/server";
import { baht, num } from "@/lib/format";
import MonthlyFlow, { type FlowRow } from "@/components/MonthlyFlow";
import InvTurnover, { type InvRow } from "@/components/InvTurnover";
import SyncButton from "@/components/SyncButton";
import { getSessionProfile } from "@/lib/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

const NEAR_EXPIRY_DAYS = Number(process.env.NEAR_EXPIRY_DAYS || 90);

export default async function Dashboard() {
  const supabase = createSupabaseServer();
  const { profile } = await getSessionProfile();
  const isAdmin = profile?.role === "admin";

  const [{ data: valByWh }, { count: reorderCount }, { data: nearExp }, { data: flow }, { data: turnover }] = await Promise.all([
    supabase.from("v_valuation_by_warehouse").select("*"),
    supabase.from("v_reorder_list").select("*", { count: "exact", head: true }),
    supabase.from("v_near_expiry").select("sku,name,warehouse_code,lot_no,expiry_date,days_left,qty").lte("days_left", NEAR_EXPIRY_DAYS).gte("days_left", 0).limit(6),
    supabase.from("monthly_flow").select("business,category,month,month_idx,input_value,output_value,inventory_value").limit(2000),
    supabase.from("inv_turnover").select("sheet,business,month,month_idx,inv_ratio,dsi").limit(500),
  ]);

  const totalValue = (valByWh || []).reduce((s, w) => s + Number(w.total_value_fifo || 0), 0);
  const totalQty = (valByWh || []).reduce((s, w) => s + Number(w.total_qty || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">แดชบอร์ด</h1>
        {isAdmin && <SyncButton />}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi title="มูลค่าสต๊อก (FIFO)" value={baht(totalValue)} accent="text-brand" />
        <Kpi title="จำนวนคงเหลือรวม" value={num(totalQty) + " ชิ้น"} />
        <Kpi title="ต้องสั่งเพิ่ม" value={num(reorderCount || 0) + " รายการ"} accent="text-orange-600" href="/reorder" />
        <Kpi title="ใกล้หมดอายุ" value={num((nearExp || []).length) + " ล็อต"} accent="text-amber-600" />
      </div>

      {/* value per warehouse */}
      <div className="grid gap-3 md:grid-cols-2">
        {(valByWh || []).map((w) => (
          <div key={w.warehouse_code} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{w.warehouse_code}</div>
              <div className="text-xs text-slate-400">{w.warehouse_name}</div>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-brand">{baht(Number(w.total_value_fifo))}</div>
                <div className="text-xs text-slate-500">{num(Number(w.total_qty))} ชิ้น · {num(Number(w.sku_count))} SKU</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* monthly input vs output */}
      <MonthlyFlow rows={(flow as FlowRow[]) || []} />

      {/* inventory turnover: Inv.Ratio + DSI */}
      <InvTurnover rows={(turnover as InvRow[]) || []} />

      {/* near expiry */}
      {nearExp && nearExp.length > 0 && (
        <div className="card">
          <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">ใกล้หมดอายุ (ภายใน {NEAR_EXPIRY_DAYS} วัน)</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr><th className="th">SKU</th><th className="th">ล็อต</th><th className="th">คลัง</th><th className="th text-right">เหลือ(วัน)</th><th className="th text-right">จำนวน</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {nearExp.map((e, i) => (
                  <tr key={i}>
                    <td className="td font-mono text-xs">{e.sku}</td>
                    <td className="td">{e.lot_no}</td>
                    <td className="td">{e.warehouse_code}</td>
                    <td className="td text-right text-amber-600">{num(Number(e.days_left))}</td>
                    <td className="td text-right">{num(Number(e.qty))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ title, value, accent, href }: { title: string; value: string; accent?: string; href?: string }) {
  const body = (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className={"mt-1 text-xl font-bold " + (accent || "text-slate-800")}>{value}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
