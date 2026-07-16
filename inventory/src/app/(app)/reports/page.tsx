import { createSupabaseServer } from "@/lib/supabase/server";
import { num, baht } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = createSupabaseServer();
  const [{ data: byWh }, { data: byCat }] = await Promise.all([
    supabase.from("v_valuation_by_warehouse").select("*"),
    supabase.from("v_valuation_by_category").select("*").limit(30),
  ]);

  const grand = (byWh || []).reduce((s, w) => s + Number(w.total_value_fifo || 0), 0);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold">รายงานมูลค่าสต๊อกคงเหลือ (FIFO)</h1>
        <p className="text-sm text-slate-500">ตีมูลค่าตามล็อต/ชั้นที่รับเข้าก่อน (First-In First-Out)</p>
      </div>

      <div className="card p-5">
        <div className="text-sm text-slate-500">มูลค่ารวมทั้งหมด (FIFO)</div>
        <div className="text-3xl font-bold text-brand">{baht(grand)}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">แยกตามคลัง</h2></div>
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr><th className="th">คลัง</th><th className="th text-right">SKU</th><th className="th text-right">จำนวน</th><th className="th text-right">มูลค่า FIFO</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(byWh || []).map((w) => (
                <tr key={w.warehouse_code}>
                  <td className="td font-medium">{w.warehouse_code} <span className="text-xs text-slate-400">{w.warehouse_name}</span></td>
                  <td className="td text-right">{num(Number(w.sku_count))}</td>
                  <td className="td text-right">{num(Number(w.total_qty))}</td>
                  <td className="td text-right font-medium">{baht(Number(w.total_value_fifo))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">แยกตามหมวด (Top 30)</h2></div>
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 border-b border-slate-100 bg-slate-50">
                <tr><th className="th">หมวด</th><th className="th text-right">SKU</th><th className="th text-right">จำนวน</th><th className="th text-right">มูลค่า FIFO</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(byCat || []).map((c) => (
                  <tr key={c.category}>
                    <td className="td font-mono text-xs">{c.category}</td>
                    <td className="td text-right">{num(Number(c.sku_count))}</td>
                    <td className="td text-right">{num(Number(c.total_qty))}</td>
                    <td className="td text-right font-medium">{baht(Number(c.total_value_fifo))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
