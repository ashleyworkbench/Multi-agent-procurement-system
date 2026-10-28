"use client";

import { useState, useMemo, ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  defectiveApi,
  procurementApi,
  getStoredUser,
  type DefectiveItem,
  type CreateDefectivePayload,
  type UpdateDefectiveStatusPayload,
  type AuthUser,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  PackageX,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  Camera,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  X,
  FileText,
  Upload,
  Layers,
  ArrowUpRight,
  Building2,
  Calendar,
  UserCheck,
  Download,
  Copy,
  Check,
  ShieldCheck,
  DollarSign,
  ArrowRight,
  Truck,
  RotateCcw,
  FileCheck2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { downloadDefectiveReportPdf } from "@/lib/defectivePdf";

const statusConfig: Record<
  string,
  { label: string; cls: string; icon: React.ElementType; badgeBg: string }
> = {
  REPORTED: {
    label: "Quarantined / Reported",
    cls: "bg-amber-50 text-amber-800 border-amber-300",
    badgeBg: "badge-yellow",
    icon: Clock,
  },
  UNDER_REVIEW: {
    label: "Under QA Review",
    cls: "bg-blue-50 text-blue-700 border-blue-300",
    badgeBg: "badge-blue",
    icon: Search,
  },
  AWAITING_VENDOR: {
    label: "Awaiting Vendor RMA",
    cls: "bg-purple-50 text-purple-700 border-purple-300",
    badgeBg: "badge-purple",
    icon: Building2,
  },
  RESOLUTION_IN_PROGRESS: {
    label: "Resolution in Progress",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-300",
    badgeBg: "bg-indigo-50 text-indigo-700",
    icon: RefreshCw,
  },
  RESOLVED: {
    label: "Claim Settled / Resolved",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-300",
    badgeBg: "badge-green",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Claim Dismissed",
    cls: "bg-rose-50 text-rose-700 border-rose-300",
    badgeBg: "badge-red",
    icon: XCircle,
  },
};

const severityConfig: Record<
  string,
  { label: string; cls: string; dot: string; desc: string }
> = {
  CRITICAL: {
    label: "Critical",
    cls: "bg-red-50 text-red-700 border-red-300",
    dot: "bg-red-500",
    desc: "Production / safety hazard; batch delivery halted",
  },
  MAJOR: {
    label: "Major",
    cls: "bg-amber-50 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
    desc: "Component failure; fails standard specifications",
  },
  MINOR: {
    label: "Minor",
    cls: "bg-blue-50 text-blue-700 border-blue-300",
    dot: "bg-blue-500",
    desc: "Cosmetic flaw / surface blemish; non-fatal defect",
  },
};

const DEFECT_TYPES = [
  "Physical Damage / Broken",
  "Incorrect Specification",
  "Material / Quality Defect",
  "Packaging Damaged",
  "Expired / Past Shelf Life",
  "Missing Components",
  "Functional Failure",
  "Other",
];

const ROOT_CAUSES = [
  { value: "MANUFACTURING_FLAW", label: "Manufacturing / Production Flaw" },
  { value: "TRANSIT_IMPACT", label: "Transit Mishandling / Logistics Impact" },
  { value: "PACKAGING_FAILURE", label: "Protective Packaging Failure" },
  { value: "SPEC_DEVIATION", label: "Tolerance / Specification Deviation" },
  { value: "CONTAMINATION", label: "Environmental / Moisture Contamination" },
  { value: "EXPIRED_SHELF_LIFE", label: "Expired Shelf-Life / Deterioration" },
];

const DISPOSITION_STRATEGIES = [
  {
    value: "REPLACEMENT",
    label: "Vendor Replacement Shipment",
    desc: "Vendor dispatches brand new replacement units with tracked delivery",
    icon: RotateCcw,
  },
  {
    value: "CREDIT_NOTE",
    label: "Credit Note / Invoice Deduction",
    desc: "Finance deducts claim amount from current or future vendor payments",
    icon: FileText,
  },
  {
    value: "RETURN_TO_VENDOR",
    label: "Return to Vendor (RTV)",
    desc: "Quarantined items shipped back to vendor facility via designated freight",
    icon: Truck,
  },
  {
    value: "SCRAP_ON_SITE",
    label: "Scrap on Site with Concurrence",
    desc: "Items destroyed or recycled locally with documented vendor concurrence",
    icon: Trash2,
  },
  {
    value: "REWORK",
    label: "Vendor On-Site Rework / Repair",
    desc: "Vendor technical team repairs units to meet ISO quality standards",
    icon: RefreshCw,
  },
];

const STATUS_TABS = [
  { key: "ALL", label: "All RMA Dockets" },
  { key: "REPORTED", label: "Quarantined" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "AWAITING_VENDOR", label: "Awaiting Vendor" },
  { key: "RESOLUTION_IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Settled / Resolved" },
  { key: "REJECTED", label: "Dismissed" },
];

const PAGE_SIZE = 10;

export function DefectiveItemsView() {
  const searchParams = useSearchParams();
  const poParam = searchParams?.get("po") || "";

  const [filter, setFilter] = useState("ALL");
  const [defectTypeFilter, setDefectTypeFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [dispositionFilter, setDispositionFilter] = useState("ALL");
  const [search, setSearch] = useState(poParam);
  const [page, setPage] = useState(1);

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [statusModalItem, setStatusModalItem] = useState<DefectiveItem | null>(null);
  const [detailModalItem, setDetailModalItem] = useState<DefectiveItem | null>(null);
  const [vendorModalItem, setVendorModalItem] = useState<DefectiveItem | null>(null);

  const qc = useQueryClient();
  const currentUser = getStoredUser();
  const isVendor = currentUser?.role === "Vendor";
  const isAdmin = currentUser?.role === "Admin";
  const isInternal = !isVendor;
  const vendorName = currentUser?.vendor_name || currentUser?.name || "Supplier Partner";

  // Queries
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["defective-items", filter, isVendor, currentUser?.vendor_id, currentUser?.vendor_name],
    queryFn: () =>
      defectiveApi.getItems({
        ...(filter !== "ALL" ? { status: filter } : {}),
        ...(isVendor ? { vendor_id: currentUser?.vendor_id, vendor_name: currentUser?.vendor_name } : {}),
      }),
    refetchInterval: 12000,
  });

  const { data: poData } = useQuery({
    queryKey: ["purchase-orders-for-defect"],
    queryFn: () => procurementApi.getPOs(),
    enabled: isInternal,
    staleTime: 60000,
  });

  // Mutations
  const updateStatusMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: UpdateDefectiveStatusPayload;
    }) => defectiveApi.updateStatus(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defective-items"] });
      toast.success("RMA disposition status updated successfully");
      setStatusModalItem(null);
      setDetailModalItem(null);
    },
    onError: (err: any) =>
      toast.error(`Failed to update status: ${err?.message || "Error"}`),
  });

  const deleteReportMut = useMutation({
    mutationFn: (id: number) => defectiveApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defective-items"] });
      toast.success("Defect report deleted");
    },
    onError: (err: any) =>
      toast.error(`Failed to delete report: ${err?.message || "Error"}`),
  });

  // Client-side filtering & search
  const rawItems: DefectiveItem[] = data?.defective_items ?? [];
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      if (isVendor) {
        const uVid = currentUser?.vendor_id;
        const uVname = currentUser?.vendor_name?.toLowerCase().trim();
        const itemVid = item.vendor_id;
        const itemVname = item.vendor_name?.toLowerCase().trim();
        const matchesVendor =
          (uVid && itemVid && Number(uVid) === Number(itemVid)) ||
          (uVname && itemVname && uVname === itemVname);
        if (!matchesVendor && (uVid || uVname)) return false;
      }

      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.rma_number?.toLowerCase().includes(q) ||
        item.po_number?.toLowerCase().includes(q) ||
        item.item_name?.toLowerCase().includes(q) ||
        item.vendor_name?.toLowerCase().includes(q) ||
        item.defect_type?.toLowerCase().includes(q) ||
        item.batch_number?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q);

      const matchesType =
        defectTypeFilter === "ALL" || item.defect_type === defectTypeFilter;

      const matchesSeverity =
        severityFilter === "ALL" ||
        (item.severity || "MAJOR").toUpperCase() === severityFilter;

      const matchesDisposition =
        dispositionFilter === "ALL" ||
        item.disposition_type === dispositionFilter;

      return matchesSearch && matchesType && matchesSeverity && matchesDisposition;
    });
  }, [rawItems, search, defectTypeFilter, severityFilter, dispositionFilter, isVendor, currentUser]);

  const pendingVendorActionItems = useMemo(() => {
    return rawItems.filter(
      (item) =>
        item.status === "REPORTED" ||
        item.status === "AWAITING_VENDOR" ||
        item.vendor_action_status === "PENDING_VENDOR_REVIEW"
    );
  }, [rawItems]);

  const total = filteredItems.length;
  const paged = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stats = data?.stats ?? {
    total_reports: 0,
    total_defective_units: 0,
    quarantine_units: 0,
    pending_resolution: 0,
    resolved: 0,
    rejected: 0,
    total_claim_value: 0,
    critical_defects: 0,
  };

  const copyRmaToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Copied RMA Docket #${code} to clipboard`);
  };

  return (
    <div className="space-y-6">
      {/* Enterprise Module Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900">
              {isVendor ? "Supplier Quality & Non-Conformance RMA Portal" : "Quality Assurance & RMA Quarantine"}
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                isVendor
                  ? "bg-purple-100 text-purple-800 border-purple-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              )}
            >
              {isVendor ? (
                <>
                  <Building2 size={13} className="text-purple-700" /> Supplier RMA Portal
                </>
              ) : (
                <>
                  <ShieldCheck size={13} className="text-emerald-700" /> ISO 9001:2015 Compliant
                </>
              )}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {isVendor
              ? `Authorized supplier workspace for ${vendorName}. Review incoming quality non-conformance reports, inspect dock photographic proof, and dispatch tracked replacement shipments or credit notes.`
              : "Enterprise goods receipt quality control — record inspection failures, isolate stock into quarantine bays, issue vendor RMA notices, and settle financial indemnity."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            className="btn-secondary"
            title="Refresh defect reports"
          >
            <RefreshCw
              size={14}
              className={cn(isFetching && "animate-spin")}
            />{" "}
            Refresh
          </button>
          {isInternal && (
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="btn-primary"
            >
              <Plus size={16} /> Report Defect & Issue RMA
            </button>
          )}
        </div>
      </div>

      {/* Supplier Attention Required Notice Banner */}
      {isVendor && pendingVendorActionItems.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/15 via-rose-500/10 to-amber-500/5 border border-amber-300/80 rounded-2xl p-4 sm:p-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 animate-pulse">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-amber-950 text-sm sm:text-base">
                    Action Required: {pendingVendorActionItems.length} Quarantined Shipment{pendingVendorActionItems.length > 1 ? "s" : ""} Pending Resolution
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 uppercase">
                    Urgent
                  </span>
                </div>
                <p className="text-xs text-amber-900/80 leading-relaxed max-w-3xl">
                  Goods receipt inspection has identified non-conforming or damaged units from your recent consignments. 
                  Please inspect the photographic evidence and submit a restitution plan (Replacement dispatch with courier AWB tracking # or formal Credit Note) to unblock goods receipt and prevent assembly line halt.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => setVendorModalItem(pendingVendorActionItems[0])}
                className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-1.5"
              >
                <RotateCcw size={14} /> Respond to Next Claim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ISO Quality Lifecycle Workflow Stepper Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-slate-700/60">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Standard Industry RMA & Quarantine Workflow
              </h2>
              <p className="text-xs text-slate-300">
                End-to-end non-conformance quarantine isolation and closed-loop supplier restitution.
              </p>
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-5 text-xs text-slate-300">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Quarantine Stock</span>
              <span className="text-amber-400 font-bold text-sm">{(stats.quarantine_units || 0).toLocaleString()} units</span>
            </div>
            <div className="w-px h-6 bg-white/15" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Indemnity Claim Value</span>
              <span className="text-emerald-400 font-bold text-sm">
                ₹{(stats.total_claim_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* 5-Step Process Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 text-xs">
          <div className="bg-white/5 rounded-xl p-3 border border-white/10 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center border border-amber-500/40">1</span>
              <span className="font-semibold text-white">Receiving QC</span>
            </div>
            <p className="text-[11px] text-slate-300">Goods inspected upon delivery. Damaged units flagged.</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center border border-blue-500/40">2</span>
              <span className="font-semibold text-white">Stock Quarantine</span>
            </div>
            <p className="text-[11px] text-slate-300">Isolated into designated bays. Usable inventory cleared.</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center border border-purple-500/40">3</span>
              <span className="font-semibold text-white">Vendor RMA Docket</span>
            </div>
            <p className="text-[11px] text-slate-300">Official RMA claim with indemnity terms issued to vendor.</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center border border-indigo-500/40">4</span>
              <span className="font-semibold text-white">Formal Disposition</span>
            </div>
            <p className="text-[11px] text-slate-300">Replacement shipment, credit note, or scrap approved.</p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center border border-emerald-500/40">5</span>
              <span className="font-semibold text-white">Settlement & Audit</span>
            </div>
            <p className="text-[11px] text-slate-300">Quarantine released, ISO certificate signed and archived.</p>
          </div>
        </div>
      </div>

      {/* Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          {
            label: "Total Defect Reports",
            value: stats.total_reports ?? 0,
            icon: AlertTriangle,
            color: "bg-blue-50 text-blue-600",
            desc: "All logged QA inspection dockets",
          },
          {
            label: "Active In Quarantine",
            value: (stats.quarantine_units ?? 0).toLocaleString(),
            icon: Clock,
            color: "bg-amber-50 text-amber-600",
            desc: "Units segregated in warehouse",
          },
          {
            label: "Total Claim Value",
            value: `₹${(stats.total_claim_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: DollarSign,
            color: "bg-rose-50 text-rose-600",
            desc: "Financial indemnity claim amount",
          },
          {
            label: "Critical Incidents",
            value: stats.critical_defects ?? 0,
            icon: ShieldAlert,
            color: "bg-red-50 text-red-600",
            desc: "High-risk defects halting batch",
          },
          {
            label: "Resolved & Settled",
            value: stats.resolved ?? 0,
            icon: CheckCircle2,
            color: "bg-emerald-50 text-emerald-600",
            desc: "Replacements received or credited",
          },
        ].map((card) => (
          <div key={card.label} className="stat-card">
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center mb-3",
                card.color
              )}
            >
              <card.icon size={16} />
            </div>
            <p className="text-xl font-bold text-slate-900 truncate">{card.value}</p>
            <p className="text-xs font-semibold text-slate-700 mt-1">
              {card.label}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">{card.desc}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={cn(
              "px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
              filter === tab.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
            {tab.key === "ALL" && rawItems.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full text-[10px]">
                {rawItems.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Multidimensional Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by RMA #, PO #, Vendor, Item, or Lot #..."
            className="form-input pl-9 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">🔴 Critical Severity</option>
            <option value="MAJOR">🟠 Major Severity</option>
            <option value="MINOR">🔵 Minor Severity</option>
          </select>

          {/* Disposition Filter */}
          <select
            value={dispositionFilter}
            onChange={(e) => {
              setDispositionFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Dispositions</option>
            <option value="REPLACEMENT">Vendor Replacement</option>
            <option value="CREDIT_NOTE">Credit Note / Debit</option>
            <option value="RETURN_TO_VENDOR">Return to Vendor (RTV)</option>
            <option value="SCRAP_ON_SITE">Scrap on Site</option>
            <option value="REWORK">Vendor Repair / Rework</option>
          </select>

          {/* Defect Type Filter */}
          <select
            value={defectTypeFilter}
            onChange={(e) => {
              setDefectTypeFilter(e.target.value);
              setPage(1);
            }}
            className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="ALL">All Defect Types</option>
            {DEFECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Defect Reports Table */}
      <div className="section-card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="animate-spin text-brand-600" />
            <p className="text-sm text-slate-500 font-medium">
              Loading quality inspection records...
            </p>
          </div>
        ) : isError ? (
          <div className="py-12 text-center text-sm text-red-500">
            Could not retrieve defect reports. Please verify backend service connection.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-semibold text-slate-700">
              No defective items or quarantine dockets found
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {search || defectTypeFilter !== "ALL" || severityFilter !== "ALL" || dispositionFilter !== "ALL" || filter !== "ALL"
                ? "Try clearing filters to see other records."
                : "All incoming goods receipts meet ISO quality thresholds. Click 'Report Defect & Issue RMA' to log damages."}
            </p>
            {(search || defectTypeFilter !== "ALL" || severityFilter !== "ALL" || dispositionFilter !== "ALL" || filter !== "ALL") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("ALL");
                  setDefectTypeFilter("ALL");
                  setSeverityFilter("ALL");
                  setDispositionFilter("ALL");
                }}
                className="btn-secondary text-xs mt-3.5 inline-flex"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>RMA Docket / Code</th>
                    <th>Purchase Order</th>
                    {isInternal && <th>Vendor / Supplier</th>}
                    <th>Item & Lot Traceability</th>
                    <th>Defect & Severity</th>
                    <th>Claim Value (₹)</th>
                    <th>Quarantine Bay</th>
                    <th>Lifecycle & Restitution Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const sc = statusConfig[item.status] ?? statusConfig.REPORTED;
                    const StatusIcon = sc.icon;
                    const sev = severityConfig[(item.severity || "MAJOR").toUpperCase()] ?? severityConfig.MAJOR;
                    const defectPercent = item.ordered_quantity > 0
                      ? ((item.defective_quantity / item.ordered_quantity) * 100).toFixed(1)
                      : "0.0";
                    const claimVal = item.total_claim_amount || 0;
                    const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* RMA Code with Copy */}
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                              {rmaCode}
                            </span>
                            <button
                              onClick={() => copyRmaToClipboard(rmaCode)}
                              className="text-slate-400 hover:text-slate-600 p-0.5 transition"
                              title="Copy RMA tracking code"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Docket #{String(item.id).padStart(4, "0")}
                          </span>
                        </td>

                        {/* PO Number */}
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {item.po_number}
                            </span>
                            <a
                              href={`/purchase-orders?search=${encodeURIComponent(item.po_number)}`}
                              title="View Purchase Order"
                              className="text-slate-400 hover:text-brand-600"
                            >
                              <ArrowUpRight size={12} />
                            </a>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Inspected: {item.inspection_date}
                          </span>
                        </td>

                        {/* Vendor Name (Internal Only) */}
                        {isInternal && (
                          <td className="text-slate-700 max-w-[140px] truncate font-medium">
                            {item.vendor_name}
                          </td>
                        )}

                        {/* Item & Lot Traceability */}
                        <td>
                          <div className="space-y-0.5 max-w-[200px]">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {item.item_name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                {item.defective_quantity} defective
                              </span>
                              <span className="text-[10px] text-slate-400">
                                of {item.ordered_quantity} ({defectPercent}%)
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              Lot: {item.batch_number || "LOT-2026-001"}
                            </span>
                          </div>
                        </td>

                        {/* Defect Category & Severity */}
                        <td className="max-w-[200px]">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold border",
                                sev.cls
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", sev.dot)} />
                              {sev.label}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate">
                              {item.defect_type}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 leading-snug">
                              {item.description}
                            </p>
                          )}
                        </td>

                        {/* Financial Claim Value */}
                        <td className="whitespace-nowrap font-mono text-xs font-bold text-slate-900">
                          ₹{claimVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Quarantine Bay */}
                        <td className="whitespace-nowrap text-xs text-amber-800 font-medium">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 rounded border border-amber-200 text-[11px]">
                            <Layers size={11} className="text-amber-600" />
                            {item.quarantine_location || "Quarantine Bay Q-1"}
                          </span>
                        </td>

                        {/* Lifecycle & Restitution Status */}
                        <td className="whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                              sc.cls
                            )}
                          >
                            <StatusIcon size={12} />
                            {sc.label}
                          </span>

                          {/* Vendor Restitution Indicator */}
                          {item.vendor_action_status === "DISPATCHED_REPLACEMENT" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded mt-1 max-w-[210px] truncate" title={item.tracking_reference}>
                              <Truck size={10} className="text-emerald-600 shrink-0" />
                              <span className="truncate">Repl: {item.tracking_reference || "Dispatched"}</span>
                            </span>
                          ) : item.vendor_action_status === "CREDIT_MEMO_OFFERED" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded mt-1 max-w-[210px] truncate" title={item.tracking_reference}>
                              <FileText size={10} className="text-blue-600 shrink-0" />
                              <span className="truncate">Credit: {item.tracking_reference || "Offered"}</span>
                            </span>
                          ) : item.vendor_action_status === "REWORK_REQUESTED" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded mt-1 max-w-[210px] truncate" title={item.tracking_reference}>
                              <RefreshCw size={10} className="text-indigo-600 shrink-0" />
                              <span className="truncate">Rework: {item.tracking_reference || "Scheduled"}</span>
                            </span>
                          ) : item.vendor_action_status === "CONTESTED" ? (
                            <span className="flex items-center gap-1 text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded mt-1 max-w-[210px] truncate">
                              <AlertTriangle size={10} className="text-rose-600 shrink-0" />
                              <span>Contested by Supplier</span>
                            </span>
                          ) : (item.status === "REPORTED" || item.status === "AWAITING_VENDOR" || item.vendor_action_status === "PENDING_VENDOR_REVIEW") ? (
                            <span className={cn(
                              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded mt-1",
                              isVendor
                                ? "bg-amber-100 text-amber-900 border border-amber-300 animate-pulse"
                                : "bg-purple-50 text-purple-700 border border-purple-200"
                            )}>
                              <Clock size={10} className="shrink-0" />
                              <span>{isVendor ? "Action Required" : "Awaiting Supplier Action"}</span>
                            </span>
                          ) : item.disposition_type ? (
                            <span className="block text-[10px] font-semibold text-slate-600 mt-1 uppercase tracking-wider">
                              ↳ {item.disposition_type.replace(/_/g, " ")}
                            </span>
                          ) : null}
                        </td>

                        {/* Actions */}
                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {/* Download Official PDF */}
                            <button
                              onClick={async () => {
                                try {
                                  await downloadDefectiveReportPdf(item);
                                  toast.success(`Downloaded official certificate for ${rmaCode}`);
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error
                                      ? `PDF download failed: ${error.message}`
                                      : "PDF download failed"
                                  );
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors"
                              title={`Download ISO 9001 RMA Certificate (${rmaCode}.pdf)`}
                            >
                              <Download size={14} />
                            </button>

                            {/* View Detail Dossier */}
                            <button
                              onClick={() => setDetailModalItem(item)}
                              className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors"
                              title="View full RMA inspection dossier"
                            >
                              <Eye size={14} />
                            </button>

                            {/* Vendor Action Button */}
                            {isVendor ? (
                              <button
                                onClick={() => setVendorModalItem(item)}
                                className={cn(
                                  "px-2.5 py-1 text-[11px] font-bold rounded-md shadow-2xs transition-colors flex items-center gap-1",
                                  item.vendor_action_status && item.vendor_action_status !== "PENDING_VENDOR_REVIEW"
                                    ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300"
                                    : "bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
                                )}
                                title="Submit replacement tracking, credit note, or contest"
                              >
                                <RotateCcw size={12} />
                                {item.vendor_action_status && item.vendor_action_status !== "PENDING_VENDOR_REVIEW"
                                  ? "Update Action"
                                  : "Take Action"}
                              </button>
                            ) : (
                              /* Internal Staff Settle / Update Disposition */
                              <button
                                onClick={() => setStatusModalItem(item)}
                                className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md shadow-2xs transition-colors"
                                title="Review supplier action & authorize disposition clearance"
                              >
                                Disposition
                              </button>
                            )}

                            {/* Delete (Internal only) */}
                            {isInternal && (
                              <button
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Are you sure you want to delete RMA Docket ${rmaCode}?`
                                    )
                                  ) {
                                    deleteReportMut.mutate(item.id);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                title="Delete record"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-xs text-slate-500">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(page * PAGE_SIZE, total)} of {total} records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="font-semibold text-slate-700">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-slate-100 disabled:opacity-40"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {isReportModalOpen && (
        <ReportDefectModal
          purchaseOrders={poData?.purchase_orders ?? []}
          onClose={() => setIsReportModalOpen(false)}
          onSuccess={() => {
            setIsReportModalOpen(false);
            qc.invalidateQueries({ queryKey: ["defective-items"] });
          }}
        />
      )}

      {statusModalItem && (
        <RmaDispositionModal
          item={statusModalItem}
          isPending={updateStatusMut.isPending}
          onClose={() => setStatusModalItem(null)}
          onUpdate={(payload) =>
            updateStatusMut.mutate({ id: statusModalItem.id, payload })
          }
        />
      )}

      {detailModalItem && (
        <DefectDossierModal
          item={detailModalItem}
          isVendor={isVendor}
          onClose={() => setDetailModalItem(null)}
          onEditDisposition={() => {
            setStatusModalItem(detailModalItem);
            setDetailModalItem(null);
          }}
          onVendorRespond={() => {
            setVendorModalItem(detailModalItem);
            setDetailModalItem(null);
          }}
        />
      )}

      {vendorModalItem && (
        <VendorDefectiveResponseModal
          item={vendorModalItem}
          user={currentUser}
          onClose={() => setVendorModalItem(null)}
          onSuccess={() => {
            setVendorModalItem(null);
            qc.invalidateQueries({ queryKey: ["defective-items"] });
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Report Defect & Issue RMA Modal
// =====================================================================
function ReportDefectModal({
  purchaseOrders,
  onClose,
  onSuccess,
}: {
  purchaseOrders: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedPoId, setSelectedPoId] = useState("");
  const [defectiveQuantity, setDefectiveQuantity] = useState<number | "">("");
  const [defectType, setDefectType] = useState(DEFECT_TYPES[0]);
  const [severity, setSeverity] = useState("MAJOR");
  const [rootCause, setRootCause] = useState("MANUFACTURING_FLAW");
  const [batchNumber, setBatchNumber] = useState(`LOT-2026-${Math.floor(100 + Math.random() * 900)}`);
  const [quarantineLocation, setQuarantineLocation] = useState("Quarantine Bay Q-01");
  const [description, setDescription] = useState("");
  const [inspectionDate, setInspectionDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reporter, setReporter] = useState("Lead Quality Inspector");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPO = useMemo(() => {
    return purchaseOrders.find((p) => String(p.id) === selectedPoId);
  }, [purchaseOrders, selectedPoId]);

  const unitPrice = selectedPO ? parseFloat(selectedPO.unit_price) || 0 : 0;
  const qtyNum = Number(defectiveQuantity) || 0;
  const estimatedClaimAmount = unitPrice * qtyNum;

  // Handle Photo selection
  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Photo size must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPO) {
      toast.error("Please select a valid Purchase Order");
      return;
    }

    if (!qtyNum || qtyNum <= 0) {
      toast.error("Defective quantity must be greater than zero");
      return;
    }

    if (qtyNum > selectedPO.quantity) {
      toast.error(
        `Defective quantity (${qtyNum}) cannot exceed ordered quantity (${selectedPO.quantity})`
      );
      return;
    }

    const payload: CreateDefectivePayload = {
      po_id: selectedPO.id,
      po_number: selectedPO.po_number,
      vendor_id: selectedPO.vendor_id,
      vendor_name: selectedPO.vendor_name,
      item_name: selectedPO.item_name,
      ordered_quantity: selectedPO.quantity,
      defective_quantity: qtyNum,
      defect_type: defectType,
      severity: severity,
      root_cause: rootCause,
      batch_number: batchNumber.trim() || undefined,
      quarantine_location: quarantineLocation.trim() || "Quarantine Bay Q-01",
      unit_price: unitPrice,
      description: description.trim() || undefined,
      inspection_date: inspectionDate,
      evidence_photo_url: photoDataUrl || undefined,
      reported_by: reporter.trim() || "Lead Quality Inspector",
    };

    try {
      setSubmitting(true);
      const res = await defectiveApi.create(payload);
      toast.success(
        `RMA Docket ${res.rma_number || "created"}! ${qtyNum} units isolated in ${quarantineLocation}.`
      );
      onSuccess();
    } catch (err: any) {
      toast.error(`Failed to submit report: ${err?.message || "Error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">
                Log Non-Conformance & Issue Vendor RMA
              </h2>
              <p className="text-xs text-slate-300">
                Physical quarantine isolation & financial claim recording
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white rounded-lg p-1.5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 1. Purchase Order Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              1. Source Purchase Order <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              required
              className="form-input text-xs"
            >
              <option value="">-- Choose Purchase Order --</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number} — {po.item_name} ({po.quantity} units) • {po.vendor_name}
                </option>
              ))}
            </select>
          </div>

          {/* Selected PO Details Card */}
          {selectedPO && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-sm">
                  {selectedPO.po_number}
                </span>
                <span className="badge badge-green text-[10px]">
                  PO Status: {selectedPO.status}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-600 pt-2 border-t border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Item</span>
                  <span className="font-semibold text-slate-800">{selectedPO.item_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Vendor</span>
                  <span className="font-semibold text-slate-800">{selectedPO.vendor_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Ordered Qty</span>
                  <span className="font-bold text-slate-900">{selectedPO.quantity?.toLocaleString()} units</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Unit Price</span>
                  <span className="font-bold text-slate-900 font-mono">₹{unitPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Defect Quantities & Severity */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Defective Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={selectedPO ? selectedPO.quantity : undefined}
                value={defectiveQuantity}
                onChange={(e) =>
                  setDefectiveQuantity(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                required
                placeholder="e.g. 50"
                className="form-input text-xs"
              />
              {selectedPO && defectiveQuantity && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Remaining usable:{" "}
                  <strong className="text-emerald-700">
                    {Math.max(0, selectedPO.quantity - qtyNum)} units
                  </strong>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                3. Severity Level <span className="text-red-500">*</span>
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="form-input text-xs"
              >
                <option value="CRITICAL">🔴 Critical (Halts Batch)</option>
                <option value="MAJOR">🟠 Major Non-Conformance</option>
                <option value="MINOR">🔵 Minor / Surface Flaw</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                4. Defect Category <span className="text-red-500">*</span>
              </label>
              <select
                value={defectType}
                onChange={(e) => setDefectType(e.target.value)}
                className="form-input text-xs"
              >
                {DEFECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 3. Batch Traceability & Quarantine Location */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                5. Lot / Batch #
              </label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="e.g. LOT-2026-B92"
                className="form-input text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                6. Quarantine Storage Bay
              </label>
              <input
                type="text"
                value={quarantineLocation}
                onChange={(e) => setQuarantineLocation(e.target.value)}
                placeholder="e.g. Quarantine Bay Q-01"
                className="form-input text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                7. Root Cause Category
              </label>
              <select
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                className="form-input text-xs"
              >
                {ROOT_CAUSES.map((rc) => (
                  <option key={rc.value} value={rc.value}>
                    {rc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Indemnity Calculation Preview */}
          <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-rose-900 uppercase tracking-wider">
                Financial Indemnity Claim Value
              </span>
              <p className="text-xs text-rose-700">
                Formula: {qtyNum} units × ₹{unitPrice.toFixed(2)} agreed purchase price
              </p>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold font-mono text-rose-900">
                ₹{estimatedClaimAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] text-rose-600 font-medium">To be claimed from vendor</span>
            </div>
          </div>

          {/* Inspection Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              8. Inspection Remarks & Observations
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detail specific physical flaws, measured tolerance errors, or damaged packaging observations..."
              className="form-input text-xs"
            />
          </div>

          {/* Photo Evidence Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              9. Photographic Evidence (ISO Audit Archive)
            </label>
            {photoDataUrl ? (
              <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center p-2">
                <img
                  src={photoDataUrl}
                  alt="Inspection Evidence"
                  className="max-h-48 rounded-xl object-contain"
                />
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl("")}
                  className="absolute top-3 right-3 p-1.5 bg-black/70 text-white rounded-full hover:bg-black transition"
                  title="Remove photo"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-400 rounded-2xl p-5 cursor-pointer bg-slate-50/60 hover:bg-slate-50 transition">
                <Upload size={22} className="text-slate-400 mb-1" />
                <span className="text-xs font-semibold text-slate-700">
                  Click to upload inspection photo evidence
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  JPEG, PNG, WebP (Max 5MB)
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Inspector Details */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Inspection Date
              </label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="form-input text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Lead Inspector Sign-Off
              </label>
              <input
                type="text"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                className="form-input text-xs"
              />
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedPoId}
              className="btn-primary text-xs"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {submitting ? "Quarantining & Filing..." : "Confirm & Issue RMA Claim"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// RMA Disposition & Settlement Modal
// =====================================================================
function RmaDispositionModal({
  item,
  isPending,
  onClose,
  onUpdate,
}: {
  item: DefectiveItem;
  isPending: boolean;
  onClose: () => void;
  onUpdate: (payload: UpdateDefectiveStatusPayload) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState(item.status);
  const [dispositionType, setDispositionType] = useState(
    item.disposition_type || "REPLACEMENT"
  );
  const [trackingReference, setTrackingReference] = useState(
    item.tracking_reference || ""
  );
  const [notes, setNotes] = useState(item.resolution_notes || "");
  const [approverName, setApproverName] = useState(
    item.disposition_approved_by || "Operations Manager"
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate({
      status: selectedStatus,
      disposition_type: dispositionType,
      tracking_reference: trackingReference.trim() || undefined,
      resolution_notes: notes.trim() || undefined,
      disposition_approved_by: approverName.trim() || undefined,
      performed_by: approverName.trim() || "Operations Manager",
    });
  };

  const statusOptions = [
    { key: "UNDER_REVIEW", label: "Under QA Review", desc: "Joint technical investigation with vendor" },
    { key: "AWAITING_VENDOR", label: "Awaiting Vendor Response", desc: "Claim forwarded to vendor for replacement / credit" },
    { key: "RESOLUTION_IN_PROGRESS", label: "Resolution in Progress", desc: "Replacement shipment in transit or credit memo processing" },
    { key: "RESOLVED", label: "Resolved & Closed", desc: "Replacement received & accepted, or credit note verified" },
    { key: "REJECTED", label: "Claim Dismissed", desc: "Non-conformance dismissed after joint review" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8 overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-900 text-white">
          <div>
            <h2 className="font-bold text-sm text-white">
              Settle RMA Disposition & Resolution
            </h2>
            <p className="text-xs text-slate-300">
              Docket: {item.rma_number || `#DEF-${item.id}`} • PO: {item.po_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Supplier Restitution Feedback Card */}
          <div className="rounded-2xl p-3.5 border text-xs">
            {item.vendor_action_status === "DISPATCHED_REPLACEMENT" ? (
              <div className="space-y-1.5 text-emerald-900 bg-emerald-50/80 -m-3.5 p-3.5 rounded-2xl border border-emerald-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <Truck size={14} className="text-emerald-700" />
                  <span>Supplier Action: Free Replacement Units Dispatched</span>
                </div>
                <p className="text-emerald-800 text-[11px]">
                  Carrier & AWB: <span className="font-mono font-bold text-slate-900">{item.tracking_reference || "Tracking Logged"}</span>
                </p>
                {item.vendor_comments && (
                  <p className="text-emerald-700 italic text-[11px] bg-white/70 p-2 rounded-lg border border-emerald-200/60">
                    "{item.vendor_comments}"
                  </p>
                )}
                <p className="text-[10px] text-emerald-700 mt-1">
                  💡 Recommendation: Verify goods receipt when units arrive at receiving dock, then mark as "Resolved & Closed".
                </p>
              </div>
            ) : item.vendor_action_status === "CREDIT_MEMO_OFFERED" ? (
              <div className="space-y-1.5 text-blue-900 bg-blue-50/80 -m-3.5 p-3.5 rounded-2xl border border-blue-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <FileText size={14} className="text-blue-700" />
                  <span>Supplier Action: Formal Credit Note Offered</span>
                </div>
                <p className="text-blue-800 text-[11px]">
                  Credit Reference: <span className="font-mono font-bold text-slate-900">{item.tracking_reference}</span>
                </p>
                {item.vendor_comments && (
                  <p className="text-blue-700 italic text-[11px] bg-white/70 p-2 rounded-lg border border-blue-200/60">
                    "{item.vendor_comments}"
                  </p>
                )}
                <p className="text-[10px] text-blue-700 mt-1">
                  💡 Recommendation: Confirm invoice deduction with Finance Director, then mark as "Resolved & Closed".
                </p>
              </div>
            ) : item.vendor_action_status === "REWORK_REQUESTED" ? (
              <div className="space-y-1.5 text-indigo-900 bg-indigo-50/80 -m-3.5 p-3.5 rounded-2xl border border-indigo-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <RefreshCw size={14} className="text-indigo-700" />
                  <span>Supplier Action: On-Site Technician Rework Scheduled</span>
                </div>
                <p className="text-indigo-800 text-[11px]">
                  Service Details: <span className="font-mono font-bold text-slate-900">{item.tracking_reference}</span>
                </p>
                {item.vendor_comments && (
                  <p className="text-indigo-700 italic text-[11px] bg-white/70 p-2 rounded-lg border border-indigo-200/60">
                    "{item.vendor_comments}"
                  </p>
                )}
              </div>
            ) : item.vendor_action_status === "CONTESTED" ? (
              <div className="space-y-1.5 text-rose-900 bg-rose-50/80 -m-3.5 p-3.5 rounded-2xl border border-rose-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle size={14} className="text-rose-700" />
                  <span>Supplier Contested This Non-Conformance Claim</span>
                </div>
                {item.vendor_comments && (
                  <p className="text-rose-700 italic text-[11px] bg-white/70 p-2 rounded-lg border border-rose-200/60">
                    "{item.vendor_comments}"
                  </p>
                )}
                <p className="text-[10px] text-rose-700 mt-1">
                  Joint engineering / QA re-inspection recommended before final disposition sign-off.
                </p>
              </div>
            ) : (
              <div className="space-y-1 text-purple-900 bg-purple-50/80 -m-3.5 p-3.5 rounded-2xl border border-purple-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <Building2 size={14} className="text-purple-700" />
                  <span>Awaiting Supplier Restitution Response</span>
                </div>
                <p className="text-[11px] text-purple-800">
                  Supplier has been alerted under Docket {item.rma_number || `#${item.id}`} and has not yet submitted tracking or credit memo.
                </p>
              </div>
            )}
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Lifecycle Progress
            </label>
            <div className="space-y-1.5">
              {statusOptions.map((opt) => (
                <label
                  key={opt.key}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all",
                    selectedStatus === opt.key
                      ? "border-brand-500 bg-brand-50/70 text-brand-900 shadow-xs"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={opt.key}
                    checked={selectedStatus === opt.key}
                    onChange={() => setSelectedStatus(opt.key)}
                    className="mt-0.5 text-brand-600 focus:ring-brand-500"
                  />
                  <div>
                    <span className="font-bold block">{opt.label}</span>
                    <span className="text-[11px] text-slate-500 block">
                      {opt.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Disposition Strategy */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              2. Formal Disposition Strategy
            </label>
            <div className="space-y-1.5">
              {DISPOSITION_STRATEGIES.map((strat) => {
                const StratIcon = strat.icon;
                return (
                  <label
                    key={strat.value}
                    className={cn(
                      "flex items-start gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all",
                      dispositionType === strat.value
                        ? "border-indigo-500 bg-indigo-50/60 text-indigo-950 font-medium shadow-xs"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <input
                      type="radio"
                      name="disposition"
                      value={strat.value}
                      checked={dispositionType === strat.value}
                      onChange={() => setDispositionType(strat.value)}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <StratIcon size={13} className="text-indigo-600" />
                        <span>{strat.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {strat.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Logistics Tracking / Waybill */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              3. Courier AWB / Tracking Ref / Credit Memo #
            </label>
            <input
              type="text"
              value={trackingReference}
              onChange={(e) => setTrackingReference(e.target.value)}
              placeholder="e.g. BlueDart AWB #94827103 or Credit Memo #CR-8821"
              className="form-input text-xs font-mono"
            />
          </div>

          {/* Approver Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              4. Disposition Approver Sign-Off
            </label>
            <input
              type="text"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              placeholder="e.g. Operations Manager / Quality Lead"
              className="form-input text-xs"
            />
          </div>

          {/* Resolution Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              5. Final Audit Resolution Remarks
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document replacement dispatch confirmation, credit note deduction date, or quality clearance details..."
              className="form-input text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="btn-primary text-xs"
            >
              {isPending && <Loader2 size={13} className="animate-spin" />}
              Save & Authorize Disposition
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// Full RMA Dossier Modal
// =====================================================================
function DefectDossierModal({
  item,
  isVendor,
  onClose,
  onEditDisposition,
  onVendorRespond,
}: {
  item: DefectiveItem;
  isVendor?: boolean;
  onClose: () => void;
  onEditDisposition: () => void;
  onVendorRespond?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"inspection" | "quarantine" | "disposition">("inspection");
  const sc = statusConfig[item.status] ?? statusConfig.REPORTED;
  const StatusIcon = sc.icon;
  const sev = severityConfig[(item.severity || "MAJOR").toUpperCase()] ?? severityConfig.MAJOR;
  const defectPercent = item.ordered_quantity > 0
    ? ((item.defective_quantity / item.ordered_quantity) * 100).toFixed(1)
    : "0.0";
  const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;
  const claimVal = item.total_claim_amount || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-amber-400">
                  {rmaCode}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border",
                    sc.cls
                  )}
                >
                  <StatusIcon size={12} />
                  {sc.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
                    sev.cls
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", sev.dot)} />
                  {sev.label}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Purchase Order: <strong>{item.po_number}</strong> • Supplier: <strong>{item.vendor_name}</strong>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white rounded-lg p-1.5 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
            <button
              onClick={() => setActiveTab("inspection")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition",
                activeTab === "inspection"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              QC Inspection
            </button>
            <button
              onClick={() => setActiveTab("quarantine")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition",
                activeTab === "quarantine"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              Quarantine & Indemnity
            </button>
            <button
              onClick={() => setActiveTab("disposition")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition",
                activeTab === "disposition"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-white/10"
              )}
            >
              RMA Settlement
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "inspection" && (
            <div className="space-y-4 text-xs">
              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Ordered Units</span>
                  <span className="text-base font-bold text-slate-900">{item.ordered_quantity?.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[10px] text-rose-600 uppercase font-bold block">Quarantined Defective</span>
                  <span className="text-base font-bold text-rose-700">{item.defective_quantity?.toLocaleString()} ({defectPercent}%)</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-600 uppercase font-bold block">Usable Stock Accepted</span>
                  <span className="text-base font-bold text-emerald-700">
                    {Math.max(0, item.ordered_quantity - item.defective_quantity)?.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Classification & Root Cause */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Defect Classification</span>
                  <span className="font-semibold text-slate-800">{item.defect_type}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Root Cause Category</span>
                  <span className="font-semibold text-slate-800 font-mono">
                    {(item.root_cause || "MANUFACTURING_FLAW").replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Lead Inspector</span>
                  <span className="font-semibold text-slate-800">{item.reported_by || "QC Officer"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Inspection Date</span>
                  <span className="font-semibold text-slate-800">{item.inspection_date}</span>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider mb-1">
                  Inspection Remarks & Physical Findings
                </span>
                <p className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed font-normal">
                  {item.description || "No specific inspection remarks documented."}
                </p>
              </div>

              {/* Photo Evidence */}
              {item.evidence_photo_url && (
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider mb-1.5">
                    Attached Photographic Audit Evidence
                  </span>
                  <div className="rounded-2xl border border-slate-200 overflow-hidden bg-black/5 flex items-center justify-center max-h-64">
                    <img
                      src={item.evidence_photo_url}
                      alt="Defect evidence"
                      className="max-h-64 object-contain"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "quarantine" && (
            <div className="space-y-4 text-xs">
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-900 text-sm">Warehouse Stock Segregation Policy</h4>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Physical units are quarantined in warehouse storage bay <strong>{item.quarantine_location || "Quarantine Bay Q-01"}</strong> under strict isolation tags. These goods cannot be allocated to production or outbound dispatch until formal disposition clearance.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Quarantine Storage Location</span>
                  <span className="text-sm font-bold text-amber-900">{item.quarantine_location || "Quarantine Bay Q-01"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Lot / Batch Number</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">{item.batch_number || "LOT-2026-001"}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Agreed PO Unit Price</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    ₹{(item.unit_price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Claim Indemnity Value</span>
                  <span className="text-base font-bold text-rose-700 font-mono">
                    ₹{claimVal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "disposition" && (
            <div className="space-y-4 text-xs">
              <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 text-sm uppercase tracking-wide">
                    {item.disposition_type ? item.disposition_type.replace(/_/g, " ") : "Pending Disposition"}
                  </span>
                  <span className="badge badge-indigo text-[10px]">
                    Status: {item.status}
                  </span>
                </div>
                <p className="text-indigo-900 text-xs">
                  Authorized Settlement Route: {item.disposition_type || "Vendor replacement or credit note under evaluation"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Tracking Reference / AWB</span>
                  <span className="text-xs font-bold text-slate-900 font-mono">
                    {item.tracking_reference || "None Logged Yet"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Authorized Approver</span>
                  <span className="text-xs font-bold text-slate-900">
                    {item.disposition_approved_by || "Operations Manager"}
                  </span>
                </div>
              </div>

              {item.vendor_comments && (
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Vendor Response Comments
                  </span>
                  <p className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 leading-relaxed font-medium">
                    {item.vendor_comments}
                  </p>
                </div>
              )}

              {item.resolution_notes && (
                <div>
                  <span className="text-slate-400 block text-[11px] font-bold uppercase tracking-wider mb-1">
                    Resolution Audit Remarks
                  </span>
                  <p className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 leading-relaxed font-medium">
                    {item.resolution_notes}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[11px] text-slate-400 font-mono">
            Audit ID: #{item.id} • {item.created_at}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  await downloadDefectiveReportPdf(item);
                  toast.success(`Downloaded official RMA certificate ${rmaCode}`);
                } catch (error) {
                  toast.error("Download failed");
                }
              }}
              className="btn-secondary text-xs inline-flex items-center gap-1.5"
            >
              <Download size={13} />
              Official ISO PDF
            </button>
            {isVendor ? (
              <button
                onClick={onVendorRespond}
                className="btn-primary text-xs bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 shadow-xs"
              >
                <RotateCcw size={13} />
                {item.vendor_action_status && item.vendor_action_status !== "PENDING_VENDOR_REVIEW"
                  ? "Update Restitution Action"
                  : "Submit Restitution Action"}
              </button>
            ) : (
              <button
                onClick={onEditDisposition}
                className="btn-primary text-xs"
              >
                Update Disposition
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Supplier RMA Restitution & Response Modal (Vendor Portal)
// =====================================================================
function VendorDefectiveResponseModal({
  item,
  user,
  onClose,
  onSuccess,
}: {
  item: DefectiveItem;
  user: AuthUser | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<
    "ACCEPT_REPLACEMENT" | "ACCEPT_CREDIT" | "REQUEST_REWORK" | "CONTEST"
  >(
    item.vendor_action_status === "CREDIT_MEMO_OFFERED"
      ? "ACCEPT_CREDIT"
      : item.vendor_action_status === "CONTESTED"
      ? "CONTEST"
      : item.vendor_action_status === "REWORK_REQUESTED"
      ? "REQUEST_REWORK"
      : "ACCEPT_REPLACEMENT"
  );

  const [courierName, setCourierName] = useState("BlueDart Express");
  const [trackingNumber, setTrackingNumber] = useState(
    item.tracking_reference || ""
  );
  const [etaDate, setEtaDate] = useState(
    new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [creditMemoRef, setCreditMemoRef] = useState(
    item.tracking_reference || `CR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [creditAmount, setCreditAmount] = useState<number>(
    item.total_claim_amount || 0
  );
  const [reworkTechnician, setReworkTechnician] = useState(
    item.tracking_reference || "Certified Senior Field Engineer"
  );
  const [reworkDate, setReworkDate] = useState(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [contestReason, setContestReason] = useState("TRANSIT_DAMAGE");
  const [comments, setComments] = useState(item.vendor_comments || "");
  const [representativeName, setRepresentativeName] = useState(
    user?.name || user?.vendor_name || "Supplier Representative"
  );
  const [submitting, setSubmitting] = useState(false);

  const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;
  const claimAmt = item.total_claim_amount || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let combinedTracking = "";
    if (action === "ACCEPT_REPLACEMENT") {
      if (!trackingNumber.trim()) {
        toast.error("Please provide the replacement shipment tracking / AWB number");
        return;
      }
      combinedTracking = `${courierName.trim()} AWB #${trackingNumber.trim()} (ETA: ${etaDate})`;
    } else if (action === "ACCEPT_CREDIT") {
      if (!creditMemoRef.trim()) {
        toast.error("Please provide the formal Credit Memo reference number");
        return;
      }
      combinedTracking = `Credit Note #${creditMemoRef.trim()} (₹${Number(creditAmount).toLocaleString("en-IN")})`;
    } else if (action === "REQUEST_REWORK") {
      if (!reworkTechnician.trim()) {
        toast.error("Please specify the technician or repair team details");
        return;
      }
      combinedTracking = `On-Site Rework: ${reworkTechnician.trim()} (Scheduled: ${reworkDate})`;
    } else if (action === "CONTEST") {
      combinedTracking = `Disputed: ${contestReason}`;
    }

    try {
      setSubmitting(true);
      await defectiveApi.vendorResponse(item.id, {
        action,
        tracking_reference: combinedTracking,
        vendor_comments: comments.trim() || undefined,
        performed_by: representativeName.trim() || "Supplier Representative",
      });
      toast.success(`RMA response recorded for Docket ${rmaCode}!`);
      onSuccess();
    } catch (err: any) {
      toast.error(`Submission failed: ${err?.message || "Error submitting response"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8 overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
                {rmaCode}
              </span>
              <h2 className="font-bold text-sm text-white">
                Supplier RMA Acknowledgement & Restitution
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              PO #{item.po_number} • Claim Value: ₹{claimAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Defect Incident Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between font-bold text-slate-900">
              <span className="text-sm">{item.item_name}</span>
              <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                <AlertTriangle size={11} />
                {item.defective_quantity} of {item.ordered_quantity} Units Quarantined
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
              <div>
                <span className="text-slate-400 block text-[10px]">Defect Type</span>
                <span className="font-semibold text-slate-800">{item.defect_type}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Severity</span>
                <span className="font-semibold text-slate-800">{item.severity || "MAJOR"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Warehouse Bay</span>
                <span className="font-semibold text-slate-800">{item.quarantine_location || "Quarantine Bay Q-01"}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Inspected Lot</span>
                <span className="font-semibold text-slate-800 font-mono">{item.batch_number || "LOT-2026-001"}</span>
              </div>
            </div>
            {item.description && (
              <p className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 leading-relaxed italic">
                "{item.description}"
              </p>
            )}
          </div>

          {/* Action Choice */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Restitution Action
            </label>
            <div className="space-y-2">
              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "ACCEPT_REPLACEMENT"
                  ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 font-medium shadow-2xs"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "ACCEPT_REPLACEMENT"}
                  onChange={() => setAction("ACCEPT_REPLACEMENT")}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <Truck size={14} className="text-emerald-600 shrink-0" />
                    <span>Dispatch Free Replacement Shipment</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Acknowledge the defect claim and immediately dispatch new units with carrier tracking.
                  </span>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "ACCEPT_CREDIT"
                  ? "border-blue-500 bg-blue-50/70 text-blue-950 font-medium shadow-2xs"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "ACCEPT_CREDIT"}
                  onChange={() => setAction("ACCEPT_CREDIT")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <FileText size={14} className="text-blue-600 shrink-0" />
                    <span>Issue Credit Note / Debit Offset</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Deduct full or partial claim value (₹{claimAmt.toLocaleString("en-IN")}) from pending invoices.
                  </span>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "REQUEST_REWORK"
                  ? "border-indigo-500 bg-indigo-50/70 text-indigo-950 font-medium shadow-2xs"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "REQUEST_REWORK"}
                  onChange={() => setAction("REQUEST_REWORK")}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <RefreshCw size={14} className="text-indigo-600 shrink-0" />
                    <span>Schedule On-Site Technician Repair / Rework</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Send supplier engineering or service technician to customer warehouse for on-site rework.
                  </span>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "CONTEST"
                  ? "border-amber-500 bg-amber-50/70 text-amber-950 font-medium shadow-2xs"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "CONTEST"}
                  onChange={() => setAction("CONTEST")}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                    <span>Contest Claim with Technical Justification</span>
                  </div>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Dispute non-conformance citing transit damage, improper storage, or specifications within tolerance.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Action Specific Fields */}
          {action === "ACCEPT_REPLACEMENT" && (
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Logistics / Courier Partner <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    className="form-input text-xs"
                  >
                    <option value="BlueDart Express">BlueDart Express</option>
                    <option value="FedEx India">FedEx India</option>
                    <option value="DTDC Air Express">DTDC Air Express</option>
                    <option value="Delhivery Logistics">Delhivery Logistics</option>
                    <option value="GATI-KWE Freight">GATI-KWE Freight</option>
                    <option value="Direct Supplier Truck">Direct Supplier Truck / Dedicated Fleet</option>
                    <option value="Other Freight Carrier">Other Freight Carrier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Air Waybill / Tracking # <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="e.g. BLU-94820193"
                    className="form-input text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Estimated Delivery Date at Customer Dock
                </label>
                <input
                  type="date"
                  value={etaDate}
                  onChange={(e) => setEtaDate(e.target.value)}
                  className="form-input text-xs"
                />
              </div>
            </div>
          )}

          {action === "ACCEPT_CREDIT" && (
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Credit Memo Reference # <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={creditMemoRef}
                    onChange={(e) => setCreditMemoRef(e.target.value)}
                    placeholder="e.g. CR-MEMO-2026-904"
                    className="form-input text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Credited Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(Number(e.target.value) || 0)}
                    className="form-input text-xs font-mono font-bold"
                  />
                </div>
              </div>
            </div>
          )}

          {action === "REQUEST_REWORK" && (
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Technician / Repair Agency <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={reworkTechnician}
                    onChange={(e) => setReworkTechnician(e.target.value)}
                    placeholder="e.g. Apex Tech Services Ltd"
                    className="form-input text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Scheduled Visit Date
                  </label>
                  <input
                    type="date"
                    value={reworkDate}
                    onChange={(e) => setReworkDate(e.target.value)}
                    className="form-input text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {action === "CONTEST" && (
            <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Primary Grounds for Dispute <span className="text-rose-500">*</span>
                </label>
                <select
                  value={contestReason}
                  onChange={(e) => setContestReason(e.target.value)}
                  className="form-input text-xs"
                >
                  <option value="TRANSIT_DAMAGE">Transit Mishandling After Ex-Works Handover</option>
                  <option value="IMPROPER_UNCRATING">Customer Uncrating / Handling Error</option>
                  <option value="WITHIN_TOLERANCE">Batch Dimensions Within Standard Drawing Tolerance</option>
                  <option value="STORAGE_ENVIRONMENT">Warehouse Moisture / Environment Exposure</option>
                  <option value="INCORRECT_TEST_PROTOCOL">Buyer Testing Protocol Deviates From ISO Standards</option>
                </select>
              </div>
            </div>
          )}

          {/* Supplier Comments */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              2. Supplier Resolution Comments & Justification
            </label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Enter packaging instructions, serial numbers of replacement units, or root cause prevention measures taken at your factory..."
              className="form-input text-xs leading-relaxed"
            />
          </div>

          {/* Supplier Sign-off */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              3. Authorized Supplier Sign-Off
            </label>
            <input
              type="text"
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              placeholder="e.g. Rajesh Sharma, Quality Director"
              className="form-input text-xs"
            />
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-xs"
            >
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {submitting ? "Submitting Response..." : "Submit Restitution Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
