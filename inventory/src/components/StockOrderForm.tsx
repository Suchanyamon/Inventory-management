"use client";
import { useMemo, useState } from "react";
import { num } from "@/lib/format";

export interface OrderRow {
  category: string;
  code: string;
  name: string | null;
  grade: string | null;
  annual_target: number | null;
  current_stock: number | null;
  wip: number | null;
  stock_wip: number | null;
  reorder_point: number | null;
  order_qty: number | null;
}

const CAT_ORDER = ["Kaneko", "CoolPlus", "Cotton", "Anti Bac", "ช็อป", "คนงาน", "ผ้ากันเปื้อน"];

interface FormState {
  code: string; grade: string; annual_target: string; current_stock: string;
  stock_wip: string; reorder_point: string; order_qty: string;
  name: string; category: string;
  doc_no: string; date: string; requester: string; note: string;
}

function toForm(r: OrderRow, today: string): FormState {
  const s = (v: number | null) => (v == null ? "" : String(v));
  return {
    code: r.code, grade: r.grade || "", annual_target: s(r.annual_target),
    current_stock: s(r.current_stock), stock_wip: s(r.stock_wip),
    reorder_point: s(r.reorder_point), order_qty: s(r.order_qty),
    name: r.name || "", category: r.category,
    doc_no: "", date: today, requester: "", note: "",
  };
}

