"use client";
import { useFormState, useFormStatus } from "react-dom";
import { createUser, type ActionResult } from "@/app/(app)/settings/actions";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
      {pending ? "กำลังเพิ่ม…" : "เพิ่มผู้ใช้"}
    </button>
  );
}

export default function AddUserForm() {
  const [state, action] = useFormState<ActionResult | null, FormData>(createUser, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">อีเมล</span>
          <input name="email" type="email" required autoComplete="off" placeholder="user@polomaker.com" className="input w-full" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">ชื่อ-สกุล</span>
          <input name="full_name" type="text" placeholder="เช่น สมชาย ใจดี" className="input w-full" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">รหัสผ่านชั่วคราว</span>
          <input name="password" type="text" required minLength={6} placeholder="อย่างน้อย 6 ตัวอักษร" className="input w-full" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-500">บทบาท</span>
          <select name="role" defaultValue="staff" className="input w-full">
            <option value="admin">ผู้ดูแลระบบ (admin)</option>
            <option value="staff">พนักงานคลัง (staff)</option>
            <option value="viewer">ดูอย่างเดียว (viewer)</option>
          </select>
        </label>
      </div>
      <SubmitBtn />
      {state && (
        <p className={`text-sm ${state.ok ? "text-emerald-600" : "text-red-600"}`}>
          {state.ok ? "✅ " : "⚠️ "}
          {state.message}
        </p>
      )}
    </form>
  );
}
