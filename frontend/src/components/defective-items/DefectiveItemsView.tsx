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
} from "lucide-react";
import { toast } from "sonner";
import { downloadDefectiveReportPdf } from "@/lib/defectivePdf";

const statusConfig: Record<
  string,
  { label: string; cls: string; icon: React.ElementType; badgeBg: string }
> = {
  REPORTED: {
    label: "Reported",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    badgeBg: "badge-yellow",
    icon: Clock,
  },
  UNDER_REVIEW: {
    label: "Under Review",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    badgeBg: "badge-blue",
    icon: Search,
  },
  AWAITING_VENDOR: {
    label: "Awaiting Vendor",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
    badgeBg: "badge-purple",
    icon: Building2,
  },
  RESOLUTION_IN_PROGRESS: {
    label: "Resolution in Progress",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-200",
    badgeBg: "bg-indigo-50 text-indigo-700",
    icon: RefreshCw,
  },
  RESOLVED: {
    label: "Resolved",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    badgeBg: "badge-green",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rejected",
    cls: "bg-red-50 text-red-700 border-red-200",
    badgeBg: "badge-red",
    icon: XCircle,
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

const STATUS_TABS = [
  { key: "ALL", label: "All Reports" },
  { key: "REPORTED", label: "Reported" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "AWAITING_VENDOR", label: "Awaiting Vendor" },
  { key: "RESOLUTION_IN_PROGRESS", label: "In Progress" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "REJECTED", label: "Rejected" },
];

const PAGE_SIZE = 10;

export function DefectiveItemsView() {
  const searchParams = useSearchParams();
  const poParam = searchParams?.get("po") || "";

  const [filter, setFilter] = useState("ALL");
  const [defectTypeFilter, setDefectTypeFilter] = useState("ALL");
  const [search, setSearch] = useState(poParam);
  const [page, setPage] = useState(1);

  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [statusModalItem, setStatusModalItem] = useState<DefectiveItem | null>(null);
  const [detailModalItem, setDetailModalItem] = useState<DefectiveItem | null>(null);

  const qc = useQueryClient();
  const currentUser = getStoredUser();

  // Queries
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["defective-items", filter],
    queryFn: () =>
      defectiveApi.getItems({
        ...(filter !== "ALL" ? { status: filter } : {}),
      }),
    refetchInterval: 12000,
  });

  const { data: poData } = useQuery({
    queryKey: ["purchase-orders-for-defect"],
    queryFn: () => procurementApi.getPOs(),
    staleTime: 60000,
  });

  // Mutations
  const updateStatusMut = useMutation({
    mutationFn: ({
      id,
      status,
      notes,
    }: {
      id: number;
      status: string;
      notes?: string;
    }) =>
      defectiveApi.updateStatus(id, {
        status,
        resolution_notes: notes,
        performed_by: currentUser?.name || "Receiving Team",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["defective-items"] });
      toast.success("Defect report status updated");
      setStatusModalItem(null);
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
      const matchesSearch =
        !search.trim() ||
        item.po_number?.toLowerCase().includes(search.toLowerCase()) ||
        item.item_name?.toLowerCase().includes(search.toLowerCase()) ||
        item.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
        item.defect_type?.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase());

      const matchesType =
        defectTypeFilter === "ALL" || item.defect_type === defectTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [rawItems, search, defectTypeFilter]);

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
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">Defective Items</h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              <Layers size={12} /> Stock Quarantine Active
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Buyer & receiving team inspection portal — log defects, segregate quarantine stock, and manage vendor resolutions
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
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="btn-primary"
          >
            <Plus size={16} /> Report Defective Item
          </button>
        </div>
      </div>

      {/* Stock Segregation & Policy Alert */}
      <div className="bg-slate-900 text-white rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Defective Stock Segregation Policy
            </h2>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Defective quantities reported are automatically segregated to quarantine storage and kept separate from usable inventory. Original Purchase Orders remain uncompromised to maintain audit trail integrity.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs shrink-0 self-end md:self-center border-t md:border-t-0 md:border-l border-white/10 pt-2 md:pt-0 md:pl-5">
          <div className="text-center">
            <span className="block text-amber-400 font-bold text-base">
              {stats.quarantine_units?.toLocaleString()}
            </span>
            <span className="text-slate-400 text-[11px]">Quarantine Units</span>
          </div>
          <div className="text-center">
            <span className="block text-emerald-400 font-bold text-base">
              {stats.resolved?.toLocaleString()}
            </span>
            <span className="text-slate-400 text-[11px]">Resolved Cases</span>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Defect Reports",
            value: stats.total_reports ?? 0,
            icon: AlertTriangle,
            color: "bg-brand-50 text-brand-600",
            desc: "All logged receiving issues",
          },
          {
            label: "Total Defective Units",
            value: (stats.total_defective_units ?? 0).toLocaleString(),
            icon: PackageX,
            color: "bg-red-50 text-red-600",
            desc: "Units identified as defective",
          },
          {
            label: "Active In Quarantine",
            value: (stats.quarantine_units ?? 0).toLocaleString(),
            icon: Clock,
            color: "bg-amber-50 text-amber-600",
            desc: "Segregated awaiting resolution",
          },
          {
            label: "Resolved / Credited",
            value: stats.resolved ?? 0,
            icon: CheckCircle2,
            color: "bg-emerald-50 text-emerald-600",
            desc: "Settled with vendor replacement",
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
            <p className="text-xl font-bold text-slate-900">{card.value}</p>
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

      {/* Search & Secondary Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            placeholder="Search by PO #, Item, Vendor, or defect keyword..."
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

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Filter size={13} />
            <span>Defect Type:</span>
          </div>
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
              Loading defect reports...
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
              No defective items found
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              {search || defectTypeFilter !== "ALL" || filter !== "ALL"
                ? "Try clearing filters to see other reports."
                : "No defects reported yet. Select 'Report Defective Item' to record damages or discrepancies."}
            </p>
            {(search || defectTypeFilter !== "ALL" || filter !== "ALL") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("ALL");
                  setDefectTypeFilter("ALL");
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
                    <th>Report ID</th>
                    <th>Purchase Order</th>
                    <th>Vendor</th>
                    <th>Item & Stock Segregation</th>
                    <th>Defect Details</th>
                    <th>Inspection Date</th>
                    <th>Evidence</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((item) => {
                    const sc = statusConfig[item.status] ?? statusConfig.REPORTED;
                    const StatusIcon = sc.icon;
                    const defectPercent = Math.round(
                      (item.defective_quantity / item.ordered_quantity) * 100
                    );

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="font-mono text-xs text-slate-600 font-semibold whitespace-nowrap">
                          #DEF-{String(item.id).padStart(4, "0")}
                        </td>

                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {item.po_number}
                            </span>
                            <a
                              href={`/purchase-orders?search=${encodeURIComponent(
                                item.po_number
                              )}`}
                              title="View Purchase Order"
                              className="text-slate-400 hover:text-brand-600"
                            >
                              <ArrowUpRight size={12} />
                            </a>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            By {item.reported_by || "Receiving Team"}
                          </span>
                        </td>

                        <td className="text-slate-700 max-w-[140px] truncate font-medium">
                          {item.vendor_name}
                        </td>

                        <td>
                          <div className="space-y-1 max-w-[200px]">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {item.item_name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-200">
                                {item.defective_quantity} defective
                              </span>
                              <span className="text-[10px] text-slate-400">
                                of {item.ordered_quantity} ({defectPercent}%)
                              </span>
                            </div>
                            <span className="inline-block text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-medium">
                              Quarantined
                            </span>
                          </div>
                        </td>

                        <td className="max-w-[220px]">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.defect_type}
                          </span>
                          {item.description && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </td>

                        <td className="text-xs text-slate-600 whitespace-nowrap">
                          <div className="flex items-center gap-1 text-slate-500">
                            <Calendar size={12} />
                            <span>{item.inspection_date}</span>
                          </div>
                        </td>

                        <td className="whitespace-nowrap">
                          {item.evidence_photo_url ? (
                            <button
                              onClick={() => setDetailModalItem(item)}
                              className="group relative flex items-center gap-1 px-2 py-1 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-md text-[11px] font-medium border border-brand-200 transition-colors"
                              title="Click to view photo evidence"
                            >
                              <Camera size={13} className="text-brand-600" />
                              <span>Photo</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              None
                            </span>
                          )}
                        </td>

                        <td className="whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border",
                              sc.cls
                            )}
                          >
                            <StatusIcon size={12} />
                            {sc.label}
                          </span>
                        </td>

                        <td className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {/* Download PDF Report */}
                            <button
                              onClick={async () => {
  try {
    await downloadDefectiveReportPdf(item);
    toast.success(
      `Downloaded report DEF-${String(item.id).padStart(4, "0")}.pdf`
    );
  } catch (error) {
    toast.error(
      error instanceof Error
        ? `PDF download failed: ${error.message}`
        : "PDF download failed. Please try again."
    );
  }
}}
                              className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors"
                              title={`Download PDF report DEF-${String(item.id).padStart(4, "0")}.pdf`}
                            >
                              <Download size={14} />
                            </button>

                            {/* View Detail */}
                            <button
                              onClick={() => setDetailModalItem(item)}
                              className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-slate-100 rounded-md transition-colors"
                              title="View details & evidence"
                            >
                              <Eye size={14} />
                            </button>

                            {/* Status Quick Action */}
                            <button
                              onClick={() => setStatusModalItem(item)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md shadow-2xs transition-colors"
                              title="Update defect resolution status"
                            >
                              Update Status
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete defect report #DEF-${String(
                                      item.id
                                    ).padStart(4, "0")}?`
                                  )
                                ) {
                                  deleteReportMut.mutate(item.id);
                                }
                              }}
                              className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              title="Delete defect record"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
              <p className="text-xs text-slate-500">
                {total} total defect reports • showing{" "}
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, total)}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-ghost p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "w-7 h-7 text-xs rounded-md font-medium transition-colors",
                      n === page
                        ? "bg-brand-600 text-white font-semibold"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-ghost p-1.5 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODAL 1: Report Defective Item */}
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

      {/* MODAL 2: Update Status & Resolution */}
      {statusModalItem && (
        <UpdateStatusModal
          item={statusModalItem}
          isPending={updateStatusMut.isPending}
          onClose={() => setStatusModalItem(null)}
          onUpdate={(status, notes) =>
            updateStatusMut.mutate({ id: statusModalItem.id, status, notes })
          }
        />
      )}

      {/* MODAL 3: Defect Details & Evidence Preview */}
      {detailModalItem && (
        <DefectDetailModal
          item={detailModalItem}
          onClose={() => setDetailModalItem(null)}
          onEditStatus={() => {
            const current = detailModalItem;
            setDetailModalItem(null);
            setStatusModalItem(current);
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Report Defect Modal Component
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
  const currentUser = getStoredUser();
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [defectiveQuantity, setDefectiveQuantity] = useState<number | "">("");
  const [defectType, setDefectType] = useState<string>(DEFECT_TYPES[0]);
  const [description, setDescription] = useState<string>("");
  const [inspectionDate, setInspectionDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");
  const [reporter, setReporter] = useState<string>(
    currentUser?.name || "Receiving Team"
  );
  const [submitting, setSubmitting] = useState(false);

  // Find selected PO
  const selectedPO = useMemo(() => {
    return purchaseOrders.find((p) => String(p.id) === selectedPoId);
  }, [purchaseOrders, selectedPoId]);

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

    const qty = Number(defectiveQuantity);
    if (!qty || qty <= 0) {
      toast.error("Defective quantity must be greater than zero");
      return;
    }

    if (qty > selectedPO.quantity) {
      toast.error(
        `Defective quantity (${qty}) cannot exceed ordered quantity (${selectedPO.quantity})`
      );
      return;
    }

    if (!defectType) {
      toast.error("Please specify defect type");
      return;
    }

    const payload: CreateDefectivePayload = {
      po_id: selectedPO.id,
      po_number: selectedPO.po_number,
      vendor_id: selectedPO.vendor_id,
      vendor_name: selectedPO.vendor_name,
      item_name: selectedPO.item_name,
      ordered_quantity: selectedPO.quantity,
      defective_quantity: qty,
      defect_type: defectType,
      description: description.trim() || undefined,
      inspection_date: inspectionDate,
      evidence_photo_url: photoDataUrl || undefined,
      reported_by: reporter.trim() || "Receiving Team",
    };

    try {
      setSubmitting(true);
      await defectiveApi.create(payload);
      toast.success(
        `Defective report created! ${qty} units of '${selectedPO.item_name}' placed into quarantine.`
      );
      onSuccess();
    } catch (err: any) {
      toast.error(`Failed to submit report: ${err?.message || "Error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <PackageX size={16} />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-base">
                Report Defective Item
              </h2>
              <p className="text-xs text-slate-500">
                Log post-delivery vendor defects & quarantine stock
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* 1. Purchase Order Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              1. Select Purchase Order <span className="text-red-500">*</span>
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
            {purchaseOrders.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No purchase orders found in the database. Run agent workflow to generate POs first.
              </p>
            )}
          </div>

          {/* Selected PO Details Card */}
          {selectedPO && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  PO: {selectedPO.po_number}
                </span>
                <span className="badge badge-slate text-[10px]">
                  Status: {selectedPO.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-600 pt-1 border-t border-slate-200/60">
                <div>
                  <span className="text-slate-400 block text-[10px]">Item</span>
                  <span className="font-medium text-slate-800">
                    {selectedPO.item_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Vendor</span>
                  <span className="font-medium text-slate-800">
                    {selectedPO.vendor_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    Total Ordered Qty
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedPO.quantity?.toLocaleString()} units
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    Expected Delivery
                  </span>
                  <span className="text-slate-700">
                    {selectedPO.delivery_date_expected || "N/A"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 2. Defective Quantity & Defect Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
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
                placeholder="e.g. 25"
                className="form-input text-xs"
              />
              {selectedPO && defectiveQuantity && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Remaining usable units:{" "}
                  <strong className="text-slate-800">
                    {Math.max(0, selectedPO.quantity - Number(defectiveQuantity))}
                  </strong>{" "}
                  units
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                3. Defect Classification <span className="text-red-500">*</span>
              </label>
              <select
                value={defectType}
                onChange={(e) => setDefectType(e.target.value)}
                required
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

          {/* 3. Description & Observation */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              4. Inspection Observation & Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe physical defects, batch/lot numbers, damage pattern, packaging condition..."
              className="form-input text-xs leading-relaxed"
            />
          </div>

          {/* 4. Inspection Date & Reporter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                5. Inspection Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                required
                className="form-input text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                6. Inspected By
              </label>
              <input
                type="text"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                placeholder="Receiver name or department"
                className="form-input text-xs"
              />
            </div>
          </div>

          {/* 5. Photo Evidence Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              7. Photographic Evidence (Optional)
            </label>
            {photoDataUrl ? (
              <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100 max-h-44 flex items-center justify-center">
                <img
                  src={photoDataUrl}
                  alt="Defect evidence preview"
                  className="max-h-44 object-contain"
                />
                <button
                  type="button"
                  onClick={() => setPhotoDataUrl("")}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                  title="Remove photo"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-brand-400 rounded-xl p-4 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <Upload size={22} className="text-slate-400 mb-1" />
                <span className="text-xs font-medium text-slate-600">
                  Upload evidence photo (JPEG, PNG, WebP)
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Max file size: 5MB
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

          {/* Quarantine Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle size={15} className="shrink-0 text-amber-600 mt-0.5" />
            <p>
              <strong>Notice:</strong> Submitting will record this batch as
              segregated Quarantine stock. The original Purchase Order status and
              quantities remain intact.
            </p>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
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
              {submitting ? "Logging Defect..." : "Record & Quarantine"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// Update Status Modal Component
// =====================================================================
function UpdateStatusModal({
  item,
  isPending,
  onClose,
  onUpdate,
}: {
  item: DefectiveItem;
  isPending: boolean;
  onClose: () => void;
  onUpdate: (status: string, notes?: string) => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState(item.status);
  const [notes, setNotes] = useState(item.resolution_notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(selectedStatus, notes.trim() || undefined);
  };

  const statusOptions = [
    { key: "REPORTED", label: "Reported", desc: "Defect logged; initial quarantine" },
    { key: "UNDER_REVIEW", label: "Under Review", desc: "Quality team evaluating inspection" },
    { key: "AWAITING_VENDOR", label: "Awaiting Vendor", desc: "Communicated with vendor for RMA / RMA claim" },
    { key: "RESOLUTION_IN_PROGRESS", label: "Resolution in Progress", desc: "Replacement or repair being processed" },
    { key: "RESOLVED", label: "Resolved", desc: "Replacement received, credit note issued, or resolved" },
    { key: "REJECTED", label: "Rejected", desc: "Defect claim dismissed after inspection" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-800 text-sm">
              Update Defect Status
            </h2>
            <p className="text-xs text-slate-500">
              #DEF-{String(item.id).padStart(4, "0")} • {item.po_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Select Lifecycle Status
            </label>
            <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
              {statusOptions.map((opt) => (
                <label
                  key={opt.key}
                  className={cn(
                    "flex items-start gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all",
                    selectedStatus === opt.key
                      ? "border-brand-500 bg-brand-50/60 text-brand-900"
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
                    <span className="font-semibold block">{opt.label}</span>
                    <span className="text-[11px] text-slate-500 block">
                      {opt.desc}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Resolution Remarks / RMA Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. RMA #4982 issued by vendor; replacement shipment arriving by next Monday."
              className="form-input text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
              Save Status
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =====================================================================
// Defect Detail Modal Component
// =====================================================================
function DefectDetailModal({
  item,
  onClose,
  onEditStatus,
}: {
  item: DefectiveItem;
  onClose: () => void;
  onEditStatus: () => void;
}) {
  const sc = statusConfig[item.status] ?? statusConfig.REPORTED;
  const StatusIcon = sc.icon;
  const defectPercent = Math.round(
    (item.defective_quantity / item.ordered_quantity) * 100
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-800">
                #DEF-{String(item.id).padStart(4, "0")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border",
                  sc.cls
                )}
              >
                <StatusIcon size={11} />
                {sc.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Associated PO: {item.po_number} • Inspected: {item.inspection_date}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Stock Metrics Bar */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-center">
            <div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">
                Ordered Qty
              </span>
              <span className="text-sm font-bold text-slate-800">
                {item.ordered_quantity?.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-red-500 font-medium uppercase tracking-wider block">
                Defective (Quarantine)
              </span>
              <span className="text-sm font-bold text-red-600">
                {item.defective_quantity?.toLocaleString()} ({defectPercent}%)
              </span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider block">
                Usable Stock
              </span>
              <span className="text-sm font-bold text-emerald-700">
                {Math.max(
                  0,
                  item.ordered_quantity - item.defective_quantity
                )?.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Core Info */}
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-400 block text-[11px]">Item</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {item.item_name}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Vendor</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {item.vendor_name}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  Defect Category
                </span>
                <span className="inline-block mt-0.5 px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                  {item.defect_type}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  Inspected By
                </span>
                <span className="text-slate-700 font-medium">
                  {item.reported_by || "Receiving Team"}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-slate-400 block text-[11px] mb-1">
                Inspection Remarks / Description
              </span>
              <p className="bg-slate-50 p-3 rounded-lg text-slate-700 leading-relaxed font-normal">
                {item.description || "No detailed description provided."}
              </p>
            </div>

            {/* Resolution Notes */}
            {item.resolution_notes && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-1">
                  Resolution Notes
                </span>
                <p className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-emerald-900 leading-relaxed font-normal">
                  {item.resolution_notes}
                </p>
              </div>
            )}

            {/* Photo Evidence */}
            {item.evidence_photo_url && (
              <div className="pt-2 border-t border-slate-100">
                <span className="text-slate-400 block text-[11px] mb-2 font-medium">
                  Attached Photographic Evidence
                </span>
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-black/5 flex items-center justify-center max-h-72">
                  <img
                    src={item.evidence_photo_url}
                    alt="Defective item evidence"
                    className="max-h-72 object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-100 bg-slate-50/50">
          <span className="text-[11px] text-slate-400">
            Recorded: {item.created_at}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
  try {
    await downloadDefectiveReportPdf(item);
    toast.success(
      `Downloaded report DEF-${String(item.id).padStart(4, "0")}.pdf`
    );
  } catch (error) {
    toast.error(
      error instanceof Error
        ? `PDF download failed: ${error.message}`
        : "PDF download failed. Please try again."
    );
  }
}}
              className="btn-secondary text-xs inline-flex items-center gap-1.5"
              title="Download official PDF report"
            >
              <Download size={13} />
              Download PDF
            </button>
            <button onClick={onClose} className="btn-secondary text-xs">
              Close
            </button>
            <button onClick={onEditStatus} className="btn-primary text-xs">
              Update Resolution Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
