"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { procurementApi } from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2, RefreshCw,
  Download, Eye, ShieldCheck, PenTool, X, FileText, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

const tierConfig: Record<string, { label: string; role: string; email: string; cls: string }> = {
  TIER_1_OFFICER: {
    label: "Tier 1 (< ₹50,000)",
    role: "Procurement Officer",
    email: "officer.procurement@procureflow.local",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  TIER_2_MANAGER: {
    label: "Tier 2 (₹50,000 – ₹2,00,000)",
    role: "Operations Manager",
    email: "manager.ops@procureflow.local",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  TIER_3_DIRECTOR: {
    label: "Tier 3 (> ₹2,00,000)",
    role: "Finance Director",
    email: "director.finance@procureflow.local",
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

        {/* PO Snapshot Box */}
        <div className="p-5 border-b border-slate-100 bg-slate-50 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Order Routing:</span>
            <span className={cn("px-2 py-0.5 rounded font-semibold border", tierInfo.cls)}>
              {tierInfo.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">Vendor:</span>
              <p className="font-semibold text-slate-800">{po.vendor_name}</p>
            </div>
            <div>
              <span className="text-slate-400">Total PO Value:</span>
              <p className="font-bold text-slate-900 text-sm">{formatCurrency(po.total_price)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Item: {po.item_name} ({po.quantity} units)</span>
            <a
              href={procurementApi.getPO_PDF_Url(po.id)}
              target="_blank"
              rel="noreferrer"
              className="text-brand-600 hover:underline flex items-center gap-1 font-medium"
            >
              <Eye size={12} /> View Draft PDF
            </a>
          </div>
        </div>

        {/* Signing Form */}
        <form onSubmit={handleSign} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Authorized Signer
              </label>
              <input
                type="text"
                value={signerName}
                onChange={e => { setSignerName(e.target.value); setSignatureText(e.target.value); }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Signer Email
              </label>
              <input
                type="email"
                value={signerEmail}
                onChange={e => setSignerEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
          </div>

          {/* Digital Signature Preview Card */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              DocuSign Digital Seal
            </label>
            <div className="p-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 text-center relative overflow-hidden">
              <span className="text-[10px] uppercase font-bold text-blue-400 tracking-widest block mb-1">
                Digitally signed by
              </span>
              <p className="font-serif italic text-2xl text-blue-900 tracking-wide select-none py-1">
                {signatureText || "Authorized Signer"}
              </p>
              <div className="text-[10px] text-blue-600 font-mono mt-1">
                DS-ENV-{po.po_number}-VERIFIED &bull; SHA-256 PKI
              </div>
            </div>
          </div>

          {/* MinIO Archiving Notice */}
          <div className="p-3 rounded-xl bg-slate-100/70 border border-slate-200 text-slate-600 text-[11px] flex items-start gap-2.5">
            <Lock size={14} className="text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Upon authorization, the certificate stamp will be permanently embedded into the PDF and archived into <b>MinIO Document Storage</b> under <code className="text-slate-800">procurement-documents/signed-pos/{po.po_number}_signed.pdf</code>.
            </p>
          </div>

          {/* Declaration Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>I confirm that I have verified order specifications and authorized procurement.</span>
          </label>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !agreed}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-all shadow-md"
            >
              {submitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Stamping & Storing in MinIO...
                </>
              ) : (
                <>
                  <PenTool size={13} />
                  Sign with DocuSign & Approve
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
// Main Approvals View                                                 //
// ------------------------------------------------------------------ //
export function ApprovalsView() {
  const qc = useQueryClient();
  const [signingPO, setSigningPO] = useState<any | null>(null);

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
      {/* Modal if signing */}
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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Approvals & Digital Signatures</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Amount-based approval routing with DocuSign eSignature & MinIO Document Store
          </p>
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
              {pending.length} purchase order{pending.length !== 1 ? "s" : ""} waiting for amount-tiered approval
            </p>
          </div>

          {pending.map((po: any) => {
            const tierInfo = tierConfig[po.approval_tier] ?? tierConfig.TIER_1_OFFICER;
            return (
              <div key={po.id} className="section-card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-slate-800">{po.po_number}</span>
                      <span className="badge badge-yellow gap-1"><Clock size={10} /> Pending Approval</span>
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-semibold border", tierInfo.cls)}>
                        {tierInfo.label} &bull; {po.assigned_approver_name || tierInfo.role}
                      </span>
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
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        {po.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions column */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {/* Primary DocuSign Action */}
                    <button
                      onClick={() => setSigningPO(po)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm"
                    >
                      <PenTool size={13} />
                      Sign with DocuSign
                    </button>

                    {/* Download PO PDF */}
                    <a
                      href={procurementApi.getPO_Download_Url(po.id)}
                      download={`${po.po_number}.pdf`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors shadow-sm"
                    >
                      <Download size={13} className="text-brand-600" />
                      Download PO PDF
                    </a>

                    {/* Quick Reject */}
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
  );
}
