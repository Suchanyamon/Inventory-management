import { signIn } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl text-white">
            📦
          </div>
          <h1 className="text-lg font-semibold">ระบบจัดการคลังสินค้า</h1>
          <p className="text-sm text-slate-500">DCMT / DCMTA</p>
        </div>
        {searchParams.error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {searchParams.error}
          </div>
        )}
        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={searchParams.next || "/"} />
          <div>
            <label className="label">อีเมล</label>
            <input name="email" type="email" required className="input" placeholder="you@company.com" />
          </div>
          <div>
            <label className="label">รหัสผ่าน</label>
            <input name="password" type="password" required className="input" />
          </div>
          <button className="btn-primary w-full" type="submit">
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </main>
  );
}
