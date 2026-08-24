import { StatCards } from "@/components/dashboard/StatCards";
import { ProcurementChart } from "@/components/dashboard/ProcurementChart";
import { AgentStatusPanel } from "@/components/dashboard/AgentStatusPanel";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { RecentRequestsTable } from "@/components/dashboard/RecentRequestsTable";
import { TopVendors } from "@/components/dashboard/TopVendors";
import { DataSourcesPanel } from "@/components/dashboard/DataSourcesPanel";
import { SystemStatusBar } from "@/components/dashboard/SystemStatusBar";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Monitor procurement operations and AI agent performance
        </p>
      </div>

      {/* KPI stat cards */}
      <StatCards />

      {/* Row 2: Chart + Agent Status + Activity */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-5">
          <ProcurementChart />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <AgentStatusPanel />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <RecentActivity />
        </div>
      </div>

      {/* Row 3: Recent Requests + Top Vendors + Data Sources */}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-6">
          <RecentRequestsTable />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <TopVendors />
        </div>
        <div className="col-span-12 lg:col-span-3">
          <DataSourcesPanel />
        </div>
      </div>

      {/* System status bar */}
      <SystemStatusBar />
    </div>
  );
}
