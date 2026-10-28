"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  ShoppingCart,
  Bot,
  PackageX,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Building2,
  Star,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  ExternalLink,
  MessageSquare,
  Download,
  Truck,
  RotateCcw,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  procurementApi,
  procuraApi,
  defectiveApi,
  getStoredUser,
  type AuthUser,
  type ProcuraProposal
} from "@/lib/api";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { ProcuraView } from "@/components/procura/ProcuraView";
import { downloadDefectiveReportPdf } from "@/lib/defectivePdf";

export function VendorPortalView() {
  const router = useRouter();
  const qc = useQueryClient();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "proposals" | "quality" | "chat">("orders");
  const [poFilterStatus, setPoFilterStatus] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [vendorResponseItem, setVendorResponseItem] = useState<any | null>(null);

  useEffect(() => {
    const stored = getStoredUser();
    setUser(stored);
  }, []);

  // 1. Fetch Vendor's Purchase Orders
  const {
    data: poData,
    isLoading: posLoading,
    isFetching: posFetching,
    refetch: refetchPOs
  } = useQuery({
    queryKey: ["vendor-pos", user?.vendor_id, user?.vendor_name],
    queryFn: async () => {
      return procurementApi.getPOs();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // 2. Fetch Vendor's Negotiation Proposals
  const {
    data: proposalData,
    isLoading: proposalsLoading,
    refetch: refetchProposals
  } = useQuery({
    queryKey: ["vendor-proposals", user?.vendor_id, user?.vendor_name],
    queryFn: async () => {
      return procuraApi.getProposals();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // 3. Fetch Vendor's Defective Items
  const {
    data: defectiveData,
    isLoading: defectiveLoading,
    refetch: refetchDefective
  } = useQuery({
    queryKey: ["vendor-defective", user?.vendor_id, user?.vendor_name],
    queryFn: async () => {
      return defectiveApi.getItems({
        limit: 50,
        vendor_id: user?.vendor_id,
        vendor_name: user?.vendor_name,
      });
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  const allPOs = poData?.purchase_orders || [];
  const allProposals = proposalData?.proposals || [];
  const allDefective = defectiveData?.defective_items || [];

  // Filter POs
  const filteredPOs = allPOs.filter((po: any) => {
    const matchesStatus = poFilterStatus === "ALL" || po.status === poFilterStatus;
    const matchesSearch =
      searchTerm === "" ||
      po.po_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.item_name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Metrics
  const totalPOsCount = allPOs.length;
  const activeOrdersCount = allPOs.filter((po: any) => po.status === "PENDING_APPROVAL" || po.status === "APPROVED").length;
  const totalSpend = allPOs.reduce((acc: number, po: any) => acc + (parseFloat(po.total_price) || 0), 0);
  const pendingProposalsCount = allProposals.filter((p: ProcuraProposal) => p.status === "PENDING").length;
  const defectiveReportsCount = allDefective.length;

  const vendorName = user?.vendor_name || user?.name || "Verified Supplier";
  const vendorCity = user?.city || "India";
  const vendorRating = user?.rating || 4.5;

  return (
    <div className="space-y-6">
      {/* Supplier Profile Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 sm:p-8 text-white shadow-xl border border-slate-700/60">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                <ShieldCheck size={14} className="text-emerald-400" />
                Verified Partner Supplier
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                <Star size={12} className="fill-amber-400 text-amber-400" />
                {vendorRating} Star Supplier Rating
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Vendor ID #{user?.vendor_id || user?.id || "8"}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {vendorName}
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Official supplier dashboard for Purchase Order fulfillment, Procura AI real-time negotiation, and quality defect tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab("chat")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition active:scale-95"
            >
              <Bot size={18} />
              Launch Procura AI
            </button>
            <button
              onClick={() => {
                refetchPOs();
                refetchProposals();
                refetchDefective();
                toast.success("Refreshed supplier records");
              }}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 transition"
              title="Refresh Data"
            >
              <RefreshCw size={16} className={cn(posFetching && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Assigned Orders
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingCart size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{totalPOsCount}</span>
            <span className="text-xs text-slate-500">POs awarded</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{activeOrdersCount} in active fulfillment</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contract Value
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{formatCurrency(totalSpend)}</span>
          </div>
          <p className="text-xs text-emerald-600 mt-1 font-medium">Cumulated awarded volume</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Counter-Offers
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{pendingProposalsCount}</span>
            <span className="text-xs text-amber-700 font-medium">Under buyer review</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Submitted via Procura Chat</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Quality Alerts
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <PackageX size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{defectiveReportsCount}</span>
            <span className="text-xs text-slate-500">defective incident(s)</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Requires inspection review</p>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-2xl shadow-sm">
        <button
          onClick={() => setActiveTab("orders")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            activeTab === "orders"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <ShoppingCart size={16} />
          My Purchase Orders
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
            {totalPOsCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("proposals")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            activeTab === "proposals"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Clock size={16} />
          Counter-Proposals & Negotiation
          {pendingProposalsCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
              {pendingProposalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("quality")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            activeTab === "quality"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <PackageX size={16} />
          Defective Shipments
          {defectiveReportsCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
              {defectiveReportsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            activeTab === "chat"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Bot size={16} />
          Procura AI Assistant
        </button>
      </div>

      {/* Tab 1: My Purchase Orders */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by PO # or item..."
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
              <select
                value={poFilterStatus}
                onChange={(e) => setPoFilterStatus(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="ISSUED">Issued</option>
              </select>
            </div>
          </div>

          {/* POs Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {posLoading ? (
              <div className="p-16 text-center text-slate-400">Loading your purchase orders...</div>
            ) : filteredPOs.length === 0 ? (
              <div className="p-16 text-center space-y-2">
                <ShoppingCart size={40} className="mx-auto text-slate-300" />
                <p className="text-base font-semibold text-slate-700">No purchase orders found</p>
                <p className="text-xs text-slate-400">You currently have no purchase orders matching this filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">PO Number</th>
                      <th className="py-3.5 px-4">Item & Specifications</th>
                      <th className="py-3.5 px-4">Quantity</th>
                      <th className="py-3.5 px-4">Unit Price</th>
                      <th className="py-3.5 px-4">Total Amount</th>
                      <th className="py-3.5 px-4">Expected Delivery</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPOs.map((po: any) => {
                      const isPending = po.status === "PENDING_APPROVAL";
                      const isApproved = po.status === "APPROVED";
                      return (
                        <tr key={po.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4">
                            <span className="font-bold text-slate-900 font-mono text-sm">
                              {po.po_number}
                            </span>
                            <p className="text-[11px] text-slate-400">Req #{po.request_id || "N/A"}</p>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="font-medium text-slate-800">{po.item_name}</span>
                            <p className="text-[11px] text-slate-400">{po.notes || "Standard procurement item"}</p>
                          </td>

                          <td className="py-3.5 px-4 font-semibold text-slate-700">
                            {po.quantity?.toLocaleString()}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-medium text-slate-800">
                            ₹{parseFloat(po.unit_price).toFixed(2)}
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {formatCurrency(parseFloat(po.total_price))}
                          </td>

                          <td className="py-3.5 px-4 text-slate-600">
                            {po.delivery_date_expected || "Not specified"}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                                isApproved
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : isPending
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-slate-100 text-slate-700 border border-slate-200"
                              )}
                            >
                              {isApproved ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                              {po.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/procura?po=${po.po_number}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 transition"
                            >
                              <Bot size={14} />
                              Negotiate / Chat
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Counter-Proposals & Negotiation Status */}
      {activeTab === "proposals" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Active Counter-Offers & Negotiation History
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Counter-proposals submitted through Procura AI are automatically staged here as PENDING until reviewed and manually accepted by the assigned internal buyer (Procurement Officer, Operations Manager, or Finance Director).
            </p>

            {proposalsLoading ? (
              <div className="p-12 text-center text-slate-400">Loading counter-proposals...</div>
            ) : allProposals.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Clock size={36} className="mx-auto text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No negotiation proposals submitted yet</p>
                <p className="text-xs text-slate-400">
                  Open any Purchase Order in Procura AI to propose a price adjustment or delivery extension.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {allProposals.map((prop: ProcuraProposal) => {
                  const isApproved = prop.status === "APPROVED";
                  const isRejected = prop.status === "REJECTED";
                  const isPending = prop.status === "PENDING";

                  return (
                    <div
                      key={prop.id}
                      className={cn(
                        "rounded-2xl border p-5 transition",
                        isApproved
                          ? "bg-emerald-50/40 border-emerald-200"
                          : isRejected
                          ? "bg-rose-50/30 border-rose-200"
                          : "bg-amber-50/30 border-amber-200"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            Proposal #{prop.id}
                          </span>
                          <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border text-slate-600">
                            {prop.po_number}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold",
                              isApproved
                                ? "bg-emerald-100 text-emerald-800"
                                : isRejected
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800 animate-pulse"
                            )}
                          >
                            {isApproved && <CheckCircle2 size={12} />}
                            {isRejected && <XCircle size={12} />}
                            {isPending && <Clock size={12} />}
                            {prop.status === "PENDING" ? "Awaiting Buyer Acceptance" : prop.status}
                          </span>
                        </div>

                        <span className="text-xs text-slate-400">
                          Submitted on {formatDateTime(prop.created_at)}
                        </span>
                      </div>

                      {/* Comparison Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded-xl border border-slate-100 mb-3 text-xs">
                        <div>
                          <span className="text-slate-400 font-medium">Unit Price:</span>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-500 line-through">₹{parseFloat(String(prop.current_unit_price)).toFixed(2)}</span>
                            <span className="font-bold text-slate-900 font-mono">
                              {prop.proposed_unit_price ? `₹${parseFloat(String(prop.proposed_unit_price)).toFixed(2)}` : "Unchanged"}
                            </span>
                            {prop.price_variance_pct && parseFloat(String(prop.price_variance_pct)) !== 0 && (
                              <span className={cn(
                                "px-1.5 py-0.2 rounded font-bold text-[10px]",
                                parseFloat(String(prop.price_variance_pct)) < 0 ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              )}>
                                {parseFloat(String(prop.price_variance_pct)) > 0 ? "+" : ""}{prop.price_variance_pct}%
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 font-medium">Delivery Schedule:</span>
                          <div className="flex items-center gap-2 mt-0.5 font-medium text-slate-800">
                            {prop.proposed_delivery_date ? (
                              <>
                                <span className="line-through text-slate-400">{prop.current_delivery_date || "Original"}</span>
                                <span className="font-bold text-blue-700">➔ {prop.proposed_delivery_date}</span>
                              </>
                            ) : (
                              <span>Unchanged</span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span className="text-slate-400 font-medium">Revised Total Amount:</span>
                          <div className="mt-0.5 font-bold text-slate-900 font-mono text-sm">
                            {formatCurrency(parseFloat(String(prop.proposed_total_price)))}
                          </div>
                        </div>
                      </div>

                      {/* Rationale & Review notes */}
                      <div className="space-y-1.5 text-xs">
                        <p className="text-slate-600">
                          <span className="font-semibold text-slate-700">Your Business Justification: </span>
                          {prop.reason || "Volume discount / operational adjustment"}
                        </p>

                        {prop.review_notes && (
                          <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">
                            <span className="font-bold text-slate-900">Buyer Review Note ({prop.reviewed_by}): </span>
                            {prop.review_notes}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-end">
                        <Link
                          href={`/procura?po=${prop.po_number}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          View discussion in Procura <ArrowRight size={13} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Defective Shipments & RMA Non-Conformance */}
      {activeTab === "quality" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Quality Inspection Reports & RMA Non-Conformance
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    ISO 9001 Quarantine
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time inspection flags logged by incoming receiving. Acknowledge claims, dispatch replacement units, or confirm credit memos.
                </p>
              </div>
            </div>

            {defectiveLoading ? (
              <div className="p-12 text-center text-slate-400">Loading defect records...</div>
            ) : allDefective.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <p className="text-sm font-semibold text-slate-700">Flawless Quality Score!</p>
                <p className="text-xs text-slate-400">No defective items or quality incidents logged for your shipments.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {allDefective.map((item: any) => {
                  const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;
                  const claimAmt = item.total_claim_amount || 0;
                  const severity = (item.severity || "MAJOR").toUpperCase();

                  return (
                    <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 text-xs px-2 py-0.5 rounded font-mono">
                            {rmaCode}
                          </span>
                          <span className="font-bold text-slate-900 text-sm font-mono">PO: {item.po_number}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            {item.defective_quantity} of {item.ordered_quantity} {item.item_name} Defective
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[11px] font-semibold border",
                            severity === "CRITICAL"
                              ? "bg-red-50 text-red-700 border-red-300"
                              : severity === "MAJOR"
                              ? "bg-amber-50 text-amber-800 border-amber-300"
                              : "bg-blue-50 text-blue-700 border-blue-300"
                          )}>
                            {severity} Severity
                          </span>
                          <span className="text-xs text-slate-400">• Inspected: {item.inspection_date}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <span><strong>Defect Type:</strong> {item.defect_type}</span>
                          <span><strong>Batch / Lot:</strong> <code className="text-slate-800">{item.batch_number || "LOT-2026-001"}</code></span>
                          <span><strong>Claim Value:</strong> <strong className="text-rose-700 font-mono">₹{claimAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        </div>

                        {item.description && (
                          <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <strong>QC Observations:</strong> {item.description}
                          </p>
                        )}

                        {item.tracking_reference && (
                          <p className="text-xs text-indigo-700 font-medium">
                            🚚 <strong>Dispatched Tracking Reference:</strong> {item.tracking_reference}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Download Official PDF */}
                        <button
                          onClick={async () => {
                            try {
                              await downloadDefectiveReportPdf(item);
                              toast.success(`Downloaded official certificate for ${rmaCode}`);
                            } catch (e: any) {
                              toast.error(`Download failed: ${e?.message || "Error"}`);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                          title="Download ISO 9001 Certificate"
                        >
                          <Download size={13} />
                          Certificate
                        </button>

                        {/* Respond to RMA */}
                        <button
                          onClick={() => setVendorResponseItem(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition"
                        >
                          <RotateCcw size={13} />
                          Acknowledge & Settle RMA
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Embedded Procura Chatbot */}
      {activeTab === "chat" && (
        <div className="space-y-3">
          <div className="bg-blue-50/80 border border-blue-200 p-4 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                <Bot size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Procura Real-Time Supplier Chatbot</h3>
                <p className="text-xs text-slate-600">
                  Select any of your purchase orders below to ask questions, view specs, or submit a counter-offer.
                </p>
              </div>
            </div>
            <Link
              href="/procura"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
            >
              Full Screen Mode <ExternalLink size={13} />
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <ProcuraView />
          </div>
        </div>
      )}

      {/* Vendor RMA Response Modal */}
      {vendorResponseItem && (
        <VendorDefectiveResponseModal
          item={vendorResponseItem}
          user={user}
          onClose={() => setVendorResponseItem(null)}
          onSuccess={() => {
            setVendorResponseItem(null);
            qc.invalidateQueries({ queryKey: ["vendor-defective"] });
            refetchDefective();
          }}
        />
      )}
    </div>
  );
}

function VendorDefectiveResponseModal({
  item,
  user,
  onClose,
  onSuccess,
}: {
  item: any;
  user: AuthUser | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [action, setAction] = useState<"ACCEPT_REPLACEMENT" | "ACCEPT_CREDIT" | "CONTEST">("ACCEPT_REPLACEMENT");
  const [trackingRef, setTrackingRef] = useState("");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;
  const claimAmt = item.total_claim_amount || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await defectiveApi.vendorResponse(item.id, {
        action,
        tracking_reference: trackingRef.trim() || undefined,
        vendor_comments: comments.trim() || undefined,
        performed_by: user?.name || user?.vendor_name || "Supplier Representative",
      });
      toast.success(`Response recorded for RMA ${rmaCode}!`);
      onSuccess();
    } catch (err: any) {
      toast.error(`Submission failed: ${err?.message || "Error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg my-8 overflow-hidden flex flex-col max-h-[92vh] border border-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-900 text-white">
          <div>
            <h2 className="font-bold text-sm text-white">
              Supplier RMA Acknowledgement & Settlement
            </h2>
            <p className="text-xs text-slate-300">
              Docket {rmaCode} • Claim Value: ₹{claimAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center justify-between font-bold text-slate-900">
              <span>{item.item_name}</span>
              <span className="text-rose-600">{item.defective_quantity} Units Quarantined</span>
            </div>
            <p className="text-slate-500">
              PO #{item.po_number} • Defect: {item.defect_type} ({item.severity || "MAJOR"} Severity)
            </p>
          </div>

          {/* Action Choice */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Settlement Action
            </label>
            <div className="space-y-2">
              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "ACCEPT_REPLACEMENT"
                  ? "border-emerald-500 bg-emerald-50/60 text-emerald-950 font-medium"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "ACCEPT_REPLACEMENT"}
                  onChange={() => setAction("ACCEPT_REPLACEMENT")}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold block">🚚 Dispatch Brand New Replacement Units</span>
                  <span className="text-[11px] text-slate-500">Accept claim and provide shipment tracking / AWB number.</span>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "ACCEPT_CREDIT"
                  ? "border-blue-500 bg-blue-50/60 text-blue-950 font-medium"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "ACCEPT_CREDIT"}
                  onChange={() => setAction("ACCEPT_CREDIT")}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold block">💳 Offer Credit Note / Invoice Deduction</span>
                  <span className="text-[11px] text-slate-500">Deduct ₹{claimAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from pending invoices.</span>
                </div>
              </label>

              <label className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition",
                action === "CONTEST"
                  ? "border-amber-500 bg-amber-50/60 text-amber-950 font-medium"
                  : "border-slate-200 hover:bg-slate-50 text-slate-700"
              )}>
                <input
                  type="radio"
                  name="action"
                  checked={action === "CONTEST"}
                  onChange={() => setAction("CONTEST")}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-bold block">⚠️ Contest Claim with Technical Justification</span>
                  <span className="text-[11px] text-slate-500">Request joint QA re-inspection and provide manufacturer explanation.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Courier / Tracking Ref */}
          {action === "ACCEPT_REPLACEMENT" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Courier Partner & AWB Waybill Tracking # <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={trackingRef}
                onChange={(e) => setTrackingRef(e.target.value)}
                placeholder="e.g. DTDC Air Express #DTC-94829103 or BlueDart AWB #84920"
                className="form-input text-xs font-mono"
              />
            </div>
          )}

          {action === "ACCEPT_CREDIT" && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Credit Memo Reference #
              </label>
              <input
                type="text"
                value={trackingRef}
                onChange={(e) => setTrackingRef(e.target.value)}
                placeholder="e.g. CR-MEMO-2026-902"
                className="form-input text-xs font-mono"
              />
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Supplier Comments & Remarks
            </label>
            <textarea
              rows={3}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="e.g. Replacement units dispatched from Pune warehouse; expected delivery within 3 business days..."
              className="form-input text-xs"
            />
          </div>

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
              Submit Settlement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
