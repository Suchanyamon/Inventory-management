import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { syncAll } from "@/lib/sync-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Failed to load sync profile", {
      code: profileError.code,
      message: profileError.message,
    });
  }
  if (!profile || profile.role !== "admin") return NextResponse.json({ error: "เฉพาะ admin เท่านั้น" }, { status: 403 });

  try {
    const results = await syncAll();
    return NextResponse.json({ results, at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "sync ล้มเหลว" }, { status: 500 });
  }
}
