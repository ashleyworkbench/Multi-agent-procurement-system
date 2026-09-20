"""
MinIO Document Storage helper for Procurement Service
Manages storage and retrieval of draft and digitally signed PO PDFs.
"""

import os
import logging
from io import BytesIO
from datetime import timedelta
from typing import Optional
from minio import Minio
from minio.error import S3Error
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("procurement-minio")

MINIO_ENDPOINT   = os.getenv("MINIO_ENDPOINT",   "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET     = os.getenv("MINIO_BUCKET",     "procurement-documents")
MINIO_SECURE     = os.getenv("MINIO_SECURE",     "false").lower() == "true"

_client: Optional[Minio] = None

def get_minio_client() -> Optional[Minio]:
    global _client
    if _client is not None:
        return _client
    try:
        _client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
        # Ensure bucket exists
        if not _client.bucket_exists(MINIO_BUCKET):
            _client.make_bucket(MINIO_BUCKET)
            log.info(f"Created MinIO bucket: {MINIO_BUCKET}")
        return _client
    except Exception as e:
        log.warning(f"MinIO connection not ready ({MINIO_ENDPOINT}): {e}")
        return None


def upload_pdf_bytes(pdf_bytes: bytes, object_name: str, content_type: str = "application/pdf") -> Optional[str]:
    """
    Uploads PDF bytes to MinIO and returns the object key.
    """
    client = get_minio_client()
    if not client:
        log.warning("MinIO unavailable, skipping upload")
        return None
    try:
        stream = BytesIO(pdf_bytes)
        client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=stream,
            length=len(pdf_bytes),
            content_type=content_type,
        )
        log.info(f"Uploaded {object_name} to MinIO ({len(pdf_bytes)} bytes)")
        return f"{MINIO_BUCKET}/{object_name}"
    except Exception as e:
        log.error(f"Failed to upload {object_name} to MinIO: {e}")
        return None


def download_pdf_bytes(object_name: str) -> Optional[bytes]:
    """
    Downloads PDF bytes from MinIO by object name or path.
    """
    client = get_minio_client()
    if not client:
        return None
    # Strip bucket name if prefix included
    if object_name.startswith(f"{MINIO_BUCKET}/"):
        object_name = object_name[len(MINIO_BUCKET) + 1:]
    try:
        response = client.get_object(MINIO_BUCKET, object_name)
        data = response.read()
        response.close()
        response.release_conn()
        return data
    except Exception as e:
        log.error(f"Failed to download {object_name} from MinIO: {e}")
        return None


def get_download_url(object_name: str, expiry_hours: int = 24) -> Optional[str]:
    """
    Generates a pre-signed URL for direct browser access if needed.
    """
    client = get_minio_client()
    if not client:
        return None
    if object_name.startswith(f"{MINIO_BUCKET}/"):
        object_name = object_name[len(MINIO_BUCKET) + 1:]
    try:
        return client.presigned_get_object(
            MINIO_BUCKET,
            object_name,
            expires=timedelta(hours=expiry_hours),
        )
    except Exception as e:
        log.warning(f"Could not generate pre-signed URL for {object_name}: {e}")
        return None
