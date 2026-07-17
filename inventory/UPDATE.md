# วิธีอัปเดตข้อมูลเข้าระบบ

ข้อมูลในระบบมี 2 แบบ:

## 1) สต็อก (รับ/เบิก/โอน) — อัปเดตสดในแอป ไม่ต้องทำอะไร
ทุกครั้งที่ทำรายการในแอป ยอดคงเหลือ + มูลค่า FIFO อัปเดตทันที

## 2) ข้อมูลอ้างอิง/วิเคราะห์ — รันสคริปต์เมื่อต้นทางเปลี่ยน
แก้ที่ต้นทาง (Google Sheets / Excel) แล้วรันคำสั่งด้านล่างบนเครื่องนี้

| คำสั่ง | อัปเดตอะไร | ต้นทาง |
|---|---|---|
| `npm run sync-reorder` | ต้องสั่งเพิ่ม (แยก SIZE) | Google Sheet "สั่งสต๊อก" |
| `npm run sync-storage` | ตำแหน่งเก็บ | Google Sheet "Layout PWC19" |
| `npm run sync-monthly` | Input/Output/คงคลัง รายเดือน | Excel `_DATA Inventory _ Month 2026.xlsb` |
| `npm run sync-turnover` | Inv.Ratio + DSI | Excel เดียวกัน (หน้า Inv.Trun) |
| `npm run sync-all` | ทั้งหมดข้างบนรวดเดียว | — |

> รันเสร็จ ข้อมูลจะเข้า Supabase ทันที และเว็บ (Vercel) จะแสดงค่าใหม่เมื่อรีเฟรชหน้า — **ไม่ต้อง deploy ใหม่**

---

## ตั้งค่าครั้งแรก (ทำครั้งเดียว)

1. ติดตั้งของที่ต้องใช้ (ครั้งเดียว):
   ```powershell
   cd "C:\Users\This PC\OneDrive\Documents\Desktop\Website\inventory"
   npm install
   pip install pyxlsb          # สำหรับอ่าน Excel .xlsb
   ```
2. ใส่คีย์ลงไฟล์ `inventory\.env.local` (ไฟล์นี้ไม่ถูกอัปขึ้น GitHub):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://jyeatyxztxkuxldfyscs.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key จาก Supabase > Settings > API>
   ```
   > `SUPABASE_SERVICE_ROLE_KEY` เป็นคีย์ลับ — ใช้เฉพาะรันสคริปต์บนเครื่อง ห้ามแชร์/commit

## รูทีนรายสัปดาห์ (เมื่อ Excel อัปเดต)
1. เซฟไฟล์ Excel `_DATA Inventory _ Month 2026.xlsb` ให้เรียบร้อย (ปิดหรือเปิดค้างก็ได้ สคริปต์ copy ก่อนอ่าน)
2. เปิด PowerShell:
   ```powershell
   cd "C:\Users\This PC\OneDrive\Documents\Desktop\Website\inventory"
   npm run sync-all
   ```
3. เปิดเว็บ รีเฟรช → เห็นตัวเลขใหม่

---

## 🔄 ปุ่ม "Sync ข้อมูล" ในแอป (ดึงจากคลาวด์ ไม่ต้องรันในเครื่อง)

แดชบอร์ด (เฉพาะ admin) มีปุ่ม **🔄 Sync ข้อมูล** กดแล้วเซิร์ฟเวอร์จะดึง:
- **Excel** จาก OneDrive (Input/Output/คงคลัง + Inv.Ratio/DSI)
- **Google Sheets** (ต้องสั่งเพิ่ม + ตำแหน่งเก็บ)
แล้วอัปเดต DB ให้อัตโนมัติ — รายงานผลรายแหล่งว่าสำเร็จกี่แถว

### ตั้งค่าให้ปุ่มทำงาน (บน Vercel → Project → Settings → Environment Variables)
| ตัวแปร | ค่า |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | จาก Supabase → Settings → API (Secret) |
| `ONEDRIVE_XLSB_URL` | ลิงก์ดาวน์โหลดตรงของไฟล์ Excel บน OneDrive |

**วิธีได้ ONEDRIVE_XLSB_URL:**
1. OneDrive → คลิกขวาไฟล์ `_DATA Inventory _ Month 2026.xlsb` → **แชร์** → ตั้ง "ทุกคนที่มีลิงก์" → Copy link
2. เติม `&download=1` ต่อท้ายลิงก์ (ให้เป็นดาวน์โหลดตรง ไม่ใช่หน้าเว็บ)
3. วางเป็นค่า `ONEDRIVE_XLSB_URL` ใน Vercel → Redeploy 1 ครั้ง

> **Google Sheets** (reorder/storage) ให้ทำงานผ่านปุ่ม ต้องแชร์ชีตแบบ "ทุกคนที่มีลิงก์ = ผู้อ่าน" ด้วย
> ถ้าไม่อยากแชร์สาธารณะ ใช้ `npm run sync-reorder` / `sync-storage` ในเครื่องแทนได้ (ปุ่มจะรายงานว่าส่วนนั้น error เฉยๆ ไม่กระทบส่วนอื่น)

## หมายเหตุ
- **Google Sheets**: sync ได้ต้องแชร์ชีตแบบ "ทุกคนที่มีลิงก์ = ผู้อ่าน" (หรือใช้ service account — ดูคอมเมนต์ใน `scripts/sync-reorder.mjs`)
- **Excel**: ไฟล์ต้องอยู่ที่ `Desktop\_DATA Inventory _ Month 2026.xlsb` (เปลี่ยน path ได้: `python scripts/build-monthly-flow.py "D:\path\file.xlsb"`)
- ถ้าย้ายไปเครื่องอื่น: แก้ path ไฟล์ Excel ในหัวสคริปต์ `build-monthly-flow.py` / `build-inv-turnover.py`
