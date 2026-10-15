"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ShieldAlert,
  Search,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Package,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import { riskApi, INDUSTRIES } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SuitableVendor {
  vendor_id?: string;
  purchase_vendor_id?: number;
  vendor_name?: string;
  risk_level?: string | null;
  risk_score?: number | null;
  suitability_score?: number | null;
  unit_price?: number | null;
  total_price?: number | null;
  lead_time_days?: number | null;
  quantity?: number | null;
  confidence?: number | null;
  risk_factors?: string[];
  reasons?: string[];
  can_fulfill?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  Low: "badge-green",
  Medium: "badge-yellow",
  High: "badge-red",
};

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) {
    return <span className="badge badge-slate">Unscored</span>;
  }

  return (
    <span className={cn("badge", RISK_COLORS[level] ?? "badge-slate")}>
      {level}
    </span>
  );
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-IN");
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `₹${Number(value).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

export default function RiskAnalysisView() {
  const [companyId, setCompanyId] = useState("construction");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");

  const [results, setResults] = useState<SuitableVendor[]>([]);
  const [recommendation, setRecommendation] =
    useState<SuitableVendor | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<any>(null);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      riskApi.evaluateVendorSuitability({
        company_id: companyId,
        item: item.trim(),
        required_quantity: Number(quantity),
        available_inventory: 0,
        shortage_quantity: Number(quantity),
      }),

    onSuccess: (data) => {
      const vendors: SuitableVendor[] =
        data?.suitable_vendors ?? [];

      const selected: SuitableVendor[] =
        data?.selected_vendors ?? [];

      setResults(vendors);
      setRecommendation(selected[0] ?? null);
      setAnalysisInfo(data);

      if (vendors.length === 0 && selected.length === 0) {
        toast.warning("No suitable vendors found for this requirement.");
      } else {
        toast.success(
          `Found ${vendors.length || selected.length} suitable vendor(s).`
        );
      }
    },

    onError: (error: any) => {
      setResults([]);
      setRecommendation(null);
      setAnalysisInfo(null);

      toast.error(
        error?.message || "Unable to analyze vendor suitability."
      );
    },
  });

  const canAnalyze =
    item.trim().length > 0 &&
    Number(quantity) > 0 &&
    !analyzeMutation.isPending;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Risk Analysis
        </h1>
        <p className="text-sm text-slate-500">
          Analyze vendor risk for a specific procurement requirement
        </p>
      </div>

      {/* Requirement Form */}
      <div className="section-card">
        <div className="flex items-center gap-2 mb-5">
          <Package size={18} className="text-slate-600" />
          <div>
            <h2 className="font-semibold text-slate-900">
              Procurement Requirement
            </h2>
            <p className="text-xs text-slate-500">
              Enter the item and quantity you need to procure.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company / Industry
            </label>

            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setResults([]);
                setRecommendation(null);
              }}
              className="input w-full"
            >
              {INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {industry.charAt(0).toUpperCase() +
                    industry.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Item */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Item
            </label>

            <input
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="e.g. Cement"
              className="input w-full"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Required Quantity
            </label>

            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 100"
              className="input w-full"
            />
          </div>

        </div>

        <div className="mt-5">
          <button
            type="button"
            disabled={!canAnalyze}
            onClick={() => analyzeMutation.mutate()}
            className="btn btn-primary flex items-center gap-2"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Analyzing Vendors...
              </>
            ) : (
              <>
                <Search size={16} />
                Analyze Vendors
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading */}
      {analyzeMutation.isPending && (
        <div className="section-card flex items-center gap-3 text-slate-600">
          <Loader2 size={20} className="animate-spin" />
          <div>
            <p className="font-medium">
              Evaluating vendor suitability
            </p>
            <p className="text-sm text-slate-500">
              Checking vendor availability, historical performance,
              and risk.
            </p>
          </div>
        </div>
      )}

      {/* Recommendation */}
      {!analyzeMutation.isPending && recommendation && (
        <div className="section-card border-2 border-green-200 bg-green-50">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <Trophy size={20} className="text-green-700" />
            </div>

            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                Recommended Vendor
              </p>

              <h2 className="text-lg font-bold text-slate-900 mt-1">
                {recommendation.vendor_name ?? "Vendor"}
              </h2>

              <div className="flex flex-wrap gap-2 mt-2">
                <RiskBadge level={recommendation.risk_level} />

                {recommendation.risk_score !== null &&
                  recommendation.risk_score !== undefined && (
                    <span className="badge badge-slate">
                      Risk Score:{" "}
                      {Number(recommendation.risk_score).toFixed(1)}
                    </span>
                  )}

                {recommendation.suitability_score !== null &&
                  recommendation.suitability_score !== undefined && (
                    <span className="badge badge-blue">
                      Suitability:{" "}
                      {Number(
                        recommendation.suitability_score
                      ).toFixed(1)}
                    </span>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!analyzeMutation.isPending && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-900">
                Suitable Vendors
              </h2>
              <p className="text-xs text-slate-500">
                Vendors evaluated for {formatNumber(Number(quantity))}{" "}
                {item}.
              </p>
            </div>

            <span className="badge badge-slate">
              {results.length} found
            </span>
          </div>

          <div className="space-y-3">
            {results.map((vendor, index) => (
              <div
                key={`${vendor.vendor_id ?? vendor.vendor_name}-${index}`}
                className={cn(
                  "section-card border rounded-xl",
                  index === 0
                    ? "border-green-200"
                    : "border-slate-200"
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {index === 0 && (
                        <CheckCircle2
                          size={17}
                          className="text-green-600"
                        />
                      )}

                      <h3 className="font-semibold text-slate-900">
                        {vendor.vendor_name ?? "Unknown Vendor"}
                      </h3>

                      <RiskBadge level={vendor.risk_level} />
                    </div>

                    <p className="text-xs text-slate-500 mt-1">
                      Vendor ID:{" "}
                      {vendor.vendor_id ??
                        vendor.purchase_vendor_id ??
                        "—"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">

                    <div>
                      <p className="text-xs text-slate-500">
                        Risk Score
                      </p>
                      <p className="font-semibold text-slate-900">
                        {vendor.risk_score !== null &&
                        vendor.risk_score !== undefined
                          ? Number(vendor.risk_score).toFixed(1)
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Suitability
                      </p>
                      <p className="font-semibold text-slate-900">
                        {vendor.suitability_score !== null &&
                        vendor.suitability_score !== undefined
                          ? Number(
                              vendor.suitability_score
                            ).toFixed(1)
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Lead Time
                      </p>
                      <p className="font-semibold text-slate-900">
                        {vendor.lead_time_days !== null &&
                        vendor.lead_time_days !== undefined
                          ? `${vendor.lead_time_days} days`
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-slate-500">
                        Total Cost
                      </p>
                      <p className="font-semibold text-slate-900">
                        {formatCurrency(vendor.total_price)}
                      </p>
                    </div>

                  </div>
                </div>

                {(vendor.risk_factors?.length ||
                  vendor.reasons?.length) && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-600 mb-2">
                      Analysis
                    </p>

                    <div className="flex flex-wrap gap-2">
                      {[
                        ...(vendor.reasons ?? []),
                        ...(vendor.risk_factors ?? []),
                      ]
                        .filter(Boolean)
                        .slice(0, 5)
                        .map((reason, i) => (
                          <span
                            key={`${reason}-${i}`}
                            className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-600"
                          >
                            {reason}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!analyzeMutation.isPending &&
        analysisInfo &&
        results.length === 0 &&
        !recommendation && (
          <div className="section-card text-center py-10">
            <AlertTriangle
              size={36}
              className="mx-auto mb-3 text-yellow-500"
            />

            <p className="font-medium text-slate-900">
              No suitable vendor found
            </p>

            <p className="text-sm text-slate-500 mt-1">
              No vendor met the requirements for this procurement request.
            </p>
          </div>
        )}

      {/* Initial state */}
      {!analysisInfo &&
        !analyzeMutation.isPending && (
          <div className="section-card text-center py-12">
            <ShieldAlert
              size={42}
              className="mx-auto mb-3 text-slate-300"
            />

            <p className="font-medium text-slate-700">
              Ready for vendor risk analysis
            </p>

            <p className="text-sm text-slate-500 mt-1">
              Enter a procurement item and required quantity above
              to evaluate suitable vendors.
            </p>
          </div>
        )}

    </div>
  );
}
