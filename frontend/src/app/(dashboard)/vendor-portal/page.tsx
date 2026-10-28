import { Suspense } from "react";
import { VendorPortalView } from "@/components/vendor-portal/VendorPortalView";

export default function VendorPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="p-16 text-center text-slate-400">
          Loading Supplier Partner Portal...
        </div>
      }
    >
      <VendorPortalView />
    </Suspense>
  );
}
