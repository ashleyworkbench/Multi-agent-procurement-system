from pydantic import BaseModel
from typing import List, Optional, Dict, Any


# ============================================================
# Procurement Item
# ============================================================

class ProcurementItem(BaseModel):
    description: str
    quantity: int
    estimated_cost: float


# ============================================================
# LLM Extraction
# ============================================================

class ProcurementExtraction(BaseModel):
    requester_name: str

    address: Optional[str] = None

    phone_number: Optional[str] = None

    items: List[ProcurementItem]

    # IMPORTANT:
    # This represents the FINAL invoice total/payable amount.
    # It may include GST, taxes, discounts, shipping charges,
    # rounding, or other invoice-level adjustments.
    total_estimated_cost: float


# ============================================================
# Procurement Item Response
# ============================================================

class ProcurementItemResponse(ProcurementItem):
    id: int

    class Config:
        from_attributes = True


# ============================================================
# Procurement Request Response
# ============================================================

class ProcurementRequestResponse(BaseModel):
    id: int

    requester_name: str

    address: Optional[str] = None

    phone_number: Optional[str] = None

    # FINAL invoice amount
    total_estimated_cost: float

    items: List[ProcurementItemResponse]

    class Config:
        from_attributes = True


# ============================================================
# Document Processing Response
# ============================================================

class DocumentProcessingResponse(BaseModel):
    id: int

    filename: str

    # --------------------------------------------------------
    # MinIO
    # --------------------------------------------------------

    minio_status: str

    minio_object_name: Optional[str] = None

    # --------------------------------------------------------
    # Processing Status
    # --------------------------------------------------------

    status: str

    ocr_status: str

    docling_status: str

    gemini_status: str

    # --------------------------------------------------------
    # Extracted Data
    # --------------------------------------------------------

    ocr_text: Optional[str] = None

    structured_data: Optional[Dict[str, Any]] = None

    request_id: Optional[int] = None

    error_message: Optional[str] = None

    class Config:
        from_attributes = True