import { createSupabaseServer } from "@/lib/supabase/server";
import { baht, num } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const NEAR_EXPIRY_DAYS = Number(process.env.NEAR_EXPIRY_DAYS || 90);
const PAGE = 60;

export default async function DashboardPWC19({ searchParams }: { searchParams: { model?: string; q?: string; p?: string } }) {
  const supabase = createSupabaseServer();
  const model = searchParams.model || "";
  const q = (searchParams.q || "").trim();
  const page = Math.max(1, Number(searchParams.p || 1));

  let stockQ = supabase
    .from("v_product_warehouse_stock")
    .select("sku,name,model,size,dcmt,dcmta,total", { count: "exact" })
    .order("total", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (model) stockQ = stockQ.eq("model", model);
  if (q) stockQ = stockQ.or(`sku.ilike.%${q}%,name.ilike.%${q}%`);

  const [{ data: valByWh }, { count: reorderCount }, { data: nearExp }, { data: models }, { data: stock, count: stockCount }] = await Promise.all([
    supabase.from("v_valuation_by_warehouse").select("*"),
    supabase.from("v_reorder_list").select("*", { count: "exact", head: true }),
    supabase.from("v_near_expiry").select("sku,name,warehouse_code,lot_no,expiry_date,days_left,qty").lte("days_left", NEAR_EXPIRY_DAYS).gte("days_left", 0).limit(6),
    supabase.from("v_models").select("model"),
    stockQ,
  ]);

  const totalValue = (valByWh || []).reduce((s, w) => s + Number(w.total_value_fifo || 0), 0);
  const totalQty = (valByWh || []).reduce((s, w) => s + Number(w.total_qty || 0), 0);
  const maxVal = Math.max(1, ...(valByWh || []).map((w) => Number(w.total_value_fifo || 0)));
  const totalPages = Math.max(1, Math.ceil((stockCount || 0) / PAGE));
  const qs = (extra: Record<string, string | number>) => {
    const s = new URLSearchParams({ ...(model ? { model } : {}), ...(q ? { q } : {}), ...extra } as any);
    return "?" + s.toString();
  };

  return (
    <div className="space-y-6 pb-16">
      <h1 className="text-xl font-semibold">แดชบอร์ด PWC19</h1>

      {/* KPI สรุป */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi title="มูลค่าสต๊อก (FIFO)" value={baht(totalValue)} accent="text-brand" />
        <Kpi title="จำนวนคงเหลือรวม" value={num(totalQty) + " ชิ้น"} />
        <Kpi title="ต้องสั่งเพิ่ม" value={num(reorderCount || 0) + " รายการ"} accent="text-orange-600" href="/reorder" />
        <Kpi title="ใกล้หมดอายุ" value={num((nearExp || []).length) + " ล็อต"} accent="text-amber-600" />
      </div>

      {/* KPI ต่อคลัง + กราฟเทียบ DCMT/DCMTA */}
      <div className="grid gap-3 md:grid-cols-2">
        {(valByWh || []).map((w) => (
          <div key={w.warehouse_code} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{w.warehouse_code}</div>
              <div className="text-xs text-slate-400">{w.warehouse_name}</div>
            </div>
            <div className="mt-2 text-2xl font-bold text-brand">{baht(Number(w.total_value_fifo))}</div>
            <div className="text-xs text-slate-500">{num(Number(w.total_qty))} ชิ้น · {num(Number(w.sku_count))} SKU</div>
            <div className="mt-2 h-2 rounded bg-slate-100">
              <div className="h-full rounded bg-brand" style={{ width: `${(Number(w.total_value_fifo) / maxVal) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* ตาราง SKU ต่อคลัง (กรองตามรุ่น) */}
      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <h2 className="font-semibold">สต็อกรายสินค้า — DCMT / DCMTA</h2>
          <p className="mt-0.5 text-xs text-slate-400">จาก "คงคลังสินค้า" (Rev.00 สั่งสต๊อก 2026) · กรองตามรุ่นได้</p>
          <form className="mt-3 flex flex-wrap gap-2">
            <select name="model" defaultValue={model} className="input max-w-[240px]">
              <option value="">ทุกรุ่น</option>
              {(models || []).map((m) => <option key={m.model} value={m.model}>{m.model}</option>)}
            </select>
            <input name="q" defaultValue={q} className="input max-w-[200px]" placeholder="ค้นหา SKU / ชื่อ…" />
            <button className="btn-primary shrink-0">กรอง</button>
            {(model || q) && <Link href="/pwc19" className="btn-ghost shrink-0">ล้าง</Link>}
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="th">SKU</th>
                <th className="th">สินค้า</th>
                <th className="th">รุ่น</th>
                <th className="th">ขนาด</th>
                <th className="th text-right">DCMT</th>
                <th className="th text-right">DCMTA</th>
                <th className="th text-right">รวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(stock || []).map((r) => (
                <tr key={r.sku} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs">
                    <Link href={`/products/${encodeURIComponent(r.sku)}`} className="text-brand hover:underline">{r.sku}</Link>
                  </td>
                  <td className="td max-w-[220px] truncate">{r.name}</td>
                  <td className="td text-slate-500">{r.model || "-"}</td>
                  <td className="td text-slate-500">{r.size || "-"}</td>
                  <td className="td text-right">{num(Number(r.dcmt))}</td>
                  <td className="td text-right">{num(Number(r.dcmta))}</td>
                  <td className="td text-right font-medium">{num(Number(r.total))}</td>
                </tr>
              ))}
              {(!stock || stock.length === 0) && <tr><td className="td text-slate-400" colSpan={7}>ไม่พบสินค้า</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center gap-2 border-t border-slate-100 p-3 text-sm">
          {page > 1 && <Link className="btn-ghost" href={qs({ p: page - 1 })}>← ก่อนหน้า</Link>}
          <span className="px-2 text-slate-500">หน้า {page}/{totalPages} · {num(stockCount || 0)} SKU</span>
          {page < totalPages && <Link className="btn-ghost" href={qs({ p: page + 1 })}>ถัดไป →</Link>}
        </div>
      </div>

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
