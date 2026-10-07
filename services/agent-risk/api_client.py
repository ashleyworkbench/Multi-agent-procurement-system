"""
API Integration for Vendor History
Follows the existing Inventory Agent's API integration pattern:
- Async HTTP via httpx with timeouts and error handling
- API Key / Bearer authentication headers
- Pluggable provider architecture (Dummy API initially, Company REST API later)
- Never hardcodes raw datasets directly into ML/cleaning pipelines
"""

import os
import logging
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import httpx

from config import GATEWAY_URL, GATEWAY_KEY

log = logging.getLogger("agent-risk.api_client")


class BaseVendorHistoryProvider(ABC):
    """Abstract interface for fetching vendor history."""

    @abstractmethod
    async def fetch_vendor_history(
        self, company_id: str, vendor_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch historical vendor transactions and performance records."""
        pass

    @abstractmethod
    async def test_connection(self, company_id: str) -> None:
        """Verify authentication and endpoint reachability without ingesting records."""
        pass

    @abstractmethod
    async def fetch_vendor_master(self, company_id: str) -> List[Dict[str, Any]]:
        """Fetch the stable company vendor master through the configured API."""
        pass


class DummyDatasetAPIClient(BaseVendorHistoryProvider):
    """
    Client for the seeded development company via Vendor Service and Gateway.
    The CSV is never read by this runtime client.
    """

    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None):
        self.base_url = (base_url or os.getenv("DUMMY_API_URL") or GATEWAY_URL).rstrip("/")
        self.api_key = api_key or GATEWAY_KEY

    async def test_connection(self, company_id: str) -> None:
        url = f"{self.base_url}/vendor-performance/health"
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                url,
                params={"industry": company_id},
                headers={"X-API-KEY": self.api_key, "Accept": "application/json"},
            )
            response.raise_for_status()

    async def fetch_vendor_master(self, company_id: str) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/vendor-performance/vendors"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                url,
                params={"industry": company_id},
                headers={"X-API-KEY": self.api_key, "Accept": "application/json"},
            )
            response.raise_for_status()
            data = response.json()
        vendors = data.get("vendors", []) if isinstance(data, dict) else data
        if not isinstance(vendors, list) or any(not isinstance(row, dict) for row in vendors):
            raise ValueError("Vendor master API must return a list of vendor objects.")
        return vendors

    async def fetch_vendor_history(
        self, company_id: str, vendor_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/vendor-performance/history"
        params = {"industry": company_id}
        if vendor_id:
            params["vendor_id"] = vendor_id

        headers = {
            "X-API-KEY": self.api_key,
            "Accept": "application/json",
            "User-Agent": "Agent-Risk-Analysis/1.0",
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception:
            log.exception("Dummy vendor-history API request failed for company '%s'.", company_id)
            raise

        if isinstance(data, dict):
            data = data.get("data") or data.get("items") or data.get("records")
        if not isinstance(data, list) or any(not isinstance(record, dict) for record in data):
            raise ValueError("Vendor performance API must return a list of record objects.")

        log.info("Fetched %s vendor history records via Gateway API from %s", len(data), url)
        return data


class CompanyRESTAPIClient(BaseVendorHistoryProvider):
    """
    Extensible REST Client for real enterprise company APIs (ERP, SAP, Oracle, etc.).
    Supports custom base URLs, auth types (API Key, Bearer Token), headers, and endpoints.
    """

    def __init__(
        self,
        endpoint_url: str,
        auth_type: str = "api_key",
        api_key: Optional[str] = None,
        bearer_token: Optional[str] = None,
        custom_headers: Optional[Dict[str, str]] = None,
        master_endpoint_url: Optional[str] = None,
    ):
        self.endpoint_url = endpoint_url
        self.auth_type = auth_type
        self.api_key = api_key
        self.bearer_token = bearer_token
        self.custom_headers = custom_headers or {}
        self.master_endpoint_url = master_endpoint_url

    def _auth_headers(self) -> Dict[str, str]:
        headers = {"Accept": "application/json", **self.custom_headers}
        if self.auth_type == "api_key" and self.api_key:
            headers["X-API-KEY"] = self.api_key
        elif self.auth_type == "bearer" and self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        return headers

    async def test_connection(self, company_id: str) -> None:
        if self.auth_type not in {"api_key", "bearer", "none"}:
            raise ValueError("Unsupported vendor API authentication type.")
        if self.auth_type == "api_key" and not self.api_key:
            raise ValueError("API key authentication is selected but no key is configured.")
        if self.auth_type == "bearer" and not self.bearer_token:
            raise ValueError("Bearer authentication is selected but no token is configured.")

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                self.endpoint_url,
                params={"company_id": company_id},
                headers=self._auth_headers(),
            )
            response.raise_for_status()
            if self.master_endpoint_url:
                master_response = await client.get(
                    self.master_endpoint_url,
                    params={"company_id": company_id},
                    headers=self._auth_headers(),
                )
                master_response.raise_for_status()

    async def fetch_vendor_master(self, company_id: str) -> List[Dict[str, Any]]:
        endpoint = self.master_endpoint_url or self.endpoint_url
        params = {"company_id": company_id}
        if not self.master_endpoint_url:
            params["resource"] = "vendor_master"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(endpoint, params=params, headers=self._auth_headers())
            response.raise_for_status()
            data = response.json()
        if isinstance(data, dict):
            vendors = data.get("vendors") or data.get("vendor_master")
            if vendors is None and self.master_endpoint_url:
                vendors = data.get("data") or data.get("items") or data.get("records")
        else:
            vendors = data if self.master_endpoint_url else None
        if not isinstance(vendors, list) or any(not isinstance(row, dict) for row in vendors):
            raise ValueError("External API must provide vendor master records or a vendor master endpoint URL.")
        return vendors

    async def fetch_vendor_history(
        self, company_id: str, vendor_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        if self.auth_type not in {"api_key", "bearer", "none"}:
            raise ValueError("Unsupported vendor API authentication type.")
        if self.auth_type == "api_key" and not self.api_key:
            raise ValueError("API key authentication is selected but no key is configured.")
        if self.auth_type == "bearer" and not self.bearer_token:
            raise ValueError("Bearer authentication is selected but no token is configured.")

        params = {"company_id": company_id}
        if vendor_id:
            params["vendor_id"] = vendor_id

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(self.endpoint_url, params=params, headers=self._auth_headers())
            resp.raise_for_status()
            data = resp.json()
            # Normalize list response if wrapped in {"data": [...]} or {"items": [...]}
            if isinstance(data, dict):
                data = data.get("data") or data.get("items") or data.get("records") or [data]
            if not isinstance(data, list) or any(not isinstance(record, dict) for record in data):
                raise ValueError("Vendor history API must return a list of record objects.")
            log.info("Fetched %s vendor history records from configured API", len(data))
            return data


def get_vendor_history_provider(
    company_id: str, config: Optional[Dict[str, Any]] = None
) -> BaseVendorHistoryProvider:
    """
    Factory function returning the configured provider for a given company.
    Defaults to DummyDatasetAPIClient unless a real company API is configured.
    """
    if config and config.get("api_integration"):
        api_cfg = config["api_integration"]
        if api_cfg.get("mode") == "real_api" and api_cfg.get("endpoint_url"):
            return CompanyRESTAPIClient(
                endpoint_url=api_cfg["endpoint_url"],
                auth_type=api_cfg.get("auth_type", "api_key"),
                api_key=api_cfg.get("api_key"),
                bearer_token=api_cfg.get("bearer_token"),
                custom_headers=api_cfg.get("headers"),
                master_endpoint_url=api_cfg.get("master_endpoint_url"),
            )
        if api_cfg.get("mode") == "dummy":
            return DummyDatasetAPIClient(api_key=api_cfg.get("api_key"))

    return DummyDatasetAPIClient()
