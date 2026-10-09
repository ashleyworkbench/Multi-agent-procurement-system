import { Suspense } from "react";
import { DefectiveItemsView } from "@/components/defective-items/DefectiveItemsView";

export default function DefectiveItemsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-400">
          Loading defective items...
        </div>
      }
    >
      <DefectiveItemsView />
    </Suspense>
  );
}
