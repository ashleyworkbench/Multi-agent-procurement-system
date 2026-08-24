from sqlalchemy.orm import Session

from . import models, schemas


# ============================================================
# Create Procurement Request
# ============================================================

def create_procurement_request(
    db: Session,
    data: schemas.ProcurementExtraction
):
    """
    Saves one procurement request and all extracted items.

    IMPORTANT:
    total_estimated_cost comes directly from the validated
    LLM extraction.

    It is NOT recalculated from individual item costs.

    This is intentional because the final invoice total may
    include:

        - GST / taxes
        - discounts
        - shipping charges
        - handling charges
        - rounding
        - other invoice-level charges

    Therefore:

        item total != necessarily final invoice total
    """

    try:

        # ----------------------------------------------------
        # Create Main Procurement Request
        # ----------------------------------------------------

        db_request = models.ProcurementRequest(

            requester_name=data.requester_name,

            address=data.address,

            phone_number=data.phone_number,

            # IMPORTANT:
            # Store the final invoice total extracted by
            # Groq/Gemini directly.
            total_estimated_cost=(
                data.total_estimated_cost
            )
        )

        db.add(db_request)

        # ----------------------------------------------------
        # Get generated request ID before adding items
        # ----------------------------------------------------

        db.flush()

        # ----------------------------------------------------
        # Save Extracted Items
        # ----------------------------------------------------

        for item in data.items:

            db_item = models.ProcurementItem(

                request_id=db_request.id,

                description=item.description,

                quantity=item.quantity,

                # This is the cost of THIS ITEM only.
                estimated_cost=item.estimated_cost
            )

            db.add(db_item)

        # ----------------------------------------------------
        # Commit Everything Together
        # ----------------------------------------------------

        db.commit()

        db.refresh(db_request)

        return db_request

    except Exception:

        # ----------------------------------------------------
        # Rollback if anything fails
        # ----------------------------------------------------

        db.rollback()

        raise


# ============================================================
# Create Document Processing Record
# ============================================================

def create_document_processing(
    db: Session,
    filename: str,
    file_path: str
):
    """
    Creates a tracking record when an invoice is uploaded.
    """

    processing = models.DocumentProcessing(

        filename=filename,

        file_path=file_path,

        status="queued",

        # ----------------------------------------------------
        # MinIO
        # ----------------------------------------------------

        minio_status="pending",

        minio_object_name=None,

        # ----------------------------------------------------
        # Processing stages
        # ----------------------------------------------------

        ocr_status="pending",

        docling_status="pending",

        gemini_status="pending"
    )

    db.add(processing)

    db.commit()

    db.refresh(processing)

    return processing


# ============================================================
# Update MinIO Status
# ============================================================

def update_minio_status(
    db: Session,
    processing_id: int,
    status: str,
    object_name: str = None
):
    """
    Updates MinIO storage status and object name.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.minio_status = status

        if object_name is not None:

            processing.minio_object_name = (
                object_name
            )

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Get Document Processing
# ============================================================

def get_document_processing(
    db: Session,
    processing_id: int
):
    """
    Retrieves a document processing record by ID.
    """

    return (
        db.query(
            models.DocumentProcessing
        )
        .filter(
            models.DocumentProcessing.id
            == processing_id
        )
        .first()
    )


# ============================================================
# Update Overall Processing Status
# ============================================================

def update_processing_status(
    db: Session,
    processing_id: int,
    status: str
):
    """
    Updates the overall document processing status.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.status = status

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Update OCR Status
# ============================================================

def update_ocr_status(
    db: Session,
    processing_id: int,
    status: str,
    ocr_text: str = None
):
    """
    Updates OCR processing status and optionally stores
    extracted OCR text.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.ocr_status = status

        if ocr_text is not None:

            processing.ocr_text = ocr_text

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Update Docling Status
# ============================================================

def update_docling_status(
    db: Session,
    processing_id: int,
    status: str
):
    """
    Updates Docling document-structure processing status.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.docling_status = status

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Update Gemini / LLM Status
# ============================================================

def update_gemini_status(
    db: Session,
    processing_id: int,
    status: str,
    structured_data: dict = None
):
    """
    Updates LLM processing status and optionally stores
    the structured extraction result.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.gemini_status = status

        if structured_data is not None:

            processing.structured_data = (
                structured_data
            )

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Save Processing Result
# ============================================================

def save_processing_result(
    db: Session,
    processing_id: int,
    ocr_text: str,
    structured_data: dict,
    request_id: int
):
    """
    Saves the final successful document-processing result.

    Docling status is preserved if it actually failed.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.status = "completed"

        processing.ocr_status = "completed"

        # ----------------------------------------------------
        # Do not blindly overwrite a real Docling failure.
        # ----------------------------------------------------

        if processing.docling_status == "processing":

            processing.docling_status = "completed"

        processing.gemini_status = "completed"

        processing.ocr_text = ocr_text

        processing.structured_data = structured_data

        processing.request_id = request_id

        processing.error_message = None

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Save Processing Error
# ============================================================

def save_processing_error(
    db: Session,
    processing_id: int,
    error_message: str
):
    """
    Marks document processing as failed and stores
    the error message.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if processing:

        processing.status = "failed"

        processing.error_message = (
            error_message
        )

        db.commit()

        db.refresh(processing)

    return processing


# ============================================================
# Get All Document Processing Records
# ============================================================

def get_all_document_processing(
    db: Session
):
    """
    Returns all document-processing records,
    newest first.
    """

    return (
        db.query(
            models.DocumentProcessing
        )
        .order_by(
            models.DocumentProcessing.created_at.desc()
        )
        .all()
    )


# ============================================================
# Delete Document Processing Record
# ============================================================

def delete_document_processing(
    db: Session,
    processing_id: int
):
    """
    Deletes a document-processing record.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if not processing:

        return None

    db.delete(processing)

    db.commit()

    return processing


# ============================================================
# Reset Document For Reprocessing
# ============================================================

def reset_document_processing(
    db: Session,
    processing_id: int
):
    """
    Resets OCR, Docling, and LLM processing.

    IMPORTANT:
    The MinIO document is retained because it is the original
    source document and can be reused for reprocessing.
    """

    processing = get_document_processing(
        db,
        processing_id
    )

    if not processing:

        return None

    # --------------------------------------------------------
    # Overall status
    # --------------------------------------------------------

    processing.status = "queued"

    # --------------------------------------------------------
    # MinIO
    #
    # Keep the existing MinIO object.
    # --------------------------------------------------------

    if processing.minio_object_name:

        processing.minio_status = "completed"

    else:

        processing.minio_status = "pending"

    # --------------------------------------------------------
    # Processing stages
    # --------------------------------------------------------

    processing.ocr_status = "pending"

    processing.docling_status = "pending"

    processing.gemini_status = "pending"

    # --------------------------------------------------------
    # Previous results
    # --------------------------------------------------------

    processing.ocr_text = None

    processing.structured_data = None

    processing.request_id = None

    processing.error_message = None

    # --------------------------------------------------------
    # Save reset state
    # --------------------------------------------------------

    db.commit()

    db.refresh(processing)

    return processing