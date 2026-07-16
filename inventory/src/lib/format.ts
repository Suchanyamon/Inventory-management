// ยูทิลจัดรูปแบบตัวเลข/วันที่ (ไทย, Asia/Bangkok)
const TZ = "Asia/Bangkok";

export const nf = new Intl.NumberFormat("th-TH");
export const nf2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(n: number | null | undefined): string {
  return n == null ? "-" : nf.format(n);
}
export function baht(n: number | null | undefined): string {
  return n == null ? "-" : "฿" + nf2.format(n);
}
export function dt(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("th-TH", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// แตกจำนวนเป็นกล่องเต็ม + เศษ
export function boxBreakdown(qty: number, boxPack: number | null): { boxes: number; loose: number } | null {
  if (!boxPack || boxPack <= 0) return null;
  return { boxes: Math.floor(qty / boxPack), loose: qty % boxPack };
}

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  out: { text: "หมด", cls: "bg-red-100 text-red-700 border-red-200" },
  reorder: { text: "ต้องสั่ง", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  low: { text: "ใกล้หมด", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  ok: { text: "ปกติ", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  unknown: { text: "ยังไม่ตั้ง ROP", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};
