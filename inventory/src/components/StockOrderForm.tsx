"use client";
import { useMemo, useState } from "react";
import { num } from "@/lib/format";

export interface SizeRow {
  category: string;
  code: string;
  name: string | null;
  grade: string | null;
  annual_target: number | null;
  size_raw: string;
  current_stock: number | null;
  wip: number | null;
  reorder_point: number | null;
}

const CAT_ORDER = ["Kaneko", "CoolPlus", "Cotton", "Anti Bac", "ช็อป", "คนงาน", "ผ้ากันเปื้อน"];

// เทมเพลตคอลัมน์คงที่ (ตามแบบฟอร์มต้นฉบับ)
const GROUPS: { label: string; gender: string; sizes: string[] }[] = [
  { label: "ผู้หญิง", gender: "women", sizes: ["XS", "S", "M", "L"] },
  { label: "ผู้ชาย", gender: "men", sizes: ["M", "L", "XL", "XXL", "3XL", "5XL"] },
  { label: "UNISEX", gender: "uni", sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "5XL"] },
];
const ALL_KEYS = [...GROUPS.flatMap((g) => g.sizes.map((s) => `${g.gender}:${s}`)), "free:Free"];

const round10 = (n: number) => Math.round(n / 10) * 10;
const n = (v: string | undefined) => { const x = parseFloat((v ?? "").replace(/,/g, "")); return isNaN(x) ? 0 : x; };

function parseSize(raw: string): { gender: string; key: string } {
  const t = (raw || "").trim();
  if (t.includes("ญ")) return { gender: "women", key: t.replace(/ญ/g, "").trim() };
  if (t.includes("ช")) return { gender: "men", key: t.replace(/ช/g, "").trim() };
  if (/free/i.test(t)) return { gender: "free", key: "Free" };
  return { gender: "uni", key: t };
}

interface Cell { c: string; sw: string; r: string; o: string }
type Cells = Record<string, Cell>;
interface Block { code: string; name: string; grade: string; target: string; note: string; cells: Cells }

function buildBlock(rows: SizeRow[]): Block {
  const cells: Cells = {};
  for (const rr of rows) {
    const { gender, key } = parseSize(rr.size_raw);
    const cur = Number(rr.current_stock ?? 0), wip = Number(rr.wip ?? 0), rp = Number(rr.reorder_point ?? 0);
    cells[`${gender}:${key}`] = { c: String(cur), sw: String(cur + wip), r: String(rp), o: String(rp > 0 ? round10(rp) : 0) };
  }
  const f = rows[0];
  return { code: f.code, name: f.name || "", grade: f.grade || "", target: f.annual_target == null ? "" : String(f.annual_target), note: "", cells };
}

const METRICS: { label: string; field: keyof Cell | "pending"; bold?: boolean; red?: boolean }[] = [
  { label: "จำนวนคงคลังปัจจุบัน", field: "c" },
  { label: "จำนวนคงคลังรวมค้างผลิต", field: "sw" },
  { label: "จุดสั่งซื้อ (Reorder Point)", field: "r" },
  { label: "จำนวนที่ขอผลิต/สั่งตัด", field: "o", bold: true },
];
const cellVal = (field: keyof Cell | "pending", c: Cell | undefined): string => {
  if (!c) return "";
  if (field === "pending") return String(n(c.sw) + n(c.o));
  return c[field] ?? "";
};
const rowTotal = (cells: Cells, field: keyof Cell | "pending"): number =>
  ALL_KEYS.reduce((s, k) => { const c = cells[k]; if (!c) return s; return s + (field === "pending" ? n(c.sw) + n(c.o) : n(c[field])); }, 0);

