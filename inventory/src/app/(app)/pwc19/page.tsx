import { createSupabaseServer } from "@/lib/supabase/server";
import { baht, num } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const NEAR_EXPIRY_DAYS = Number(process.env.NEAR_EXPIRY_DAYS || 90);

const STATUS = {
  out: { label: "หมด", cls: "text-red-600" },
  reorder: { label: "ต้องสั่ง", cls: "text-orange-600" },
  low: { label: "ใกล้หมด", cls: "text-amber-600" },
  ok: { label: "ปกติ", cls: "text-emerald-600" },
} as const;

export default async function DashboardPWC19({ searchParams }: { searchParams: { zone?: string; sku?: string; productType?: string; fabric?: string } }) {
  const supabase = createSupabaseServer();
  const zone = (searchParams.zone || "").trim();
  const skuSearch = (searchParams.sku || "").trim();
  const productType = (searchParams.productType || "").trim();
  const fabric = (searchParams.fabric || "").trim();

  let inventoryQuery = supabase
    .from("v_pwc19_inventory_valuation_by_sku")
    .select("sku,name,storage_location,product_type,fabric,dcmt_qty,dcmt_full_boxes,dcmt_loose_units,dcmt_value,dcmta_qty,dcmta_full_boxes,dcmta_loose_units,dcmta_value,units_per_carton", { count: "exact" })
    .order("storage_location", { ascending: true, nullsFirst: false })
    .order("sku", { ascending: true })
    .limit(200);

  if (skuSearch) {
    inventoryQuery = inventoryQuery.or(`sku.ilike.%${skuSearch}%,name.ilike.%${skuSearch}%`);
  }
  if (productType) inventoryQuery = inventoryQuery.eq("product_type", productType);
  if (fabric) inventoryQuery = inventoryQuery.eq("fabric", fabric);

  const [
    { data: valByWh }, { count: reorderCount }, { data: nearExp }, { data: statusSum }, { data: byCat },
    { data: abc }, { data: zones }, { data: inventoryRows, count: inventoryCount }, { data: storageLocations },
    { data: productTypeRows }, { data: fabricRows },
  ] = await Promise.all([
    supabase.from("v_valuation_by_warehouse_snapshot").select("*"),
    supabase.from("v_reorder_list").select("*", { count: "exact", head: true }),
    supabase.from("v_near_expiry").select("sku,name,warehouse_code,lot_no,expiry_date,days_left,qty").lte("days_left", NEAR_EXPIRY_DAYS).gte("days_left", 0).limit(6),
    supabase.from("v_stock_status_summary").select("*"),
    supabase.from("v_valuation_by_category_snapshot").select("*").limit(10),
    supabase.from("v_abc_summary").select("*"),
    supabase.from("v_zone_usage").select("*"),
    inventoryQuery,
    supabase.from("storage_location").select("code,locations").order("code"),
    supabase.from("v_pwc19_inventory_valuation_by_sku").select("product_type").order("product_type"),
    supabase.from("v_pwc19_inventory_valuation_by_sku").select("fabric").order("fabric"),
  ]);

  const totalValue = (valByWh || []).reduce((s, w) => s + Number(w.total_value_fifo || 0), 0);
  const totalQty = (valByWh || []).reduce((s, w) => s + Number(w.total_qty || 0), 0);
  const maxVal = Math.max(1, ...(valByWh || []).map((w) => Number(w.total_value_fifo || 0)));
  const statusMap = Object.fromEntries((statusSum || []).map((s) => [s.stock_status, s]));
  const catMax = Math.max(1, ...(byCat || []).map((c) => Number(c.total_value_fifo || 0)));
  const sortedZones = [...(zones || [])].sort((a, b) => String(a.zone || "").localeCompare(String(b.zone || ""), "en", { numeric: true }));
  const zoneMax = Math.max(1, ...sortedZones.map((z) => Number(z.slots || 0)));
  const inventoryDcmtTotal = (inventoryRows || []).reduce((s, d) => s + Number(d.dcmt_value || 0), 0);
  const inventoryDcmtaTotal = (inventoryRows || []).reduce((s, d) => s + Number(d.dcmta_value || 0), 0);
  const productTypes = [...new Set((productTypeRows || []).map((r) => String(r.product_type || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const fabrics = [...new Set((fabricRows || []).map((r) => String(r.fabric || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const hasInventoryFilters = Boolean(skuSearch || productType || fabric);
  const selectedZoneRows = (storageLocations || [])
    .flatMap((row) =>
      row.locations.split(",").map((location: string) => location.trim()).filter(Boolean).flatMap((location: string) => {
        const rowZone = location.split(/\s+/)[0];
        if (zone && zone !== "all" && rowZone !== zone) return [];
        return [{ code: row.code, location, zone: rowZone }];
      }),
    )
    .sort((a, b) => a.location.localeCompare(b.location, "en", { numeric: true }) || a.code.localeCompare(b.code, "en", { numeric: true }));
  const zoneTitle = zone === "all" ? "ทั้งหมด" : zone;

  return (
    <div className="space-y-6 pb-16">
      <h1 className="text-xl font-semibold">แดชบอร์ด PWC19</h1>

      {/* KPI รวม */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi title="มูลค่าสต๊อก (FIFO)" value={baht(totalValue)} accent="text-brand" />
        <Kpi title="จำนวนคงเหลือรวม" value={num(totalQty) + " ชิ้น"} />
        <Kpi title="ต้องสั่งเพิ่ม" value={num(reorderCount || 0) + " รายการ"} accent="text-orange-600" href="/order" />
        <Kpi title="ใกล้หมดอายุ" value={num((nearExp || []).length) + " ล็อต"} accent="text-amber-600" />
      </div>

      {/* 🚦 สรุปสถานะสต็อก */}
      <div className="card p-4">
        <h2 className="mb-3 font-semibold">🚦 สถานะสต็อก (ตาม ROP)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["out", "reorder", "low", "ok"] as const).map((k) => (
            <div key={k} className="rounded-lg border border-slate-100 p-3">
              <div className={"text-xs font-medium " + STATUS[k].cls}>● {STATUS[k].label}</div>
              <div className="mt-1 text-2xl font-bold">{num(Number(statusMap[k]?.sku_count || 0))}</div>
              <div className="text-xs text-slate-400">SKU · {baht(Number(statusMap[k]?.value || 0))}</div>
            </div>
          ))}
        </div>
      </div>

      {/* KPI ต่อคลัง */}
      <div className="grid gap-3 md:grid-cols-2">
        {(valByWh || []).map((w) => (
          <div key={w.warehouse_code} className="card p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{w.warehouse_code}</div>
              <div className="text-xs text-slate-400">{w.warehouse_name}</div>
            </div>
            <div className="mt-2 text-2xl font-bold text-brand">{baht(Number(w.total_value_fifo))}</div>
            <div className="text-xs text-slate-500">{num(Number(w.total_qty))} ชิ้น · {num(Number(w.sku_count))} SKU</div>
            <div className="mt-2 h-2 rounded bg-slate-100"><div className="h-full rounded bg-brand" style={{ width: `${(Number(w.total_value_fifo) / maxVal) * 100}%` }} /></div>
          </div>
        ))}
      </div>

      {/* 💰 มูลค่าแยกหมวด + ABC */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">💰 มูลค่าสต็อกแยกหมวด (Top 10)</h2>
          <div className="space-y-2">
            {(byCat || []).map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-xs"><span className="font-mono text-slate-500">{c.category}</span><span className="font-medium">{baht(Number(c.total_value_fifo))}</span></div>
                <div className="mt-0.5 h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-brand" style={{ width: `${(Number(c.total_value_fifo) / catMax) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p-4">
          <h2 className="mb-1 font-semibold">🔤 ABC Analysis</h2>
          <p className="mb-3 text-xs text-slate-400">แบ่งตามสัดส่วนมูลค่าสะสม (A≤80% · B≤95% · C ที่เหลือ)</p>
          <div className="grid grid-cols-3 gap-3">
            {(["A", "B", "C"] as const).map((cls) => {
              const r = (abc || []).find((x) => x.abc === cls);
              const color = cls === "A" ? "text-brand" : cls === "B" ? "text-amber-600" : "text-slate-500";
              return (
                <div key={cls} className="rounded-lg border border-slate-100 p-3 text-center">
                  <div className={"text-2xl font-bold " + color}>{cls}</div>
                  <div className="mt-1 text-sm font-medium">{num(Number(r?.sku_count || 0))} SKU</div>
                  <div className="text-xs text-slate-400">{baht(Number(r?.value || 0))}</div>
                  <div className="text-[11px] text-slate-400">{num(Number(r?.pct || 0))}% ของมูลค่า</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 🗺️ การใช้พื้นที่ตามโซนเก็บ */}
      <div className="card p-4">
        <h2 className="mb-1 font-semibold">🗺️ การใช้พื้นที่ตามโซนเก็บ (PWC19)</h2>
        <p className="mb-3 text-xs text-slate-400">
          <Link href="/pwc19?zone=all#zone-products" className="font-medium text-brand hover:underline">ทั้งหมด {num(sortedZones.length)} โซน</Link>
          <span> · กดโซนเพื่อดูรหัสสินค้าที่จัดเก็บในโซนนั้น · ตัวเลข = จำนวนช่องเก็บที่ใช้</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {sortedZones.map((z) => (
            <Link key={z.zone} href={`/pwc19?zone=${encodeURIComponent(z.zone)}#zone-products`} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-brand hover:bg-brand/5 ${zone === z.zone ? "border-brand bg-brand/10" : "border-slate-200"}`} title={`ดู ${z.codes} รหัสสินค้าในโซน ${z.zone}`}>
              <b>{z.zone}</b>
              <span className="inline-block rounded bg-brand/10 px-1 text-brand" style={{ opacity: 0.4 + 0.6 * (Number(z.slots) / zoneMax) }}>{num(Number(z.slots))}</span>
            </Link>
          ))}
        </div>
        {zone && (
          <div id="zone-products" className="mt-4 rounded-lg border border-brand/20 bg-brand/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">รหัสสินค้าในโซน {zoneTitle}</h3>
                <p className="text-xs text-slate-500">พบ {num(selectedZoneRows.length)} รหัส/ตำแหน่ง</p>
              </div>
              <Link href="/pwc19" className="btn-ghost text-xs">ปิดรายการ</Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedZoneRows.map((row) => (
                <Link key={`${row.code}-${row.location}`} href={`/products?q=${encodeURIComponent(row.code)}`} className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-brand hover:border-brand hover:underline">
                  {row.code} <span className="font-sans text-slate-400">({row.location})</span>
                </Link>
              ))}
              {selectedZoneRows.length === 0 && <span className="text-sm text-slate-500">ไม่พบรหัสสินค้าในโซนนี้</span>}
            </div>
          </div>
        )}
      </div>

      {/* 🧮 มูลค่าคงคลังสินค้า DCMT / DCMTA */}
      <div id="inventory-valuation" className="card">
        <div className="border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">🧮 มูลค่าคงคลังสินค้าของคลัง DCMT / DCMTA</h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {num(inventoryCount || 0)} SKU · แสดง 200 รายการแรกเรียงตามตำแหน่งเก็บ PWC19 · มูลค่าหน้านี้ DCMT {baht(inventoryDcmtTotal)} / DCMTA {baht(inventoryDcmtaTotal)}
              </p>
            </div>
            {hasInventoryFilters && <Link href="/pwc19#inventory-valuation" className="btn-ghost text-xs">ล้างตัวกรอง</Link>}
          </div>
          <form className="mt-4 grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_auto]" action="/pwc19#inventory-valuation">
            <input
              name="sku"
              defaultValue={skuSearch}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="ค้นหา SKU / ชื่อสินค้า"
            />
            <select name="productType" defaultValue={productType} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">ทุกประเภทสินค้า</option>
              {productTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select name="fabric" defaultValue={fabric} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand">
              <option value="">ทุกเนื้อผ้า</option>
              {fabrics.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button className="btn-primary whitespace-nowrap" type="submit">ค้นหา</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="th">รหัสสินค้า</th>
                <th className="th">ชื่อสินค้า</th>
                <th className="th">ตำแหน่ง</th>
                <th className="th text-right">คงเหลือ DCMT<br /><span className="text-[11px] font-normal text-slate-400">จำนวนตัวเศษ</span></th>
                <th className="th text-right">มูลค่าคงคลังสินค้า DCMT</th>
                <th className="th text-right">คงเหลือ DCMTA<br /><span className="text-[11px] font-normal text-slate-400">จำนวนตัว / กล่อง</span></th>
                <th className="th text-right">มูลค่าสินค้า DCMTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(inventoryRows || []).map((d) => (
                <tr key={d.sku} className="hover:bg-slate-50">
                  <td className="td font-mono text-xs"><Link href={`/products/${encodeURIComponent(d.sku)}`} className="text-brand hover:underline">{d.sku}</Link></td>
                  <td className="td max-w-[220px] truncate">{d.name}</td>
                  <td className="td text-xs text-slate-500">{d.storage_location || "-"}</td>
                  <td className="td text-right">
                    <DcmtLoose qty={Number(d.dcmt_qty || 0)} loose={d.dcmt_loose_units} />
                  </td>
                  <td className="td text-right font-medium text-brand">{baht(Number(d.dcmt_value || 0))}</td>
                  <td className="td text-right">
                    <DcmtaQtyPack qty={Number(d.dcmta_qty || 0)} boxes={d.dcmta_full_boxes} loose={d.dcmta_loose_units} />
                  </td>
                  <td className="td text-right font-medium text-brand">{baht(Number(d.dcmta_value || 0))}</td>
                </tr>
              ))}
              {(!inventoryRows || inventoryRows.length === 0) && (
                <tr>
                  <td className="td py-8 text-center text-slate-400" colSpan={7}>ไม่พบสินค้าตามตัวกรองนี้</td>
                </tr>
              )}
            </tbody>
          </table>
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

function DcmtLoose({ qty, loose }: { qty: number; loose: number | string | null }) {
  const looseCount = loose === null || loose === undefined ? qty : Number(loose);

  return (
    <div>
      <div className="font-medium">{num(looseCount)} ตัวเศษ</div>
      <div className="text-[11px] text-slate-400">รวม {num(qty)} ชิ้น</div>
    </div>
  );
}

function DcmtaQtyPack({ qty, boxes, loose }: { qty: number; boxes: number | string | null; loose: number | string | null }) {
  const boxCount = boxes === null || boxes === undefined ? null : Number(boxes);
  const looseCount = loose === null || loose === undefined ? null : Number(loose);

  if (boxCount === null) {
    return <span>{num(qty)} ตัว</span>;
  }

  return (
    <div>
      <div className="font-medium">{num(qty)} ตัว</div>
      <div className="text-[11px] text-slate-400">{num(boxCount)} กล่อง · {num(looseCount || 0)} เศษ</div>
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
