import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { syncAll } from "@/lib/sync-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { email, profile } = await getSessionProfile();
  if (!email) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
  if (profile?.role !== "admin") return NextResponse.json({ error: "เฉพาะ admin เท่านั้น" }, { status: 403 });

  try {
    const results = await syncAll();
    return NextResponse.json({ results, at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sync ล้มเหลว" }, { status: 500 });
  }
}
