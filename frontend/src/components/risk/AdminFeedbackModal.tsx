"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { riskApi } from "@/lib/api";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Vendor {
  vendor_id: string;
  risk_level: string | null;
}

interface Props {
  vendor: Vendor;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const RISK_LABELS = ["Low", "Medium", "High"] as const;

export default function AdminFeedbackModal({ vendor, companyId, onClose, onSuccess }: Props) {
  const [label, setLabel] = useState<string>(vendor.risk_level ?? "Medium");
  const [notes, setNotes] = useState("");

  const submitMut = useMutation({
    mutationFn: () =>
      riskApi.submitFeedback({
        company_id: companyId,
        vendor_id: vendor.vendor_id,
        verified_risk_label: label,
        admin_notes: notes,
      }),
    onSuccess: () => {
      toast.success(`Feedback submitted — ${vendor.vendor_id} marked as ${label}`);
      onSuccess();
    },
    onError: () => toast.error("Failed to submit feedback."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Admin Risk Feedback</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600">
            Override the risk classification for{" "}
            <strong className="text-slate-800">{vendor.vendor_id}</strong>.
            This becomes a ground-truth label used in future model training.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Verified Risk Label
            </label>
            <div className="flex gap-2">
              {RISK_LABELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setLabel(l)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    label === l
                      ? l === "Low"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : l === "Medium"
                        ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                        : "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              className="form-input w-full min-h-[80px] resize-none text-sm"
              placeholder="Reason for this override…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5 pt-2">
          <button className="btn-secondary flex-1" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending}
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
