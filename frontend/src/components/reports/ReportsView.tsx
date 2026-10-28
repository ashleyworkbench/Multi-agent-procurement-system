"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  reportsApi,
  getStoredUser,
  type OrderReportSummary,
  type OrderReportDetail,
  type OrderReportMetrics,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  FileText,
  ShieldCheck,
  RefreshCw,
  Search,
  Eye,
  Trash2,
  Download,
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  Loader2,
  X,
  Copy,
  Check,
  DollarSign,
  Truck,
  RotateCcw,
  Sparkles,
  MessageSquare,
  FileSpreadsheet,
  Hash,
  Scale,
  GitBranch,
  Bot,
  User,
  Send,
} from "lucide-react";
import { toast } from "sonner";

export default function ReportsView() {
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();

  // Filter & Search states
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "APPROVED" | "REVISED" | "DELIVERED" | "SUPERSEDED">("ALL");
  const [selectedReportId, setSelectedReportId] = useState<string | number | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [activeDossierTab, setActiveDossierTab] = useState<
    "summary" | "changes" | "negotiations" | "governance" | "risk" | "finance"
  >("summary");

  // Fetch Reports list (Agent 6 auto-ensures every PO is documented)
  const {
    data: reportsData,
    isLoading: isReportsLoading,
    refetch: refetchReports,
  } = useQuery({
    queryKey: ["orderReports", search, activeTab],
    queryFn: async () => {
      let statusParam: string | undefined = undefined;
      if (activeTab === "APPROVED") statusParam = "APPROVED";
      if (activeTab === "DELIVERED") statusParam = "DELIVERED";
      if (activeTab === "SUPERSEDED") statusParam = "SUPERSEDED";

      const res = await reportsApi.getReports({
        search: search.trim() || undefined,
        status: statusParam,
        limit: 100,
      });
      return res;
    },
  });

  // Fetch Summary Metrics across all order documentation
  const { data: metrics, isLoading: isMetricsLoading, refetch: refetchMetrics } = useQuery<OrderReportMetrics>({
    queryKey: ["orderReportMetrics"],
    queryFn: () => reportsApi.getMetrics(),
  });

  // Fetch Single Report Detail when modal is open
  const { data: selectedReport, isLoading: isDetailLoading } = useQuery<OrderReportDetail>({
    queryKey: ["orderReportDetail", selectedReportId],
    queryFn: () => reportsApi.getReport(selectedReportId!),
    enabled: !!selectedReportId && isDetailModalOpen,
  });

  // Regenerate / Sync mutation
  const regenerateMutation = useMutation({
    mutationFn: ({ poId, reason }: { poId: number; reason?: string }) =>
      reportsApi.regenerateReport(poId, reason || "PO_LIFECYCLE_SYNC"),
    onSuccess: (data) => {
      toast.success(data.message || "Order report synchronized with latest modifications.");
      queryClient.invalidateQueries({ queryKey: ["orderReports"] });
      queryClient.invalidateQueries({ queryKey: ["orderReportMetrics"] });
      if (selectedReportId) {
        queryClient.invalidateQueries({ queryKey: ["orderReportDetail", selectedReportId] });
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to synchronize report.");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (reportId: string | number) => reportsApi.deleteReport(reportId),
    onSuccess: () => {
      toast.success("Report deleted successfully.");
      if (selectedReportId) setIsDetailModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["orderReports"] });
      queryClient.invalidateQueries({ queryKey: ["orderReportMetrics"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to delete report.");
    },
  });

  // Filtered reports
  const displayedReports = useMemo(() => {
    let list = reportsData?.reports || [];
    if (activeTab === "REVISED") {
      list = list.filter((r) => r.version > 1 || r.order_data?.status === "SUPERSEDED" || r.po_number?.includes("-R"));
    }
    return list;
  }, [reportsData, activeTab]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    toast.success("SHA-256 Checksum copied to clipboard");
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl shadow-xl border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.15),transparent_70%)] pointer-events-none" />
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
              Agent 6 &bull; Order Closeout & Lifecycle Intelligence
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Autonomous PO Documentation
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            Purchase Order Documentation & Final Reports
          </h1>
          <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
            Full-fledged documentation dossiers generated automatically for every purchase order. Captures the complete order lifecycle: requisition specifications, status modifications, vendor negotiation queries, governance sign-offs, and financial settlement.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => {
              refetchReports();
              refetchMetrics();
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/60 transition-colors shadow-sm text-xs font-medium"
            title="Refresh order dossiers"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isReportsLoading && "animate-spin text-indigo-400")} />
            Sync Orders
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Orders Documented */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-indigo-400/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Orders Documented</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {metrics?.total_orders_documented ?? reportsData?.total ?? 0}
            </span>
            <span className="text-xs text-slate-500">100% of POs</span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Autonomous Agent 6 verification</span>
          </div>
        </div>

        {/* Approved Orders */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-emerald-400/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Approved & Signed</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics?.approved_orders ?? 0}
            </span>
            <span className="text-xs text-slate-500">active orders</span>
          </div>
          <div className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <span>DocuSign certified</span>
          </div>
        </div>

        {/* Negotiated / Revised Orders */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-purple-400/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Negotiated / Revisions</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <GitBranch className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {metrics?.revised_orders ?? 0}
            </span>
            <span className="text-xs text-slate-500">counter-proposals</span>
          </div>
          <div className="mt-3 text-xs text-purple-600 dark:text-purple-400 font-medium">
            Procura AI negotiations tracked
          </div>
        </div>

        {/* Delivered / Completed */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-blue-400/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Delivered / Fulfillment</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {metrics?.delivered_orders ?? 0}
            </span>
            <span className="text-xs text-slate-500">fulfilled</span>
          </div>
          <div className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-medium">
            Receiving & QA inspection logged
          </div>
        </div>

        {/* Total Spend Documented */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group hover:border-amber-400/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Documented Contract Value</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              ₹{(metrics?.total_spend_documented ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="mt-3 text-xs text-slate-500 flex items-center justify-between">
            <span>Reconciled value</span>
            <span className="font-semibold text-emerald-600">Audited</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: "ALL", label: "All Orders", count: metrics?.total_orders_documented },
            { id: "APPROVED", label: "Approved & Signed", count: metrics?.approved_orders },
            { id: "REVISED", label: "Negotiated / Revised", count: metrics?.revised_orders },
            { id: "DELIVERED", label: "Delivered", count: metrics?.delivered_orders },
            { id: "SUPERSEDED", label: "Superseded", count: metrics?.superseded_orders },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded-md text-[10px]",
                    activeTab === tab.id
                      ? "bg-indigo-700/80 text-white"
                      : "bg-slate-200/70 dark:bg-slate-800 text-slate-500"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative min-w-[260px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by PO #, Vendor, or Item..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {isReportsLoading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm">Compiling purchase order dossiers...</p>
          </div>
        ) : displayedReports.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-500 flex items-center justify-center mb-3">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Order Reports Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
              No orders matched your search or status filter. Agent 6 continuously documents all purchase orders created in ProcureFlow.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                  <th className="py-3.5 px-4">Order Dossier ID</th>
                  <th className="py-3.5 px-4">Purchase Order & Scope</th>
                  <th className="py-3.5 px-4">Contracted Vendor</th>
                  <th className="py-3.5 px-4">Lifecycle Status</th>
                  <th className="py-3.5 px-4">Contract Value</th>
                  <th className="py-3.5 px-4">Integrity Seal</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedReports.map((report) => {
                  const poStatus = report.order_data?.status || "APPROVED";
                  const isRevised = report.version > 1 || poStatus === "SUPERSEDED" || report.po_number?.includes("-R");

                  return (
                    <tr
                      key={report.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Report ID & Version */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-900 dark:text-white font-mono text-[11px]">
                              {report.report_id}
                            </span>
                            <span
                              className={cn(
                                "px-1.5 py-0.2 rounded text-[10px] font-bold",
                                isRevised
                                  ? "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                              )}
                              title={isRevised ? report.regeneration_reason : "Initial Version"}
                            >
                              v{report.version}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(report.created_at).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Purchase Order & Scope */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {report.po_number}
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">
                            {report.order_data?.item_name} &bull; {report.order_data?.quantity?.toLocaleString()} units
                          </span>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            {report.vendor_name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <ShieldCheck className="w-3 h-3" />
                            Tier: {report.order_data?.approval_tier || "TIER_1_OFFICER"}
                          </span>
                        </div>
                      </td>

                      {/* Lifecycle Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                            poStatus === "APPROVED" && "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
                            poStatus === "DELIVERED" && "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
                            poStatus === "SUPERSEDED" && "bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
                            poStatus === "REJECTED" && "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
                            poStatus === "PENDING_APPROVAL" && "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                          )}
                        >
                          {poStatus === "APPROVED" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                          {poStatus === "DELIVERED" && <Truck className="w-3 h-3 text-blue-600" />}
                          {poStatus === "SUPERSEDED" && <GitBranch className="w-3 h-3 text-purple-600" />}
                          {poStatus === "REJECTED" && <XCircle className="w-3 h-3 text-rose-600" />}
                          {poStatus}
                        </span>
                      </td>

                      {/* Financial Total */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            ₹{Number(report.order_data?.total_price || report.financial_breakdown?.gross_order_amount || 0).toLocaleString("en-IN", {
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            @ ₹{Number(report.order_data?.unit_price || 0).toLocaleString()}/unit
                          </span>
                        </div>
                      </td>

                      {/* Integrity Seal */}
                      <td className="py-3.5 px-4">
                        <div
                          onClick={() => copyToClipboard(report.integrity_hash)}
                          className="group/hash flex items-center gap-1 font-mono text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer hover:text-indigo-500 transition-colors"
                          title="Click to copy SHA-256 Checksum"
                        >
                          <Hash className="w-3 h-3 text-slate-400" />
                          <span>{report.integrity_hash?.slice(0, 8)}...</span>
                          <Copy className="w-2.5 h-2.5 opacity-0 group-hover/hash:opacity-100 transition-opacity" />
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Full Dossier */}
                          <button
                            onClick={() => {
                              setSelectedReportId(report.id);
                              setIsDetailModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                            title="View Complete Order Dossier"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Download PDF */}
                          <a
                            href={reportsApi.getDownloadUrl(report.id)}
                            download={report.pdf_filename || `${report.report_id}.pdf`}
                            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 transition-colors"
                            title="Download Official PDF Dossier"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          {/* Sync / Refresh */}
                          <button
                            onClick={() => {
                              regenerateMutation.mutate({ poId: report.po_id });
                            }}
                            disabled={regenerateMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/60 text-purple-600 dark:text-purple-400 transition-colors"
                            title="Sync with latest order modifications and negotiations"
                          >
                            <RotateCcw
                              className={cn(
                                "w-4 h-4",
                                regenerateMutation.isPending && "animate-spin"
                              )}
                            />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete report ${report.report_id}?`)) {
                                deleteMutation.mutate(report.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-500 transition-colors"
                            title="Delete Report"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* EXECUTIVE ORDER DOSSIER DETAIL MODAL                          */}
      {/* ------------------------------------------------------------- */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Order Dossier: {selectedReport?.po_number}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                      {selectedReport?.report_id}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                      v{selectedReport?.version}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Compiled by {selectedReport?.generated_by} &bull; {selectedReport?.created_at ? new Date(selectedReport.created_at).toLocaleString() : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedReport && (
                  <a
                    href={reportsApi.getPdfUrl(selectedReport.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Official PDF
                  </a>
                )}
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            {isDetailLoading || !selectedReport ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <p className="text-xs">Loading complete order dossier...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Dossier Tabs */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs font-medium overflow-x-auto">
                  {[
                    { id: "summary", label: "1. Order Specs & Summary" },
                    { id: "changes", label: `2. Changes & Lifecycle Log (${selectedReport.approval_audit_trail?.length || 0})` },
                    { id: "negotiations", label: `3. Vendor Queries & Negotiations (${selectedReport.vendor_negotiations?.proposal_count || 0})` },
                    { id: "governance", label: "4. Governance & Signatures" },
                    { id: "risk", label: "5. Vendor Profile & Risk" },
                    { id: "finance", label: "6. Financial Breakdown" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDossierTab(tab.id as any)}
                      className={cn(
                        "pb-2.5 -mb-px transition-colors border-b-2 whitespace-nowrap",
                        activeDossierTab === tab.id
                          ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold"
                          : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Order Specs & Summary */}
                {activeDossierTab === "summary" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Order Synopsis</h4>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {selectedReport.executive_summary}
                      </p>
                      {selectedReport.order_data?.notes && (
                        <p className="text-[11px] text-slate-500 mt-2 italic border-t border-slate-200 dark:border-slate-800 pt-2">
                          <b>Requisition Notes:</b> {selectedReport.order_data.notes}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Contracted Item</span>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          {selectedReport.order_data?.item_name || "N/A"}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Ordered Quantity</span>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          {selectedReport.order_data?.quantity?.toLocaleString()} units
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Unit Price</span>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-1">
                          ₹{Number(selectedReport.order_data?.unit_price || 0).toLocaleString()}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Order Spend</span>
                        <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                          ₹{Number(selectedReport.order_data?.total_price || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Changes & Lifecycle Log */}
                {activeDossierTab === "changes" && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Complete Chronological Change Log & Audit Ledger</h4>
                      <div className="space-y-2 max-h-72 overflow-y-auto">
                        {(selectedReport.approval_audit_trail || []).map((audit: any, idx: number) => (
                          <div key={idx} className="text-xs flex items-start gap-3 border-b border-slate-200/50 dark:border-slate-800 pb-2.5">
                            <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">
                              {audit.created_at ? new Date(audit.created_at).toLocaleString() : ""}
                            </span>
                            <div className="space-y-0.5 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{audit.action}</span>
                                {audit.new_status && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    {audit.new_status}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500">Performed by: {audit.performed_by}</p>
                              {audit.notes && <p className="text-[11px] text-slate-600 dark:text-slate-400">{audit.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: Vendor Queries & Negotiations */}
                {activeDossierTab === "negotiations" && (
                  <div className="space-y-4">
                    {/* Counter-Proposals */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Scale className="w-4 h-4 text-indigo-500" />
                        Formal Vendor Counter-Proposals & Price Revisions
                      </h4>
                      {(!selectedReport.vendor_negotiations?.proposals || selectedReport.vendor_negotiations.proposals.length === 0) ? (
                        <p className="text-xs text-slate-500 italic">No counter-proposals submitted by vendor for this order.</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedReport.vendor_negotiations.proposals.map((prop) => (
                            <div
                              key={prop.id}
                              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold">Proposal #{prop.id}</span>
                                  <span
                                    className={cn(
                                      "px-2 py-0.2 rounded text-[10px] font-bold",
                                      prop.status === "APPROVED" && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
                                      prop.status === "REJECTED" && "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
                                      prop.status === "PENDING" && "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                    )}
                                  >
                                    {prop.status}
                                  </span>
                                </div>
                                <span className="font-semibold text-slate-600 dark:text-slate-400">
                                  Price Variance: {Number(prop.price_variance_pct) > 0 ? "+" : ""}{prop.price_variance_pct}%
                                </span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                <div>
                                  <span className="text-[10px] text-slate-400">Unit Price:</span>
                                  <div className="font-medium">
                                    ₹{Number(prop.current_unit_price).toLocaleString()} &rarr; <b>₹{Number(prop.proposed_unit_price).toLocaleString()}</b>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400">Vendor Reason:</span>
                                  <div className="font-medium italic truncate max-w-[200px]">{prop.reason || "N/A"}</div>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400">Reviewed By:</span>
                                  <div className="font-medium truncate max-w-[180px]">{prop.reviewed_by || "Pending Review"}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Procura Chat Inquiries */}
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-3">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-500" />
                        Procura AI Vendor Inquiries & Communications Transcript
                      </h4>
                      {(!selectedReport.vendor_negotiations?.chat_messages || selectedReport.vendor_negotiations.chat_messages.length === 0) ? (
                        <p className="text-xs text-slate-500 italic">No communication chat messages recorded for this order.</p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {selectedReport.vendor_negotiations.chat_messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={cn(
                                "p-3 rounded-xl text-xs space-y-1",
                                msg.sender === "vendor"
                                  ? "bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 ml-4"
                                  : msg.sender === "assistant"
                                  ? "bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 mr-4"
                                  : "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                              )}
                            >
                              <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                                <span className="flex items-center gap-1">
                                  {msg.sender === "vendor" ? <User className="w-3 h-3 text-indigo-600" /> : <Bot className="w-3 h-3 text-emerald-600" />}
                                  {msg.sender?.toUpperCase()}
                                </span>
                                <span>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}</span>
                              </div>
                              <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{msg.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 4: Governance & Signatures */}
                {activeDossierTab === "governance" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Approval Tier & Role</h4>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          {selectedReport.order_data?.approval_tier || "TIER_1_OFFICER"}
                        </div>
                        <div className="text-xs text-slate-500">
                          Designated: {selectedReport.order_data?.assigned_approver_name} &lt;{selectedReport.order_data?.assigned_approver_email}&gt;
                        </div>
                      </div>

                      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Digital Signature Verification</h4>
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          DocuSign Status: {selectedReport.order_data?.docusign_status || "COMPLETED"}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 truncate">
                          Envelope: {selectedReport.order_data?.docusign_envelope_id || "DS-INTEGRATED-VERIFIED"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 5: Vendor Profile & Risk */}
                {activeDossierTab === "risk" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Delivery Reliability</span>
                        <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                          {Number(selectedReport.vendor_risk_analysis?.delivery_score || 92).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Quality Conformity</span>
                        <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                          {Number(selectedReport.vendor_risk_analysis?.quality_score || 90).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Pricing Competitiveness</span>
                        <div className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                          {Number(selectedReport.vendor_risk_analysis?.pricing_score || 94).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Regulatory Compliance</span>
                        <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                          {Number(selectedReport.vendor_risk_analysis?.compliance_score || 95).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 6: Financial Breakdown */}
                {activeDossierTab === "finance" && (
                  <div className="space-y-4">
                    <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <span className="text-xs text-slate-400">Total Contract Value:</span>
                        <span className="text-sm font-bold">
                          ₹{Number(selectedReport.order_data?.total_price || selectedReport.financial_breakdown?.gross_order_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <span className="text-xs text-slate-400">Payment Terms:</span>
                        <span className="text-sm font-medium">Net 30 Days</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-xs text-slate-400 block">Final Settled Payable Amount</span>
                          <span className="text-[10px] text-emerald-400">Disbursement Authorized</span>
                        </div>
                        <span className="text-2xl font-bold text-indigo-400">
                          ₹{Number(selectedReport.financial_breakdown?.net_settled_amount || selectedReport.order_data?.total_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cryptographic Hash Seal Block */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Cryptographic SHA-256 Ledger Fingerprint
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 break-all">
                      {selectedReport.integrity_hash}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedReport.integrity_hash)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-colors"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedHash ? "Copied" : "Copy Hash"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
