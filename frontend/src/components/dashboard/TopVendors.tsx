"use client";

import { useQuery } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { ExternalLink, Star, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

export function TopVendors() {
  const { data, isLoading } = useQuery({
    queryKey: ["po-summary"],
    queryFn:  procurementApi.getSummary,
    refetchInterval: 15000,
  });

  const vendors = data?.top_vendors ?? [];

  return (
    <div className="section-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Top Vendors</h2>
          <p className="text-xs text-slate-400 mt-0.5">By order volume — live</p>
        </div>
        <Link href="/vendors" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          View All <ExternalLink size={11} />
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-slate-300" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400">
          No purchase orders yet.<br />
          Trigger the agent pipeline to generate orders.
        </div>
      ) : (
        <div className="space-y-0">
          <div className="grid grid-cols-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide pb-2 border-b border-slate-100">
            <span>Vendor</span>
            <span className="text-center">Orders</span>
            <span className="text-right">Value</span>
          </div>
          {vendors.map((v: any, i: number) => (
            <div key={i} className="grid grid-cols-3 items-center py-3 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-slate-600">
                    {v.vendor_name?.slice(0, 3).toUpperCase()}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-800 truncate">{v.vendor_name}</span>
              </div>
              <span className="text-xs text-slate-600 text-center font-semibold">{v.orders}</span>
              <span className="text-xs font-semibold text-slate-700 text-right">
                {formatCurrency(v.total_value ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
