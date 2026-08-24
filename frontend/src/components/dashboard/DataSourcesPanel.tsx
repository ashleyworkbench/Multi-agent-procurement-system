"use client";

import { mockDataSources } from "@/lib/mockData";
import { ExternalLink, Database, FileSpreadsheet, Plug, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const typeIcon: Record<string, React.ElementType> = {
  "API Connection":      Plug,
  "CSV Upload":          FileSpreadsheet,
  "Database Connection": Database,
  "XLSX Upload":         FileSpreadsheet,
};

const typeColor: Record<string, string> = {
  "API Connection":      "bg-blue-50 text-blue-600",
  "CSV Upload":          "bg-emerald-50 text-emerald-600",
  "Database Connection": "bg-purple-50 text-purple-600",
  "XLSX Upload":         "bg-green-50 text-green-600",
};

export function DataSourcesPanel() {
  return (
    <div className="section-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Data Sources</h2>
          <p className="text-xs text-slate-400 mt-0.5">Connected integrations</p>
        </div>
        <Link href="/data-sources" className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
          Manage All <ExternalLink size={11} />
        </Link>
      </div>

      <div className="space-y-2.5">
        {mockDataSources.map((ds) => {
          const Icon = typeIcon[ds.type] ?? Database;
          return (
            <div key={ds.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", typeColor[ds.type])}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{ds.name}</p>
                <p className="text-[11px] text-slate-400">{ds.type}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-600">{ds.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new */}
      <Link
        href="/file-uploads"
        className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-xs font-medium text-slate-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
      >
        + Add Data Source
      </Link>
    </div>
  );
}
