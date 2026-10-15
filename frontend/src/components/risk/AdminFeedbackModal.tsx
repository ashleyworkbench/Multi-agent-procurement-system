"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { riskApi } from "@/lib/api";
import { X, Loader2, Star, Sparkles, AlertCircle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VendorInfo {
  vendor_id?: string;
  vendor_name?: string;
  risk_level?: string | null;
}

interface Props {
  vendor?: VendorInfo | null;
  companyId: string;
  orderId?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const RISK_LABELS = ["Low", "Medium", "High"] as const;

const OUTCOMES = [
  { id: "on_time_delivery", label: "On-time Delivery", icon: CheckCircle2, color: "text-emerald-600 border-emerald-300 bg-emerald-50/50" },
  { id: "delayed_delivery", label: "Delayed Delivery", icon: Clock, color: "text-amber-600 border-amber-300 bg-amber-50/50" },
  { id: "defective_shipment", label: "Defective / Quality Issue", icon: ShieldAlert, color: "text-rose-600 border-rose-300 bg-rose-50/50" },
];

export default function AdminFeedbackModal({
  vendor,
  companyId,
  orderId: initialOrderId,
  onClose,
  onSuccess,
}: Props) {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState<string>(vendor?.vendor_id || vendor?.vendor_name || "");
  const [vendorName, setVendorName] = useState<string>(vendor?.vendor_name || vendor?.vendor_id || "");
  const [orderId, setOrderId] = useState<string>(initialOrderId || "");
  const [rating, setRating] = useState<number>(4.5);
  const [outcome, setOutcome] = useState<string>("on_time_delivery");
  const [label, setLabel] = useState<string>(vendor?.risk_level ?? "Low");
  const [notes, setNotes] = useState("");

  const submitMut = useMutation({
    mutationFn: () =>
      riskApi.submitFeedback({
        company_id: companyId,
        vendor_id: vendorId.trim(),
        vendor_name: vendorName.trim() || vendorId.trim(),
        rating,
        actual_outcome: outcome,
        verified_risk_label: label,
        actual_risk_label: label,
        order_id: orderId.trim() || undefined,
        admin_notes: notes.trim() || undefined,
        notes: notes.trim() || undefined,
        submitted_by: "Admin",
      }),
    onSuccess: (res: any) => {
      const count = res?.unconsumed_feedback_count ?? 0;
      const threshold = res?.auto_retrain_threshold ?? 5;
      if (res?.auto_retrain_triggered) {
        toast.success(
          `🎉 Auto-retrain threshold (${threshold}/${threshold}) reached! Random Forest model is retraining in background.`
        );
      } else {
        toast.success(
          `Feedback recorded successfully (${count}/${threshold} toward automatic retraining).`
        );
      }
      qc.invalidateQueries({ queryKey: ["risk-model-status", companyId] });
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-feedback", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
      if (onSuccess) onSuccess();
      onClose();
    },
    onError: () => toast.error("Failed to submit feedback. Check agent status."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-6 border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Record Vendor Feedback</h2>
              <p className="text-xs text-slate-400">Supervised feedback loop for ML retraining</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Info pill about auto-retraining */}
          <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2.5">
            <AlertCircle size={15} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              When <strong>5 feedback records</strong> are collected, Agent 5 will automatically retrain
              the Random Forest model, evaluate against quality thresholds, and safely promote the new model.
            </p>
          </div>

          {/* Vendor identification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Vendor Name / ID *
              </label>
              <input
                type="text"
                className="form-input w-full text-sm rounded-lg"
                placeholder="e.g. Ambuja Cements"
                value={vendorName}
                onChange={(e) => {
                  setVendorName(e.target.value);
                  if (!vendorId) setVendorId(e.target.value);
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
                Order ID / PO (optional)
              </label>
              <input
                type="text"
                className="form-input w-full text-sm rounded-lg font-mono"
                placeholder="e.g. PO-2026-19B357"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
            </div>
          </div>

          {/* Star Rating */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Performance Rating: <span className="text-indigo-600 font-bold">{rating.toFixed(1)} / 5.0</span>
            </label>
            <div className="flex items-center gap-1.5 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    size={22}
                    className={cn(
                      rating >= star
                        ? "text-amber-400 fill-amber-400"
                        : "text-slate-200"
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Actual Delivery Outcome */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1.5">
              Actual Order Outcome
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const isSelected = outcome === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setOutcome(o.id);
                      if (o.id === "on_time_delivery") setLabel("Low");
                      if (o.id === "delayed_delivery") setLabel("Medium");
                      if (o.id === "defective_shipment") setLabel("High");
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all text-center gap-1.5",
                      isSelected
                        ? `${o.color} border-2 shadow-xs font-semibold`
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    )}
                  >
                    <Icon size={16} />
                    <span>{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Verified Risk Label Override */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Verified Ground-Truth Risk Label
            </label>
            <div className="flex gap-2">
              {RISK_LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel(l)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all",
                    label === l
                      ? l === "Low"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : l === "Medium"
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  )}
                >
                  {l} Risk
                </button>
              ))}
            </div>
          </div>

          {/* Admin Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">
              Feedback Notes (optional)
            </label>
            <textarea
              className="form-input w-full min-h-[75px] resize-none text-xs rounded-xl"
              placeholder="e.g. On-time delivery, exceptional material quality, no discrepancies..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-6 pb-5 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={submitMut.isPending}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending || !vendorName.trim()}
          >
            {submitMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : null}
            Submit Feedback
          </button>
        </div>
      </div>
    </div>
  );
}
