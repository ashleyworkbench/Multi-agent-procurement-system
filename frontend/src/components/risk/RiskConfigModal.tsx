"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { riskApi, INDUSTRIES } from "@/lib/api";
import { X, Loader2, Plug, RefreshCw, Key } from "lucide-react";
import { toast } from "sonner";

interface Props {
  companyId: string;
  onCompanyChange: (companyId: string) => void;
  onClose: () => void;
}

type SourceMode = "dummy" | "external";
type AuthType = "none" | "api_key" | "bearer";

export default function RiskConfigModal({ companyId, onCompanyChange, onClose }: Props) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-history-config", companyId],
    queryFn: () => riskApi.getVendorHistoryConfig(companyId),
  });

  const [mode, setMode] = useState<SourceMode>("dummy");
  const [connectionName, setConnectionName] = useState("Dummy Construction Vendor History");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [masterEndpointUrl, setMasterEndpointUrl] = useState("");
  const [authType, setAuthType] = useState<AuthType>("none");
  const [credential, setCredential] = useState("");

  useEffect(() => {
    if (data) {
      setMode(data.mode ?? "dummy");
      setConnectionName(data.connection_name ?? "Vendor History");
      setEndpointUrl(data.endpoint_url ?? "");
      setMasterEndpointUrl(data.master_endpoint_url ?? "");
      setAuthType(data.auth_type ?? "none");
    }
  }, [data]);

  const payload = {
    company_id: companyId,
    connection_name: connectionName.trim(),
    mode,
    endpoint_url: endpointUrl.trim(),
    master_endpoint_url: masterEndpointUrl.trim(),
    auth_type: authType,
    ...(credential ? { credential } : {}),
  };

  const testMut = useMutation({
    mutationFn: async () => {
      await riskApi.testVendorHistoryConnection(payload);
      return riskApi.updateVendorHistoryConfig(payload);
    },
    onSuccess: () => {
      setCredential("");
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
      toast.success(`${connectionName} connected successfully`);
    },
    onError: (error: Error) => toast.error(error.message || "Connection test failed."),
  });

  const syncMut = useMutation({
    mutationFn: async () => {
      await riskApi.updateVendorHistoryConfig(payload);
      setCredential("");
      return riskApi.syncVendorHistory(companyId);
    },
    onSuccess: (result) => {
      toast.success(`Synced ${result.records_ready} cleaned records for ${companyId}`);
      qc.invalidateQueries({ queryKey: ["risk-vendors", companyId] });
      qc.invalidateQueries({ queryKey: ["vendor-history-config", companyId] });
    },
    onError: (error: Error) => toast.error(error.message || "Vendor history sync failed."),
  });

  const sync = () => syncMut.mutate();
  const busy = testMut.isPending || syncMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Connect Vendor History API</h2>
          <button onClick={onClose} aria-label="Close settings" className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={24} />
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div>
              <label htmlFor="risk-connection-name" className="block text-sm font-medium text-slate-700 mb-1">Connection Name</label>
              <input
                id="risk-connection-name"
                className="form-input w-full text-sm"
                value={connectionName}
                onChange={(event) => setConnectionName(event.target.value)}
                placeholder="e.g. Dummy Construction Vendor History"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="risk-industry" className="block text-sm font-medium text-slate-700 mb-1">Industry</label>
                <select
                  id="risk-industry"
                  className="form-input w-full text-sm"
                  value={companyId}
                  onChange={(event) => onCompanyChange(event.target.value)}
                >
                  {INDUSTRIES.map((industry) => (
                    <option key={industry} value={industry}>{industry}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="risk-data-type" className="block text-sm font-medium text-slate-700 mb-1">Data Type</label>
                <input id="risk-data-type" className="form-input w-full text-sm bg-slate-50" value="Vendor History" readOnly />
              </div>
            </div>

            <div>
              <label htmlFor="risk-source" className="block text-sm font-medium text-slate-700 mb-1">History source</label>
              <select
                id="risk-source"
                className="form-input w-full text-sm"
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as SourceMode;
                  setMode(nextMode);
                  if (nextMode === "dummy") {
                    setEndpointUrl("");
                    setMasterEndpointUrl("");
                    setCredential("");
                    setAuthType("api_key");
                  }
                }}
              >
                <option value="dummy">Dummy API (testing)</option>
                <option value="external">External REST API</option>
              </select>
            </div>

            {mode === "external" && (
              <>
                <div>
                  <label htmlFor="risk-api-url" className="block text-sm font-medium text-slate-700 mb-1">API URL</label>
                  <input
                    id="risk-api-url"
                    type="url"
                    className="form-input w-full text-sm"
                    placeholder="https://api.example.com/vendor-history"
                    value={endpointUrl}
                    onChange={(e) => setEndpointUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="risk-master-api-url" className="block text-sm font-medium text-slate-700 mb-1">Vendor Master API URL</label>
                  <input
                    id="risk-master-api-url"
                    type="url"
                    className="form-input w-full text-sm"
                    placeholder="Optional when history API returns vendor_master"
                    value={masterEndpointUrl}
                    onChange={(event) => setMasterEndpointUrl(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="risk-auth-type" className="block text-sm font-medium text-slate-700 mb-1">Authentication</label>
                  <select id="risk-auth-type" className="form-input w-full text-sm" value={authType} onChange={(e) => setAuthType(e.target.value as AuthType)}>
                    <option value="none">No authentication</option>
                    <option value="api_key">API key</option>
                    <option value="bearer">Bearer token</option>
                  </select>
                </div>
              </>
            )}

            {(mode === "dummy" || authType !== "none") && (
              <div>
                <label htmlFor="risk-api-credential" className="block text-sm font-medium text-slate-700 mb-1">
                  {mode === "external" && authType === "bearer" ? "Bearer Token" : "API Key"}
                </label>
                <div className="relative">
                  <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="risk-api-credential"
                    type="password"
                    autoComplete="new-password"
                    className="form-input w-full text-sm pl-9"
                    placeholder={data?.credential_configured ? "Saved key; leave blank to keep it" : mode === "dummy" ? "Enter API key or use the server-managed key" : "Enter API key"}
                    value={credential}
                    onChange={(event) => setCredential(event.target.value)}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              API keys are sent only to Agent 5 and stored encrypted. The key is never returned to the browser.
            </p>

            <p className="text-xs text-slate-500">
              {data?.record_count
                ? `${data.record_count} records synced${data.fetched_at ? ` · ${new Date(data.fetched_at).toLocaleString()}` : ""}`
                : "No history synced for this company yet."}
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 px-6 pb-5 pt-2">
          <button className="btn-secondary" onClick={() => testMut.mutate()} disabled={busy || isLoading || !connectionName.trim() || (mode === "external" && !endpointUrl.trim())}>
            {testMut.isPending ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : <Plug size={14} className="mr-1 inline" />}
            Connect & Test
          </button>
          <button
            className="btn-secondary"
            onClick={sync}
            disabled={busy || isLoading || !connectionName.trim() || (mode === "external" && !endpointUrl.trim())}
          >
            {syncMut.isPending ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : <RefreshCw size={14} className="mr-1 inline" />}
            Fetch / Sync
          </button>
        </div>
      </div>
    </div>
  );
}
