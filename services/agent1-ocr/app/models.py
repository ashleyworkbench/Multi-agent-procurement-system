from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    TIMESTAMP,
    ForeignKey,
    Text,
    JSON,
    text
)

from sqlalchemy.orm import relationship

from .database import Base


# ============================================================
# Procurement Request
# ============================================================

class ProcurementRequest(Base):
    __tablename__ = "procurement_requests"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    requester_name = Column(
        String(255),
        nullable=False
    )

    address = Column(
        String(500),
        nullable=True
    )

    phone_number = Column(
        String(50),
        nullable=True
    )

    # IMPORTANT:
    # This is the FINAL invoice total extracted by Groq/Gemini.
    #
    # It may include:
    # - GST / taxes
    # - discounts
    # - shipping charges
    # - other invoice-level charges
    # - rounding
    #
    # It must NOT be recalculated from item costs.
    total_estimated_cost = Column(
        Numeric(12, 2),
        nullable=False
    )

    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )

    items = relationship(
        "ProcurementItem",
        back_populates="request",
        cascade="all, delete-orphan"
    )


# ============================================================
# Procurement Items
# ============================================================

class ProcurementItem(Base):
    __tablename__ = "procurement_request_items"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    request_id = Column(
        Integer,
        ForeignKey(
            "procurement_requests.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    description = Column(
        String(255),
        nullable=False
    )

    quantity = Column(
        Integer,
        nullable=False
    )

    # Cost of this individual item.
    #
    # IMPORTANT:
    # This is NOT necessarily the final invoice total.
    estimated_cost = Column(
        Numeric(12, 2),
        nullable=False
    )

    request = relationship(
        "ProcurementRequest",
        back_populates="items"
    )


# ============================================================
# Document Processing
# ============================================================

class DocumentProcessing(Base):
    __tablename__ = "document_processing"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    filename = Column(
        String(255),
        nullable=False
    )

    # --------------------------------------------------------
    # MinIO
    # --------------------------------------------------------

    minio_status = Column(
        String(50),
        nullable=False,
        default="pending"
    )

    minio_object_name = Column(
        String(500),
        nullable=True
    )

    # --------------------------------------------------------
    # Original file information
    # --------------------------------------------------------

    file_path = Column(
        String(500),
        nullable=False
    )

    # --------------------------------------------------------
    # Processing status
    # --------------------------------------------------------

    status = Column(
        String(50),
        nullable=False,
        default="queued"
    )

    ocr_status = Column(
        String(50),
        nullable=False,
        default="pending"
    )

    docling_status = Column(
        String(50),
        nullable=False,
        default="pending"
    )

    gemini_status = Column(
        String(50),
        nullable=False,
        default="pending"
    )

    # --------------------------------------------------------
    # Extracted data
    # --------------------------------------------------------

    ocr_text = Column(
        Text,
        nullable=True
    )

    structured_data = Column(
        JSON,
        nullable=True
    )

    # --------------------------------------------------------
    # Link to procurement request
    # --------------------------------------------------------

    request_id = Column(
        Integer,
        ForeignKey(
            "procurement_requests.id"
        ),
        nullable=True
    )

    # --------------------------------------------------------
    # Error tracking
    # --------------------------------------------------------

    error_message = Column(
        Text,
        nullable=True
    )

    # --------------------------------------------------------
    # Timestamps
    # --------------------------------------------------------

    created_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )

    updated_at = Column(
        TIMESTAMP,
        server_default=text("CURRENT_TIMESTAMP")
    )