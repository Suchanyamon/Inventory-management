import { createSupabaseServer } from "@/lib/supabase/server";
import { num, dt } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MTYPE: Record<string, { label: string; cls: string }> = {
  opening: { label: "ยอดยกมา", cls: "text-slate-500" },
  in: { label: "รับเข้า", cls: "text-emerald-600" },
  out: { label: "เบิกออก", cls: "text-red-600" },
  transfer_in: { label: "โอนเข้า", cls: "text-sky-600" },
  transfer_out: { label: "โอนออก", cls: "text-orange-600" },
  adjust: { label: "ปรับปรุง", cls: "text-purple-600" },
};

export default async function MovementsPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const q = (searchParams.q || "").trim();
  const type = searchParams.type || "";
  const supabase = createSupabaseServer();

  let query = supabase
    .from("stock_movement")
    .select("id, qty, m_type, ref_doc, note, actor_name, created_at, product:product_id(sku,name), warehouse:warehouse_id(code)")
    .order("created_at", { ascending: false })
    .limit(150);
  if (type) query = query.eq("m_type", type);

  let { data: rows } = await query;
  // client-side filter by sku/name text (embedded columns can't be OR-filtered easily)
  if (q && rows) {
    const qq = q.toLowerCase();
    rows = rows.filter((r: any) => r.product?.sku?.toLowerCase().includes(qq) || r.product?.name?.toLowerCase().includes(qq));
  }

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-xl font-semibold">ประวัติการเคลื่อนไหว</h1>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} className="input max-w-xs" placeholder="ค้นหา SKU / ชื่อ…" />
        <select name="type" defaultValue={type} className="input max-w-[180px]">
          <option value="">ทุกประเภท</option>
          {Object.entries(MTYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-primary shrink-0">กรอง</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <th className="th">เวลา</th><th className="th">SKU</th><th className="th">สินค้า</th>
              <th className="th">ประเภท</th><th className="th">คลัง</th><th className="th text-right">จำนวน</th>
              <th className="th">เอกสาร</th><th className="th">ผู้ทำ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {(rows || []).map((m: any) => {
              const t = MTYPE[m.m_type] || { label: m.m_type, cls: "" };
              return (
                <tr key={m.id}>
                  <td className="td whitespace-nowrap text-xs text-slate-500">{dt(m.created_at)}</td>
                  <td className="td font-mono text-xs">
                    <Link href={`/products/${encodeURIComponent(m.product?.sku)}`} className="text-brand hover:underline">{m.product?.sku}</Link>
                  </td>
                  <td className="td max-w-[200px] truncate">{m.product?.name}</td>
                  <td className={"td font-medium " + t.cls}>{t.label}</td>
                  <td className="td">{m.warehouse?.code}</td>
                  <td className={"td text-right font-medium " + (Number(m.qty) < 0 ? "text-red-600" : "text-emerald-600")}>
                    {Number(m.qty) > 0 ? "+" : ""}{num(Number(m.qty))}
                  </td>
                  <td className="td text-xs">{m.ref_doc || "-"}</td>
                  <td className="td text-xs text-slate-500">{m.actor_name || "-"}</td>
                </tr>
              );
            })}
            {(!rows || rows.length === 0) && <tr><td className="td text-slate-400" colSpan={8}>ไม่มีข้อมูล</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
