// =====================================================================
// test-ledger.mjs — พิสูจน์ตรรกะ ledger (สะท้อน SQL ใน 0001/0002)
//   ตรวจ: (1) โอนข้ามคลังหลายรอบ → ยอดรวมทุกคลังไม่เปลี่ยน (conservation)
//         (2) balance รายคลัง = ผลรวม movement เสมอ
//         (3) กันติดลบ (out/transfer เกินคงเหลือต้อง throw)
//         (4) FIFO valuation = ผลรวมชั้น inbound เก่าสุดที่เหลือ
// รัน:  node scripts/test-ledger.mjs   (ไม่ต้องมี DB — เป็น logic test)
// =====================================================================

// ---- จำลอง ledger append-only เหมือน stock_movement ----
class Ledger {
  constructor() { this.rows = []; this.seq = 0; }
  _bal(wh) { return this.rows.filter(r => r.wh === wh).reduce((s, r) => s + r.qty, 0); }
  balanceAll() {
    const m = {};
    for (const r of this.rows) m[r.wh] = (m[r.wh] || 0) + r.qty;
    return m;
  }
  push(wh, qty, type, unit_cost = 0, group = null) {
    if (qty === 0) throw new Error("qty must be <> 0");
    this.rows.push({ id: ++this.seq, wh, qty, type, unit_cost, group, ts: this.seq });
  }
  stockIn(wh, qty, unit_cost) { this.push(wh, qty, "in", unit_cost); }
  stockOut(wh, qty) {
    if (this._bal(wh) < qty) throw new Error(`OUT เกินคงเหลือที่ ${wh}`);
    this.push(wh, -qty, "out");
  }
  // โอนย้าย = 2 แถวผูก group เดียว (สะท้อน sp_transfer, non-lot)
  transfer(from, to, qty, unit_cost) {
    if (from === to) throw new Error("from==to");
    if (this._bal(from) < qty) throw new Error(`TRANSFER เกินคงเหลือที่ ${from}`);
    const g = "g" + (this.seq + 1);
    this.push(from, -qty, "transfer_out", unit_cost, g);
    this.push(to, qty, "transfer_in", unit_cost, g);
    return g;
  }
  // FIFO: เดินชั้น inbound เก่าสุดก่อน (สะท้อน v_stock_valuation)
  fifoValue(wh) {
    const rows = this.rows.filter(r => r.wh === wh).sort((a, b) => a.ts - b.ts);
    const totalOut = rows.filter(r => r.qty < 0).reduce((s, r) => s - r.qty, 0);
    let cum = 0, val = 0;
    for (const r of rows.filter(r => r.qty > 0)) {
      const before = cum; cum += r.qty;
      const remain = Math.max(0, Math.min(r.qty, cum - totalOut));
      val += remain * r.unit_cost;
      void before;
    }
    return val;
  }
}

// ---- assert helper ----
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } }
function throws(fn, msg) { try { fn(); fail++; console.error("  ✗ (ควร throw) " + msg); } catch { pass++; } }

// ---- deterministic PRNG (ไม่ใช้ Math.random เพื่อผลคงที่) ----
let _s = 123456789;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

console.log("=== TEST 1: conservation หลังโอนข้ามคลังหลายรอบ ===");
{
  const L = new Ledger();
  // ยอดยกมา (เหมือน seed จริง)
  L.push("DCMT", 41153, "opening", 100);
  L.push("DCMTA", 207818, "opening", 100);
  L.push("WHX", 0 + 5000, "opening", 100);
  const before = Object.values(L.balanceAll()).reduce((a, b) => a + b, 0);

  const whs = ["DCMT", "DCMTA", "WHX"];
  let done = 0;
  for (let i = 0; i < 5000; i++) {
    const from = pick(whs); let to = pick(whs); while (to === from) to = pick(whs);
    const avail = L.balanceAll()[from] || 0;
    if (avail <= 0) continue;
    const qty = Math.max(1, Math.floor(rnd() * Math.min(avail, 500)));
    try { L.transfer(from, to, qty, 100); done++; } catch { /* skip if not enough */ }
  }
  const after = Object.values(L.balanceAll()).reduce((a, b) => a + b, 0);
  console.log(`  โอนสำเร็จ ${done} รอบ | รวมก่อน ${before} → หลัง ${after}`);
  ok(before === after, "ยอดรวมทุกคลังต้องไม่เปลี่ยนหลังโอน");

  // ทุก transfer group ต้องมีผลรวม = 0
  const groups = {};
  for (const r of L.rows) if (r.group) groups[r.group] = (groups[r.group] || 0) + r.qty;
  ok(Object.values(groups).every(v => v === 0), "ทุกคู่โอน (group) ผลรวมต้อง = 0");

  // ไม่มีคลังไหนติดลบ
  ok(Object.values(L.balanceAll()).every(v => v >= 0), "ไม่มีคลังไหนติดลบ");
}

console.log("=== TEST 2: กันเบิก/โอนเกินคงเหลือ ===");
{
  const L = new Ledger();
  L.push("DCMT", 10, "opening", 50);
  throws(() => L.stockOut("DCMT", 11), "เบิกเกินคงเหลือ");
  throws(() => L.transfer("DCMT", "DCMTA", 999, 50), "โอนเกินคงเหลือ");
  L.stockOut("DCMT", 10); // เบิกพอดี
  ok((L.balanceAll()["DCMT"] || 0) === 0, "เบิกหมดพอดี = 0");
}

console.log("=== TEST 3: FIFO valuation ===");
{
  const L = new Ledger();
  // รับ 3 ชั้น ทุนต่างกัน: 100@10, 50@12, 80@15
  L.stockIn("DCMT", 100, 10);
  L.stockIn("DCMT", 50, 12);
  L.stockIn("DCMT", 80, 15);
  // เบิกออก 120 → กิน 100@10 หมด + 20@12
  L.stockOut("DCMT", 120);
  // เหลือ 30@12 + 80@15 = 360 + 1200 = 1560 ; qty 110
  const v = L.fifoValue("DCMT");
  console.log(`  FIFO value = ${v} (คาดหวัง 1560)`);
  ok(v === 1560, "FIFO value ถูกต้อง (เก่าสุดออกก่อน)");
  ok((L.balanceAll()["DCMT"] || 0) === 110, "คงเหลือหลังเบิก = 110");
}

console.log(`\n${fail === 0 ? "🎉 ผ่านทั้งหมด" : "❌ มีข้อผิดพลาด"}: pass=${pass}, fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
