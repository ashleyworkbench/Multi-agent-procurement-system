from fastapi import (
    FastAPI,
    UploadFile,
    File,
    HTTPException,
    Depends
)

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import os

from .database import SessionLocal, init_db
from . import crud, schemas
from .kafka_producer import publish_to_invoice_topic, publish_invoice_event
from .minio_client import (
    ensure_bucket_exists,
    upload_file
)


# ============================================================
# FastAPI Application
# ============================================================

app = FastAPI(
    title="Agentic AI Smart Procurement API",
    description="Backend API for Smart Procurement",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ============================================================
# Database Dependency
# ============================================================

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


# ============================================================
# Startup
# ============================================================

@app.on_event("startup")
def startup_event():
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create tables
    init_db()
    try:
        ensure_bucket_exists()
        print("MinIO connection initialized successfully.")
    except Exception as e:
        print(f"WARNING: MinIO initialization failed: {e}")
    
    # Start Kafka consumer as background thread
    try:
        from .kafka_consumer import start_consumer_thread
        start_consumer_thread()
        print("Kafka consumer thread initialization requested.")
    except Exception as e:
        print(f"ERROR: Failed to start Kafka consumer thread: {e}")
        import traceback
        traceback.print_exc()


@app.get("/health")
def health():
    return {"status": "ok", "service": "agent1-ocr"}


# ============================================================
# Home
# ============================================================

@app.get("/")
def home():
    return {
        "message":
            "Agentic AI Smart Procurement Backend Running Successfully!",
        "status":
            "online"
    }


# ============================================================
# Upload Invoice
# ============================================================

@app.post("/upload")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    processing = None

    try:

        # ----------------------------------------------------
        # Validate filename
        # ----------------------------------------------------

        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="No file provided"
            )


        # ----------------------------------------------------
        # Validate file type
        # ----------------------------------------------------

        allowed_extensions = {
            ".pdf",
            ".png",
            ".jpg",
            ".jpeg"
        }

        file_extension = os.path.splitext(
            file.filename
        )[1].lower()

        if file_extension not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Only PDF, PNG, JPG, and JPEG "
                    "files are allowed"
                )
            )


        # ----------------------------------------------------
        # Read uploaded file
        # ----------------------------------------------------

        file_data = await file.read()

        if not file_data:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty"
            )


        # ----------------------------------------------------
        # Create processing record
        #
        # We create it first because the processing ID is used
        # in the MinIO object name.
        # ----------------------------------------------------

        processing = crud.create_document_processing(
            db=db,
            filename=file.filename,
            file_path=""
        )


        # ----------------------------------------------------
        # Create MinIO object name
        # ----------------------------------------------------

        object_name = (
            f"invoices/"
            f"{processing.id}_"
            f"{file.filename}"
        )


        # ----------------------------------------------------
        # Upload original document to MinIO
        # ----------------------------------------------------

        try:

            upload_file(
                file_data=file_data,
                object_name=object_name,
                content_type=(
                    file.content_type
                    or "application/octet-stream"
                )
            )

        except Exception as minio_error:

            # Record MinIO failure in PostgreSQL
            try:
                crud.update_minio_status(
                    db=db,
                    processing_id=processing.id,
                    status="failed",
                    object_name=None
                )
            except Exception:
                db.rollback()

            raise HTTPException(
                status_code=500,
                detail=(
                    f"MinIO upload failed: {str(minio_error)}"
                )
            )


        # ----------------------------------------------------
        # Update MinIO tracking information
        # ----------------------------------------------------

        processing.file_path = object_name

        # This requires update_minio_status() in crud.py.
        crud.update_minio_status(
            db=db,
            processing_id=processing.id,
            status="completed",
            object_name=object_name
        )

        # Refresh after the CRUD update
        processing = crud.get_document_processing(
            db=db,
            processing_id=processing.id
        )


        # ----------------------------------------------------
        # Publish Kafka event (non-blocking — file is safe in MinIO regardless)
        kafka_event = {}
        try:
            kafka_event = publish_to_invoice_topic(
                processing_id=processing.id,
                filename=file.filename,
                file_path=object_name
            )
        except Exception as kafka_error:
            print(f"WARNING: Kafka publish failed (file still saved): {kafka_error}")


        # ----------------------------------------------------
        # Response
        # ----------------------------------------------------

        return {
            "message":
                "Invoice uploaded to MinIO and queued for processing",

            "processing_id":
                processing.id,

            "filename":
                file.filename,

            "status":
                "queued",

            "minio_status":
                processing.minio_status,

            "storage":
                "MinIO",

            "bucket":
                "procurement-documents",

            "minio_object_name":
                processing.minio_object_name,

            "object_name":
                object_name,

            "kafka_topic":
                "invoice-topic",

            "event":
                kafka_event
        }


    except HTTPException:
        raise


    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                f"Invoice upload failed: {str(e)}"
            )
        )


