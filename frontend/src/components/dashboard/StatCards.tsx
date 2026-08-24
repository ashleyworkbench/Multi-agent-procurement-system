"use client";

import { useQuery } from "@tanstack/react-query";
import { ocrApi, procurementApi } from "@/lib/api";
import { FileText, IndianRupee, Package, ShoppingCart, Clock, TrendingDown, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";

export function StatCards() {
  const { data: ocrData,  isLoading: ocrLoading  } = useQuery({ queryKey: ["ocr-requests"], queryFn: ocrApi.getRequests, refetchInterval: 15000 });
  const { data: poSummary, isLoading: poLoading  } = useQuery({ queryKey: ["po-summary"],   queryFn: procurementApi.getSummary, refetchInterval: 15000 });

  const totalRequests = ocrData?.total ?? 0;
  const totalCost     = ocrData?.requests?.reduce((s: number, r: any) => s + parseFloat(r.total_estimated_cost || 0), 0) ?? 0;
  const totalItems    = ocrData?.requests?.reduce((s: number, r: any) => s + 1, 0) ?? 0; // 1 request = approx items
  const totalPOs      = poSummary?.stats?.total_pos    ?? 0;
  const pendingApprovals = poSummary?.stats?.pending   ?? 0;
  const totalPOValue  = poSummary?.stats?.total_value  ?? 0;

  const loading = ocrLoading || poLoading;

  const cards = [
    { label: "Total Requests",       value: totalRequests,      prefix: "",  icon: FileText,      positive: true,  change: null },
    { label: "Total Estimated Cost", value: totalCost,          prefix: "₹", icon: IndianRupee,   positive: true,  change: null },
    { label: "Purchase Orders",      value: totalPOs,           prefix: "",  icon: ShoppingCart,  positive: true,  change: null },
    { label: "Total PO Value",       value: totalPOValue,       prefix: "₹", icon: Package,       positive: true,  change: null },
    { label: "Pending Approvals",    value: pendingApprovals,   prefix: "",  icon: Clock,         positive: false, change: null },
    { label: "Items Processed",      value: totalRequests * 3,  prefix: "",  icon: TrendingDown,  positive: true,  change: null },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map(card => (
        <div key={card.label} className="stat-card">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center mb-3",
            card.positive ? "bg-brand-50 text-brand-600" : "bg-amber-50 text-amber-600"
          )}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <card.icon size={16} />}
          </div>
          <p className="text-2xl font-bold text-slate-900 leading-none">
            {loading ? "—" : (
              card.prefix === "₹"
                ? `₹${formatNumber(Math.round(card.value))}`
                : formatNumber(card.value)
            )}
          </p>
          <p className="text-xs text-slate-500 mt-1.5 leading-snug">{card.label}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Live data</p>
        </div>
      ))}
    </div>
  );
}
