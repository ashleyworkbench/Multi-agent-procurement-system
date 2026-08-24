"use client";

import { useQuery } from "@tanstack/react-query";
import { ocrApi } from "@/lib/api";
import { ExternalLink, ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatCurrency, cn } from "@/lib/utils";
import { useState } from "react";

export function RecentRequestsTable() {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["ocr-requests"],
    queryFn: ocrApi.getRequests,
    refetchInterval: 15000,
  });

  const requests = data?.requests ?? [];
  const total    = data?.total    ?? 0;
  const paged    = requests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));

  return (
    <div className="section-card overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Procurement Requests</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isLoading ? "Loading..." : `${total} requests from OCR Service`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost py-1 px-2 text-xs">
            <RefreshCw size={12} className={cn(isFetching && "animate-spin")} />
          </button>
          <Link href="/requests" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
            View All <ExternalLink size={11} />
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : isError ? (
          <div className="py-10 text-center text-sm text-red-500">
            Could not connect to OCR Service. Is it running?
          </div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No requests found.</div>
        ) : (
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Requester</th>
                <th>Total Cost</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((req: any) => (
                <tr key={req.id}>
                  <td className="font-medium text-slate-500">#{req.id}</td>
                  <td className="font-medium text-slate-800 max-w-[180px] truncate">{req.requester_name}</td>
                  <td className="font-semibold text-slate-900">{formatCurrency(req.total_estimated_cost)}</td>
                  <td className="text-slate-400 text-xs whitespace-nowrap">{req.created_at?.slice(0, 16)}</td>
                  <td>
                    <TriggerButton requestId={req.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {requests.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, requests.length)} of {requests.length}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-ghost p-1.5 disabled:opacity-40"><ChevronLeft size={14} /></button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setPage(n)}
                className={cn("w-7 h-7 text-xs rounded-md font-medium transition-colors",
                  n === page ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100")}>
                {n}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-ghost p-1.5 disabled:opacity-40"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// Button that triggers the full agent pipeline for a request
function TriggerButton({ requestId }: { requestId: number }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const trigger = async () => {
    setLoading(true);
    try {
      const { agent2Api } = await import("@/lib/api");
      await agent2Api.trigger(requestId);
      setDone(true);
      setTimeout(() => setDone(false), 4000);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (done) return <span className="text-xs text-emerald-600 font-semibold">Pipeline triggered ✓</span>;

  return (
    <button onClick={trigger} disabled={loading}
      className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
      {loading ? <Loader2 size={10} className="animate-spin" /> : null}
      {loading ? "Triggering..." : "Run Agents"}
    </button>
  );
}
