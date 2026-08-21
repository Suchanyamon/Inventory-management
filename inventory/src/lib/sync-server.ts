import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

// =====================================================================
// Sync ฝั่ง server — ดึงข้อมูลจาก OneDrive (Excel) + Google Sheets แล้วอัปเดต DB
// ใช้ service role (ข้าม RLS) — เรียกจาก /api/sync เท่านั้น (ตรวจ admin ก่อน)
// =====================================================================

const STOCK_SHEET_ID = "1j0n4pMjUKM0eATXb-CbJvtzEF4YZSpXLww6PLUh4HGI"; // ไฟล์ "สั่งสต๊อก"
const LAYOUT_SHEET_ID = "1EL8bhU_OrODAejHJ1-bt-MHbexV_nFTIX-ylycioexU"; // "Layout PWC19"
const LGS_PERFORMANCE_SHEET_ID = "1FCkFfn0ef4g4AU1iQxtVjtu-aa5wuZRjvlClbhbr_xc"; // "DATA-Performance -LGS 2026"
const DATA_SKU_SHEET_ID = "1ZEnZ6M0D7B3oDcwVyQSnr3tkjPOd5-P7EHCC9ER7QCU"; // "โครงการฯ" / tab "DATA SKU 25-06-2026"
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export interface SyncResult { source: string; ok: boolean; count?: number; error?: string; }

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function replaceTable(table: string, rows: any[]) {
  const db = admin();
  const { error: delErr } = await db.from(table).delete().gte("id", 0);
  if (delErr) throw delErr;
  for (const part of chunk(rows, 500)) {
    const { error } = await db.from(table).insert(part);
    if (error) throw error;
  }
}

