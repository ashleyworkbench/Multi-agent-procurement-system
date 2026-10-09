const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const GATEWAY_KEY = process.env.NEXT_PUBLIC_GATEWAY_KEY || "GATEWAY-master-key-2024";

export const INDUSTRIES = [
  "construction",
  "pharma",
  "manufacturing",
  "electronics",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_API_KEYS: Record<Industry, string> = {
  construction: process.env.NEXT_PUBLIC_CONSTRUCTION_KEY || "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567",
  pharma: process.env.NEXT_PUBLIC_PHARMA_KEY || "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456",
  manufacturing: process.env.NEXT_PUBLIC_MANUFACTURING_KEY || "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345",
  electronics: process.env.NEXT_PUBLIC_ELECTRONICS_KEY || "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234",
};

export type UserRole =
  | "Admin"
  | "Procurement Officer"
  | "Operations Manager"
  | "Finance Director";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

const AUTH_TOKEN_KEY = "procureflow_access_token";
const AUTH_USER_KEY = "procureflow_user";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": GATEWAY_KEY,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const text = await response.text();

      try {
        const error = JSON.parse(text);
        throw new Error(error.detail || "Invalid email or password");
      } catch {
        throw new Error("Invalid email or password");
      }
    }

    const data = await response.json();

    setAuthSession(data.access_token, data.user);

    return data as {
      access_token: string;
      token_type: string;
      user: AuthUser;
    };
  },

  me: async () => {
    const token = getAuthToken();

    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": GATEWAY_KEY,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      clearAuthSession();
      throw new Error("Authentication expired");
    }

    return response.json() as Promise<AuthUser>;
  },

  logout: () => {
    clearAuthSession();
  },
};
async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": GATEWAY_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const ocrApi = {
  getRequests: async () => apiFetch<any>("/agent1/documents"),
  getProcurementRequests: async () => apiFetch<any>("/ocr/requests"),
  getRequestById: async (id: number) => apiFetch<any>(`/agent1/processing/${id}`),
  getRequestItems: async (requestId: number) => apiFetch<any>(`/agent1/requests/${requestId}/items`),
  deleteRequest: async (requestId: number) => apiFetch<any>(`/ocr/requests/${requestId}`, { method: "DELETE" }),
  clearRequests: async () => apiFetch<any>("/ocr/requests", { method: "DELETE" }),
  deleteDocument: async (processingId: number) => apiFetch<any>(`/agent1/documents/${processingId}`, { method: "DELETE" }),
  clearDocuments: async () => apiFetch<any>("/agent1/documents", { method: "DELETE" }),
  cancelDocument: async (processingId: number) => apiFetch<any>(`/agent1/documents/${processingId}/cancel`, { method: "POST" }),
  uploadFile: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/agent1/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Upload failed");
    }
    return res.json();
  },
};

