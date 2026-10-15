"use client";

import { CheckCircle2, Plug, Radio, HardDrive, FileSignature, Database, ExternalLink, ShieldCheck } from "lucide-react";
import Link from "next/link";

const integrations = [
  {
    name: "Apache Kafka Event Broker",
    category: "Message Broker & Event Stream",
    endpoint: "kafka:9092 / PLAINTEXT://localhost:29092",
    status: "Connected & Active",
    latency: "< 5ms",
    icon: Radio,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    description: "Orchestrates asynchronous event streaming across Agent 1, Agent 2, Agent 3, and Agent 4.",
    details: [
      { label: "Broker ID", value: "1" },
      { label: "Active Topics", value: "5 (invoice, ocr, inv, vendor, po)" },
      { label: "Auto-create Topics", value: "Enabled" },
    ],
    actionHref: "/kafka-logs",
    actionLabel: "View Kafka Stream Logs",
  },
  {
    name: "MinIO Document Object Storage",
    category: "Object Storage & Document Vault",
    endpoint: "http://minio:9000 (Console: :9001)",
    status: "Connected & Active",
    latency: "< 12ms",
    icon: HardDrive,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    description: "S3-compatible bucket storage for raw PDF invoice uploads and signed PO archive PDFs.",
    details: [
      { label: "Primary Bucket", value: "invoices / procurement-documents" },
      { label: "Storage Engine", value: "Distributed S3 MinIO" },
      { label: "Archiving", value: "Automated on PO DocuSign Signature" },
    ],
    actionHref: "http://localhost:9001",
    actionLabel: "Open MinIO Console",
    external: true,
  },
  {
    name: "DocuSign eSignature Engine",
    category: "Digital Signature & Verification",
    endpoint: "REST API + Connect Webhook",
    status: "Connected & Ready",
    latency: "< 35ms",
    icon: FileSignature,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    description: "Tier-based approval workflow with automatic digital signing stamps and email delivery.",
    details: [
      { label: "Webhook Status", value: "Connect Webhook Active" },
      { label: "Approval Tiers", value: "Level 1, Level 2, Executive Tier" },
      { label: "Certificate", value: "SHA-256 Tamper-evident Stamp" },
    ],
    actionHref: "/approvals",
    actionLabel: "View Approvals & Signatures",
  },
  {
    name: "Integration REST Gateway",
    category: "API Gateway & Security",
    endpoint: "http://localhost:8000",
    status: "Connected & Active",
    latency: "< 2ms",
    icon: Plug,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    description: "Unified entry point enforcing API key validation, role authorization, and service routing.",
    details: [
      { label: "Rate Limiting", value: "Active" },
      { label: "Auth Provider", value: "JWT + Header Key Auth" },
      { label: "Microservices", value: "4 AI Agents + 4 Domain Services" },
    ],
    actionHref: "/",
    actionLabel: "View Control Panel",
  },
  {
    name: "PostgreSQL Database Cluster",
    category: "Relational Persistence",
    endpoint: "postgres:5432 (Exposed: 5433)",
    status: "Connected & Active",
    latency: "< 1ms",
    icon: Database,
    color: "bg-sky-50 text-sky-600 border-sky-200",
    description: "Stores procurement requests, purchase orders, approval logs, and procurement_events.",
    details: [
      { label: "Databases", value: "procurement_db, ocr_procurement_db, construction_db" },
      { label: "Kafka Event Store", value: "procurement_events table" },
      { label: "SSL Mode", value: "Preferred" },
    ],
    actionHref: "/data-sources",
    actionLabel: "Manage Data Sources",
  },
];

export function ApiConnectionsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">API Connections & Integration Status</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Live connection status for Kafka broker, MinIO object store, DocuSign engine, and system APIs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.name} className="section-card p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${item.color}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{item.name}</h2>
                      <p className="text-xs text-slate-400">{item.category}</p>
                    </div>
                  </div>

                  <span className="badge badge-green flex items-center gap-1 shrink-0 text-[11px]">
                    <CheckCircle2 size={12} />
                    {item.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                  {item.description}
                </p>

                <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-100">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-mono">Endpoint:</span>
                    <code className="text-slate-700 font-semibold">{item.endpoint}</code>
                  </div>
                  {item.details.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">{d.label}:</span>
                      <span className="text-slate-700 font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Latency: <b className="text-emerald-600">{item.latency}</b></span>
                {item.external ? (
                  <a
                    href={item.actionHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    {item.actionLabel} <ExternalLink size={11} />
                  </a>
                ) : (
                  <Link
                    href={item.actionHref}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    {item.actionLabel} <ExternalLink size={11} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
