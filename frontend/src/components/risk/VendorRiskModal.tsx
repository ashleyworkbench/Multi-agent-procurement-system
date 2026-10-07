"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VendorRisk {
  vendor_id: string;
  risk_level: string | null;
  risk_score: number | null;
  probabilities: Record<string, number>;
  pillar_scores: Record<string, number>;
  label_source: string;
  confidence: number;
  last_updated: string;
  top_risk_factors: string[];
}

interface Props {
  vendor: VendorRisk;
  onClose: () => void;
}

function ProbBar({ label, value }: { label: string; value: number }) {
  const color =
    label === "Low"
      ? "bg-green-500"
      : label === "Medium"
      ? "bg-yellow-400"
      : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">{(value * 100).toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className={cn("h-2 rounded-full transition-all", color)}
          style={{ width: `${value * 100}%` }}
        />
      </div>
    </div>
  );
}

function PillarRow({ name, value }: { name: string; value: number }) {
  const color =
    value >= 70 ? "text-green-600" : value >= 45 ? "text-yellow-600" : "text-red-600";
  const bg =
    value >= 70 ? "bg-green-500" : value >= 45 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-600 capitalize">{name.replace(/_/g, " ")}</span>
        <span className={cn("font-bold", color)}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className={cn("h-1.5 rounded-full", bg)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function VendorRiskModal({ vendor, onClose }: Props) {
  const isProvisional = vendor.label_source === "provisional_rule";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-semibold text-slate-800">{vendor.vendor_id}</h2>
            <p className="text-xs text-slate-500">
              {isProvisional ? "⚙ Provisional rule label" : "✓ Verified feedback label"} ·{" "}
              Last updated {new Date(vendor.last_updated).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Risk label + score */}
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1">Risk Label</p>
              <span
                className={cn(
                  "inline-block px-3 py-1 rounded-full text-sm font-bold",
                  vendor.risk_level === "Low"
                    ? "bg-green-100 text-green-700"
                    : vendor.risk_level === "Medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : vendor.risk_level === "High"
                    ? "bg-red-100 text-red-700"
                    : "bg-slate-100 text-slate-600"
                )}
              >
                {vendor.risk_level ?? "Unscored"}
              </span>
            </div>
            {vendor.risk_score !== null && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Risk Score</p>
                <p className="text-2xl font-bold text-slate-800">{vendor.risk_score.toFixed(1)}</p>
              </div>
            )}
            {vendor.confidence > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Confidence</p>
                <p className="text-xl font-semibold text-slate-700">
                  {(vendor.confidence * 100).toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          {/* ML Probabilities */}
          {Object.keys(vendor.probabilities ?? {}).length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">ML Probability Breakdown</p>
              <div className="space-y-2">
                {["Low", "Medium", "High"].map((lbl) => (
                  <ProbBar key={lbl} label={lbl} value={vendor.probabilities[lbl] ?? 0} />
                ))}
              </div>
            </div>
          )}

          {/* Pillar scores */}
          {Object.keys(vendor.pillar_scores ?? {}).length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Pillar Scores (0–100)</p>
              <div className="space-y-2">
                {Object.entries(vendor.pillar_scores).map(([k, v]) => (
                  <PillarRow key={k} name={k} value={v} />
                ))}
              </div>
            </div>
          )}

          {/* Top risk factors */}
          {vendor.top_risk_factors?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Key Risk Factors</p>
              <ul className="flex flex-wrap gap-2">
                {vendor.top_risk_factors.map((f) => (
                  <li
                    key={f}
                    className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs"
                  >
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-6 pb-5">
          <button className="btn-secondary w-full" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
