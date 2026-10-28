import { Suspense } from "react";
import { ProcuraView } from "@/components/procura/ProcuraView";

export default function ProcuraPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading Procura Vendor Portal...</div>}>
      <ProcuraView />
    </Suspense>
  );
}
