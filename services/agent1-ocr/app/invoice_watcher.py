import os
import time
import hashlib
import logging
import threading
from pathlib import Path

from . import crud, models
from .database import SessionLocal
from .minio_client import upload_file
from .kafka_producer import publish_to_invoice_topic

log = logging.getLogger("invoice-watcher")

WATCH_FOLDER = "/app/invoices"
POLL_INTERVAL = 5

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg"}

processing_files = set()
processing_lock = threading.Lock()
watcher_thread = None


def wait_for_file_ready(file_path, retries=10, delay=1):
    """Wait until a file has a stable, non-zero size."""
    previous_size = -1

    for _ in range(retries):
        try:
            current_size = os.path.getsize(file_path)

            if current_size > 0 and current_size == previous_size:
                return True

            previous_size = current_size
        except OSError:
            previous_size = -1

        time.sleep(delay)

    return False


def calculate_fingerprint(file_data):
    """Calculate a SHA-256 fingerprint for the file contents."""
    return hashlib.sha256(file_data).hexdigest()


def get_content_type(file_name):
    extension = Path(file_name).suffix.lower()

    content_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }

    return content_types.get(
        extension, "application/octet-stream"
    )


def process_file(file_path):
    """Process a supported file once at a time within this process."""
    file_path = os.path.abspath(file_path)

    if not os.path.isfile(file_path):
        return

    if Path(file_path).suffix.lower() not in ALLOWED_EXTENSIONS:
        return

    with processing_lock:
        if file_path in processing_files:
            return
        processing_files.add(file_path)

    try:
        if not wait_for_file_ready(file_path):
            log.warning(
                "File is empty, unavailable, or still changing: %s",
                os.path.basename(file_path),
            )
            return

        process_invoice(file_path)

    except Exception:
        log.exception("Unexpected watcher error for %s", file_path)

    finally:
        with processing_lock:
            processing_files.discard(file_path)


def process_invoice(file_path):
    """Store the file in MinIO, publish it to Kafka, and track its state."""
    db = SessionLocal()
    processing_id = None
    file_name = os.path.basename(file_path)

    try:
        with open(file_path, "rb") as file_handle:
            file_data = file_handle.read()

        if not file_data:
            log.warning("Skipping empty invoice: %s", file_name)
            return

        fingerprint = calculate_fingerprint(file_data)

        tracking = (
            db.query(models.FolderInvoiceFile)
            .filter(models.FolderInvoiceFile.file_path == file_path)
            .with_for_update()
            .first()
        )

        if tracking and tracking.fingerprint == fingerprint:
            if tracking.status == "completed":
                log.debug("Already queued; skipping %s", file_name)
                return

            # Retry a previous attempt using its original processing record.
            processing_id = tracking.processing_id

        elif tracking:
            # Same path, changed contents: treat as a new invoice version.
            tracking.fingerprint = fingerprint
            tracking.status = "processing"
            tracking.processing_id = None
            tracking.error_message = None
            processing_id = None

        else:
            tracking = models.FolderInvoiceFile(
                file_path=file_path,
                fingerprint=fingerprint,
                status="processing",
                error_message=None,
            )
            db.add(tracking)

        db.commit()
        db.refresh(tracking)

        processing = None
        if processing_id is not None:
            processing = crud.get_document_processing(db, processing_id)

        if processing is None:
            processing = crud.create_document_processing(
                db=db,
                filename=file_name,
                file_path="",
            )
            processing_id = processing.id
            tracking.processing_id = processing_id
            tracking.status = "processing"
            tracking.error_message = None
            db.commit()

        # Reset the document to a retryable state if this is a retry.
        processing.status = "queued"
        processing.error_message = None
        db.commit()

        object_name = f"invoices/{processing_id}_{file_name}"

        # Upload the file. Retrying uses the same object name.
        upload_file(
            file_data=file_data,
            object_name=object_name,
            content_type=get_content_type(file_name),
        )

        crud.update_minio_status(
            db=db,
            processing_id=processing_id,
            status="completed",
            object_name=object_name,
        )

        # Do not mark the file completed unless Kafka confirms delivery.
        publish_to_invoice_topic(
            processing_id=processing_id,
            filename=file_name,
            file_path=object_name,
        )

        tracking = (
            db.query(models.FolderInvoiceFile)
            .filter(models.FolderInvoiceFile.file_path == file_path)
            .first()
        )

        tracking.status = "completed"
        tracking.processing_id = processing_id
        tracking.error_message = None
        db.commit()

        log.info(
            "Invoice queued successfully: %s | processing_id=%s",
            file_name,
            processing_id,
        )

    except Exception as error:
        db.rollback()
        log.exception("Failed to process folder invoice: %s", file_name)

        # Save failure state so the next scan can retry it.
        try:
            tracking = (
                db.query(models.FolderInvoiceFile)
                .filter(models.FolderInvoiceFile.file_path == file_path)
                .first()
            )

            if tracking:
                tracking.status = "failed"
                tracking.error_message = str(error)[:4000]
                if processing_id is not None:
                    tracking.processing_id = processing_id
                db.commit()

            if processing_id is not None:
                crud.save_processing_error(
                    db=db,
                    processing_id=processing_id,
                    error_message=str(error),
                )

        except Exception:
            db.rollback()
            log.exception("Could not save invoice failure state")

    finally:
        db.close()


def scan_folder():
    """Find new and retryable files in the mounted folder."""
    os.makedirs(WATCH_FOLDER, exist_ok=True)

    try:
        for file_path in Path(WATCH_FOLDER).iterdir():
            if file_path.is_file():
                process_file(str(file_path))
    except Exception:
        log.exception("Error scanning invoice folder")


def watcher_loop():
    log.info(
        "Invoice folder polling started: %s; interval=%ss",
        WATCH_FOLDER,
        POLL_INTERVAL,
    )

    while True:
        scan_folder()
        time.sleep(POLL_INTERVAL)


def start_invoice_watcher():
    """Start one background polling thread."""
    global watcher_thread, WATCH_FOLDER

    try:
        if not os.path.exists(WATCH_FOLDER):
            os.makedirs(WATCH_FOLDER, exist_ok=True)
    except Exception as e:
        log.warning(f"Could not create WATCH_FOLDER '{WATCH_FOLDER}': {e}. Falling back to ./invoices")
        WATCH_FOLDER = os.path.abspath("invoices")
        os.makedirs(WATCH_FOLDER, exist_ok=True)

    if watcher_thread and watcher_thread.is_alive():
        log.info("Invoice folder watcher is already running")
        return watcher_thread

    watcher_thread = threading.Thread(
        target=watcher_loop,
        name="invoice-folder-poller",
        daemon=True,
    )
    watcher_thread.start()

    return watcher_thread

