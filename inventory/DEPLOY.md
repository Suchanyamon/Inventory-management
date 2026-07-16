# Deploy ขึ้น Vercel (ผ่าน GitHub — auto-deploy)

โปรเจกต์นี้อยู่ในโฟลเดอร์ย่อย `inventory/` ของ repo → ตอน import ให้ตั้ง **Root Directory = `inventory`**

## 1) Push ขึ้น GitHub

สร้าง repo เปล่าใหม่ที่ https://github.com/new (เช่นชื่อ `inventory-management`, ตั้ง Private ได้)
แล้วรันใน PowerShell:

```powershell
cd "C:\Users\This PC\OneDrive\Documents\Desktop\Website"
git remote add origin https://github.com/<username>/<repo>.git
git branch -M main
git push -u origin main
```
> ครั้งแรก Git จะให้ล็อกอิน GitHub (เปิดเบราว์เซอร์ หรือใช้ Personal Access Token)

## 2) Import เข้า Vercel

1. ไปที่ https://vercel.com/new
2. **Import Git Repository** → เลือก repo ที่เพิ่ง push
3. ตั้งค่า:
   - **Root Directory** → กด *Edit* → เลือก **`inventory`** ⬅️ สำคัญ
   - Framework Preset → **Next.js** (ตรวจเจอเอง)
   - Build/Output → ค่า default
4. **Environment Variables** — เพิ่ม 2 ตัวนี้ (จาก Supabase → Settings → API):

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://jyeatyxztxkuxldfyscs.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `<anon key>` |

   (ไม่ต้องใส่ service role key — แอปไม่ใช้ ฝั่ง client)
5. กด **Deploy** → รอ ~1–2 นาที → ได้ URL production

## 3) หลัง deploy

- ทุกครั้งที่ `git push` → Vercel deploy ใหม่อัตโนมัติ
- สร้าง user admin: Supabase → Authentication → Add user (auto confirm) → trigger ตั้งเป็น admin "Suchanyamon.M" อัตโนมัติ
- เข้า URL → ล็อกอิน → ใช้งานได้ครบ

## ค่า env ทั้งหมด (อ้างอิง)
ดู `.env.example` — บน Vercel ตั้งเฉพาะ `NEXT_PUBLIC_*` ก็พอ
(`NEAR_EXPIRY_DAYS`, `DEFAULT_LEAD_TIME_DAYS` มี default ในโค้ดอยู่แล้ว)