export default function StockOrderForm({ rows, today }: { rows: SizeRow[]; today: string }) {
  const [active, setActive] = useState("ALL");
  const [term, setTerm] = useState("");
  const [onlyNeed, setOnlyNeed] = useState(true);
  const [blocks, setBlocks] = useState<Block[]>([]);

  const byCode = useMemo(() => {
    const m = new Map<string, SizeRow[]>();
    for (const r of rows) { if (!m.has(r.code)) m.set(r.code, []); m.get(r.code)!.push(r); }
    return m;
  }, [rows]);

  const codeList = useMemo(() =>
    [...byCode.entries()].map(([code, rs]) => {
      const orderSum = rs.reduce((s, r) => { const rp = Number(r.reorder_point ?? 0); return s + (rp > 0 ? round10(rp) : 0); }, 0);
      return { code, category: rs[0].category, name: rs[0].name, grade: rs[0].grade, target: rs[0].annual_target, orderSum };
    }), [byCode]);

  const cats = useMemo(() => CAT_ORDER.filter((c) => codeList.some((r) => r.category === c)), [codeList]);
  const countByCat = useMemo(() => {
    const m: Record<string, number> = {};
    codeList.forEach((r) => (m[r.category] = (m[r.category] || 0) + 1));
    return m;
  }, [codeList]);
  const filtered = useMemo(() => {
    const t = term.toLowerCase().trim();
    return codeList
      .filter((r) => active === "ALL" || r.category === active)
      .filter((r) => !onlyNeed || r.orderSum > 0)
      .filter((r) => !t || r.code.toLowerCase().includes(t) || (r.name || "").toLowerCase().includes(t))
      .sort((a, b) => b.orderSum - a.orderSum);
  }, [codeList, active, term, onlyNeed]);

  const MAX_CODES = 7;
  const addCode = (code: string) =>
    setBlocks((prev) => (prev.some((b) => b.code === code) || prev.length >= MAX_CODES ? prev : [...prev, buildBlock(byCode.get(code) || [])]));
  const removeBlock = (code: string) => setBlocks((prev) => prev.filter((b) => b.code !== code));
  const editCell = (code: string, key: string, field: keyof Cell, v: string) =>
    setBlocks((prev) => prev.map((b) => b.code !== code ? b : { ...b, cells: { ...b.cells, [key]: { ...(b.cells[key] || { c: "", sw: "", r: "", o: "" }), [field]: v } } }));
  const editMeta = (code: string, field: "name" | "grade" | "target" | "note", v: string) =>
    setBlocks((prev) => prev.map((b) => (b.code === code ? { ...b, [field]: v } : b)));

  const grandTotal = blocks.reduce((s, b) => s + rowTotal(b.cells, "o"), 0);

  return (
    <div className="space-y-5 pb-16">
      <style>{`
        @media print {
          aside, header, nav.fixed, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: none !important; }
          .print-area { width: 100% !important; overflow: visible !important; }
          .print-area, .print-area * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-area table { width: 100% !important; font-size: 7px !important; }
          .print-area th, .print-area td { padding: 0 1px !important; line-height: 1.1 !important; }
          .print-area input, .print-area span { font-size: 7px !important; }
          .print-area .form-title { font-size: 14px !important; }
          .print-area .logo-box { width: 140px !important; }
          .print-area .logo-box img { height: 30px !important; }
          .print-area .sign-area { font-size: 9px !important; }
          .print-area .sign-area > div { padding: 6px 20px !important; }
          @page { size: A4 portrait; margin: 7mm; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-xl font-semibold">การสั่งสต๊อกสินค้า · ขออนุมัติสั่งผลิต</h1>
        <p className="text-sm text-slate-500">
          เลือกรหัสที่ต้องสั่ง → กด “+ เพิ่มลงฟอร์ม” ตัวเลขรายไซส์เข้าฟอร์มอัตโนมัติ (ดึงจากทุกหน้า “สั่งสต๊อก” Rev.00) — แก้ไขได้ทุกช่อง แล้วพิมพ์เป็นเอกสาร
        </p>
      </div>

      {/* filters + list */}
      <div className="no-print space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterBtn label="ทั้งหมด" count={codeList.length} active={active === "ALL"} onClick={() => setActive("ALL")} />
          {cats.map((c) => (
            <FilterBtn key={c} label={c} count={countByCat[c]} active={active === c} onClick={() => setActive(c)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input className="input max-w-xs" placeholder="🔍 ค้นหารหัส หรือชื่อสินค้า…" value={term} onChange={(e) => setTerm(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={onlyNeed} onChange={(e) => setOnlyNeed(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            เฉพาะที่ต้องสั่ง
          </label>
          {blocks.length > 0 && <span className="text-sm text-brand">เพิ่มในฟอร์มแล้ว {blocks.length}/{MAX_CODES} รหัส{blocks.length >= MAX_CODES ? " (สูงสุดแล้ว · 1 หน้ากระดาษ)" : ""}</span>}
        </div>
        <div className="card max-h-[320px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="th">รหัสสินค้า</th><th className="th">ชื่อสินค้า</th><th className="th text-center">Grade</th>
                <th className="th text-right">เป้าขาย/ปี</th><th className="th text-right">รวมขอผลิต</th><th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filtered.map((r) => {
                const added = blocks.some((b) => b.code === r.code);
                return (
                  <tr key={r.code} className={added ? "bg-brand/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}>
                    <td className="td font-mono text-xs">{r.code}</td>
                    <td className="td max-w-[240px] truncate">{r.name || "-"}</td>
                    <td className="td text-center"><GradeBadge g={r.grade} /></td>
                    <td className="td text-right">{num(r.target ?? 0)}</td>
                    <td className="td text-right font-bold text-emerald-600">{num(r.orderSum)}</td>
                    <td className="td text-right">
                      {added
                        ? <button onClick={() => removeBlock(r.code)} className="btn-ghost !px-3 !py-1 text-xs text-red-500">เอาออก</button>
                        : <button onClick={() => addCode(r.code)} disabled={blocks.length >= MAX_CODES} className="btn-primary !px-3 !py-1 text-xs disabled:opacity-40">+ เพิ่มลงฟอร์ม</button>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td className="td text-slate-400" colSpan={6}>ไม่พบรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== แบบฟอร์ม ===== */}
      {blocks.length > 0 && (
        <div className="space-y-3">
          <div className="no-print flex flex-wrap items-center gap-2">
            <button onClick={() => window.print()} className="btn-primary">🖨️ สร้างเอกสาร / พิมพ์</button>
            <button onClick={() => setBlocks([])} className="btn-ghost">ล้างฟอร์ม</button>
            <span className="text-xs text-slate-400">* แก้ไขได้ทุกช่อง — รวมสุทธิคำนวณอัตโนมัติ · สูงสุด 7 รหัส/หน้า A4</span>
          </div>

          <div className="print-area overflow-x-auto border-2 border-slate-900 bg-white p-0 text-slate-900 dark:bg-white"
            style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
            {/* header */}
            <div className="flex items-stretch border-b-2 border-slate-900">
              <div className="logo-box flex w-[220px] shrink-0 items-center justify-center border-r border-slate-900 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/pmk-logo.png" alt="PMK" className="h-12 w-auto" />
              </div>
              <div className="form-title flex flex-1 items-center justify-center px-4 py-3 text-center text-2xl font-bold">
                แบบฟอร์มขออนุมัติสั่งผลิตสินค้าสำเร็จรูป
              </div>
            </div>

            <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight">
              <colgroup>
                <col style={{ width: "14%" }} />
                {ALL_KEYS.map((k) => <col key={k} style={{ width: "4.15%" }} />)}
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th rowSpan={2} className="border border-slate-500 px-1 py-1 text-left align-bottom">รายละเอียดสินค้า</th>
                  {GROUPS.map((g) => (
                    <th key={g.label} colSpan={g.sizes.length} className="border border-slate-500 px-1 py-0.5">{g.label}</th>
                  ))}
                  <th rowSpan={2} className="border border-slate-500 px-0.5 align-bottom leading-none">Free<br />Size</th>
                  <th rowSpan={2} className="border border-slate-500 px-0.5 align-bottom leading-none">รวม<br />สุทธิ</th>
                </tr>
                <tr>
                  {GROUPS.flatMap((g) => g.sizes.map((s) => (
                    <th key={`${g.gender}:${s}`} className="border border-slate-500 px-0.5 py-0.5 font-medium">{s}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <BlockRows key={b.code} b={b} editCell={editCell} editMeta={editMeta} />
                ))}
                {/* grand total */}
                <tr>
                  <td colSpan={1 + ALL_KEYS.length} className="border border-slate-500 px-2 py-1 text-center text-sm font-bold" style={{ background: "#e8c4c4" }}>รวมสุทธิ</td>
                  <td className="border border-slate-500 px-1 font-bold" style={{ background: "#e8c4c4" }}>{num(grandTotal)}</td>
                </tr>
              </tbody>
            </table>

            {/* signatures */}
            <div className="sign-area flex border-t-2 border-slate-900 text-xs">
              <div className="flex-1 space-y-8 border-r-2 border-slate-900 px-8 py-6">
                <Sign role="ผู้ขออนุมัติ" title="ผู้จัดการส่วนโลจิสติกส์การขาย" />
                <Sign role="ผู้อนุมัติร่วม" title="รองผู้อำนวยการฝ่ายพัฒนาธุรกิจ" noDate />
              </div>
              <div className="flex-1 space-y-8 px-8 py-6">
                <Sign role="ผู้อนุมัติร่วม" title="ผู้อำนวยการฝ่ายพัฒนาธุรกิจ" />
                <Sign role="ผู้อนุมัติร่วม" title="ผู้อำนวยการฝ่ายปฏิบัติการ" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BlockRows({ b, editCell, editMeta }: {
  b: Block;
  editCell: (code: string, key: string, field: keyof Cell, v: string) => void;
  editMeta: (code: string, field: "name" | "grade" | "target" | "note", v: string) => void;
}) {
  const YEL = { background: "#dce6f1" };
  return (
    <>
      {/* code header row */}
      <tr style={{ background: "#dce6f1" }}>
        <td className="border border-slate-500 px-2 py-1 text-left font-medium">รหัสสินค้า</td>
        <td colSpan={4} className="border border-slate-500 px-1 text-center" style={YEL}>
          <input value={b.code} readOnly className="w-full bg-transparent text-center font-mono font-bold outline-none" />
        </td>
        <td className="border border-slate-500 px-1 text-right font-medium">Grade</td>
        <td colSpan={2} className="border border-slate-500 px-1" style={YEL}>
          <input value={b.grade} onChange={(e) => editMeta(b.code, "grade", e.target.value)} className="w-full bg-transparent text-center font-bold outline-none" />
        </td>
        <td colSpan={3} className="border border-slate-500 px-1 text-right font-medium">เป้าหมายยอดขายต่อปี</td>
        <td colSpan={2} className="border border-slate-500 px-1" style={YEL}>
          <input value={b.target} onChange={(e) => editMeta(b.code, "target", e.target.value)} className="w-full bg-transparent text-center font-bold outline-none" />
        </td>
        <td colSpan={8} className="border border-slate-500 px-2 text-left text-[11px] font-semibold text-blue-700">
          <input value={b.note} onChange={(e) => editMeta(b.code, "note", e.target.value)} className="w-full bg-transparent outline-none" />
        </td>
      </tr>

      {/* metric rows */}
      {METRICS.map((m) => (
        <tr key={m.label} style={m.red ? { background: "#e6f0f7" } : undefined}>
          <td className={"border border-slate-500 px-2 py-0.5 text-left " + (m.bold ? "font-bold" : "")}>{m.label}</td>
          {ALL_KEYS.map((key) => {
            const c = b.cells[key];
            const has = !!c;
            const editable = m.field !== "pending";
            const val = cellVal(m.field, c);
            return (
              <td key={key} className={"border border-slate-400 p-0 " + (m.red ? "text-red-600" : m.bold ? "font-bold" : "")}>
                {has && editable
                  ? <input value={val} onChange={(e) => editCell(b.code, key, m.field as keyof Cell, e.target.value)}
                      className={"h-full w-full bg-transparent px-0.5 py-0.5 text-center outline-none focus:bg-sky-100 " + (m.bold ? "text-emerald-700 font-bold" : "")} />
                  : <span className="block px-0.5 py-0.5">{has ? num(n(val)) : ""}</span>}
              </td>
            );
          })}
          <td className={"border border-slate-500 px-1 font-bold " + (m.red ? "text-red-600" : "")} style={m.red ? { background: "#e6f0f7" } : undefined}>
            {num(rowTotal(b.cells, m.field))}
          </td>
        </tr>
      ))}
    </>
  );
}

function Sign({ role, title, noDate }: { role: string; title: string; noDate?: boolean }) {
  return (
    <div>
      <div className="flex items-end gap-2">
        <span className="whitespace-nowrap">ลงชื่อ</span>
        <span className="flex-1 border-b border-dotted border-slate-500">&nbsp;</span>
        <span className="whitespace-nowrap">{role}</span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="whitespace-nowrap">ตำแหน่ง :</span>
        <span className="flex-1 border-b border-slate-500 text-center">{title}</span>
      </div>
      {!noDate && (
        <div className="mt-2 flex items-end gap-2">
          <span className="whitespace-nowrap">วันที่ :</span>
          <span className="flex-1 border-b border-dotted border-slate-500">&nbsp;</span>
        </div>
      )}
    </div>
  );
}

function GradeBadge({ g }: { g: string | null }) {
  if (!g) return <span className="text-slate-300">-</span>;
  const c = g === "A" ? "bg-emerald-500/10 text-emerald-600" : g === "B" ? "bg-amber-500/10 text-amber-600" : g === "C" ? "bg-slate-500/10 text-slate-500" : "bg-red-500/10 text-red-600";
  return <span className={"inline-block min-w-[24px] rounded px-1.5 text-xs font-bold " + c}>{g}</span>;
}
function FilterBtn({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={"inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition " +
        (active ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-800 dark:bg-slate-800 dark:text-slate-300")}>
      {label}<span className={"text-xs " + (active ? "opacity-90" : "text-slate-400")}>{num(count)}</span>
    </button>
  );
}
