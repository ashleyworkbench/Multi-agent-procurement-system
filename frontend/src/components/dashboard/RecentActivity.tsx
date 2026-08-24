"use client";

import { useQuery } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { ShoppingCart, FileText, Clock, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";

export function RecentActivity() {
  const { data, isLoading } = useQuery({
    queryKey: ["po-summary"],
    queryFn:  procurementApi.getSummary,
    refetchInterval: 10000,
  });

  const recent = data?.recent_pos ?? [];

  const statusColor: Record<string, string> = {
    PENDING_APPROVAL: "badge-yellow",
    APPROVED:         "badge-blue",
    ORDERED:          "badge-purple",
    DELIVERED:        "badge-green",
    REJECTED:         "badge-red",
  };

  return (
    <div className="section-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
          <p className="text-xs text-slate-400 mt-0.5">Latest purchase orders</p>
        </div>
        <Link href="/purchase-orders" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View All <ExternalLink size={11} />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : recent.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No activity yet.<br/>Trigger the agent pipeline to see live data.
        </div>
      ) : (
        <div className="space-y-3">
          {recent.slice(0, 6).map((po: any, i: number) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-brand-50 text-brand-600">
                <ShoppingCart size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 leading-snug truncate">
                  {po.po_number}
                </p>
                <p className="text-xs text-slate-500 truncate">{po.vendor_name} · {po.item_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-semibold text-slate-700">{formatCurrency(po.total_price)}</span>
                  <span className={cn("badge text-[10px]", statusColor[po.status] ?? "badge-slate")}>
                    {po.status?.replace("_", " ")}
                  </span>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                {po.created_at?.slice(0, 10)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
