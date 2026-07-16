import { createSupabaseServer } from "@/lib/supabase/server";
import { num, baht, dt, boxBreakdown } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MTYPE: Record<string, { label: string; cls: string }> = {
  opening: { label: "ยอดยกมา", cls: "text-slate-500" },
  in: { label: "รับเข้า", cls: "text-emerald-600" },
  out: { label: "เบิกออก", cls: "text-red-600" },
  transfer_in: { label: "โอนเข้า", cls: "text-sky-600" },
  transfer_out: { label: "โอนออก", cls: "text-orange-600" },
  adjust: { label: "ปรับปรุง", cls: "text-purple-600" },
};

export default async function ProductDetail({ params }: { params: { sku: string } }) {
  const sku = decodeURIComponent(params.sku);
  const supabase = createSupabaseServer();

  const { data: p } = await supabase
    .from("product")
    .select("id, sku, name, category, color, size, model, unit, box_pack_size, cost_current, reorder_point, par_level, has_lot, barcode, storage_location")
    .eq("sku", sku)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: whs }, { data: bal }, { data: moves }] = await Promise.all([
    supabase.from("warehouse").select("id, code, name"),
    supabase.from("v_stock_balance").select("warehouse_id, qty").eq("product_id", p.id),
    supabase
      .from("stock_movement")
      .select("id, warehouse_id, qty, m_type, unit_cost, ref_doc, note, actor_name, created_at, lot_id")
      .eq("product_id", p.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const codeById = Object.fromEntries((whs || []).map((w) => [w.id, w.code]));
  const balByWh = (bal || []).map((b) => ({ code: codeById[b.warehouse_id], qty: Number(b.qty) }));
  const onHand = balByWh.reduce((s, b) => s + b.qty, 0);

  return (
    <div className="space-y-5 pb-16">
      <Link href="/products" className="text-sm text-slate-400 hover:text-slate-600">← กลับรายการสินค้า</Link>

      <div className="card p-5">
        <div className="font-mono text-xs text-slate-400">{p.sku}</div>
        <h1 className="text-xl font-semibold">{p.name}</h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {p.model && <span>รุ่น: {p.model}</span>}
          {p.color && <span>สี: {p.color}</span>}
          {p.size && <span>ขนาด: {p.size}</span>}
          {p.category && <span>หมวด: {p.category}</span>}
          {p.barcode && <span>บาร์โค้ด: {p.barcode}</span>}
        </div>
        {p.storage_location && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-brand">
            📍 ตำแหน่งเก็บ (PWC19): <span className="font-semibold">{p.storage_location}</span>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/operations?sku=${encodeURIComponent(p.sku)}`} className="btn-primary">ทำรายการ</Link>
        </div>
      </div>

      {/* stock cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat title="คงเหลือรวม" value={`${num(onHand)} ${p.unit}`} />
        <Stat
          title="เท่ากับ (กล่อง)"
          value={(() => {
            const b = boxBreakdown(onHand, p.box_pack_size);
            return b ? `${num(b.boxes)} กล่อง + ${num(b.loose)}` : "—";
          })()}
          sub={p.box_pack_size ? `บรรจุ ${p.box_pack_size}/กล่อง` : "ไม่ได้ตั้งขนาดกล่อง"}
        />
        <Stat title="ทุนปัจจุบัน" value={baht(p.cost_current)} />
        <Stat title="ROP / Par" value={`${num(p.reorder_point)} / ${num(p.par_level)}`} />
      </div>

      {/* balance per warehouse */}
      <div className="card p-4">
        <h2 className="mb-3 font-semibold">คงเหลือรายคลัง</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {balByWh.map((b) => (
            <div key={b.code} className="rounded-lg border border-slate-100 p-3">
              <div className="text-xs text-slate-400">{b.code}</div>
              <div className="text-lg font-semibold">{num(b.qty)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* movement history = audit trail */}
      <div className="card">
        <div className="border-b border-slate-100 p-4"><h2 className="font-semibold">ประวัติการเคลื่อนไหว (ย้อนหลัง)</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="th">เวลา</th><th className="th">ประเภท</th><th className="th">คลัง</th>
                <th className="th text-right">จำนวน</th><th className="th">เอกสาร</th><th className="th">ผู้ทำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(moves || []).map((m) => {
                const t = MTYPE[m.m_type] || { label: m.m_type, cls: "" };
                return (
                  <tr key={m.id}>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{dt(m.created_at)}</td>
                    <td className={"td font-medium " + t.cls}>{t.label}</td>
                    <td className="td">{codeById[m.warehouse_id]}</td>
                    <td className={"td text-right font-medium " + (Number(m.qty) < 0 ? "text-red-600" : "text-emerald-600")}>
                      {Number(m.qty) > 0 ? "+" : ""}{num(Number(m.qty))}
                    </td>
                    <td className="td text-xs">{m.ref_doc || "-"}</td>
                    <td className="td text-xs text-slate-500">{m.actor_name || "-"}</td>
                  </tr>
                );
              })}
              {(!moves || moves.length === 0) && <tr><td className="td text-slate-400" colSpan={6}>ยังไม่มีการเคลื่อนไหว</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-bold text-slate-800">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