export const onboardingApi = {
  getConnections: async () => apiFetch<any>("/connections"),
  getConnectedIndustries: async () => apiFetch<any>("/connections/industries"),
  connect: async (payload: Record<string, any>) => apiFetch<any>("/connections/connect", { method: "POST", body: JSON.stringify(payload) }),
  disconnect: async (industry: string, dataType: string) => apiFetch<any>(`/connections/disconnect?industry=${encodeURIComponent(industry)}&data_type=${encodeURIComponent(dataType)}`, { method: "DELETE" }),
  getUploads: async () => apiFetch<any>("/onboarding/uploads"),
  getData: async (uploadId: string) => apiFetch<any>(`/onboarding/data/${uploadId}`),
  deleteUpload: async (uploadId: string) => apiFetch<any>(`/onboarding/uploads/${uploadId}`, { method: "DELETE" }),
  upload: async (file: File, dataType: string, industry: string, displayName: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("data_type", dataType);
    form.append("industry", industry);
    form.append("display_name", displayName);
    const res = await fetch(`${API_BASE}/onboarding/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.text()) || "Upload failed");
    return res.json();
  },
};

export const agent2Api = {
  getHealth: async () => apiFetch<any>("/agent2/health"),
  getStatus: async () => apiFetch<any>("/agent2/status"),
  getResult: async (requestId: number) => apiFetch<any>(`/agent2/evaluate/${requestId}/result`),
  trigger: async (requestId: number) => apiFetch<any>("/agent2/trigger", {
    method: "POST",
    body: JSON.stringify({ request_id: requestId }),
  }),
  evaluate: async (requestId: number) => apiFetch<any>(`/agent2/evaluate/${requestId}`, { method: "POST" }),
};

export const agent3Api = {
  getHealth: async () => apiFetch<any>("/agent3/health"),
  getStatus: async () => apiFetch<any>("/agent3/status"),
  getResult: async (requestId: number) => apiFetch<any>(`/agent3/recommend/${requestId}/result`),
  recommend: async (payload: any) => apiFetch<any>("/agent3/recommend", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};

export const agent4Api = {
  getHealth: async () => apiFetch<any>("/agent4/health"),
  getStatus: async () => apiFetch<any>("/agent4/status"),
  process: async (payload: any) => apiFetch<any>("/agent4/process", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
};

export const procurementApi = {
  getSummary: async () => apiFetch<any>("/procurement/summary"),
  getPOs: async (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return apiFetch<any>(`/procurement/po?${qs.toString()}`);
  },
  getAgentLogs: async (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return apiFetch<any>(`/agent-logs?${qs.toString()}`);
  },
  getEvents: async (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return apiFetch<any>(`/events?${qs.toString()}`);
  },
  signPO: async (poId: number, payload: Record<string, any>) => apiFetch<any>(`/procurement/purchase-orders/${poId}/sign`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  getContracts: async () => {
    const user = getStoredUser();
    const qs =
      user?.role !== "Admin"
        ? "?assigned_to_me=true"
        : "";
    return apiFetch<any>(`/procurement/contracts${qs}`);
  },
  getPO_PDF_Url: (poId: number) => `${API_BASE}/procurement/purchase-orders/${poId}/pdf`,
  getPO_Download_Url: (poId: number) => `${API_BASE}/procurement/purchase-orders/${poId}/download`,
  updateStatus: async (poId: number, payload: Record<string, any>) => apiFetch<any>(`/procurement/purchase-orders/${poId}/status`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
  deletePO: async (poId: number) => apiFetch<any>(`/procurement/purchase-orders/${poId}`, { method: "DELETE" }),
  clearPOs: async () => apiFetch<any>("/procurement/purchase-orders", { method: "DELETE" }),
  resetDemo: async () => apiFetch<any>("/demo/reset", { method: "POST" }),
};

export const inventoryApi = {
  getItems: async (industry: string) => apiFetch<any>(`/inventory/items?industry=${encodeURIComponent(industry)}`),
};

export const vendorApi = {
  getVendors: async (industry: string) => apiFetch<any>(`/vendors?industry=${encodeURIComponent(industry)}`),
};


export const riskApi = {
  getStatus:       async ()                                    => apiFetch<any>("/agent-risk/status"),
  getHealth:       async ()                                    => apiFetch<any>("/agent-risk/health"),
  getVendorsRisk:  async (companyId: string)                   => apiFetch<any>(`/agent-risk/api/v1/vendors/risk?company_id=${encodeURIComponent(companyId)}`),
  getVendorRisk:   async (vendorId: string, companyId: string) => apiFetch<any>(`/agent-risk/api/v1/vendors/${encodeURIComponent(vendorId)}/risk?company_id=${encodeURIComponent(companyId)}`),
  evaluateVendorSuitability: async (payload: Record<string, any>) =>
    apiFetch<any>("/risk/suitability", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  analyzeRisk:     async (companyId: string)                   => apiFetch<any>("/agent-risk/api/v1/vendors/analyze", { method: "POST", body: JSON.stringify({ company_id: companyId }) }),
  getFeedback:     async (companyId: string)                   => apiFetch<any>(`/agent-risk/api/v1/feedback?company_id=${encodeURIComponent(companyId)}`),
  submitFeedback:  async (payload: Record<string, any>)        => apiFetch<any>("/agent-risk/api/v1/feedback", { method: "POST", body: JSON.stringify(payload) }),
  getModelStatus:  async (companyId: string)                   => apiFetch<any>(`/agent-risk/api/v1/models/status?company_id=${encodeURIComponent(companyId)}`),
  retrainModel:    async (companyId: string)                   => apiFetch<any>("/agent-risk/api/v1/models/retrain", { method: "POST", body: JSON.stringify({ company_id: companyId }) }),
  getEvents: async (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return apiFetch<any>(`/events?${qs.toString()}`);
  },
  getVendorHistoryConfig: async (companyId: string)            => apiFetch<any>(`/agent-risk/api/v1/vendor-history/config?company_id=${encodeURIComponent(companyId)}`),
  updateVendorHistoryConfig: async (payload: Record<string, any>) => apiFetch<any>("/agent-risk/api/v1/vendor-history/config", { method: "PUT", body: JSON.stringify(payload) }),
  testVendorHistoryConnection: async (payload: Record<string, any>) => apiFetch<any>("/agent-risk/api/v1/vendor-history/test", { method: "POST", body: JSON.stringify(payload) }),
  syncVendorHistory: async (companyId: string)                => apiFetch<any>("/agent-risk/api/v1/vendor-history/sync", { method: "POST", body: JSON.stringify({ company_id: companyId }) }),
  getCleaningLogs: async (companyId: string)                   => apiFetch<any>(`/agent-risk/api/v1/cleaning-logs?company_id=${encodeURIComponent(companyId)}`),
  getConfig:       async (companyId: string)                   => apiFetch<any>(`/agent-risk/api/v1/config?company_id=${encodeURIComponent(companyId)}`),
  updateConfig:    async (companyId: string, payload: Record<string, any>) => apiFetch<any>(`/agent-risk/api/v1/config?company_id=${encodeURIComponent(companyId)}`, { method: "PUT", body: JSON.stringify(payload) }),
};
export type DefectiveStatus =
  | "REPORTED"
  | "UNDER_REVIEW"
  | "AWAITING_VENDOR"
  | "RESOLUTION_IN_PROGRESS"
  | "RESOLVED"
  | "REJECTED";

export interface DefectiveItem {
  id: number;
  po_id: number;
  po_number: string;
  vendor_id?: number;
  vendor_name: string;
  item_name: string;
  ordered_quantity: number;
  defective_quantity: number;
  defect_type: string;
  description?: string;
  inspection_date: string;
  evidence_photo_url?: string;
  status: string;
  resolution_notes?: string;
  reported_by?: string;
  created_at: string;
  updated_at: string;
}

export interface DefectiveStats {
  total_reports: number;
  total_defective_units: number;
  quarantine_units: number;
  pending_resolution: number;
  resolved: number;
  rejected: number;
}

export interface CreateDefectivePayload {
  po_id: number;
  po_number?: string;
  vendor_id?: number;
  vendor_name?: string;
  item_name?: string;
  ordered_quantity?: number;
  defective_quantity: number;
  defect_type: string;
  description?: string;
  inspection_date?: string;
  evidence_photo_url?: string;
  reported_by?: string;
}

export interface UpdateDefectiveStatusPayload {
  status: string;
  resolution_notes?: string;
  performed_by?: string;
}

export const defectiveApi = {
  getItems: async (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>);
    return apiFetch<{ defective_items: DefectiveItem[]; total: number; stats: DefectiveStats }>(`/defective-items?${qs.toString()}`);
  },
  getSummary: async () => apiFetch<{ stats: DefectiveStats }>("/defective-items/summary"),
  getItem: async (id: number) => apiFetch<DefectiveItem>(`/defective-items/${id}`),
  create: async (payload: CreateDefectivePayload) =>
    apiFetch<DefectiveItem>("/defective-items", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStatus: async (id: number, payload: UpdateDefectiveStatusPayload) =>
    apiFetch<DefectiveItem>(`/defective-items/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  delete: async (id: number) =>
    apiFetch<{ message: string }>(`/defective-items/${id}`, {
      method: "DELETE",
    }),
};

export default API_BASE;
