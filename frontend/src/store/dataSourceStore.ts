import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ConnectionType = "api" | "xlsx" | "csv";
export type ConnectionStatus = "connected" | "disconnected" | "testing" | "error";

export interface DataSource {
  id: string;
  name: string;
  type: ConnectionType;
  industry: string;
  dataType: "inventory" | "vendor";
  apiKey?: string;
  endpoint?: string;
  fileName?: string;
  status: ConnectionStatus;
  lastTested?: string;
  error?: string;
  rowCount?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function syncConnection(industry: string, dataType: string, apiKey: string, connected: boolean) {
  try {
    if (connected) {
      await fetch(`${API_BASE}/connections/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, data_type: dataType, api_key: apiKey }),
      });
    } else {
      await fetch(`${API_BASE}/connections/disconnect?industry=${industry}&data_type=${dataType}`, {
        method: "DELETE",
      });
    }
  } catch (e) {
    console.warn("Could not sync connection status to backend:", e);
  }
}

const DEFAULT_SOURCES: DataSource[] = [
  { id: "builtin-const-inv", name: "Construction Inventory",  type: "api", industry: "construction",  dataType: "inventory", apiKey: "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567", status: "disconnected" },
  { id: "builtin-const-ven", name: "Construction Vendors",    type: "api", industry: "construction",  dataType: "vendor",    apiKey: "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567", status: "disconnected" },
  { id: "builtin-pharm-inv", name: "Pharma Inventory",        type: "api", industry: "pharma",        dataType: "inventory", apiKey: "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456", status: "disconnected" },
  { id: "builtin-pharm-ven", name: "Pharma Vendors",          type: "api", industry: "pharma",        dataType: "vendor",    apiKey: "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456", status: "disconnected" },
  { id: "builtin-mfg-inv",   name: "Manufacturing Inventory", type: "api", industry: "manufacturing", dataType: "inventory", apiKey: "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345", status: "disconnected" },
  { id: "builtin-mfg-ven",   name: "Manufacturing Vendors",   type: "api", industry: "manufacturing", dataType: "vendor",    apiKey: "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345", status: "disconnected" },
  { id: "builtin-elec-inv",  name: "Electronics Inventory",   type: "api", industry: "electronics",   dataType: "inventory", apiKey: "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234", status: "disconnected" },
  { id: "builtin-elec-ven",  name: "Electronics Vendors",     type: "api", industry: "electronics",   dataType: "vendor",    apiKey: "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234", status: "disconnected" },
];

interface DataSourceStore {
  sources: DataSource[];
  addSource:    (s: DataSource)  => void;
  updateSource: (id: string, patch: Partial<DataSource>) => void;
  removeSource: (id: string)     => void;
  getKey:       (industry: string, dataType: "inventory" | "vendor") => string | undefined;
}

export const useDataSourceStore = create<DataSourceStore>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      addSource:    (s)         => set(st => ({ sources: [...st.sources, s] })),
      updateSource: (id, patch) => {
        set(st => ({
          sources: st.sources.map(s => s.id === id ? { ...s, ...patch } : s),
        }));
        // Sync connection status to backend
        if (patch.status === "connected" || patch.status === "disconnected") {
          const state = get();
          const source = state.sources.find(s => s.id === id);
          if (source) {
            syncConnection(
              source.industry,
              source.dataType,
              source.apiKey ?? "",
              patch.status === "connected"
            );
          }
        }
      },
      removeSource: (id)        => set(st => ({
        sources: st.sources.filter(s => s.id !== id),
      })),
      getKey: (industry, dataType) => {
        const s = get().sources.find(s =>
          s.industry === industry && s.dataType === dataType && s.status === "connected"
        );
        return s?.apiKey;
      },
    }),
    {
      name: "procureflow-data-sources-v4",
      // Only persist status, lastTested, error, and user-added sources
      partialize: (state) => ({
        sources: state.sources.map(s => ({
          id: s.id,
          status: s.status,
          lastTested: s.lastTested,
          error: s.error,
          // preserve user-added sources fully
          ...(s.id.startsWith("builtin-") ? {} : s),
        })),
      }),
      merge: (persisted: any, current) => {
        const persistedMap: Record<string, any> = {};
        (persisted?.sources ?? []).forEach((s: any) => { persistedMap[s.id] = s; });

        return {
          ...current,
          sources: [
            // Merge status back into default sources
            ...DEFAULT_SOURCES.map(def => ({
              ...def,
              ...(persistedMap[def.id]
                ? { status: persistedMap[def.id].status, lastTested: persistedMap[def.id].lastTested, error: persistedMap[def.id].error }
                : {}),
            })),
            // Keep any user-added (non-builtin) sources
            ...(persisted?.sources ?? []).filter((s: any) => !s.id.startsWith("builtin-")),
          ],
        };
      },
    }
  )
);
