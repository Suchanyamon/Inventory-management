# -*- coding: utf-8 -*-
# สร้าง data/inv_turnover.json จาก Excel "_DATA Inventory _ Month 2026.xlsb"
# หน้า Inv.Trun Over / Over Runitem / Over F — คอลัมน์ Inv.Ratio(9) + DSI(10)
#   pip install pyxlsb ; python scripts/build-inv-turnover.py ["<path-to-xlsb>"]
import sys, json, shutil, tempfile, os, pathlib
from pyxlsb import open_workbook

XLSB = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\This PC\OneDrive\Documents\Desktop\_DATA Inventory _ Month 2026.xlsb"
MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
SHEETS = {"Inv.Trun Over": "Over", "Inv.Trun Over Runitem": "Runitem", "Inv.Trun Over F": "F"}
# คอลัมน์ (0-based): 1=กลุ่มธุรกิจ, 2=เดือน, 9=Inv.Ratio, 10=DSI

# copy ก่อนอ่าน กันไฟล์ถูกล็อก (เปิดใน Excel อยู่)
tmp = os.path.join(tempfile.gettempdir(), "_invturn_tmp.xlsb")
shutil.copyfile(XLSB, tmp)

rows = []
wb = open_workbook(tmp)
for name, key in SHEETS.items():
    with wb.get_sheet(name) as sh:
        for i, row in enumerate(sh.rows()):
            if i == 0: continue
            v = {c.c: c.v for c in row}
            b = v.get(1); mo = v.get(2)
            b = b.strip() if isinstance(b, str) else b
            mo = mo.strip() if isinstance(mo, str) else mo
            if not b or mo not in MONTHS: continue
            ratio = v.get(9); dsi = v.get(10)
            rows.append({
                "sheet": key, "business": b, "month": mo, "month_idx": MONTHS.index(mo),
                "inv_ratio": round(ratio, 6) if isinstance(ratio, (int, float)) else None,
                "dsi": round(dsi, 2) if isinstance(dsi, (int, float)) else None,
            })

wb.close()
out = pathlib.Path(__file__).parent.parent / "data" / "inv_turnover.json"
out.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
try: os.remove(tmp)
except OSError: pass
print(f"wrote {len(rows)} rows -> {out}")