// ---------- Google Sheets (gviz CSV) ----------
function parseCSV(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") {} else f += c; }
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function gviz(id: string, sheet: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(sheet)}`;
  const res = await fetch(url, { cache: "no-store" });
  const txt = await res.text();
  if (!res.ok || txt.startsWith("<")) throw new Error(`ดึงชีต "${sheet}" ไม่ได้ — ต้องแชร์ "ทุกคนที่มีลิงก์ = ผู้อ่าน"`);
  return parseCSV(txt);
}
const toNum = (v: string) => { const s = (v || "").replace(/[, ]/g, "").replace(/[^0-9.\-]/g, ""); return s === "" || s === "-" ? null : parseFloat(s); };
const norm = (v: string) => (v || "").trim();
const pad2 = (n: number) => String(n).padStart(2, "0");
function parseShipnityDate(v: string): string | null {
  const s = (v || "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const mm = Number(m[1]), dd = Number(m[2]);
  const yy = Number(m[3]);
  const yyyy = yy < 100 ? 2000 + yy : yy;
  if (!mm || !dd || mm > 12 || dd > 31) return null;
  return `${yyyy}-${pad2(mm)}-${pad2(dd)}`;
}
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const t1 = Date.parse(`${a}T00:00:00+07:00`);
  const t2 = Date.parse(`${b}T00:00:00+07:00`);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
}
function monthLabel(date: string): string {
  const [, m] = date.split("-");
  return MONTHS[Number(m) - 1] || "";
}

// ---------- reorder_plan ----------
export async function syncReorder(): Promise<SyncResult> {
  try {
    const SHEETS: [string, string][] = [
      ["Kaneko", "สั่งสต๊อก Kaneko"], ["CoolPlus", "สั่งสต๊อก CoolPlus"], ["Cotton", "สั่งสต๊อก Cotton"],
      ["Anti Bac", "สั่งสต๊อก Anti Bac"], ["ช็อป", "สั่งสต๊อก ช็อป"], ["คนงาน", "สั่งสต๊อก คนงาน"], ["ผ้ากันเปื้อน", "สั่งสต๊อก ผ้ากันเปื้อน"],
    ];
    const isCode = (v: string) => /^[A-Z0-9]{5,}$/.test((v || "").trim());
    const out: any[] = [];
    for (const [cat, sheet] of SHEETS) {
      const rows = await gviz(STOCK_SHEET_ID, sheet);
      let name = "", grade = "";
      for (let r = 3; r < rows.length; r++) {
        const c0 = (rows[r][0] || "").trim(), size = (rows[r][5] || "").trim();
        if (isCode(c0)) { grade = (rows[r][4] || "").trim(); name = (rows[r][1] || "").trim(); }
        else if (c0 && /[ก-๙]/.test(c0) && c0.length > 2) name = c0;
        if (size && size !== "SIZE") {
          const q = toNum(rows[r][10]);
          if (q != null && q > 0) out.push({ category: cat, sku: (rows[r][19] || rows[r][18] || "").trim() || null, name: name || null, grade: grade || null, size, qty: Math.round(q) });
        }
      }
    }
    await replaceTable("reorder_plan", out);
    return { source: "ต้องสั่งเพิ่ม (reorder)", ok: true, count: out.length };
  } catch (e: any) { return { source: "ต้องสั่งเพิ่ม (reorder)", ok: false, error: e.message }; }
}

// ---------- stock_order_plan (ระดับรหัส — แบบฟอร์มขออนุมัติสั่งตัดสต๊อก) ----------
// อ่านเฉพาะ "แถวหัวรหัส" ในหน้าสั่งสต๊อก: 0=รหัส 1=ชื่อ 16=เป้าหมายยอดขายต่อปี 4=เกรด
//   8=WIP 9=สต็อกปัจจุบัน 10=จำนวนที่ต้องการสั่งเพิ่ม(จุดสั่งซื้อ)
const roundTo10 = (n: number) => Math.round(n / 10) * 10;
export async function syncOrderPlan(): Promise<SyncResult> {
  try {
    const SHEETS: [string, string][] = [
      ["Kaneko", "สั่งสต๊อก Kaneko"], ["CoolPlus", "สั่งสต๊อก CoolPlus"], ["Cotton", "สั่งสต๊อก Cotton"],
      ["Anti Bac", "สั่งสต๊อก Anti Bac"], ["ช็อป", "สั่งสต๊อก ช็อป"], ["คนงาน", "สั่งสต๊อก คนงาน"], ["ผ้ากันเปื้อน", "สั่งสต๊อก ผ้ากันเปื้อน"],
    ];
    const isCode = (v: string) => /^[A-Z0-9]{5,}$/.test((v || "").trim());
    const out: any[] = [];
    for (const [cat, sheet] of SHEETS) {
      const rows = await gviz(STOCK_SHEET_ID, sheet);
      for (let r = 3; r < rows.length; r++) {
        const code = (rows[r][0] || "").trim();
        if (!isCode(code)) continue;
        const cur = toNum(rows[r][9]) ?? 0;
        const wip = toNum(rows[r][8]) ?? 0;
        const rp = toNum(rows[r][10]) ?? 0;
        out.push({
          category: cat, code, name: (rows[r][1] || "").trim() || null, grade: (rows[r][4] || "").trim() || null,
          annual_target: toNum(rows[r][16]), current_stock: cur, wip, stock_wip: cur + wip,
          reorder_point: rp, order_qty: rp > 0 ? roundTo10(rp) : 0,
        });
      }
    }
    await replaceTable("stock_order_plan", out);
    return { source: "สั่งสต๊อก (ระดับรหัส)", ok: true, count: out.length };
  } catch (e: any) { return { source: "สั่งสต๊อก (ระดับรหัส)", ok: false, error: e.message }; }
}

// ---------- order_form_size (รายไซส์ — แบบฟอร์มขออนุมัติสั่งผลิต) ----------
// 0=รหัส 1=ชื่อ 4=เกรด 5=SIZE(+ญ/ช) 8=WIP 9=สต็อกปัจจุบัน 10=จำนวนที่ต้องการสั่งเพิ่ม 16=เป้าหมายยอดขายต่อปี
export async function syncOrderForm(): Promise<SyncResult> {
  try {
    const SHEETS: [string, string][] = [
      ["Kaneko", "สั่งสต๊อก Kaneko"], ["CoolPlus", "สั่งสต๊อก CoolPlus"], ["Cotton", "สั่งสต๊อก Cotton"],
      ["Anti Bac", "สั่งสต๊อก Anti Bac"], ["ช็อป", "สั่งสต๊อก ช็อป"], ["คนงาน", "สั่งสต๊อก คนงาน"], ["ผ้ากันเปื้อน", "สั่งสต๊อก ผ้ากันเปื้อน"],
    ];
    const isCode = (v: string) => /^[A-Z0-9]{5,}$/.test((v || "").trim());
    const out: any[] = [];
    for (const [cat, sheet] of SHEETS) {
      const rows = await gviz(STOCK_SHEET_ID, sheet);
      let code = "", name: string | null = "", grade: string | null = "", target: number | null = null;
      for (let r = 3; r < rows.length; r++) {
        const c0 = (rows[r][0] || "").trim();
        if (isCode(c0)) { code = c0; name = (rows[r][1] || "").trim() || null; grade = (rows[r][4] || "").trim() || null; target = toNum(rows[r][16]); continue; }
        const size = (rows[r][5] || "").trim();
        if (!size || size === "SIZE" || !code) continue;
        const cur = toNum(rows[r][9]), wip = toNum(rows[r][8]) ?? 0, rp = toNum(rows[r][10]);
        if (cur == null && rp == null && !wip) continue;
        out.push({ category: cat, code, name, grade, annual_target: target, size_raw: size, current_stock: cur ?? 0, wip, reorder_point: rp ?? 0 });
      }
    }
    await replaceTable("order_form_size", out);
    return { source: "สั่งสต๊อก (รายไซส์)", ok: true, count: out.length };
  } catch (e: any) { return { source: "สั่งสต๊อก (รายไซส์)", ok: false, error: e.message }; }
}

// ---------- storage_location ----------
export async function syncStorage(): Promise<SyncResult> {
  try {
    const rows = await gviz(LAYOUT_SHEET_ID, "Storage Location PWC19");
    const map = new Map<string, { locs: Set<string>; cat: string; grade: string }>();
    for (let r = 2; r < rows.length; r++) {
      const loc = (rows[r][0] || "").trim(), cat = (rows[r][1] || "").trim(), grade = (rows[r][2] || "").trim(), code = (rows[r][3] || "").trim();
      if (!code || !loc || !/^[0-9A-Z]{4,}$/.test(code)) continue;
      if (!map.has(code)) map.set(code, { locs: new Set(), cat, grade });
      map.get(code)!.locs.add(loc);
    }
    const recs = [...map.entries()].map(([code, v]) => ({ code, locations: [...v.locs].join(", "), category: v.cat || null, grade: v.grade || null }));
    const db = admin();
    const { error: delErr } = await db.from("storage_location").delete().neq("code", " ");
    if (delErr) throw delErr;
    const { error: insErr } = await db.from("storage_location").insert(recs);
    if (insErr) throw insErr;
    const { error: rpcErr } = await db.rpc("sp_refresh_product_storage");
    if (rpcErr) throw rpcErr;
    return { source: "ตำแหน่งเก็บ (storage)", ok: true, count: recs.length };
  } catch (e: any) { return { source: "ตำแหน่งเก็บ (storage)", ok: false, error: e.message }; }
}

// ---------- packing_performance_daily ----------
// Source: Google Sheet "DATA-Performance -LGS 2026" / tab "Data Shipnity"
// ใช้ "วันที่ปิด" เป็นวันที่จัดสินค้าเสร็จจริง ถ้าว่างให้ใช้ "วันที่พิมพ์" เป็นวันที่อ้างอิง
// เพื่อให้ยอดรวมตามกลุ่มไม่ตกหล่นจากแถวที่ยังไม่ได้ระบุวันปิดงาน
// คอลัมน์ "วันที่จัดสินค้าเสร็จ" เป็น lead time/status text
export async function syncPackingPerformance(): Promise<SyncResult> {
  try {
    const rows = await gviz(LGS_PERFORMANCE_SHEET_ID, "Data Shipnity");
    type Agg = {
      finished_date: string;
      packing_group: string;
      orders: Set<string>;
      lines_count: number;
      items_qty: number;
      wrong_qty: number;
      close_days_sum: number;
      close_days_count: number;
      max_close_days: number | null;
    };
    const agg = new Map<string, Agg>();
    type StatusAgg = { finished_date: string; packing_group: string; status: string; orders: Set<string>; lines_count: number; items_qty: number };
    const statusAgg = new Map<string, StatusAgg>();
    const rawRows: any[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const closeDate = parseShipnityDate(row[15] || ""); // วันที่ปิด
      const printedDate = parseShipnityDate(row[19] || ""); // วันที่พิมพ์
      const finishedDate = closeDate || printedDate;
      const group = (row[24] || "").trim() || "(ไม่ระบุ)";
      const orderNumber = (row[5] || `row-${r}`).trim();
      const itemQty = Math.max(0, Math.round(toNum(row[3] || "") ?? 0));
      const wrongQty = Math.max(0, Math.round(toNum(row[27] || "") ?? 0));
      const completionStatus = (row[25] || "").trim() || (closeDate ? "(ไม่ระบุสถานะ)" : "ยังไม่ระบุวันปิดงาน");

      rawRows.push({
        source_row: r + 1,
        ref_date: finishedDate,
        close_date: closeDate,
        printed_date: printedDate,
        packing_group: group,
        completion_status: completionStatus,
        order_number: orderNumber || null,
        lines_count: 1,
        items_qty: itemQty,
        wrong_qty: wrongQty,
      });

      if (orderNumber && finishedDate && group) {
        const statusKey = `${finishedDate}|${group}|${completionStatus}`;
        const status = statusAgg.get(statusKey) || {
          finished_date: finishedDate,
          packing_group: group,
          status: completionStatus,
          orders: new Set<string>(),
          lines_count: 0,
          items_qty: 0,
        };
        status.orders.add(orderNumber);
        status.lines_count += 1;
        status.items_qty += itemQty;
        statusAgg.set(statusKey, status);
      }

      if (!finishedDate || !group) continue;

      const key = `${finishedDate}|${group}`;
      const cur = agg.get(key) || {
        finished_date: finishedDate,
        packing_group: group,
        orders: new Set<string>(),
        lines_count: 0,
        items_qty: 0,
        wrong_qty: 0,
        close_days_sum: 0,
        close_days_count: 0,
        max_close_days: null,
      };

      cur.orders.add(orderNumber);
      cur.lines_count += 1;
      cur.items_qty += itemQty;
      cur.wrong_qty += wrongQty;

      const closeDays = closeDate ? daysBetween(printedDate, closeDate) : null;
      if (closeDays != null) {
        cur.close_days_sum += closeDays;
        cur.close_days_count += 1;
        cur.max_close_days = cur.max_close_days == null ? closeDays : Math.max(cur.max_close_days, closeDays);
      }
      agg.set(key, cur);
    }

    const out = [...agg.values()].map((o) => ({
      finished_date: o.finished_date,
      finished_month: monthLabel(o.finished_date),
      packing_group: o.packing_group,
      orders_count: o.orders.size,
      lines_count: o.lines_count,
      items_qty: o.items_qty,
      wrong_qty: o.wrong_qty,
      avg_close_days: o.close_days_count ? Math.round((o.close_days_sum / o.close_days_count) * 100) / 100 : null,
      max_close_days: o.max_close_days,
    }));
    const statusOut = [...statusAgg.values()].map((o) => ({
      finished_date: o.finished_date,
      packing_group: o.packing_group,
      completion_status: o.status,
      orders_count: o.orders.size,
      lines_count: o.lines_count,
      items_qty: o.items_qty,
    }));
    await replaceTable("packing_performance_rows", rawRows);
    await replaceTable("packing_performance_daily", out);
    await replaceTable("packing_completion_status_daily", statusOut);
    return { source: "แพ็คสินค้า LGS รายวัน", ok: true, count: out.length };
  } catch (e: any) {
    return { source: "แพ็คสินค้า LGS รายวัน", ok: false, error: e.message };
  }
}

// ---------- Excel จาก OneDrive → monthly_flow + inv_turnover ----------
const XLSB_SHEETS = ["มูลค่าสต๊อก Week+In-Out รวม", "Inv.Trun Over", "Inv.Trun Over Runitem", "Inv.Trun Over F"];

// แปลงลิงก์แชร์ SharePoint/OneDrive (:x:/g/personal/USER/SHAREID?...) → ลิงก์ดาวน์โหลดตรง
function directDownloadUrl(u: string): string {
  const m = u.match(/^(https:\/\/[^/]+)\/:[a-z]:\/[a-z]\/(personal\/[^/]+)\/([^/?]+)/i);
  if (m) return `${m[1]}/${m[2]}/_layouts/15/download.aspx?share=${m[3]}`;
  return u; // เป็นลิงก์ดาวน์โหลดตรงอยู่แล้ว
}

async function fetchXlsb(): Promise<XLSX.WorkBook> {
  const raw = process.env.ONEDRIVE_XLSB_URL;
  if (!raw) throw new Error("ยังไม่ได้ตั้ง ONEDRIVE_XLSB_URL (ลิงก์ดาวน์โหลดไฟล์ Excel จาก OneDrive)");
  const res = await fetch(directDownloadUrl(raw), { cache: "no-store" });
  if (!res.ok) throw new Error(`ดาวน์โหลด Excel ไม่ได้ (${res.status}) — ตรวจสิทธิ์แชร์ "ทุกคนที่มีลิงก์"`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x3c || buf[0] === 0x34) throw new Error("ลิงก์ OneDrive ไม่ได้คืนไฟล์ (อาจต้องล็อกอิน) — ดู UPDATE.md");
  return XLSX.read(buf, { type: "buffer", sheets: XLSB_SHEETS });
}

export async function syncExcel(): Promise<SyncResult[]> {
  let wb: XLSX.WorkBook;
  try { wb = await fetchXlsb(); }
  catch (e: any) { return [{ source: "Excel (OneDrive)", ok: false, error: e.message }]; }
  const sheet = (name: string) => XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: true });
  const results: SyncResult[] = [];

  // monthly_flow
  try {
    const rows = sheet("มูลค่าสต๊อก Week+In-Out รวม");
    const agg = new Map<string, { business: string; category: string; month: string; month_idx: number; input: number; output: number; inv: number }>();
    for (let i = 1; i < rows.length; i++) {
      const v = rows[i]; if (!v) continue;
      const biz = typeof v[5] === "string" ? v[5].trim() : v[5];
      const cat = (typeof v[7] === "string" ? v[7].trim() : v[7]) || "(ไม่ระบุ)";
      const mo = typeof v[9] === "string" ? v[9].trim() : v[9];
      if (!biz || !MONTHS.includes(mo)) continue;
      const k = `${biz}|${cat}|${mo}`;
      const o = agg.get(k) || { business: biz, category: cat, month: mo, month_idx: MONTHS.indexOf(mo), input: 0, output: 0, inv: 0 };
      o.input += typeof v[11] === "number" ? v[11] : 0;
      o.output += typeof v[12] === "number" ? v[12] : 0;
      o.inv += typeof v[2] === "number" ? v[2] : 0;
      agg.set(k, o);
    }
    const mrows = [...agg.values()].map((o) => ({ business: o.business, category: o.category, month: o.month, month_idx: o.month_idx, input_value: Math.round(o.input * 100) / 100, output_value: Math.round(o.output * 100) / 100, inventory_value: Math.round(o.inv * 100) / 100 }));
    await replaceTable("monthly_flow", mrows);
    results.push({ source: "Input/Output/คงคลัง รายเดือน", ok: true, count: mrows.length });
  } catch (e: any) { results.push({ source: "Input/Output/คงคลัง รายเดือน", ok: false, error: e.message }); }

  // inv_turnover
  try {
    const SHEETS: [string, string][] = [["Inv.Trun Over", "Over"], ["Inv.Trun Over Runitem", "Runitem"], ["Inv.Trun Over F", "F"]];
    const out: any[] = [];
    for (const [name, key] of SHEETS) {
      const rows = sheet(name);
      for (let i = 1; i < rows.length; i++) {
        const v = rows[i]; if (!v) continue;
        const biz = typeof v[1] === "string" ? v[1].trim() : v[1];
        const mo = typeof v[2] === "string" ? v[2].trim() : v[2];
        if (!biz || !MONTHS.includes(mo)) continue;
        out.push({ sheet: key, business: biz, month: mo, month_idx: MONTHS.indexOf(mo), inv_ratio: typeof v[9] === "number" ? v[9] : null, dsi: typeof v[10] === "number" ? v[10] : null });
      }
    }
    await replaceTable("inv_turnover", out);
    results.push({ source: "Inv.Ratio / DSI", ok: true, count: out.length });
  } catch (e: any) { results.push({ source: "Inv.Ratio / DSI", ok: false, error: e.message }); }

  return results;
}

export async function syncProductMaster(): Promise<SyncResult> {
  try {
    const db = admin();
    const { error } = await db.rpc("sp_sync_product_master_from_sync_tables");
    if (error) throw error;
    const { count } = await db.from("products").select("id", { count: "exact", head: true });
    return { source: "สินค้า master", ok: true, count: count ?? 0 };
  } catch (e: any) {
    return { source: "สินค้า master", ok: false, error: e.message };
  }
}

// ---------- DATA SKU 25-06-2026 ----------
// ใช้คอลัมน์ "สูตร" + "ขนาดบรรจุ/กล่อง" เป็น master สำหรับคำนวณกล่องเต็ม/เศษ
// อัปเดตเฉพาะ SKU ที่มีอยู่ใน public.products แล้ว เพื่อไม่ให้หน้า "สินค้า" เพิ่ม SKU หลายพันรายการโดยไม่ตั้งใจ
type DataSkuRow = {
  sku: string;
  name: string | null;
  size: string | null;
  formula: string | null;
  unitsPerCarton: number | null;
  costCurrent: number | null;
};
type ProductSkuPackUpdate = {
  sku: string;
  name_th?: string | null;
  size?: string | null;
  sku_formula: string | null;
  units_per_carton: number | null;
  cost_current: number | null;
  is_active: boolean;
  source_updated_at: string;
  updated_at: string;
};

function modeNumber(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return sorted[0]?.[0] ?? null;
}

function avgNumber(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

export async function syncDataSkuPack(): Promise<SyncResult> {
  try {
    const rows = await gviz(DATA_SKU_SHEET_ID, "DATA SKU 25-06-2026");
    const sourceRows: DataSkuRow[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const sku = norm(row[0] || "");
      if (!sku) continue;
      sourceRows.push({
        sku,
        name: norm(row[1] || "") || null,
        size: norm(row[12] || "") || null,
        formula: norm(row[24] || "") || null,
        unitsPerCarton: toNum(row[25] || ""),
        costCurrent: toNum(row[20] || ""),
      });
    }

    const db = admin();
    const { data: products, error: productsErr } = await db
      .from("products")
      .select("sku");
    if (productsErr) throw productsErr;

    const exact = new Map(sourceRows.map((row) => [row.sku, row]));
    const updates = (products || []).map((product: { sku: string }): ProductSkuPackUpdate | null => {
      const sku = norm(product.sku);
      const exactRow = exact.get(sku);
      if (exactRow) {
        return {
          sku,
          name_th: exactRow.name,
          size: exactRow.size,
          sku_formula: exactRow.formula,
          units_per_carton: exactRow.unitsPerCarton,
          cost_current: exactRow.costCurrent,
          is_active: true,
          source_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      const children = sourceRows.filter((row) => row.sku.startsWith(sku));
      if (!children.length) return null;
      const packs = children.map((row) => row.unitsPerCarton).filter((n): n is number => n != null && n > 0);
      const costs = children.map((row) => row.costCurrent).filter((n): n is number => n != null && n > 0);
      const formulaBase = children[0]?.formula?.split(" ")[0] || null;
      return {
        sku,
        sku_formula: formulaBase,
        units_per_carton: modeNumber(packs),
        cost_current: avgNumber(costs),
        is_active: true,
        source_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }).filter((row): row is ProductSkuPackUpdate => row != null);

    for (const part of chunk(updates, 500)) {
      const { error } = await db
        .from("products")
        .upsert(part, { onConflict: "sku" });
      if (error) throw error;
    }

    return { source: "DATA SKU สูตร/บรรจุสินค้า", ok: true, count: updates.length };
  } catch (e: any) {
    return { source: "DATA SKU สูตร/บรรจุสินค้า", ok: false, error: e.message };
  }
}

export async function syncAll(): Promise<SyncResult[]> {
  const excel = await syncExcel();
  const [reorder, storage, orderPlan, orderForm, packing] = await Promise.all([syncReorder(), syncStorage(), syncOrderPlan(), syncOrderForm(), syncPackingPerformance()]);
  const products = await syncProductMaster();
  const dataSku = await syncDataSkuPack();
  return [...excel, reorder, storage, orderPlan, orderForm, packing, products, dataSku];
}
