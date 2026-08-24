"use client";

import { Bell, Calendar, ChevronDown, Plus, Search } from "lucide-react";
import { format, subDays } from "date-fns";

export function Topbar() {
  const today = new Date();
  const weekAgo = subDays(today, 6);

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100 shrink-0">
      {/* Left: page title is rendered by each page — topbar just shows context */}
      <div className="flex items-center gap-3">
        {/* Date range pill */}
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm text-slate-600 transition-colors">
          <Calendar size={14} className="text-slate-400" />
          <span>
            {format(weekAgo, "MMM dd, yyyy")} – {format(today, "MMM dd, yyyy")}
          </span>
          <ChevronDown size={12} className="text-slate-400" />
        </button>
      </div>

      {/* Right: search + bell + avatar */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search requests, vendors..."
            className="pl-8 pr-4 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg w-56
                       focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                       placeholder-slate-400"
          />
        </div>

        {/* New Request button */}
        <button className="btn-primary">
          <Plus size={14} />
          New Request
        </button>

        {/* Notifications */}
        <button className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User avatar */}
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center cursor-pointer">
          <span className="text-xs font-bold text-white">AU</span>
        </div>
      </div>
    </header>
  );
}
