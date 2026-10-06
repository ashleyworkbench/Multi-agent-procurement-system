"use client";

import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Upload, FileText, FileImage, Loader2, CheckCircle2,
  AlertTriangle, RefreshCw, ChevronDown, ChevronUp,
  Clock, Cpu, Brain, Package, Plus, X, Trash2, Play,
  XCircle, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { ocrApi } from "@/lib/api";

const GATEWAY_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const OCR_URL    = process.env.NEXT_PUBLIC_OCR_URL  || "http://localhost:8001";
const OCR_KEY    = "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123";

// ------------------------------------------------------------------ //
// API helpers                                                          //
// ------------------------------------------------------------------ //
async function uploadInvoice(file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${GATEWAY_URL}/agent1/upload`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function fetchDocuments() {
  const resp = await fetch(`${GATEWAY_URL}/agent1/documents`);
  if (!resp.ok) throw new Error("Failed to fetch documents");
  return resp.json();
}

async function fetchProcessingStatus(id: number) {
  const resp = await fetch(`${GATEWAY_URL}/agent1/processing/${id}`);
  if (!resp.ok) throw new Error("Not found");
  return resp.json();
}

async function fetchRequests() {
  const resp = await fetch(`${OCR_URL}/requests`, { headers: { "X-API-KEY": OCR_KEY } });
  if (!resp.ok) throw new Error("Failed to fetch requests");
  return resp.json();
}

async function fetchRequestItems(requestId: number) {
  const resp = await fetch(`${OCR_URL}/requests/${requestId}/items`, { headers: { "X-API-KEY": OCR_KEY } });
  if (!resp.ok) throw new Error("Failed to fetch items");
  return resp.json();
}

// ------------------------------------------------------------------ //
// Status badge                                                         //
// ------------------------------------------------------------------ //
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: any; label: string }> = {
    completed:  { cls: "badge-green",  icon: CheckCircle2, label: "Completed" },
    processing: { cls: "badge-blue",   icon: Loader2,      label: "Processing" },
    queued:     { cls: "badge-yellow", icon: Clock,        label: "Queued" },
    failed:     { cls: "badge-red",    icon: AlertTriangle,label: "Failed" },
    cancelled:  { cls: "bg-amber-100 text-amber-800 border border-amber-300", icon: XCircle, label: "Cancelled" },
    pending:    { cls: "badge-slate",  icon: Clock,        label: "Pending" },
  };
  const c = map[status] ?? map.pending;
  return (
    <span className={cn("badge gap-1", c.cls)}>
      <c.icon size={10} className={status === "processing" ? "animate-spin" : ""} />
      {c.label}
    </span>
  );
}

// ------------------------------------------------------------------ //
// Processing step row                                                  //
// ------------------------------------------------------------------ //
function StepRow({ icon: Icon, label, status }: { icon: any; label: string; status: string }) {
  const done      = status === "completed";
  const failed    = status === "failed";
  const running   = status === "processing";
  const cancelled = status === "cancelled";
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0",
        done ? "bg-emerald-100 text-emerald-600" :
        failed ? "bg-red-100 text-red-500" :
        cancelled ? "bg-amber-100 text-amber-600" :
        running ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-400")}>
        {running ? <Loader2 size={10} className="animate-spin" /> :
         done    ? <CheckCircle2 size={10} /> :
         failed  ? <AlertTriangle size={10} /> :
         cancelled ? <XCircle size={10} /> :
                   <Icon size={10} />}
      </div>
      <span className={cn("font-medium",
        done ? "text-emerald-700" : failed ? "text-red-600" : cancelled ? "text-amber-700" : running ? "text-blue-700" : "text-slate-400")}>
        {label}
      </span>
      <span className="ml-auto text-slate-400 capitalize">{status}</span>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Request card (expanded from OCR db)                                  //
// ------------------------------------------------------------------ //
function RequestCard({ request, onDelete }: { request: any; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const { data: itemsData, isLoading } = useQuery({
    queryKey: ["request-items", request.id],
    queryFn:  () => fetchRequestItems(request.id),
    enabled:  open,
  });
  const items = itemsData?.items ?? [];

  return (
    <div className="section-card overflow-hidden relative group">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">#{request.id}</span>
              <p className="text-sm font-bold text-slate-800">{request.requester_name}</p>
            </div>
            {request.address && (
              <p className="text-xs text-slate-500 mt-0.5">{request.address}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">{new Date(request.created_at).toLocaleString()}</p>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-brand-600">{formatCurrency(request.total_estimated_cost)}</p>
              <button
                onClick={() => onDelete(request.id)}
                className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete this request"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <span className="badge badge-green text-[10px]">Extracted</span>
          </div>
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="mt-3 w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-medium text-slate-600 transition-colors">
          <span className="flex items-center gap-2">
            <Package size={11} />
            {open ? "Hide items" : "View items"}
          </span>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-100">
          {isLoading ? (
            <div className="p-4 text-center"><Loader2 size={16} className="animate-spin text-slate-400 mx-auto" /></div>
          ) : (
            <>
              <div className="grid grid-cols-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-4 py-2 bg-slate-50">
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Est. Cost</span>
              </div>
              {items.map((item: any, i: number) => (
                <div key={i} className="grid grid-cols-3 items-center px-4 py-2.5 border-t border-slate-50 text-xs hover:bg-slate-50">
                  <span className="text-slate-700 font-medium pr-2 truncate">{item.description}</span>
                  <span className="text-center text-slate-500">{item.quantity}</span>
                  <span className="text-right text-brand-600 font-semibold">{formatCurrency(item.estimated_cost)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Document processing card                                             //
// ------------------------------------------------------------------ //
function DocumentCard({
  doc,
  onDelete,
  onCancel,
}: {
  doc: any;
  onDelete: (id: number) => void;
  onCancel: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const isProcessing = ["queued", "processing"].includes(doc.status);

  // Poll while processing
  const { data: live } = useQuery({
    queryKey: ["doc-status", doc.id],
    queryFn:  () => fetchProcessingStatus(doc.id),
    refetchInterval: isProcessing ? 2000 : false,
    initialData: doc,
  });
  const d = live ?? doc;
  const isLiveProcessing = ["queued", "processing"].includes(d.status);

  return (
    <div className={cn("section-card p-4 border-l-4 relative group",
      d.status === "completed" ? "border-l-emerald-400" :
      d.status === "failed"    ? "border-l-red-400"     :
      d.status === "cancelled" ? "border-l-amber-400"   :
      d.status === "processing"? "border-l-blue-400"    : "border-l-amber-300")}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            {d.filename?.match(/\.(png|jpg|jpeg)$/i)
              ? <FileImage size={14} className="text-slate-500" />
              : <FileText  size={14} className="text-slate-500" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">{d.filename}</p>
            <p className="text-[11px] text-slate-400">{d.created_at ? new Date(d.created_at).toLocaleString() : "-"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status} />
          <button
            onClick={() => onDelete(d.id)}
            className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete processing record"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <StepRow icon={FileText} label="OCR (Tesseract)"    status={d.ocr_status} />
        <StepRow icon={Cpu}      label="Document Structure" status={d.docling_status} />
        <StepRow icon={Brain}    label="LLM Extraction"     status={d.gemini_status} />
      </div>

      {/* Cancel button mid-way while Agent 1 is actively running */}
      {isLiveProcessing && (
        <div className="mt-3 p-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-blue-700">
            <Loader2 size={13} className="animate-spin text-blue-600 shrink-0" />
            <span>Agent 1 is actively extracting...</span>
          </div>
          <button
            onClick={() => onCancel(d.id)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg shadow-sm transition-colors"
            title="Cancel Agent 1 extraction mid-process"
          >
            <X size={12} />
            Cancel
          </button>
        </div>
      )}

      {d.status === "cancelled" && (
        <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-1.5">
          <XCircle size={13} className="shrink-0 text-amber-600" />
          Extraction cancelled by user mid-process.
        </div>
      )}

      {d.request_id && (
        <div className="mt-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-700">
          <CheckCircle2 size={11} className="inline mr-1" />
          Request #{d.request_id} created - forwarded to Agent 2
        </div>
      )}

      {d.error_message && (
        <div className="mt-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">
          <AlertTriangle size={11} className="inline mr-1" />
          {d.error_message}
        </div>
      )}

      {d.structured_data && (
        <button onClick={() => setOpen(o => !o)}
          className="mt-2 w-full text-xs text-slate-500 hover:text-slate-700 flex items-center justify-center gap-1">
          {open ? <><ChevronUp size={11} /> Hide extracted data</> : <><ChevronDown size={11} /> View extracted data</>}
        </button>
      )}
      {open && d.structured_data && (
        <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-lg text-[10px] overflow-auto max-h-48">
          {JSON.stringify(d.structured_data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ //
// Upload zone                                                          //
// ------------------------------------------------------------------ //
function UploadZone({ onUploaded }: { onUploaded: () => void }) {
const [dragging, setDragging] = useState(false);
const [files, setFiles] = useState<File[]>([]);
const [uploading, setUploading] = useState(false);
const abortRef = useRef<AbortController | null>(null);

const handleSelect = (selectedFiles: FileList | File[]) => {
  const validFiles = Array.from(selectedFiles).filter(file =>
    /\.(pdf|png|jpg|jpeg)$/i.test(file.name)
  );

  if (validFiles.length === 0) {
    toast.error("Please select PDF, PNG, JPG, or JPEG invoice files.");
    return;
  }

  setFiles(validFiles);
};

const handleCancelSelection = (e?: React.MouseEvent) => {
  if (e) e.stopPropagation();

  if (uploading && abortRef.current) {
    abortRef.current.abort();
    toast.info("Invoice processing cancelled by user");
  }

  setUploading(false);
  setFiles([]);
  abortRef.current = null;
};

const startExtraction = async (e?: React.MouseEvent) => {
  if (e) e.stopPropagation();

  if (files.length === 0) {
    toast.error("Please select at least one invoice.");
    return;
  }

  setUploading(true);

  const controller = new AbortController();
  abortRef.current = controller;

  let successful = 0;
  let failed = 0;

  try {
    // Process invoices independently.
    // Promise.allSettled ensures one failed invoice does not stop the others.
    const results = await Promise.allSettled(
      files.map(file => uploadInvoice(file, controller.signal))
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successful++;
        console.log(`[OK] ${files[index].name} uploaded successfully`);
      } else {
        failed++;
        console.error(`[FAIL] ${files[index].name} failed:`, result.reason);
      }
    });

    if (successful > 0) {
      toast.success(
        `${successful} invoice${successful !== 1 ? "s" : ""} uploaded successfully - Agent 1 pipeline initiated!`
      );
    }

    if (failed > 0) {
      toast.error(
        `${failed} invoice${failed !== 1 ? "s" : ""} failed to upload.`
      );
    }

    setFiles([]);
    onUploaded();

  } catch (err: any) {
    if (err.name === "AbortError" || controller.signal.aborted) {
      toast.info("Invoice processing was cancelled");
    } else {
      toast.error(`Bulk upload failed: ${err.message}`);
    }
  } finally {
    setUploading(false);
    abortRef.current = null;
  }
};

const onDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  setDragging(false);

  const droppedFiles = Array.from(e.dataTransfer.files);

  if (droppedFiles.length > 0) {
    handleSelect(droppedFiles);
  }
}, []);

  // 1. In-flight extraction state with Cancel Extraction button
  if (uploading && files.length > 0) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl border-2 border-brand-200 bg-brand-50/50">
        <div className="flex items-center gap-3">
          <Loader2 size={24} className="animate-spin text-brand-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Extracting invoice: {files.length} invoice{files.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-slate-500">Agent 1 is running OCR & LLM data extraction...</p>
          </div>
        </div>
        <button
          onClick={handleCancelSelection}
          type="button"
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-xl transition-all shadow-sm"
        >
          <X size={14} />
          Cancel Extraction
        </button>
      </div>
    );
  }

  // 2. Selected files preview state
  if (files.length > 0) {
    return (
      <div className="flex flex-col gap-4 p-5 rounded-2xl border-2 border-brand-300 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {files.length} invoice{files.length !== 1 ? "s" : ""} selected
            </p>
            <p className="text-xs text-slate-400">
              Ready for Agent 1 extraction
            </p>
          </div>

          <button
            onClick={handleCancelSelection}
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-xl transition-colors"
          >
            <Trash2 size={13} />
            Cancel
          </button>
        </div>

        <div className="max-h-40 overflow-y-auto space-y-2">
          {files.map((selectedFile, index) => {
            const isPdf = selectedFile.name.toLowerCase().endsWith(".pdf");
            const fileSizeKb = (selectedFile.size / 1024).toFixed(1);

            return (
              <div
                key={`${selectedFile.name}-${index}`}
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                  {isPdf ? <FileText size={18} /> : <FileImage size={18} />}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {fileSizeKb} KB
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={startExtraction}
          type="button"
          className="self-end flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-sm"
        >
          <Play size={13} className="fill-white" />
          Process {files.length} Invoice{files.length !== 1 ? "s" : ""}
        </button>
      </div>
    );
  }
  // 3. Default dropzone state
  return (
    <label
      className={cn(
        "flex flex-col items-center justify-center gap-3 w-full min-h-[140px] rounded-2xl border-2 border-dashed cursor-pointer transition-all",
        dragging ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        type="file"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg"
        multiple
        onChange={e => {
          if (e.target.files) {
            handleSelect(e.target.files);
          }
          e.target.value = "";
        }}
      />
      <Upload size={22} className="text-slate-400" />
      <p className="text-sm font-semibold text-slate-600">Drop invoices here or click to browse</p>
      <p className="text-xs text-slate-400">Upload multiple invoices - PDF, PNG, JPG, JPEG</p>
    </label>
  );
}

// ------------------------------------------------------------------ //
// Main view                                                            //
// ------------------------------------------------------------------ //
export function RequestsView() {
  const [tab, setTab] = useState<"requests"|"processing">("requests");
  const qc = useQueryClient();

  const { data: requestsData, isLoading: reqLoading, refetch: refetchReqs } = useQuery({
    queryKey: ["ocr-requests-list"],
    queryFn:  fetchRequests,
    refetchInterval: 10000,
  });

  const { data: docsData, isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ["agent1-documents"],
    queryFn:  fetchDocuments,
    refetchInterval: 5000,
  });

  // Mutations for single deletion & cancel
  const deleteReqMut = useMutation({
    mutationFn: (id: number) => ocrApi.deleteRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ocr-requests-list"] });
      toast.success("Request deleted");
    },
    onError: (err: any) => toast.error(`Failed to delete request: ${err.message}`),
  });

  const clearReqsMut = useMutation({
    mutationFn: () => ocrApi.clearRequests(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ocr-requests-list"] });
      toast.success("All extracted requests cleared");
    },
    onError: (err: any) => toast.error(`Failed to clear requests: ${err.message}`),
  });

  const deleteDocMut = useMutation({
    mutationFn: (id: number) => ocrApi.deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent1-documents"] });
      toast.success("Processing record deleted");
    },
    onError: (err: any) => toast.error(`Failed to delete record: ${err.message}`),
  });

  const clearDocsMut = useMutation({
    mutationFn: () => ocrApi.clearDocuments(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent1-documents"] });
      toast.success("All processing history cleared");
    },
    onError: (err: any) => toast.error(`Failed to clear records: ${err.message}`),
  });

  const cancelDocMut = useMutation({
    mutationFn: (id: number) => ocrApi.cancelDocument(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["agent1-documents"] });
      qc.invalidateQueries({ queryKey: ["doc-status", id] });
      toast.info("Agent 1 processing cancelled successfully");
    },
    onError: (err: any) => toast.error(`Cancel failed: ${err.message}`),
  });

  const requests  = requestsData?.requests ?? [];
  const documents = Array.isArray(docsData) ? docsData : [];
  const processing = documents.filter((d: any) => ["queued","processing"].includes(d.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Procurement Requests</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Upload invoices for Agent 1 to extract. Extracted requests flow automatically to Agents 2 to 3 to 4.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "requests" && requests.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Clear all extracted requests?")) {
                  clearReqsMut.mutate();
                }
              }}
              disabled={clearReqsMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              <span>Clear Requests</span>
            </button>
          )}

          {tab === "processing" && documents.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("Clear all processing history logs?")) {
                  clearDocsMut.mutate();
                }
              }}
              disabled={clearDocsMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              <span>Clear History</span>
            </button>
          )}

          <button onClick={() => { refetchReqs(); refetchDocs(); }} className="btn-secondary">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Upload zone */}
      <div className="section-card p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Upload size={14} className="text-brand-600" />
          Upload Invoice - Agent 1 will OCR + extract
        </p>
        <UploadZone onUploaded={() => { refetchDocs(); setTimeout(refetchReqs, 5000); }} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <p className="text-2xl font-bold text-slate-900">{requests.length}</p>
          <p className="text-xs text-slate-500 mt-1">Total Requests</p>
        </div>
        <div className="stat-card">
          <p className="text-2xl font-bold text-emerald-600">{documents.filter((d:any) => d.status === "completed").length}</p>
          <p className="text-xs text-slate-500 mt-1">Processed</p>
        </div>
        <div className="stat-card">
          <p className={cn("text-2xl font-bold", processing > 0 ? "text-blue-600" : "text-slate-900")}>{processing}</p>
          <p className="text-xs text-slate-500 mt-1">Processing</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex items-center gap-1">
          {([
            { id: "requests",   label: "Extracted Requests",   count: requests.length },
            { id: "processing", label: "Processing History",   count: documents.length },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
              {t.label}
              <span className={cn("text-[11px] px-1.5 py-0.5 rounded-full font-bold",
                tab === t.id ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500")}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "requests" && (
        reqLoading ? (
          <div className="section-card p-12 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-brand-500" />
          </div>
        ) : requests.length === 0 ? (
          <div className="section-card p-12 text-center">
            <FileText size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No requests yet. Upload an invoice above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((r: any) => (
              <RequestCard
                key={r.id}
                request={r}
                onDelete={(id) => deleteReqMut.mutate(id)}
              />
            ))}
          </div>
        )
      )}

      {tab === "processing" && (
        docsLoading ? (
          <div className="section-card p-12 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-brand-500" />
          </div>
        ) : documents.length === 0 ? (
          <div className="section-card p-12 text-center">
            <FileText size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No documents processed yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((d: any) => (
              <DocumentCard
                key={d.id}
                doc={d}
                onDelete={(id) => deleteDocMut.mutate(id)}
                onCancel={(id) => cancelDocMut.mutate(id)}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
