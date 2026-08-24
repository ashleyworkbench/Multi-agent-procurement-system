"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { mockChartData } from "@/lib/mockData";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-100 rounded-xl shadow-card-hover p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-800">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export function ProcurementChart() {
  return (
    <div className="section-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Procurement Overview</h2>
          <p className="text-xs text-slate-400 mt-0.5">Last 7 days activity</p>
        </div>
        <select className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500">
          <option>Weekly</option>
          <option>Monthly</option>
        </select>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={mockChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
            iconType="circle"
            iconSize={7}
          />
          <Line
            type="monotone"
            dataKey="requests"
            name="Requests"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 3, fill: "#6366f1" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="pos"
            name="POs Created"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10b981" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            name="Total Cost (L)"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: "#f59e0b" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