# ============================================================
# Get Processing Status / Result
# ============================================================

@app.get(
    "/processing/{processing_id}",
    response_model=schemas.DocumentProcessingResponse
)
def get_processing_result(
    processing_id: int,
    db: Session = Depends(get_db)
):

    processing = crud.get_document_processing(
        db,
        processing_id
    )

    if not processing:
        raise HTTPException(
            status_code=404,
            detail="Processing record not found"
        )

    return processing


# ============================================================
# Document History
# ============================================================

@app.get("/documents")
def get_documents(
    db: Session = Depends(get_db)
):

    documents = crud.get_all_document_processing(db)

    return [
        {
            "id": document.id,
            "filename": document.filename,
            "file_path": document.file_path,

            "minio_status": document.minio_status,
            "minio_object_name": document.minio_object_name,

            "status": document.status,
            "ocr_status": document.ocr_status,
            "docling_status": document.docling_status,
            "gemini_status": document.gemini_status,

            "request_id": document.request_id,
            "created_at": document.created_at,
            "error_message": document.error_message
        }
        for document in documents
    ]


# ============================================================
# View Document Details
# ============================================================

@app.get("/documents/{processing_id}")
def get_document_details(
    processing_id: int,
    db: Session = Depends(get_db)
):

    document = crud.get_document_processing(
        db,
        processing_id
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    return {
        "id":
            document.id,

        "filename":
            document.filename,

        "file_path":
            document.file_path,

        "minio_status":
            document.minio_status,

        "minio_object_name":
            document.minio_object_name,

        "status":
            document.status,

        "ocr_status":
            document.ocr_status,

        "docling_status":
            document.docling_status,

        "gemini_status":
            document.gemini_status,

        "ocr_text":
            document.ocr_text,

        "structured_data":
            document.structured_data,

        "request_id":
            document.request_id,

        "error_message":
            document.error_message,

        "created_at":
            document.created_at,

        "updated_at":
            document.updated_at
    }


# ============================================================
# Delete Document
# ============================================================

@app.delete("/documents/{processing_id}")
def delete_document(
    processing_id: int,
    db: Session = Depends(get_db)
):

    document = crud.get_document_processing(
        db,
        processing_id
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )

    deleted = crud.delete_document_processing(
        db,
        processing_id
    )

    return {
        "message":
            "Document deleted successfully",

        "processing_id":
            deleted.id,

        "filename":
            deleted.filename
    }


# ============================================================
# Reprocess Document
# ============================================================

@app.post("/documents/{processing_id}/reprocess")
def reprocess_document(
    processing_id: int,
    db: Session = Depends(get_db)
):

    document = crud.get_document_processing(
        db,
        processing_id
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )


    # --------------------------------------------------------
    # Keep the existing MinIO object information
    # --------------------------------------------------------

    object_name = (
        document.minio_object_name
        or document.file_path
    )

    if not object_name:
        raise HTTPException(
            status_code=404,
            detail="Original document not found in MinIO"
        )


    # --------------------------------------------------------
    # Reset processing information
    # --------------------------------------------------------

    processing = crud.reset_document_processing(
        db,
        processing_id
    )

    if not processing:
        raise HTTPException(
            status_code=404,
            detail="Document not found"
        )


    # --------------------------------------------------------
    # MinIO object already exists.
    # Keep it marked as completed.
    # --------------------------------------------------------

    processing.file_path = object_name

    crud.update_minio_status(
        db=db,
        processing_id=processing.id,
        status="completed",
        object_name=object_name
    )

    processing = crud.get_document_processing(
        db=db,
        processing_id=processing.id
    )


    # --------------------------------------------------------
    # Publish document to Kafka again
    # --------------------------------------------------------

    try:

        kafka_event = publish_to_invoice_topic(
            processing_id=processing.id,
            filename=processing.filename,
            file_path=object_name
        )

    except Exception as kafka_error:

        crud.update_processing_status(
            db=db,
            processing_id=processing.id,
            status="failed"
        )

        raise HTTPException(
            status_code=500,
            detail=(
                f"Kafka event publishing failed: "
                f"{str(kafka_error)}"
            )
        )


    return {
        "message":
            "Document queued for reprocessing",

        "processing_id":
            processing.id,

        "filename":
            processing.filename,

        "status":
            "queued",

        "minio_status":
            processing.minio_status,

        "storage":
            "MinIO",

        "bucket":
            "procurement-documents",

        "minio_object_name":
            processing.minio_object_name,

        "object_name":
            object_name,

        "kafka_topic":
            "invoice-topic",

        "event":
            kafka_event
    }