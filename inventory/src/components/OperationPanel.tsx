"use client";
import { useState, useEffect, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { doStockIn, doStockOut, doTransfer, type OpResult } from "@/app/(app)/operations/actions";
import { lookupProduct, type ProductLookup } from "@/app/(app)/operations/lookup";
import { boxBreakdown, num } from "@/lib/format";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full" disabled={pending}>
      {pending ? "กำลังบันทึก…" : label}
    </button>
  );
}

type Mode = "in" | "out" | "transfer";
const MODES: { key: Mode; label: string; icon: string }[] = [
  { key: "in", label: "รับเข้า", icon: "⬇️" },
  { key: "out", label: "เบิกออก", icon: "⬆️" },
  { key: "transfer", label: "โอนย้าย", icon: "🔁" },
];

export default function OperationPanel({
  warehouses,
  initialSku = "",
}: {
  warehouses: { code: string; name: string }[];
  initialSku?: string;
}) {
  const [mode, setMode] = useState<Mode>("in");
  const [sku, setSku] = useState(initialSku);
  const [qty, setQty] = useState<number>(0);
  const [info, setInfo] = useState<ProductLookup | null>(null);
  const [looking, startLookup] = useTransition();

  const action = mode === "in" ? doStockIn : mode === "out" ? doStockOut : doTransfer;
  const [result, formAction] = useFormState<OpResult | null, FormData>(action as any, null);

  function runLookup(k: string) {
    if (!k.trim()) return setInfo(null);
    startLookup(async () => setInfo(await lookupProduct(k)));
  }
  useEffect(() => {
    if (initialSku) runLookup(initialSku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSku]);

  const bd = info?.found ? boxBreakdown(qty || 0, info.box_pack_size ?? null) : null;

  return (
    <div className="card p-5">
      {/* mode tabs */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={
              "btn " + (mode === m.key ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600")
            }
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      <form action={formAction} className="space-y-4" key={mode}>
        {/* SKU */}
        <div>
          <label className="label">SKU / บาร์โค้ด</label>
          <input
            name="sku"
            className="input font-mono"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            onBlur={(e) => runLookup(e.target.value)}
            placeholder="สแกนหรือพิมพ์รหัสสินค้า"
            required
            autoFocus
          />
          {looking && <p className="mt-1 text-xs text-slate-400">กำลังค้นหา…</p>}
          {info && !info.found && <p className="mt-1 text-xs text-red-600">ไม่พบสินค้านี้</p>}
          {info?.found && (
            <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-medium">{info.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>บรรจุ/กล่อง: <b className="text-slate-700">{info.box_pack_size ?? "—"}</b> {info.unit}</span>
                <span>คงเหลือรวม: <b className="text-slate-700">{num(info.on_hand)}</b></span>
                {info.balances?.map((b) => (
                  <span key={b.warehouse_code}>{b.warehouse_code}: <b className="text-slate-700">{num(b.qty)}</b></span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* qty */}
        <div>
          <label className="label">จำนวน ({info?.unit || "หน่วย"})</label>
          <input
            name="qty"
            type="number"
            min={1}
            step="1"
            className="input"
            value={qty || ""}
            onChange={(e) => setQty(Number(e.target.value))}
            required
          />
          {/* box breakdown hint */}
          {bd && qty > 0 && (
            <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-800">
              📦 = <b>{num(bd.boxes)}</b> กล่องเต็ม ({num((info!.box_pack_size || 0))}/กล่อง)
              {bd.loose > 0 && <> + เศษ <b>{num(bd.loose)}</b> {info?.unit}</>}
            </div>
          )}
        </div>

        {/* warehouse selection */}
        {mode === "transfer" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">จากคลัง</label>
              <select name="from_wh" className="input" required defaultValue={warehouses[0]?.code}>
                {warehouses.map((w) => (
                  <option key={w.code} value={w.code}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ไปคลัง</label>
              <select name="to_wh" className="input" required defaultValue={warehouses[1]?.code}>
                {warehouses.map((w) => (
                  <option key={w.code} value={w.code}>{w.code} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="label">คลัง</label>
            <select name="warehouse" className="input" required defaultValue={warehouses[0]?.code}>
              {warehouses.map((w) => (
                <option key={w.code} value={w.code}>{w.code} — {w.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* lot fields for stock-in when has_lot */}
        {mode === "in" && info?.has_lot && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">เลขล็อต</label>
              <input name="lot_no" className="input" required />
            </div>
            <div>
              <label className="label">วันหมดอายุ</label>
              <input name="expiry" type="date" className="input" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">เลขเอกสารอ้างอิง</label>
            <input name="ref_doc" className="input" placeholder="เช่น PO-2026-001" />
          </div>
          {mode === "in" && (
            <div>
              <label className="label">ทุน/หน่วย (ไม่บังคับ)</label>
              <input name="unit_cost" type="number" step="0.01" className="input" />
            </div>
          )}
        </div>
        <div>
          <label className="label">หมายเหตุ</label>
          <input name="note" className="input" />
        </div>

        <SubmitButton label={MODES.find((m) => m.key === mode)?.label || "บันทึก"} />

        {result && (
          <div
            className={
              "rounded-lg px-3 py-2 text-sm " +
              (result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
            }
          >
            {result.ok ? "✓ " : "✗ "}
            {result.message}
          </div>
        )}
      </form>
    </div>
  );
}
