# -*- coding: utf-8 -*-
# สร้าง data/monthly_flow.json จาก Excel "_DATA Inventory _ Month 2026.xlsb"
# ชีต "มูลค่าสต๊อก Week+In-Out รวม" — aggregate เป็น (กลุ่มธุรกิจ x หมวด x เดือน)
#   pip install pyxlsb ; python scripts/build-monthly-flow.py "<path-to-xlsb>"
# แล้ว seed เข้า Supabase (service role) ด้วยสคริปต์ Node/SQL ที่ใช้ตาราง monthly_flow
import sys, json, collections, pathlib
from pyxlsb import open_workbook

XLSB = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\This PC\OneDrive\Documents\Desktop\_DATA Inventory _ Month 2026.xlsb"
SHEET = "มูลค่าสต๊อก Week+In-Out รวม"
MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
# คอลัมน์ (0-based): 2=มูลค่าคงคลัง, 5=กลุ่มธุรกิจ, 7=ประเภทสินค้า, 9=เดือน, 11=Input, 12=Output(ติดลบ)
agg = collections.defaultdict(lambda: {"input": 0.0, "output": 0.0, "inv": 0.0})
wb = open_workbook(XLSB)
with wb.get_sheet(SHEET) as sh:
    for i, row in enumerate(sh.rows()):
        if i == 0: continue
        v = [c.v for c in row]
        if len(v) < 13: continue
        biz = (v[5] or "").strip() if isinstance(v[5], str) else v[5]
        cat = ((v[7] or "").strip() if isinstance(v[7], str) else v[7]) or "(ไม่ระบุ)"
        mon = (v[9] or "").strip() if isinstance(v[9], str) else v[9]
        if not biz or not mon: continue
        inp = v[11] if isinstance(v[11], (int, float)) else 0
        out = v[12] if isinstance(v[12], (int, float)) else 0
        inv = v[2] if isinstance(v[2], (int, float)) else 0
        k = (biz, cat, mon)
        agg[k]["input"] += inp
        agg[k]["output"] += abs(out)
        agg[k]["inv"] += inv

rows = [{"business": b, "category": c, "month": m,
         "month_idx": MONTHS.index(m) if m in MONTHS else 99,
         "input_value": round(x["input"], 2), "output_value": round(x["output"], 2),
         "inventory_value": round(x["inv"], 2)}
        for (b, c, m), x in agg.items()]
out = pathlib.Path(__file__).parent.parent / "data" / "monthly_flow.json"
out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
print(f"wrote {len(rows)} rows -> {out}")
