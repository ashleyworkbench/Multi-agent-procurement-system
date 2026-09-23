import os
import time
import logging
import threading
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

log = logging.getLogger("invoice-watcher")

WATCH_FOLDER = "/app/invoices"

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
}

# Keep track of files currently being processed
processing_files = set()

# Protect the set when filesystem events happen quickly
processing_lock = threading.Lock()


def wait_for_file_ready(file_path, retries=10, delay=1):
    """
    Wait until a copied/dropped file has a stable non-zero size.
    """
    previous_size = -1

    for _ in range(retries):
        try:
            current_size = os.path.getsize(file_path)

            if current_size > 0 and current_size == previous_size:
                return True

            previous_size = current_size
            time.sleep(delay)

        except OSError:
            time.sleep(delay)

    return False


def process_file(file_path):
    """
    Process a single invoice file.
    Prevents duplicate processing from multiple filesystem events.
    """

    file_path = os.path.abspath(file_path)

    if not os.path.isfile(file_path):
        return

    extension = Path(file_path).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        return

    with processing_lock:
        if file_path in processing_files:
            return

        processing_files.add(file_path)

    try:
        log.info(f"New invoice detected: {os.path.basename(file_path)}")

        if not wait_for_file_ready(file_path):
            log.warning(
                f"File was not ready for processing: "
                f"{os.path.basename(file_path)}"
            )
            return

        log.info(
            f"Invoice is ready: {os.path.basename(file_path)}"
        )

        process_invoice(file_path)

    except Exception as e:
        log.error(
            f"Error processing invoice {file_path}: {e}",
            exc_info=True
        )

    finally:
        with processing_lock:
            processing_files.discard(file_path)


class InvoiceHandler(FileSystemEventHandler):

    def on_created(self, event):
        if event.is_directory:
            return

        process_file(event.src_path)

    def on_modified(self, event):
        if event.is_directory:
            return

        process_file(event.src_path)


def process_existing_files():
    """
    Process invoices that already exist when the watcher starts.
    """

    if not os.path.exists(WATCH_FOLDER):
        os.makedirs(WATCH_FOLDER, exist_ok=True)

    for file_path in Path(WATCH_FOLDER).iterdir():

        if not file_path.is_file():
            continue

        if file_path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        log.info(
            f"Found existing invoice: {file_path.name}"
        )

        process_file(str(file_path))


def process_invoice(file_path):
    """
    Process a newly detected invoice using the same
    PostgreSQL + MinIO + Kafka flow as the web upload.
    """

    from .database import SessionLocal
    from . import crud
    from .minio_client import upload_file
    from .kafka_producer import publish_to_invoice_topic

    db = SessionLocal()

    try:
        file_name = os.path.basename(file_path)

        # Read invoice
        with open(file_path, "rb") as f:
            file_data = f.read()

        if not file_data:
            log.warning(
                f"Invoice file is empty: {file_name}"
            )
            return

        # Create PostgreSQL processing record
        processing = crud.create_document_processing(
            db=db,
            filename=file_name,
            file_path=""
        )

        # Create MinIO object name
        object_name = (
            f"invoices/"
            f"{processing.id}_"
            f"{file_name}"
        )

        # Upload original invoice to MinIO
        upload_file(
            file_data=file_data,
            object_name=object_name,
            content_type=get_content_type(file_name)
        )

        # Update MinIO tracking
        processing.file_path = object_name

        crud.update_minio_status(
            db=db,
            processing_id=processing.id,
            status="completed",
            object_name=object_name
        )

        # Refresh processing record
        processing = crud.get_document_processing(
            db=db,
            processing_id=processing.id
        )

        # Publish to existing invoice Kafka topic
        kafka_event = publish_to_invoice_topic(
            processing_id=processing.id,
            filename=file_name,
            file_path=object_name
        )

        log.info(
            f"Invoice processed successfully: "
            f"{file_name} | "
            f"processing_id={processing.id} | "
            f"MinIO={object_name} | "
            f"Kafka=invoice-topic"
        )

    except Exception as e:
        db.rollback()

        log.error(
            f"Failed to process invoice {file_path}: {e}",
            exc_info=True
        )

    finally:
        db.close()


def get_content_type(file_name):
    extension = Path(file_name).suffix.lower()

    content_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }

    return content_types.get(
        extension,
        "application/octet-stream"
    )


def start_invoice_watcher():

    if not os.path.exists(WATCH_FOLDER):
        os.makedirs(WATCH_FOLDER, exist_ok=True)

    # First process files that already exist
    process_existing_files()

    event_handler = InvoiceHandler()

    observer = Observer()

    observer.schedule(
        event_handler,
        WATCH_FOLDER,
        recursive=False
    )

    observer.start()

    log.info(
        f"Invoice folder watcher started: {WATCH_FOLDER}"
    )

    return observer
