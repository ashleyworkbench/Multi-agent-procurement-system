"use client";

import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useDataSourceStore, type DataSource, type ConnectionType } from "@/store/dataSourceStore";
import { onboardingApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Plug, Upload, CheckCircle2, XCircle, Loader2, Trash2,
  Eye, EyeOff, Plus, Key, FileSpreadsheet, RefreshCw,
  AlertCircle, Info, Database,
} from "lucide-react";
import axios from "axios";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ------------------------------------------------------------------ //
// Schema                                                               //
// ------------------------------------------------------------------ //
const apiSchema = z.object({
  name:     z.string().min(2, "Give this connection a name"),
  industry: z.string().min(1, "Select an industry"),
  dataType: z.enum(["inventory", "vendor"]),
  apiKey:   z.string().min(8, "API key must be at least 8 characters"),
  endpoint: z.string().optional(),
});
type ApiForm = z.infer<typeof apiSchema>;

const GATEWAY_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const GATEWAY_KEY = "GATEWAY-master-key-2024";

// ------------------------------------------------------------------ //
// Test connection by calling the gateway                               //
// ------------------------------------------------------------------ //
async function testApiConnection(industry: string, dataType: "inventory" | "vendor", apiKey: string): Promise<boolean> {
  try {
    const endpoint = dataType === "inventory"
      ? `${GATEWAY_URL}/inventory/items?industry=${industry}`
      : `${GATEWAY_URL}/vendors?industry=${industry}`;
    await axios.get(endpoint, {
      headers: { "X-API-KEY": GATEWAY_KEY },
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ //
// Status badge                                                         //
// ------------------------------------------------------------------ //
function StatusBadge({ status }: { status: DataSource["status"] }) {
  const map = {
    connected:    { cls: "badge-green",  icon: CheckCircle2, label: "Connected" },
    disconnected: { cls: "badge-slate",  icon: XCircle,      label: "Not tested" },
    testing:      { cls: "badge-blue",   icon: Loader2,      label: "Testing..." },
    error:        { cls: "badge-red",    icon: XCircle,      label: "Error" },
  };
  const c = map[status];
  return (
    <span className={cn("badge gap-1", c.cls)}>
      <c.icon size={10} className={status === "testing" ? "animate-spin" : ""} />
      {c.label}
    </span>
  );
}

// ------------------------------------------------------------------ //
// Single source card                                                   //
// ------------------------------------------------------------------ //
function SourceCard({ source }: { source: DataSource }) {
  const { updateSource, removeSource } = useDataSourceStore();
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [editKey, setEditKey] = useState(false);
  const [newKey, setNewKey]   = useState(source.apiKey ?? "");

  const test = async () => {
    setTesting(true);
    updateSource(source.id, { status: "testing" });
    const ok = await testApiConnection(source.industry, source.dataType, source.apiKey ?? "");
    updateSource(source.id, {
      status:     ok ? "connected" : "error",
      lastTested: new Date().toISOString(),
      error:      ok ? undefined : "Could not reach service. Check API key.",
    });
    setTesting(false);
    ok ? toast.success(`${source.name} — connection verified`) : toast.error(`${source.name} — connection failed`);
  };

  const disconnect = () => {
    updateSource(source.id, { status: "disconnected", lastTested: undefined, error: undefined });
    toast.success(`${source.name} disconnected`);
  };

  const saveKey = () => {
    updateSource(source.id, { apiKey: newKey, status: "disconnected" });
    setEditKey(false);
    toast.success("API key updated. Click Test to verify.");
  };

  const typeIcon = source.type === "api" ? Plug : FileSpreadsheet;
  const TypeIcon = typeIcon;

  return (
    <div className={cn(
      "section-card p-5 border-l-4 transition-all",
      source.status === "connected" ? "border-l-emerald-400" :
      source.status === "error"     ? "border-l-red-400"     :
      source.status === "testing"   ? "border-l-blue-400"    : "border-l-slate-200"
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center",
            source.dataType === "inventory" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
          )}>
            <TypeIcon size={15} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">{source.name}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="badge badge-slate text-[10px]">{source.industry}</span>
              <span className="badge badge-slate text-[10px]">{source.dataType}</span>
              <span className="badge badge-slate text-[10px]">{source.type === "api" ? "API" : "File"}</span>
            </div>
          </div>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* API Key field */}
      {source.type === "api" && (
        <div className="mb-4">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            API Key
          </label>
          {editKey ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                className="form-input font-mono text-xs flex-1"
                placeholder="Enter API key..."
              />
              <button onClick={saveKey} className="btn-primary py-1.5 px-3 text-xs">Save</button>
              <button onClick={() => setEditKey(false)} className="btn-secondary py-1.5 px-3 text-xs">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                <Key size={12} className="text-slate-400 shrink-0" />
                <code className="text-xs font-mono text-slate-600 flex-1 truncate">
                  {showKey ? (source.apiKey ?? "—") : "•".repeat(Math.min(source.apiKey?.length ?? 0, 32))}
                </code>
              </div>
              <button onClick={() => setShowKey(s => !s)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button onClick={() => setEditKey(true)} className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                <Key size={13} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* File source info */}
      {source.type !== "api" && source.fileName && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
          <FileSpreadsheet size={12} className="text-slate-400" />
          <span className="text-xs text-slate-600">{source.fileName}</span>
          {source.rowCount && <span className="text-xs text-slate-400">· {source.rowCount} rows</span>}
        </div>
      )}

      {/* Error message */}
      {source.error && source.status === "error" && (
        <div className="mb-3 flex items-center gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
          <AlertCircle size={12} className="shrink-0" />
          {source.error}
        </div>
      )}

      {/* Last tested */}
      {source.lastTested && (
        <p className="text-[11px] text-slate-400 mb-3">
          Last tested: {new Date(source.lastTested).toLocaleString()}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {source.type === "api" && source.status !== "connected" && (
          <button onClick={test} disabled={testing}
            className="btn-secondary text-xs py-1.5">
            <RefreshCw size={12} className={testing ? "animate-spin" : ""} />
            Test Connection
          </button>
        )}
        {source.type === "api" && source.status === "connected" && (
          <button onClick={disconnect}
            className="btn-secondary text-xs py-1.5 text-red-500 hover:bg-red-50 hover:border-red-200">
            <XCircle size={12} />
            Disconnect
          </button>
        )}
        <button onClick={() => { removeSource(source.id); toast.success(`${source.name} removed`); }}
          className="ml-auto p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="Remove">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Add API connection form                                              //
// ------------------------------------------------------------------ //
function AddApiForm({ onDone }: { onDone: () => void }) {
  const { addSource } = useDataSourceStore();
  const [testing, setTesting] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ApiForm>({
    resolver: zodResolver(apiSchema),
    defaultValues: { dataType: "inventory", industry: "construction" },
  });

  const onSubmit = async (data: ApiForm) => {
    setTesting(true);
    const ok = await testApiConnection(data.industry, data.dataType, data.apiKey);
    const source: DataSource = {
      id:         generateId(),
      name:       data.name,
      type:       "api",
      industry:   data.industry,
      dataType:   data.dataType,
      apiKey:     data.apiKey,
      endpoint:   data.endpoint,
      status:     ok ? "connected" : "error",
      lastTested: new Date().toISOString(),
      error:      ok ? undefined : "Connection test failed. Verify your API key.",
    };
    addSource(source);
    setTesting(false);
    if (ok) {
      toast.success(`${data.name} connected successfully!`);
      onDone();
    } else {
      toast.error("Connection test failed — source saved but marked as error.");
      onDone();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="section-card p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Connect API Data Source</h3>
        <p className="text-sm text-slate-500 mt-1">
          Enter your API key to connect an inventory or vendor data source.
          The system will test the connection before saving.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Connection Name <span className="text-red-400">*</span>
          </label>
          <input {...register("name")} placeholder="e.g. My Pharma Inventory"
            className="form-input" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
          <select {...register("industry")} className="form-input">
            <option value="construction">Construction</option>
            <option value="pharma">Pharmaceutical</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="electronics">Electronics</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Data Type</label>
          <div className="grid grid-cols-2 gap-3">
            {(["inventory", "vendor"] as const).map(dt => (
              <label key={dt} className={cn(
                "flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all",
                watch("dataType") === dt
                  ? "border-brand-500 bg-brand-50"
                  : "border-slate-200 hover:border-slate-300"
              )}>
                <input type="radio" value={dt} {...register("dataType")} className="sr-only" />
                <span className="text-sm font-semibold text-slate-800 capitalize">{dt}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            API Key <span className="text-red-400">*</span>
          </label>
          <input {...register("apiKey")} type="text" placeholder="Paste your API key here"
            className="form-input font-mono" />
          {errors.apiKey && <p className="text-xs text-red-500 mt-1">{errors.apiKey.message}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <Info size={14} className="text-blue-500 shrink-0" />
        <p className="text-xs text-blue-700">
          The connection will be tested automatically. Your API key is stored locally in your browser and never sent to any external server.
        </p>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={testing} className="btn-primary">
          {testing ? <><Loader2 size={14} className="animate-spin" /> Testing & Saving...</> : <><Plug size={14} /> Connect & Test</>}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ //
// Add file upload form                                                  //
// ------------------------------------------------------------------ //
function AddFileForm({ onDone }: { onDone: () => void }) {
  const { addSource } = useDataSourceStore();
  const [industry, setIndustry]   = useState("construction");
  const [dataType, setDataType]   = useState<"inventory"|"vendor">("inventory");
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag]           = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) setFile(f);
    else toast.error("Only CSV and Excel files supported");
  }, []);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("data_type", dataType);
      form.append("industry", industry);
      form.append("display_name", file.name.replace(/\.[^.]+$/, ""));

      const resp = { data: await onboardingApi.upload(file, dataType, industry, file.name.replace(/\.[^.]+$/, "")) };

      const source: DataSource = {
        id:        resp.data.upload_id ?? generateId(),
        name:      file.name,
        type:      file.name.endsWith(".csv") ? "csv" : "xlsx",
        industry,
        dataType,
        apiKey:    resp.data.api_key,
        status:    "connected",
        fileName:  file.name,
        rowCount:  resp.data.row_count,
        lastTested: new Date().toISOString(),
      };
      addSource(source);
      toast.success(`${file.name} imported! API key: ${resp.data.api_key}`);
      onDone();
    } catch (e: any) {
      toast.error(`Upload failed: ${e.message}`);
    }
    setUploading(false);
  };

  return (
    <div className="section-card p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Upload File (CSV / Excel)</h3>
        <p className="text-sm text-slate-500 mt-1">
          Upload your own inventory or vendor data. We'll create a database table and generate an API key for you.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
          <select value={industry} onChange={e => setIndustry(e.target.value)} className="form-input">
            <option value="construction">Construction</option>
            <option value="pharma">Pharmaceutical</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="electronics">Electronics</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Data Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["inventory", "vendor"] as const).map(dt => (
              <label key={dt} className={cn(
                "flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all",
                dataType === dt ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
              )}>
                <input type="radio" checked={dataType === dt} onChange={() => setDataType(dt)} className="sr-only" />
                <span className="text-sm font-semibold text-slate-800 capitalize">{dt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <label
        className={cn(
          "flex flex-col items-center justify-center gap-3 w-full min-h-[180px] rounded-2xl border-2 border-dashed cursor-pointer transition-all",
          drag ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50",
          file && "border-emerald-400 bg-emerald-50"
        )}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input type="file" className="sr-only" accept=".csv,.xlsx,.xls"
          onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        {file ? (
          <>
            <CheckCircle2 size={28} className="text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-700">{file.name}</p>
            <p className="text-xs text-emerald-600">{(file.size / 1024).toFixed(1)} KB</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-600">Drag & drop or click to browse</p>
            <p className="text-xs text-slate-400">CSV, Excel (.xlsx, .xls) · Max 50MB</p>
          </>
        )}
      </label>

      <div className="flex gap-3">
        <button type="button" onClick={onDone} className="btn-secondary">Cancel</button>
        <button onClick={upload} disabled={!file || uploading} className="btn-primary">
          {uploading ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Upload size={14} /> Import & Generate API</>}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Main view                                                            //
// ------------------------------------------------------------------ //
type AddMode = null | "api" | "file";

export function DataSourcesView() {
  const { sources, updateSource } = useDataSourceStore();
  const [addMode, setAddMode] = useState<AddMode>(null);

  const inventory = sources.filter(s => s.dataType === "inventory");
  const vendors   = sources.filter(s => s.dataType === "vendor");
  const connected = sources.filter(s => s.status === "connected").length;

  const resetAll = () => {
    // Clear all localStorage keys related to this store and reload
    Object.keys(localStorage)
      .filter(k => k.startsWith("procureflow-data-sources"))
      .forEach(k => localStorage.removeItem(k));
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Data Sources</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Connect inventory and vendor databases using API keys, or import CSV/Excel files.
          </p>
        </div>
        {!addMode && (
          <div className="flex items-center gap-2">
            <button onClick={resetAll} className="btn-secondary text-red-500 hover:bg-red-50 hover:border-red-200">
              <XCircle size={14} /> Reset All
            </button>
            <button onClick={() => setAddMode("api")} className="btn-primary">
              <Plug size={14} /> Connect API
            </button>
            <button onClick={() => setAddMode("file")} className="btn-secondary">
              <Upload size={14} /> Upload File
            </button>
          </div>
        )}
      </div>

      {/* How it works */}
      {!addMode && (
        <div className="bg-brand-50 border border-brand-100 rounded-xl px-5 py-4">
          <p className="text-sm font-semibold text-brand-800 mb-2">How data sources work</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-brand-700">
            <div className="flex items-start gap-2">
              <Key size={13} className="shrink-0 mt-0.5" />
              <span><strong>API Key</strong> — If your company already has an inventory/vendor API, paste the API key here. We connect directly.</span>
            </div>
            <div className="flex items-start gap-2">
              <Upload size={13} className="shrink-0 mt-0.5" />
              <span><strong>File Upload</strong> — No API? Upload a CSV or Excel file. We auto-generate a database table and API key for it.</span>
            </div>
            <div className="flex items-start gap-2">
              <Database size={13} className="shrink-0 mt-0.5" />
              <span><strong>Agents use it</strong> — Once connected, agents automatically query your data source for inventory checks and vendor recommendations.</span>
            </div>
          </div>
        </div>
      )}

      {/* Add forms */}
      {addMode === "api"  && <AddApiForm  onDone={() => setAddMode(null)} />}
      {addMode === "file" && <AddFileForm onDone={() => setAddMode(null)} />}

      {/* Summary */}
      {!addMode && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Sources",      value: sources.length },
            { label: "Connected",          value: connected, green: true },
            { label: "Inventory Sources",  value: inventory.length },
            { label: "Vendor Sources",     value: vendors.length },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className={cn("text-2xl font-bold", s.green ? "text-emerald-600" : "text-slate-900")}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Source lists */}
      {!addMode && (
        <div className="space-y-6">
          {/* Inventory */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Inventory Data Sources
            </p>
            {inventory.length === 0 ? (
              <div className="section-card p-8 text-center">
                <p className="text-sm text-slate-400">No inventory sources connected yet.</p>
                <button onClick={() => setAddMode("api")} className="btn-ghost mt-2 text-brand-600">
                  <Plus size={13} /> Add one
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inventory.map(s => <SourceCard key={s.id} source={s} />)}
              </div>
            )}
          </div>

          {/* Vendor */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              Vendor Data Sources
            </p>
            {vendors.length === 0 ? (
              <div className="section-card p-8 text-center">
                <p className="text-sm text-slate-400">No vendor sources connected yet.</p>
                <button onClick={() => setAddMode("api")} className="btn-ghost mt-2 text-brand-600">
                  <Plus size={13} /> Add one
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vendors.map(s => <SourceCard key={s.id} source={s} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
