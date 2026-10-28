"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { procurementApi, procuraApi, getStoredUser, type AuthUser, type ProcuraProposal } from "@/lib/api";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { AgentRationaleCard } from "./AgentRationaleCard";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2, RefreshCw,
  Download, Eye, ShieldCheck, PenTool, X, FileText, Lock,
  Bot, ArrowRight, Check, CornerDownLeft, Sparkles, Building2,
  Calendar, DollarSign, TrendingDown, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

const tierConfig: Record<string, { label: string; role: string; email: string; cls: string }> = {
  TIER_1_OFFICER: {
    label: "Tier 1 (< ₹50,000)",
    role: "Procurement Officer",
    email: "shindeishwari2010@gmail.com",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  TIER_2_MANAGER: {
    label: "Tier 2 (₹50,000 – ₹2,00,000)",
    role: "Operations Manager",
    email: "shindeishwari45@gmail.com",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  TIER_3_DIRECTOR: {
    label: "Tier 3 (> ₹2,00,000)",
    role: "Finance Director",
    email: "simplesalt7@gmail.com",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
  },
};

// ------------------------------------------------------------------ //
// DocuSign Digital Signature Modal                                    //
// ------------------------------------------------------------------ //
function DocuSignModal({
  po,
  onClose,
  onSigned,
}: {
  po: any;
  onClose: () => void;
  onSigned: () => void;
}) {
  const tierInfo = tierConfig[po.approval_tier] ?? tierConfig.TIER_1_OFFICER;
  const [signerName, setSignerName]   = useState(po.assigned_approver_name || tierInfo.role);
  const [signerEmail, setSignerEmail] = useState(po.assigned_approver_email || tierInfo.email);
  const [signatureText, setSignatureText] = useState(signerName);
  const [agreed, setAgreed]           = useState(true);
  const [submitting, setSubmitting]   = useState(false);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast.error("Please confirm authorization agreement");
      return;
    }
    setSubmitting(true);
    try {
      const res = await procurementApi.signPO(po.id, {
        signer_name: signerName,
        signer_email: signerEmail,
        notes: `DocuSign digital signature applied by ${signerName} (${tierInfo.role})`,
      });
      toast.success(
        `✓ PO ${po.po_number} digitally signed via DocuSign! Archived in MinIO.`
      );
      onSigned();
    } catch (err: any) {
      toast.error(`Signing failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">DocuSign eSignature Portal</h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/30 text-blue-200 border border-blue-400/30 uppercase font-semibold">
                  Secure PKI
                </span>
              </div>
              <p className="text-xs text-slate-300">Authorize Purchase Order {po.po_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSign} className="p-6 space-y-4">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">PO Number:</span>
              <span className="font-mono font-bold text-slate-900">{po.po_number}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Item & Quantity:</span>
              <span className="font-medium text-slate-800">{po.quantity?.toLocaleString()}x {po.item_name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Total Obligation:</span>
              <span className="font-bold text-blue-600">{formatCurrency(po.total_price)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-200/60 pt-2">
              <span className="text-slate-500">Approval Tier:</span>
              <span className="font-semibold text-slate-700">{tierInfo.label}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Authorized Signer Name
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => {
                setSignerName(e.target.value);
                setSignatureText(e.target.value);
              }}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Signer Corporate Email
            </label>
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* eSignature Preview Box */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Digital Signature Stamp
            </label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 bg-amber-50/30 flex items-center justify-between">
              <div>
                <p className="font-serif italic text-2xl text-slate-800 tracking-wide">
                  {signatureText || "Signature"}
                </p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">
                  PKI SHA-256 Hash Verified &bull; {new Date().toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="text-right text-[10px] text-slate-500">
                <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase">
                  DocuSign Verified
                </span>
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-600 leading-tight">
              I certify that I hold delegated financial approval authority for this tier and authorize binding issuance of this Purchase Order.
            </span>
          </label>

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !agreed}
              className="flex-1 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Signing...
                </>
              ) : (
                <>
                  <ShieldCheck size={14} /> Complete & Sign
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Counter-Proposal Buyer Review Modal                                 //
// ------------------------------------------------------------------ //
function ProposalReviewModal({
  proposal,
  action,
  onClose,
  onReviewed,
}: {
  proposal: ProcuraProposal;
  action: "APPROVE" | "REJECT";
  onClose: () => void;
  onReviewed: () => void;
}) {
  const [reviewNotes, setReviewNotes] = useState(
    action === "APPROVE"
      ? "Counter-offer approved as negotiated. Updating Purchase Order specifications."
      : "Counter-offer rejected. Current PO parameters remain binding."
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await procuraApi.reviewProposal(proposal.id, {
        action,
        review_notes: reviewNotes.trim(),
      });
      toast.success(
        action === "APPROVE"
          ? `✓ Counter-offer for ${proposal.po_number} APPROVED! PO values updated in database.`
          : `Counter-offer for ${proposal.po_number} rejected.`
      );
      onReviewed();
    } catch (err: any) {
      toast.error(`Review failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const isApprove = action === "APPROVE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
        <div className={cn(
          "p-5 text-white flex items-start justify-between",
          isApprove ? "bg-emerald-800" : "bg-rose-800"
        )}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold text-sm shadow">
              {isApprove ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            </div>
            <div>
              <h3 className="text-base font-bold">
                {isApprove ? "Accept Vendor Counter-Offer" : "Reject Vendor Counter-Offer"}
              </h3>
              <p className="text-xs text-white/80">
                {proposal.po_number} &bull; {proposal.vendor_name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Vendor:</span>
              <span className="font-semibold text-slate-800">{proposal.vendor_name}</span>
            </div>
            {proposal.proposed_unit_price && (
              <div className="flex justify-between">
                <span className="text-slate-500">Unit Price:</span>
                <span className="font-mono">
                  ₹{parseFloat(String(proposal.current_unit_price)).toFixed(2)} ➔ <strong className="text-emerald-700">₹{parseFloat(String(proposal.proposed_unit_price)).toFixed(2)}</strong> ({proposal.price_variance_pct}%)
                </span>
              </div>
            )}
            {proposal.proposed_delivery_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Schedule:</span>
                <span className="font-medium">
                  {proposal.current_delivery_date || "Original"} ➔ <strong className="text-blue-700">{proposal.proposed_delivery_date}</strong>
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <span className="text-slate-500">Revised Total:</span>
              <span className="font-bold font-mono text-slate-900">
                {formatCurrency(parseFloat(String(proposal.proposed_total_price)))}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Reviewer Notes / Instructions for Vendor
            </label>
            <textarea
              rows={3}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              required
              placeholder="Add formal justification or counter notes..."
              className="w-full p-3 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "flex-1 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5",
                isApprove ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
              )}
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Processing...
                </>
              ) : isApprove ? (
                <>
                  <Check size={14} /> Confirm & Update PO
                </>
              ) : (
                <>
                  <X size={14} /> Reject Counter-Offer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Main Approvals & Counter-Offers View                                //
// ------------------------------------------------------------------ //
export function ApprovalsView() {
  const qc = useQueryClient();
  const router = useRouter();

  const [mainTab, setMainTab] = useState<"pos" | "counter_offers">("pos");
  const [proposalFilter, setProposalFilter] = useState<"PENDING" | "ALL">("PENDING");

  const [requestedPoId, setRequestedPoId] = useState<number | null>(null);
  const [signRequested, setSignRequested] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const poId = Number(params.get("po_id"));
    if (Number.isFinite(poId) && poId > 0) {
      setRequestedPoId(poId);
    }
    setSignRequested(params.get("sign") === "true");
    if (params.get("tab") === "counter_offers") {
      setMainTab("counter_offers");
    }
  }, []);

  const [signingPO, setSigningPO] = useState<any | null>(null);
  const [activeReviewModal, setActiveReviewModal] = useState<{
    proposal: ProcuraProposal;
    action: "APPROVE" | "REJECT";
  } | null>(null);

  // 1. POs pending DocuSign
  const {
    data: poData,
    isLoading: posLoading,
    isError: posError,
    refetch: refetchPOs,
    isFetching: posFetching
  } = useQuery({
    queryKey: ["pending-pos", currentUser?.id, currentUser?.role],
    queryFn: () => procurementApi.getPOs({ status: "PENDING_APPROVAL", assigned_to_me: true }),
    refetchInterval: 8000,
  });

  // 2. Procura Vendor Counter-Offers
  const {
    data: proposalData,
    isLoading: proposalsLoading,
    refetch: refetchProposals,
    isFetching: proposalsFetching
  } = useQuery({
    queryKey: ["approvals-proposals", currentUser?.id],
    queryFn: () => procuraApi.getProposals(),
    refetchInterval: 8000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      procurementApi.updateStatus(id, { status, performed_by: currentUser?.name || currentUser?.role || "Approver" }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pending-pos"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["po-summary"] });
      toast.success(vars.status === "APPROVED" ? "Purchase order approved." : "Purchase order rejected.");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || "Failed to update status";
      toast.error(msg);
    },
  });

  const pendingPOs = poData?.purchase_orders ?? [];
  const allProposals = proposalData?.proposals ?? [];
  const pendingProposals = allProposals.filter((p: ProcuraProposal) => p.status === "PENDING");
  const displayedProposals = proposalFilter === "PENDING" ? pendingProposals : allProposals;

  useEffect(() => {
    if (!signRequested || !requestedPoId || posLoading || posError) return;
    const targetPO = pendingPOs.find((po: any) => Number(po.id) === requestedPoId);
    if (targetPO) {
      setSigningPO(targetPO);
      return;
    }
    toast.error("This Purchase Order is not assigned to your account.");
    router.replace("/approvals");
  }, [signRequested, requestedPoId, pendingPOs, posLoading, posError, router]);

  return (
    <div className="space-y-6">
      {/* Modals */}
      {signingPO && (
        <DocuSignModal
          po={signingPO}
          onClose={() => setSigningPO(null)}
          onSigned={() => {
            setSigningPO(null);
            qc.invalidateQueries({ queryKey: ["pending-pos"] });
            qc.invalidateQueries({ queryKey: ["purchase-orders"] });
            qc.invalidateQueries({ queryKey: ["po-summary"] });
          }}
        />
      )}

      {activeReviewModal && (
        <ProposalReviewModal
          proposal={activeReviewModal.proposal}
          action={activeReviewModal.action}
          onClose={() => setActiveReviewModal(null)}
          onReviewed={() => {
            setActiveReviewModal(null);
            qc.invalidateQueries({ queryKey: ["approvals-proposals"] });
            qc.invalidateQueries({ queryKey: ["pending-pos"] });
            qc.invalidateQueries({ queryKey: ["purchase-orders"] });
            qc.invalidateQueries({ queryKey: ["po-summary"] });
          }}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Approvals & Counter-Offer Center
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manual buyer acceptance of vendor price/schedule negotiations and tiered DocuSign digital authorizations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refetchPOs();
              refetchProposals();
              toast.success("Refreshed pending approvals");
            }}
            className="btn-secondary"
          >
            <RefreshCw size={14} className={cn((posFetching || proposalsFetching) && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Dual Tab Navigator */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-2xl shadow-sm">
        <button
          onClick={() => setMainTab("pos")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            mainTab === "pos"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <PenTool size={16} />
          PO Signatures (DocuSign)
          <span className={cn(
            "ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold",
            pendingPOs.length > 0 ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
          )}>
            {pendingPOs.length}
          </span>
        </button>

        <button
          onClick={() => setMainTab("counter_offers")}
          className={cn(
            "flex items-center gap-2 py-4 px-4 text-sm font-semibold border-b-2 transition -mb-px",
            mainTab === "counter_offers"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          <Bot size={16} />
          Vendor Counter-Offers (Procura AI)
          {pendingProposals.length > 0 ? (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">
              {pendingProposals.length} Pending
            </span>
          ) : (
            <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              0
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: DocuSign PO Signatures */}
      {mainTab === "pos" && (
        <div className="space-y-4">
          {posLoading ? (
            <div className="section-card p-16 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-slate-300" />
            </div>
          ) : posError ? (
            <div className="section-card p-12 text-center text-sm text-red-500">
              Could not connect to Procurement Service.
            </div>
          ) : pendingPOs.length === 0 ? (
            <div className="section-card p-16 text-center">
              <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-700">All caught up!</p>
              <p className="text-sm text-slate-400 mt-1">No purchase orders waiting for digital signature.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 font-medium">
                  {pendingPOs.length} purchase order{pendingPOs.length !== 1 ? "s" : ""} waiting for amount-tiered approval
                </p>
              </div>

              {pendingPOs.map((po: any) => {
                const tierInfo = tierConfig[po.approval_tier] ?? tierConfig.TIER_1_OFFICER;
                return (
                  <div key={po.id} className="section-card p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-slate-800">{po.po_number}</span>
                          {po.po_number && po.po_number.includes("-R") && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Amended Revision ({po.po_number.split("-").pop()})
                            </span>
                          )}
                          <span className="badge badge-yellow gap-1"><Clock size={10} /> Pending Approval</span>
                          <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border", tierInfo.cls)}>
                            {tierInfo.label} &bull; {po.assigned_approver_name || tierInfo.role}
                          </span>
                          <span className="text-xs text-slate-400">{po.created_at ? formatDateTime(po.created_at) : ""}</span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {[
                            { label: "Item",             value: po.item_name },
                            { label: "Vendor",           value: po.vendor_name },
                            { label: "Quantity",         value: po.quantity?.toLocaleString("en-IN") },
                            { label: "Unit Price",       value: formatCurrency(po.unit_price) },
                            { label: "Total Value",      value: formatCurrency(po.total_price), bold: true },
                            { label: "Expected Delivery",value: po.delivery_date_expected },
                            { label: "Assigned Approver",value: `${po.assigned_approver_name || tierInfo.role} (${po.assigned_approver_email || tierInfo.email})` },
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
                          <div className="mt-3">
                            <AgentRationaleCard notes={po.notes} />
                          </div>
                        )}
                      </div>

                      {/* Actions column */}
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => setSigningPO(po)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm"
                        >
                          <PenTool size={13} />
                          Sign with DocuSign
                        </button>

                        <a
                          href={procurementApi.getPO_Download_Url(po.id)}
                          download={`${po.po_number}.pdf`}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-sm"
                        >
                          <Download size={13} className="text-brand-600" />
                          Download PO PDF
                        </a>

                        <button
                          onClick={() => updateStatus.mutate({ id: po.id, status: "REJECTED" })}
                          disabled={updateStatus.isPending}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition-colors"
                        >
                          <XCircle size={13} />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Procura Vendor Counter-Offers */}
      {mainTab === "counter_offers" && (
        <div className="space-y-4">
          {/* Sub-Filters */}
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProposalFilter("PENDING")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition",
                  proposalFilter === "PENDING"
                    ? "bg-amber-100 text-amber-900 border border-amber-300"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                Pending Buyer Review ({pendingProposals.length})
              </button>
              <button
                onClick={() => setProposalFilter("ALL")}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-semibold transition",
                  proposalFilter === "ALL"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                All Counter-Offers History ({allProposals.length})
              </button>
            </div>

            <p className="text-xs text-slate-500 hidden sm:block">
              Auto-updating via Procurement Gateway
            </p>
          </div>

          {proposalsLoading ? (
            <div className="section-card p-16 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-slate-300" />
            </div>
          ) : displayedProposals.length === 0 ? (
            <div className="section-card p-16 text-center">
              <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-base font-semibold text-slate-700">No Counter-Offers Pending</p>
              <p className="text-sm text-slate-400 mt-1">
                {proposalFilter === "PENDING"
                  ? "All vendor negotiation proposals have been reviewed and resolved."
                  : "No negotiation counter-offers have been logged yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedProposals.map((prop: ProcuraProposal) => {
                const isApproved = prop.status === "APPROVED";
                const isRejected = prop.status === "REJECTED";
                const isPending = prop.status === "PENDING";

                const priceVariance = prop.price_variance_pct ? parseFloat(String(prop.price_variance_pct)) : 0;
                const isPriceSaving = priceVariance < 0;

                return (
                  <div
                    key={prop.id}
                    className={cn(
                      "section-card p-6 border transition",
                      isPending
                        ? "border-amber-300 bg-amber-50/20 shadow-sm"
                        : isApproved
                        ? "border-emerald-200 bg-emerald-50/10"
                        : "border-slate-200 bg-slate-50/30"
                    )}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            Proposal #{prop.id}
                          </span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border text-slate-700">
                            {prop.po_number}
                          </span>
                          <span className="text-sm font-bold text-slate-800">
                            &bull; {prop.vendor_name}
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
                            {prop.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Submitted on {formatDateTime(prop.created_at)} via Procura Supplier Chat
                        </p>
                      </div>

                      {/* Action buttons if Pending */}
                      {isPending && (
                        <div className="flex items-center gap-2 w-full lg:w-auto">
                          <button
                            onClick={() => setActiveReviewModal({ proposal: prop, action: "APPROVE" })}
                            className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition"
                          >
                            <Check size={14} /> Accept Counter-Offer
                          </button>
                          <button
                            onClick={() => setActiveReviewModal({ proposal: prop, action: "REJECT" })}
                            className="flex-1 lg:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-300 transition"
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Comparison Delta Metrics */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4 p-4 rounded-xl bg-white border border-slate-200/80">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Unit Price Revision
                        </p>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-sm text-slate-500 line-through">
                            ₹{parseFloat(String(prop.current_unit_price)).toFixed(2)}
                          </span>
                          <span className="text-base font-bold text-slate-900 font-mono">
                            ➔ {prop.proposed_unit_price ? `₹${parseFloat(String(prop.proposed_unit_price)).toFixed(2)}` : "Unchanged"}
                          </span>
                          {priceVariance !== 0 && (
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[11px] font-bold",
                              isPriceSaving ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            )}>
                              {priceVariance > 0 ? "+" : ""}{priceVariance}%
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Delivery Date Revision
                        </p>
                        <div className="mt-1 font-medium text-sm text-slate-800">
                          {prop.proposed_delivery_date ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-slate-400 line-through">
                                {prop.current_delivery_date || "Original"}
                              </span>
                              <span className="font-bold text-blue-700">
                                ➔ {prop.proposed_delivery_date}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">Unchanged</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                          Revised Total Obligation
                        </p>
                        <div className="mt-1 font-mono font-bold text-base text-slate-900">
                          {formatCurrency(parseFloat(String(prop.proposed_total_price)))}
                        </div>
                      </div>
                    </div>

                    {/* Vendor Rationale & Validation notes */}
                    <div className="space-y-2 text-xs">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="font-bold text-slate-700">Vendor Justification: </span>
                        <span className="text-slate-800">{prop.reason || "Volume discount / production realignment"}</span>
                      </div>

                      {prop.validation_notes && (
                        <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-200/60 text-blue-900 text-[11px]">
                          <span className="font-bold">Procura AI Policy Compliance: </span>
                          {prop.validation_notes}
                        </div>
                      )}

                      {/* If already reviewed, display reviewer audit */}
                      {!isPending && prop.reviewed_by && (
                        <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-1">
                          <p className="text-slate-700 font-semibold">
                            Reviewed by: <span className="font-normal text-slate-900">{prop.reviewed_by}</span> &bull; {prop.reviewed_at ? formatDateTime(prop.reviewed_at) : ""}
                          </p>
                          {prop.review_notes && (
                            <p className="text-slate-600">
                              <span className="font-semibold">Review Notes: </span>{prop.review_notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                      <Link
                        href={`/procura?po=${prop.po_number}`}
                        className="inline-flex items-center gap-1.5 text-blue-600 font-semibold hover:text-blue-800"
                      >
                        <Bot size={14} /> Open PO Conversation in Procura AI
                      </Link>
                      <span className="text-slate-400">
                        PO Registry ID #{prop.po_id}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
