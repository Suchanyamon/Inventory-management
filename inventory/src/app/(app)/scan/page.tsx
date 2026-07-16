import BarcodeScanner from "@/components/BarcodeScanner";

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-md pb-16">
      <h1 className="mb-1 text-xl font-semibold">สแกนบาร์โค้ด / QR</h1>
      <p className="mb-4 text-sm text-slate-500">สแกนเพื่อดูข้อมูลสินค้า แล้วรับเข้า/เบิกออกได้ทันที</p>
      <BarcodeScanner />
    </div>
  );
}
