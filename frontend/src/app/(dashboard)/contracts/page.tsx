"use client";

import { useEffect, useState } from "react";
import { FileSignature, Eye, Download, RefreshCw } from "lucide-react";
import { procurementApi } from "@/lib/api";

interface Contract {
  id: number;
  po_number: string;
  request_id: number;
  vendor_id: number;
  vendor_name: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  currency: string;
  status: string;
  delivery_date_expected: string | null;
  docusign_envelope_id: string | null;
  docusign_status: string;
  signed_document_url: string;
  updated_at: string;
}

export default function Page() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadContracts = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await procurementApi.getContracts();
      setContracts(data.contracts || []);
    } catch (err) {
      console.error("Failed to load contracts:", err);
      setError("Failed to load signed contracts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  const formatCurrency = (value: number, currency: string) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    return new Date(value).toLocaleDateString("en-IN");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSignature size={22} className="text-brand-600" />
            <h1 className="text-2xl font-bold text-slate-900">
              Contracts
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Signed purchase order documents stored in MinIO.
          </p>
        </div>

        <button
          onClick={loadContracts}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading signed contracts...
        </div>
      )}

      {/* Empty */}
      {!loading && !error && contracts.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <FileSignature
            size={40}
            className="mx-auto text-slate-300 mb-3"
          />
          <h2 className="text-lg font-semibold text-slate-700">
            No signed contracts
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Signed documents will appear here after a purchase order is
            completed through DocuSign.
          </p>
        </div>
      )}

      {/* Contracts table */}
      {!loading && contracts.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">
                Signed Documents
              </h2>
              <span className="text-sm text-slate-500">
                {contracts.length} contract{contracts.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">
                    PO Number
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">
                    Vendor
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">
                    Item
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">
                    Quantity
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">
                    Total
                  </th>
                  <th className="text-center px-5 py-3 font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">
                    Signed On
                  </th>
                  <th className="text-right px-5 py-3 font-semibold text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {contracts.map((contract) => (
                  <tr
                    key={contract.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {contract.po_number}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {contract.vendor_name}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {contract.item_name}
                    </td>

                    <td className="px-5 py-4 text-right text-slate-700">
                      {contract.quantity.toLocaleString("en-IN")}
                    </td>

                    <td className="px-5 py-4 text-right font-medium text-slate-900">
                      {formatCurrency(
                        contract.total_price,
                        contract.currency
                      )}
                    </td>

                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                        {contract.docusign_status}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(contract.updated_at)}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <a
                          href={procurementApi.getPO_PDF_Url(contract.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Eye size={14} />
                          View
                        </a>

                        <a
                          href={procurementApi.getPO_Download_Url(contract.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