export default function StockOrderForm({ rows, today }: { rows: OrderRow[]; today: string }) {
  const [active, setActive] = useState<string>("ALL");
  const [term, setTerm] = useState("");
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);

  const cats = useMemo(() => CAT_ORDER.filter((c) => rows.some((r) => r.category === c)), [rows]);
  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => (m[r.category] = (m[r.category] || 0) + 1));
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    const t = term.toLowerCase().trim();
    return rows
      .filter((r) => (active === "ALL" || r.category === active))
      .filter((r) => (!onlyNeed || (r.reorder_point ?? 0) > 0))
      .filter((r) => !t || r.code.toLowerCase().includes(t) || (r.name || "").toLowerCase().includes(t))
      .sort((a, b) => (b.reorder_point ?? 0) - (a.reorder_point ?? 0));
  }, [rows, active, term, onlyNeed]);

  const needCount = rows.filter((r) => (r.reorder_point ?? 0) > 0).length;
  const totalOrderQty = rows.reduce((s, r) => s + (r.order_qty ?? 0), 0);

  const set = (k: keyof FormState, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="space-y-5 pb-16">
      <style>{`
        @media print {
          aside, header, nav.fixed, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .print-area { box-shadow: none !important; border: none !important; }
          @page { size: A4 portrait; margin: 14mm; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-xl font-semibold">การสั่งสต๊อกสินค้า · ขออนุมัติสั่งตัด</h1>
        <p className="text-sm text-slate-500">
          เลือกรหัสที่ต้องการสั่ง ระบบดึงตัวเลขสำคัญมาใส่ “แบบฟอร์มขออนุมัติสั่งตัดสต๊อก 2026” — แก้ไขได้ทุกช่อง แล้วกดพิมพ์เป็นเอกสาร
        </p>
      </div>

      {/* KPIs */}
      <div className="no-print grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="รหัสทั้งหมด" value={num(rows.length)} />
        <Kpi label="ต้องสั่ง (จุดสั่งซื้อ > 0)" value={num(needCount)} accent />
        <Kpi label="รวมจำนวนที่ต้องสั่ง" value={num(totalOrderQty) + " ตัว"} />
        <Kpi label="หมวดสินค้า" value={num(cats.length)} />
      </div>

      {/* filters */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <FilterBtn label="ทั้งหมด" count={rows.length} active={active === "ALL"} onClick={() => setActive("ALL")} />
        {cats.map((c) => (
          <FilterBtn key={c} label={c} count={countByCat[c]} active={active === c} onClick={() => setActive(c)} />
        ))}
      </div>
      <div className="no-print flex flex-wrap items-center gap-3">
        <input className="input max-w-xs" placeholder="🔍 ค้นหารหัส หรือชื่อสินค้า…" value={term} onChange={(e) => setTerm(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          เฉพาะที่ต้องสั่ง
        </label>
      </div>

      {/* list */}
      <div className="no-print card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="th">รหัสสินค้า</th>
              <th className="th">ชื่อสินค้า</th>
              <th className="th text-center">Grade</th>
              <th className="th text-right">เป้าขาย/ปี</th>
              <th className="th text-right">คงคลัง</th>
              <th className="th text-right">รวม+WIP</th>
              <th className="th text-right">จุดสั่งซื้อ</th>
              <th className="th text-right">สั่ง (ปัด10)</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {filtered.map((r) => {
              const sel = form?.code === r.code;
              return (
                <tr key={r.code} className={sel ? "bg-brand/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                  <td className="td font-mono text-xs">{r.code}</td>
                  <td className="td max-w-[220px] truncate">{r.name || "-"}</td>
                  <td className="td text-center"><GradeBadge g={r.grade} /></td>
                  <td className="td text-right">{num(r.annual_target ?? 0)}</td>
                  <td className="td text-right">{num(r.current_stock ?? 0)}</td>
                  <td className="td text-right">{num(r.stock_wip ?? 0)}</td>
                  <td className={"td text-right font-semibold " + ((r.reorder_point ?? 0) > 0 ? "text-amber-600" : "text-slate-400")}>{num(r.reorder_point ?? 0)}</td>
                  <td className="td text-right text-base font-bold text-emerald-600">{num(r.order_qty ?? 0)}</td>
                  <td className="td text-right">
                    <button onClick={() => setForm(toForm(r, today))} className="btn-primary !px-3 !py-1 text-xs">เลือก →</button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={9}>ไม่พบรายการ</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== แบบฟอร์มขออนุมัติ ===== */}
      {form && (
        <div className="space-y-3">
          <div className="no-print flex flex-wrap items-center gap-2">
            <button onClick={() => window.print()} className="btn-primary">🖨️ สร้างเอกสาร / พิมพ์</button>
            <button onClick={() => setForm(null)} className="btn-ghost">ปิดฟอร์ม</button>
            <span className="text-xs text-slate-400">* แก้ไขตัวเลขในฟอร์มได้ทุกช่องก่อนพิมพ์</span>
          </div>

          <div className="print-area card mx-auto max-w-3xl border border-slate-300 p-8 text-slate-900 dark:bg-white">
            {/* header */}
            <div className="mb-5 flex items-start justify-between border-b-2 border-slate-800 pb-3">
              <div>
                <div className="text-lg font-bold">POLO MAKER</div>
                <div className="text-xs text-slate-500">บริษัท โปโล เมคเกอร์ จำกัด · คลัง DCMT / DCMTA</div>
              </div>
              <div className="text-right">
                <div className="text-base font-bold">แบบฟอร์มขออนุมัติสั่งตัดสต๊อก 2026</div>
                <div className="mt-1 text-xs text-slate-500">Stock Cutting Approval Form</div>
              </div>
            </div>

            {/* doc meta */}
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <Field label="เลขที่เอกสาร" value={form.doc_no} onChange={(v) => set("doc_no", v)} placeholder="เช่น PO-2026-001" />
              <Field label="วันที่" type="date" value={form.date} onChange={(v) => set("date", v)} />
              <Field label="หมวดสินค้า" value={form.category} onChange={(v) => set("category", v)} />
              <Field label="ผู้ขออนุมัติ" value={form.requester} onChange={(v) => set("requester", v)} placeholder="ชื่อ-สกุล" />
            </div>

            <div className="mb-3 rounded bg-slate-50 px-3 py-2 text-sm dark:bg-slate-100">
              <span className="text-slate-500">ชื่อสินค้า: </span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-[80%] bg-transparent font-medium outline-none" />
            </div>

            {/* main data table */}
            <table className="w-full border-collapse text-sm">
              <tbody>
                <Row label="รหัสสินค้า" value={form.code} onChange={(v) => set("code", v)} mono />
                <Row label="Grade" value={form.grade} onChange={(v) => set("grade", v)} />
                <Row label="เป้าหมายยอดขายต่อปี" value={form.annual_target} onChange={(v) => set("annual_target", v)} unit="ตัว" />
                <Row label="จำนวนคงคลังปัจจุบัน" value={form.current_stock} onChange={(v) => set("current_stock", v)} unit="ตัว" />
                <Row label="จำนวนคงคลังรวมค้างผลิต" value={form.stock_wip} onChange={(v) => set("stock_wip", v)} unit="ตัว" />
                <Row label="จุดสั่งซื้อ (Reorder Point)" value={form.reorder_point} onChange={(v) => set("reorder_point", v)} unit="ตัว" />
                <Row label="จำนวนที่ต้องการสั่งสินค้า" value={form.order_qty} onChange={(v) => set("order_qty", v)} unit="ตัว" highlight />
              </tbody>
            </table>

            {/* note */}
            <div className="mt-4 text-sm">
              <div className="mb-1 text-slate-500">หมายเหตุ / เหตุผลการสั่ง</div>
              <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none" />
            </div>

            {/* signatures */}
            <div className="mt-8 grid grid-cols-3 gap-6 text-center text-sm">
              {["ผู้ขออนุมัติ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"].map((role) => (
                <div key={role}>
                  <div className="mb-10 border-b border-dotted border-slate-400" />
                  <div>( ................................ )</div>
                  <div className="mt-1 font-medium">{role}</div>
                  <div className="text-xs text-slate-400">วันที่ ......./......./.......</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={"mt-1 text-2xl font-bold " + (accent ? "text-amber-600" : "text-brand")}>{value}</div>
    </div>
  );
}

function GradeBadge({ g }: { g: string | null }) {
  if (!g) return <span className="text-slate-300">-</span>;
  const c = g === "A" ? "bg-emerald-500/10 text-emerald-600" : g === "B" ? "bg-amber-500/10 text-amber-600" : g === "C" ? "bg-slate-500/10 text-slate-500" : "bg-red-500/10 text-red-600";
  return <span className={"inline-block min-w-[24px] rounded px-1.5 text-xs font-bold " + c}>{g}</span>;
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-slate-500">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 outline-none focus:border-brand" />
    </label>
  );
}

function Row({ label, value, onChange, unit, mono, highlight }: { label: string; value: string; onChange: (v: string) => void; unit?: string; mono?: boolean; highlight?: boolean }) {
  return (
    <tr className={highlight ? "bg-brand/5" : ""}>
      <td className="border border-slate-300 px-3 py-2 font-medium text-slate-700">{label}</td>
      <td className="border border-slate-300 px-2 py-1">
        <div className="flex items-center gap-2">
          <input value={value} onChange={(e) => onChange(e.target.value)}
            className={"w-full bg-transparent px-1 py-0.5 text-right outline-none focus:bg-brand/5 " + (mono ? "font-mono text-left" : "") + (highlight ? " text-lg font-bold text-emerald-700" : " font-medium")} />
          {unit && <span className="shrink-0 text-xs text-slate-400">{unit}</span>}
        </div>
      </td>
    </tr>
  );
}

function FilterBtn({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={"inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition " +
        (active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-300")}>
      {label}
      <span className={"text-xs " + (active ? "opacity-90" : "text-slate-400")}>{num(count)}</span>
    </button>
  );
}
