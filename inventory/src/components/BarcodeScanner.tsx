"use client";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { lookupProduct, type ProductLookup } from "@/app/(app)/operations/lookup";

export default function BarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<ProductLookup | null>(null);
  const [manual, setManual] = useState("");
  const router = useRouter();

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    let controls: { stop: () => void } | undefined;
    setStatus("scanning");
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (res) => {
        if (res && !stopped) {
          stopped = true;
          const text = res.getText();
          setCode(text);
          controls?.stop();
          void handleFound(text);
        }
      })
      .then((c) => (controls = c))
      .catch((e) => {
        setStatus("error");
        setErrMsg(e?.message || "เปิดกล้องไม่ได้ — ใช้ช่องพิมพ์รหัสด้านล่างแทนได้");
      });
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  async function handleFound(text: string) {
    const p = await lookupProduct(text);
    setInfo(p);
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <video ref={videoRef} className="aspect-square w-full bg-black object-cover" muted playsInline />
        <div className="p-3 text-center text-xs text-slate-500">
          {status === "scanning" && "เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ"}
          {status === "error" && <span className="text-red-600">{errMsg}</span>}
        </div>
      </div>

      {/* manual fallback */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) {
            setCode(manual.trim());
            void handleFound(manual.trim());
          }
        }}
        className="card flex gap-2 p-3"
      >
        <input
          className="input font-mono"
          placeholder="พิมพ์รหัส/บาร์โค้ดเอง"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
        />
        <button className="btn-ghost shrink-0">ค้นหา</button>
      </form>

      {code && (
        <div className="card p-4">
          <div className="mb-1 font-mono text-sm text-slate-500">{code}</div>
          {info?.found ? (
            <>
              <div className="text-lg font-semibold">{info.name}</div>
              <div className="mt-1 text-sm text-slate-500">
                บรรจุ/กล่อง {info.box_pack_size ?? "—"} · คงเหลือรวม {info.on_hand}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => router.push(`/operations?sku=${encodeURIComponent(info.sku!)}`)}>
                  ทำรายการ
                </button>
                <button className="btn-ghost" onClick={() => router.push(`/products/${encodeURIComponent(info.sku!)}`)}>
                  ดูรายละเอียด
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-red-600">ไม่พบสินค้านี้ในระบบ</div>
          )}
        </div>
      )}
    </div>
  );
}
