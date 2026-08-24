"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function ApprovalsView() {
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["pending-pos"],
    queryFn:  () => procurementApi.getPOs({ status: "PENDING_APPROVAL" }),
    refetchInterval: 8000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      procurementApi.updateStatus(id, { status, performed_by: "manager" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pending-pos"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["po-summary"] });
      toast.success(vars.status === "APPROVED" ? "Purchase order approved." : "Purchase order rejected.");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const pending = data?.purchase_orders ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Live from procurement_db — auto-refreshes every 8s</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary">
          <RefreshCw size={14} className={cn(isFetching && "animate-spin")} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="section-card p-16 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-slate-300" />
        </div>
      ) : isError ? (
        <div className="section-card p-12 text-center text-sm text-red-500">
          Could not connect to Procurement Service.
        </div>
      ) : pending.length === 0 ? (
        <div className="section-card p-16 text-center">
          <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-700">All caught up!</p>
          <p className="text-sm text-slate-400 mt-1">No purchase orders waiting for approval.</p>
          <p className="text-xs text-slate-400 mt-1">
            Trigger the agent pipeline from the Agent Monitor to generate new POs.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <p className="text-sm text-amber-700 font-medium">
              {pending.length} purchase order{pending.length !== 1 ? "s" : ""} waiting for approval
            </p>
          </div>

          {pending.map((po: any) => (
            <div key={po.id} className="section-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-700">{po.po_number}</span>
                    <span className="badge badge-yellow gap-1"><Clock size={10} /> Pending Approval</span>
                    <span className="text-xs text-slate-400">{po.created_at?.slice(0,16)}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "Item",             value: po.item_name },
                      { label: "Vendor",           value: po.vendor_name },
                      { label: "Quantity",         value: po.quantity?.toLocaleString("en-IN") },
                      { label: "Unit Price",       value: formatCurrency(po.unit_price) },
                      { label: "Total Value",      value: formatCurrency(po.total_price), bold: true },
                      { label: "Expected Delivery",value: po.delivery_date_expected },
                      { label: "Request ID",       value: `#${po.request_id}` },
                    ].map(d => (
                      <div key={d.label}>
                        <p className="text-[11px] text-slate-400 uppercase tracking-wide">{d.label}</p>
                        <p className={cn("text-sm mt-0.5", d.bold ? "font-bold text-slate-900" : "font-medium text-slate-700")}>
                          {d.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {po.notes && (
                    <p className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2">{po.notes}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => updateStatus.mutate({ id: po.id, status: "APPROVED" })}
                    disabled={updateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {updateStatus.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Approve
                  </button>
                  <button
                    onClick={() => updateStatus.mutate({ id: po.id, status: "REJECTED" })}
                    disabled={updateStatus.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-200 transition-colors disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
