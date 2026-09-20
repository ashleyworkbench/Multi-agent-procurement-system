import { Suspense } from "react";
import { PurchaseOrdersView } from "@/components/purchase-orders/PurchaseOrdersView";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading purchase orders...</div>}>
      <PurchaseOrdersView />
    </Suspense>
  );
}
