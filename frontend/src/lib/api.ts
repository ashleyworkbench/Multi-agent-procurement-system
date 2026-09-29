import axios from "axios";

export const INDUSTRIES = ["construction", "pharma", "manufacturing", "electronics"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const INDUSTRY_API_KEYS: Record<Industry, string> = {
  construction:  "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567",
  pharma:        "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456",
  manufacturing: "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345",
  electronics:   "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234",
};

export const GATEWAY_KEY = "GATEWAY-master-key-2024";
export const OCR_SERVICE_KEY = "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123";
export const PROCUREMENT_KEY = "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012";

const GATEWAY_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const OCR_URL = process.env.NEXT_PUBLIC_OCR_URL || "http://localhost:8001";
const PROCUREMENT_URL = process.env.NEXT_PUBLIC_PROCUREMENT_URL || "http://localhost:8004";
const AGENT2_URL = process.env.NEXT_PUBLIC_AGENT2_URL || "http://localhost:8005";
const AGENT3_URL = process.env.NEXT_PUBLIC_AGENT3_URL || "http://localhost:8006";
const AGENT4_URL = process.env.NEXT_PUBLIC_AGENT4_URL || "http://localhost:8008";
const ONBOARDING_URL = process.env.NEXT_PUBLIC_ONBOARDING_URL || "http://localhost:8007";

// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// Auth & Roles
// ----------------------------------------------------------------------
export type UserRole =
  | "Admin"
  | "Procurement Officer"
  | "Operations Manager"
  | "Finance Director"
  | string;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("procureflow_token");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("procureflow_user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await axios.post(`${GATEWAY_URL}/auth/login`, {
      email,
      password,
    });
    if (res.data?.access_token) {
      if (typeof window !== "undefined") {
        localStorage.setItem("procureflow_token", res.data.access_token);
        localStorage.setItem("procureflow_user", JSON.stringify(res.data.user));
      }
    }
    return res.data;
  },
  me: async (): Promise<AuthUser> => {
    const token = getStoredToken();
    if (!token) throw new Error("No authentication token found");
    const res = await axios.get(`${GATEWAY_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.data && typeof window !== "undefined") {
      localStorage.setItem("procureflow_user", JSON.stringify(res.data));
    }
    return res.data;
  },
  logout: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("procureflow_token");
      localStorage.removeItem("procureflow_user");
    }
  },
};

// OCR Service API (Port 8001 / Requests)
// ----------------------------------------------------------------------
export const ocrApi = {
  getRequests: async () => {
    const res = await axios.get(`${OCR_URL}/requests`, {
      headers: { "X-API-KEY": OCR_SERVICE_KEY },
    });
    return res.data;
  },
  getProcurementRequests: async () => {
    const res = await axios.get(`${OCR_URL}/requests`, {
      headers: { "X-API-KEY": OCR_SERVICE_KEY },
    });
    return res.data;
  },
  getRequest: async (id: number) => {
    const res = await axios.get(`${OCR_URL}/requests/${id}`, {
      headers: { "X-API-KEY": OCR_SERVICE_KEY },
    });
    return res.data;
  },
  getRequestItems: async (id: number) => {
    const res = await axios.get(`${OCR_URL}/requests/${id}/items`, {
      headers: { "X-API-KEY": OCR_SERVICE_KEY },
    });
    return res.data;
  },
  deleteRequest: async (id: number) => {
    try {
      const res = await axios.delete(`${GATEWAY_URL}/ocr/requests/${id}`);
      return res.data;
    } catch {
      const res = await axios.delete(`${OCR_URL}/requests/${id}`, {
        headers: { "X-API-KEY": OCR_SERVICE_KEY },
      });
      return res.data;
    }
  },
  clearRequests: async () => {
    try {
      const res = await axios.delete(`${GATEWAY_URL}/ocr/requests`);
      return res.data;
    } catch {
      const res = await axios.delete(`${OCR_URL}/requests`, {
        headers: { "X-API-KEY": OCR_SERVICE_KEY },
      });
      return res.data;
    }
  },
  cancelDocument: async (processingId: number) => {
    const res = await axios.post(`${GATEWAY_URL}/agent1/documents/${processingId}/cancel`);
    return res.data;
  },
  deleteDocument: async (processingId: number) => {
    const res = await axios.delete(`${GATEWAY_URL}/agent1/documents/${processingId}`);
    return res.data;
  },
  clearDocuments: async () => {
    const res = await axios.delete(`${GATEWAY_URL}/agent1/documents`);
    return res.data;
  },
  getHealth: async () => {
    const res = await axios.get(`${OCR_URL}/health`);
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Inventory API (via Gateway :8000)
// ----------------------------------------------------------------------
export const inventoryApi = {
  getItems: async (industry: Industry) => {
    const res = await axios.get(`${GATEWAY_URL}/inventory/items`, {
      params: { industry },
      headers: { "X-API-KEY": GATEWAY_KEY },
    });
    return res.data;
  },
  getItem: async (industry: Industry, itemName: string) => {
    const res = await axios.get(`${GATEWAY_URL}/inventory/item/${encodeURIComponent(itemName)}`, {
      params: { industry },
      headers: { "X-API-KEY": GATEWAY_KEY },
    });
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Vendor API (via Gateway :8000)
// ----------------------------------------------------------------------
export const vendorApi = {
  getVendors: async (industry: Industry) => {
    const res = await axios.get(`${GATEWAY_URL}/vendors`, {
      params: { industry },
      headers: { "X-API-KEY": GATEWAY_KEY },
    });
    return res.data;
  },
  getVendor: async (industry: Industry, id: number) => {
    const res = await axios.get(`${GATEWAY_URL}/vendors/${id}`, {
      params: { industry },
      headers: { "X-API-KEY": GATEWAY_KEY },
    });
    return res.data;
  },
  getVendorsForItem: async (industry: Industry, itemName: string) => {
    const res = await axios.get(`${GATEWAY_URL}/vendors/item/${encodeURIComponent(itemName)}`, {
      params: { industry },
      headers: { "X-API-KEY": GATEWAY_KEY },
    });
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Procurement Service API (Port 8004)
// ----------------------------------------------------------------------
export const procurementApi = {
  getPOs: async (params?: {
    status?: string;
    request_id?: number;
    limit?: number;
    offset?: number;
    assigned_to_me?: boolean;
  }) => {
    const token = getStoredToken();
    const headers: Record<string, string> = { "X-API-KEY": PROCUREMENT_KEY };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.get(`${GATEWAY_URL}/procurement/po`, {
      params,
      headers,
    });
    return res.data;
  },
  getContracts: async (params?: { assigned_to_me?: boolean }) => {
    const token = getStoredToken();
    const headers: Record<string, string> = { "X-API-KEY": PROCUREMENT_KEY };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.get(`${GATEWAY_URL}/procurement/contracts`, {
      params,
      headers,
    });
    return res.data;
  },
  getPO: async (id: number) => {
    const token = getStoredToken();
    const headers: Record<string, string> = { "X-API-KEY": PROCUREMENT_KEY };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.get(`${PROCUREMENT_URL}/purchase-orders/${id}`, {
      headers,
    });
    return res.data;
  },
  getSummary: async () => {
    const res = await axios.get(`${PROCUREMENT_URL}/dashboard/summary`, {
      headers: { "X-API-KEY": PROCUREMENT_KEY },
    });
    return res.data;
  },
  updateStatus: async (id: number, data: { status: string; performed_by?: string; notes?: string }) => {
    const token = getStoredToken();
    const headers: Record<string, string> = { "X-API-KEY": PROCUREMENT_KEY };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.patch(`${GATEWAY_URL}/procurement/purchase-orders/${id}/status`, data, {
      headers,
    });
    return res.data;
  },
  getEvents: async (params?: { source_agent?: string; event_type?: string; limit?: number }) => {
    const res = await axios.get(`${PROCUREMENT_URL}/events`, {
      params,
      headers: { "X-API-KEY": PROCUREMENT_KEY },
    });
    return res.data;
  },
  getAgentLogs: async (params?: { source_agent?: string; event_type?: string; limit?: number }) => {
    const res = await axios.get(`${PROCUREMENT_URL}/agent-logs`, {
      params,
      headers: { "X-API-KEY": PROCUREMENT_KEY },
    });
    return {
      logs: res.data?.logs ?? res.data?.events ?? [],
      total: res.data?.total ?? res.data?.logs?.length ?? 0,
    };
  },
  getPO_PDF_Url: (id: number) => {
    const token = getStoredToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    return `${GATEWAY_URL}/procurement/purchase-orders/${id}/pdf?api_key=${PROCUREMENT_KEY}${tokenParam}`;
  },
  getPO_Download_Url: (id: number) => {
    const token = getStoredToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : "";
    return `${GATEWAY_URL}/procurement/purchase-orders/${id}/download?api_key=${PROCUREMENT_KEY}${tokenParam}`;
  },
  signPO: async (id: number, data: { signer_name: string; signer_email: string; signature_data?: string; notes?: string }) => {
    const token = getStoredToken();
    const headers: Record<string, string> = { "X-API-KEY": PROCUREMENT_KEY };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = await axios.post(`${GATEWAY_URL}/procurement/purchase-orders/${id}/sign`, data, {
      headers,
    });
    return res.data;
  },
  getApproverRules: async () => {
    const res = await axios.get(`${PROCUREMENT_URL}/rules/approvers`);
    return res.data;
  },
  deletePO: async (id: number) => {
    const res = await axios.delete(`${GATEWAY_URL}/procurement/purchase-orders/${id}`);
    return res.data;
  },
  clearPOs: async () => {
    const res = await axios.delete(`${GATEWAY_URL}/procurement/purchase-orders`);
    return res.data;
  },
  resetDemo: async () => {
    const res = await axios.post(`${GATEWAY_URL}/demo/reset`);
    return res.data;
  },
  getActivity: async () => {
    const res = await axios.get(`${PROCUREMENT_URL}/events`, {
      params: { limit: 10 },
      headers: { "X-API-KEY": PROCUREMENT_KEY },
    });
    return res.data;
  },
  getTopVendors: async () => {
    const res = await axios.get(`${PROCUREMENT_URL}/dashboard/summary`, {
      headers: { "X-API-KEY": PROCUREMENT_KEY },
    });
    return res.data?.top_vendors ?? [];
  },
};

// ----------------------------------------------------------------------
// Agent 2: Inventory Intelligence (:8005)
// ----------------------------------------------------------------------
export const agent2Api = {
  getHealth: async () => {
    const res = await axios.get(`${AGENT2_URL}/health`);
    return res.data;
  },
  getStatus: async () => {
    const res = await axios.get(`${AGENT2_URL}/status`);
    return res.data;
  },
  evaluate: async (requestId: number) => {
    const res = await axios.post(`${AGENT2_URL}/evaluate/${requestId}`);
    return res.data;
  },
  getResult: async (requestId: number) => {
    const res = await axios.get(`${AGENT2_URL}/evaluate/${requestId}/result`);
    return res.data;
  },
  trigger: async (requestId: number) => {
    const res = await axios.post(`${AGENT2_URL}/trigger`, { request_id: requestId });
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Agent 3: Vendor Intelligence (:8006)
// ----------------------------------------------------------------------
export const agent3Api = {
  getHealth: async () => {
    const res = await axios.get(`${AGENT3_URL}/health`);
    return res.data;
  },
  getStatus: async () => {
    const res = await axios.get(`${AGENT3_URL}/status`);
    return res.data;
  },
  recommend: async (inventoryEval: any) => {
    const res = await axios.post(`${AGENT3_URL}/recommend`, inventoryEval);
    return res.data;
  },
  getResult: async (requestId: number) => {
    const res = await axios.get(`${AGENT3_URL}/recommend/${requestId}/result`);
    return res.data;
  },
};

// ----------------------------------------------------------------------
// Agent 4: Procurement Execution (:8008)
// ----------------------------------------------------------------------
export const agent4Api = {
  getHealth: async () => {
    const res = await axios.get(`${AGENT4_URL}/health`);
    return res.data;
  },
  getStatus: async () => {
    const res = await axios.get(`${AGENT4_URL}/status`);
    return res.data;
  },
  process: async (vendorRec: any) => {
    const res = await axios.post(`${AGENT4_URL}/process`, vendorRec);
    return res.data;
  },
  getResult: async (requestId: number) => {
    return procurementApi.getPOs({ request_id: requestId });
  },
};

// ----------------------------------------------------------------------
// Onboarding Service API (:8007)
// ----------------------------------------------------------------------
export const onboardingApi = {
  getConnections: async () => {
    const res = await axios.get(`${ONBOARDING_URL}/connections`);
    return res.data;
  },
  connect: async (industry: string, dataType: string, apiKey: string) => {
    const res = await axios.post(`${ONBOARDING_URL}/connections/connect`, {
      industry,
      data_type: dataType,
      api_key: apiKey,
    });
    return res.data;
  },
  disconnect: async (industry: string, dataType: string) => {
    const res = await axios.delete(`${ONBOARDING_URL}/connections/disconnect`, {
      params: { industry, data_type: dataType },
    });
    return res.data;
  },
  upload: async (file: File, dataType: string, industry: string, displayName: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("data_type", dataType);
    form.append("industry", industry);
    form.append("display_name", displayName);
    const res = await axios.post(`${GATEWAY_URL}/onboarding/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120000,
    });
    return res.data;
  },
  getData: async (uploadId: string) => {
    const res = await axios.get(`${GATEWAY_URL}/onboarding/data/${uploadId}`);
    return res.data;
  },
  getUploads: async () => {
    const res = await axios.get(`${GATEWAY_URL}/onboarding/uploads`);
    return res.data;
  },
  deleteUpload: async (uploadId: string) => {
    const res = await axios.delete(`${GATEWAY_URL}/onboarding/uploads/${uploadId}`);
    return res.data;
  },
};
