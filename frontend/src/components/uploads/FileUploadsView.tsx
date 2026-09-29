"use client";

import { useState, useCallback } from "react";
import { useDataSourceStore, type DataSource } from "@/store/dataSourceStore";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2,
  Trash2, Database, AlertCircle, RefreshCw, Plus, ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import Link from "next/link";

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function FileUploadsView() {
  const { sources, addSource, removeSource } = useDataSourceStore();
  const [industry, setIndustry] = useState("construction");
  const [dataType, setDataType] = useState<"inventory" | "vendor">("inventory");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  const fileSources = sources.filter(s => s.type === "csv" || s.type === "xlsx");

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".xlsx") || f.name.endsWith(".xls"))) {
      setFile(f);
    } else {
      toast.error("Only CSV and Excel files supported");
    }
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

      const resp = await axios.post(`http://localhost:8007/onboarding/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });

      const source: DataSource = {
        id: resp.data.upload_id ?? generateId(),
        name: file.name,
        type: file.name.endsWith(".csv") ? "csv" : "xlsx",
        industry,
        dataType,
        apiKey: resp.data.api_key,
        status: "connected",
        fileName: file.name,
        rowCount: resp.data.row_count,
        lastTested: new Date().toISOString(),
      };
      addSource(source);
      toast.success(`${file.name} imported successfully!`);
      setFile(null);
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.response?.data?.detail || e.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">File Uploads & Onboarding</h1>
        <p className="text-sm text-slate-500 mt-1">
          Import custom CSV and Excel sheets to dynamically onboard new inventory or vendor data
        </p>
      </div>

      {/* Upload Box */}
      <div className="section-card p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-900">Upload Dataset</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Target Industry
            </label>
            <select
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              className="form-input text-sm"
            >
              <option value="construction">Construction</option>
              <option value="pharma">Pharmaceutical</option>
              <option value="manufacturing">Manufacturing</option>
              <option value="electronics">Electronics</option>
              <option value="custom">Custom Industry</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Data Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["inventory", "vendor"] as const).map(dt => (
                <label
                  key={dt}
                  className={cn(
                    "flex items-center justify-center p-2.5 rounded-xl border-2 cursor-pointer font-medium text-xs capitalize transition-all",
                    dataType === dt
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  <input
                    type="radio"
                    checked={dataType === dt}
                    onChange={() => setDataType(dt)}
                    className="sr-only"
                  />
                  {dt}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Dropzone */}
        <label
          className={cn(
            "flex flex-col items-center justify-center gap-3 w-full min-h-[160px] rounded-2xl border-2 border-dashed cursor-pointer transition-all p-6",
            drag
              ? "border-brand-400 bg-brand-50"
              : "border-slate-200 hover:border-brand-300 hover:bg-slate-50",
            file && "border-emerald-400 bg-emerald-50/50"
          )}
          onDragOver={e => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input
            type="file"
            className="sr-only"
            accept=".csv,.xlsx,.xls"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          {file ? (
            <div className="text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-800">{file.name}</p>
              <p className="text-xs text-emerald-600 mt-0.5">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="text-center">
              <Upload size={28} className="text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Drag & drop your file here, or browse</p>
              <p className="text-xs text-slate-400 mt-1">Supports CSV, XLSX, and XLS formats up to 50MB</p>
            </div>
          )}
        </label>

        <div className="flex items-center justify-between pt-2">
          <Link href="/data-sources" className="text-xs text-brand-600 hover:underline">
            ← Manage all data sources
          </Link>

          <button
            onClick={upload}
            disabled={!file || uploading}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Processing dataset...
              </>
            ) : (
              <>
                <Upload size={14} /> Import Dataset
              </>
            )}
          </button>
        </div>
      </div>

      {/* Uploaded Datasets List */}
      <div className="section-card p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Uploaded Custom Datasets</h2>
        {fileSources.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No custom files uploaded yet. Upload a CSV or Excel dataset above.
          </div>
        ) : (
          <div className="space-y-3">
            {fileSources.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FileSpreadsheet size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      {s.industry} · {s.dataType} {s.rowCount ? `· ${s.rowCount} rows` : ""}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="badge badge-green">Connected</span>
                  <button
                    onClick={() => {
                      removeSource(s.id);
                      toast.success(`${s.name} removed`);
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
