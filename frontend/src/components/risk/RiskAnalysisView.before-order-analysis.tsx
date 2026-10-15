"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riskApi, INDUSTRIES, getStoredUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ShieldAlert, RefreshCw, MessageSquarePlus,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Loader2, Activity, WifiOff, BarChart2, ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import AdminFeedbackModal from "./AdminFeedbackModal";
import VendorRiskModal from "./VendorRiskModal";

// ------------------------------------------------------------------ //
// Types                                                                //
// ------------------------------------------------------------------ //
interface VendorRisk {
  vendor_id: string;
  company_id: string;
  risk_level: string | null;
  risk_score: number | null;
  probabilities: Record<string, number>;
  pillar_scores: Record<string, number>;
  label_source: string;
  confidence: number;
  last_updated: string;
  top_risk_factors: string[];
}

const RISK_COLORS: Record<string, string> = {
  Low:    "badge-green",
  Medium: "badge-yellow",
  High:   "badge-red",
};

const RISK_BG: Record<string, string> = {
  Low:    "bg-green-50 border-green-200",
  Medium: "bg-yellow-50 border-yellow-200",
  High:   "bg-red-50 border-red-200",
};

// ------------------------------------------------------------------ //
// Helpers                                                              //
// ------------------------------------------------------------------ //
function RiskBadge({ label }: { label: string | null }) {
  if (!label) return <span className="badge badge-slate">Unscored</span>;
  return <span className={cn("badge", RISK_COLORS[label] ?? "badge-slate")}>{label}</span>;
}

function PillarBar({ name, value }: { name: string; value: number }) {
  const color =
    value >= 70 ? "bg-green-500" : value >= 45 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-600">
        <span>{name}</span>
        <span className="font-medium">{value.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100">
        <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Vendor row card                                                       //
// ------------------------------------------------------------------ //
function VendorRiskRow({
  v,
  onFeedback,
  onDetails,
}: {
  v: VendorRisk;
  onFeedback: (v: VendorRisk) => void;
  onDetails: (v: VendorRisk) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pillars = v.pillar_scores ?? {};

  return (
    <div className={cn("section-card border rounded-xl mb-3 transition-all", RISK_BG[v.risk_level ?? ""] ?? "bg-white border-slate-200")}>
      {/* Header row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate">{v.vendor_id}</p>
          <p className="text-xs text-slate-500">
            {v.label_source === "ground_truth_feedback" ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ Verified label" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Provisional rule"}
            {" ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· "}Updated {new Date(v.last_updated).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <RiskBadge label={v.risk_level} />
          {v.risk_score !== null && (
            <span className="text-sm font-bold text-slate-700">
              Score: {v.risk_score.toFixed(1)}
            </span>
          )}
          {v.confidence > 0 && (
            <span className="text-xs text-slate-500">
              {(v.confidence * 100).toFixed(0)}% conf.
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-1 px-2" onClick={() => onDetails(v)}>
            <BarChart2 size={12} className="mr-1 inline" /> Details
          </button>
          <button className="btn-secondary text-xs py-1 px-2" onClick={() => onFeedback(v)}>
            <MessageSquarePlus size={12} className="mr-1 inline" /> Feedback
          </button>
          <button
            className="btn-secondary text-xs py-1 px-2"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      {/* Expanded pillar breakdown */}
      {expanded && Object.keys(pillars).length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Object.entries(pillars).map(([k, val]) => (
            <PillarBar key={k} name={k.replace(/_/g, " ")} value={val} />
          ))}
        </div>
      )}
      {expanded && v.top_risk_factors?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 mb-1">Top risk factors</p>
          <ul className="flex flex-wrap gap-1">
            {v.top_risk_factors.map((f) => (
              <li key={f} className="badge badge-slate text-xs">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Main view                                                            //
// ------------------------------------------------------------------ //
export default function RiskAnalysisView() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>(INDUSTRIES[0]);
  const [feedbackVendor, setFeedbackVendor] = useState<VendorRisk | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorRisk | null>(null);
  const [filter, setFilter] = useState<"All" | "Low" | "Medium" | "High">("All");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(getStoredUser()?.role === "Admin");
  }, []);

  // ---- Queries ----
  const { data: status, isError: statusErr } = useQuery({
    queryKey: ["risk-status"],
    queryFn: () => riskApi.getStatus(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const {
    data: vendorsData,
    isLoading: vendorsLoading,
    isError: vendorsErr,
    refetch: refetchVendors,
  } = useQuery({
    queryKey: ["risk-vendors", companyId],
    queryFn: () => riskApi.getVendorsRisk(companyId),
    refetchInterval: 30_000,
    retry: 1,
    enabled: !!companyId,
  });

  const { data: modelStatus } = useQuery({
    queryKey: ["risk-model-status", companyId],
    queryFn: () => riskApi.getModelStatus(companyId),
    refetchInterval: 60_000,
    retry: 1,
    enabled: !!companyId,
  });

  const { data: vendorHistoryConfig } = useQuery({
    queryKey: ["vendor-history-config", companyId],
    queryFn: () => riskApi.getVendorHistoryConfig(companyId),
    refetchInterval: 30_000,
    retry: 1,
    enabled: !!companyId,
  });

  // ---- Mutations ----
  const analyzeMut = useMutation({
    mutationFn: () => riskApi.analyzeRisk(companyId),
    onSuccess: () => {
      toast.success("Risk analysis complete ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â scores updated");
      qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
    },
    onError: () => toast.error("Analysis failed. Check if the agent is running."),
  });

  const testConnectionMut = useMutation({
    mutationFn: () =>
      riskApi.testVendorHistoryConnection({
        company_id: companyId,
      }),
    onSuccess: () => {
      toast.success("Vendor Service connection is working");
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
    },
    onError: () => {
      toast.error("Vendor Service connection failed");
    },
  });

  const syncVendorHistoryMut = useMutation({
    mutationFn: () => riskApi.syncVendorHistory(companyId),
    onSuccess: (result) => {
      toast.success(
        `Vendor data synced successfully ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${result?.records_ready ?? 0} records ready`
      );
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-model-status", companyId] });
    },
    onError: () => {
      toast.error("Vendor data synchronization failed");
    },
  });

  const retrainMut = useMutation({
    mutationFn: () => riskApi.retrainModel(companyId),
    onSuccess: (d) => {
      const r = d?.result;
      const metrics = r?.candidate_metrics;
      const metricSummary = metrics
        ? `Accuracy ${(metrics.accuracy * 100).toFixed(1)}%, Precision ${(metrics.precision * 100).toFixed(1)}%, Recall ${(metrics.recall * 100).toFixed(1)}%, F1 ${(metrics.f1_score * 100).toFixed(1)}%`
        : "Candidate metrics unavailable";
      if (r?.deployment_status === "active") {
        toast.success(`Model evaluated and deployed. ${metricSummary}`);
      } else {
        toast.warning(`Candidate retained without deployment: ${r?.rejection_reason ?? "validation failed"}. ${metricSummary}`);
      }
      qc.invalidateQueries({ queryKey: ["risk-model-status", companyId] });
      qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
    },
    onError: () => toast.error("Retraining failed."),
  });

  // ---- Derived ----
  const vendors: VendorRisk[] = vendorsData?.vendors ?? [];
  const filtered = filter === "All" ? vendors : vendors.filter((v) => v.risk_level === filter);

  const counts = {
    Low:    vendors.filter((v) => v.risk_level === "Low").length,
    Medium: vendors.filter((v) => v.risk_level === "Medium").length,
    High:   vendors.filter((v) => v.risk_level === "High").length,
  };

  const isAgentOnline =
    !statusErr && status && status.status !== "offline";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <ShieldAlert size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Risk Analysis</h1>
            <p className="text-sm text-slate-500">Agent 5 — Vendor Risk Intelligence</p>
          </div>
          <span className={cn("badge ml-2", isAgentOnline ? "badge-green" : "badge-red")}>
            {isAgentOnline ? (
              <><Activity size={10} className="mr-1 inline" /> Online</>
            ) : (
              <><WifiOff size={10} className="mr-1 inline" /> Offline</>
            )}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Company selector */}
          <select
            className="form-input text-sm h-9 w-44"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            {INDUSTRIES.map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>

          {isAdmin && (
            <>

              <button
                className="btn-secondary text-sm"
                onClick={() => retrainMut.mutate()}
                disabled={retrainMut.isPending}
                title="Evaluate and deploy a candidate model"
              >
                {retrainMut.isPending ? (
                  <Loader2 size={14} className="animate-spin mr-1 inline" />
                ) : (
                  <ClipboardList size={14} className="mr-1 inline" />
                )}
                Retrain
              </button>
            </>
          )}

          <button
            className="btn-primary text-sm"
            onClick={() => analyzeMut.mutate()}
            disabled={analyzeMut.isPending}
          >
            {analyzeMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <RefreshCw size={14} className="mr-1 inline" />
            )}
            Analyze
          </button>
        </div>
      </div>

      {/* Data source */}
      <div className="section-card">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Data Source</h2>
            <p className="text-xs text-slate-500 mt-1">
              Vendor performance data through the Integration Gateway
            </p>
          </div>

          <span
            className={cn(
              "badge",
              vendorHistoryConfig?.record_count > 0
                ? "badge-green"
                : "badge-slate"
            )}
          >
            {vendorHistoryConfig?.record_count > 0
              ? "Data Available"
              : "Not Synced"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Source</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">
              {companyId.charAt(0).toUpperCase() + companyId.slice(1)} Vendor Service
            </p>
            <p className="text-xs text-slate-500 mt-1">
              PostgreSQL
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Raw Records</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.raw_record_count ?? 0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Ready for Analysis</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.ready_record_count ??
                vendorHistoryConfig?.record_count ??
                0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Quarantined / Removed</p>
            <p className="text-xl font-bold text-slate-800 mt-1">
              {vendorHistoryConfig?.quarantined_record_count ?? 0}
            </p>
          </div>

          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-500">Last Synced</p>
            <p className="text-sm font-semibold text-slate-800 mt-1">
              {vendorHistoryConfig?.fetched_at
                ? new Date(vendorHistoryConfig.fetched_at).toLocaleString()
                : "Never"}
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-secondary text-sm"
            onClick={() => testConnectionMut.mutate()}
            disabled={
              testConnectionMut.isPending || syncVendorHistoryMut.isPending
            }
          >
            {testConnectionMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <Activity size={14} className="mr-1 inline" />
            )}
            Test Connection
          </button>

          <button
            className="btn-primary text-sm"
            onClick={() => syncVendorHistoryMut.mutate()}
            disabled={
              testConnectionMut.isPending || syncVendorHistoryMut.isPending
            }
          >
            {syncVendorHistoryMut.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1 inline" />
            ) : (
              <RefreshCw size={14} className="mr-1 inline" />
            )}
            Sync Data
          </button>
        </div>
      </div>

      {/* Model status banner */}
      {modelStatus && (
        <div className="section-card flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium text-slate-700">Model status:</span>
          <span className={cn("badge", modelStatus.active_model ? "badge-green" : "badge-slate")}>
            {modelStatus.active_model ? "Deployed" : "No model"}
          </span>
          {modelStatus.active_model && (
            <>
              <span className="text-slate-500">
                Accuracy: <strong>{(((modelStatus.active_model.metrics?.accuracy ?? modelStatus.active_model.accuracy) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Precision: <strong>{(((modelStatus.active_model.metrics?.precision ?? modelStatus.active_model.precision) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Recall: <strong>{(((modelStatus.active_model.metrics?.recall ?? modelStatus.active_model.recall) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                F1: <strong>{(((modelStatus.active_model.metrics?.f1_score ?? modelStatus.active_model.metrics?.f1_macro ?? modelStatus.active_model.f1_score) ?? 0) * 100).toFixed(1)}%</strong>
              </span>
              <span className="text-slate-500">
                Trained:{" "}
                <strong>
                  {new Date(modelStatus.active_model.trained_at ?? modelStatus.active_model.deployed_at).toLocaleDateString()}
                </strong>
              </span>
            </>
          )}
          {!modelStatus.active_model && (
            <span className="text-slate-500">
              Sync history, then <strong>Retrain</strong> to train the first model.
            </span>
          )}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["All", "Low", "Medium", "High"] as const).map((lbl) => {
          const count = lbl === "All" ? vendors.length : counts[lbl];
          const colorMap: Record<string, string> = {
            All: "text-slate-700", Low: "text-green-600", Medium: "text-yellow-600", High: "text-red-600",
          };
          return (
            <button
              key={lbl}
              className={cn(
                "stat-card text-left transition-all border-2",
                filter === lbl ? "border-blue-400" : "border-transparent"
              )}
              onClick={() => setFilter(lbl)}
            >
              <p className={cn("text-2xl font-bold", colorMap[lbl])}>{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {lbl === "All" ? "Total Vendors" : `${lbl} Risk`}
              </p>
            </button>
          );
        })}
      </div>

      {/* Vendor list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">
            Vendor Risk Scores
            {filter !== "All" && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                (filtered: {filter})
              </span>
            )}
          </h2>
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => refetchVendors()}
          >
            Refresh
          </button>
        </div>

        {vendorsLoading && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={20} /> Loading vendor risk dataÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦
          </div>
        )}

        {vendorsErr && (
          <div className="section-card flex items-center gap-3 text-red-600">
            <AlertTriangle size={16} />
            <span className="text-sm">
              Could not load vendor data. Make sure the Risk Analysis Agent is running on port 8010.
            </span>
          </div>
        )}

        {!vendorsLoading && !vendorsErr && filtered.length === 0 && (
          <div className="section-card text-center py-10 text-slate-500">
            {vendors.length === 0 ? (
              <>
                <ShieldAlert size={36} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No vendor risk data yet.</p>
                <p className="text-sm mt-1">
                  Sync vendor history, retrain a model, then Analyze to score vendors.
                </p>
              </>
            ) : (
              <p>No vendors match the <strong>{filter}</strong> filter.</p>
            )}
          </div>
        )}

        {filtered.map((v) => (
          <VendorRiskRow
            key={v.vendor_id}
            v={v}
            onFeedback={setFeedbackVendor}
            onDetails={setDetailVendor}
          />
        ))}
      </div>

      {/* Modals */}
      {feedbackVendor && (
        <AdminFeedbackModal
          vendor={feedbackVendor}
          companyId={companyId}
          onClose={() => setFeedbackVendor(null)}
          onSuccess={() => {
            setFeedbackVendor(null);
            qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
          }}
        />
      )}

      {detailVendor && (
        <VendorRiskModal
          vendor={detailVendor}
          onClose={() => setDetailVendor(null)}
        />
      )}
    </div>
  );
}









