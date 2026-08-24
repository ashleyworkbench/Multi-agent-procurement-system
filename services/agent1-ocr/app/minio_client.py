import os
from io import BytesIO

from dotenv import load_dotenv
from minio import Minio


# ============================================================
# Load Environment Variables
# ============================================================

load_dotenv()


# ============================================================
# MinIO Configuration
# ============================================================

MINIO_ENDPOINT = os.getenv(
    "MINIO_ENDPOINT",
    "127.0.0.1:9000"
)

MINIO_ACCESS_KEY = os.getenv(
    "MINIO_ACCESS_KEY",
    "admin"
)

MINIO_SECRET_KEY = os.getenv(
    "MINIO_SECRET_KEY",
    "admin123"
)

MINIO_BUCKET = os.getenv(
    "MINIO_BUCKET",
    "procurement-documents"
)

MINIO_SECURE = os.getenv(
    "MINIO_SECURE",
    "false"
).lower() == "true"


# ============================================================
# MinIO Client
# ============================================================

client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)


# ============================================================
# Ensure Bucket Exists
# ============================================================

def ensure_bucket_exists():

    if not client.bucket_exists(MINIO_BUCKET):

        client.make_bucket(MINIO_BUCKET)

        print(
            f"Created MinIO bucket: {MINIO_BUCKET}"
        )

    else:

        print(
            f"MinIO bucket already exists: {MINIO_BUCKET}"
        )


# ============================================================
# Upload File
# ============================================================

def upload_file(
    file_data: bytes,
    object_name: str,
    content_type: str = "application/octet-stream"
):

    file_stream = BytesIO(file_data)

    client.put_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
        data=file_stream,
        length=len(file_data),
        content_type=content_type
    )

    print(
        f"File uploaded to MinIO: "
        f"{MINIO_BUCKET}/{object_name}"
    )

    return object_name


# ============================================================
# Download File
# ============================================================

def download_file(
    object_name: str
) -> bytes:

    response = client.get_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_name
    )

    try:

        return response.read()

    finally:

        response.close()
        response.release_conn()


# ============================================================
# Delete File
# ============================================================

def delete_file(
    object_name: str
):

    client.remove_object(
        bucket_name=MINIO_BUCKET,
        object_name=object_name
    )

    print(
        f"Deleted from MinIO: "
        f"{MINIO_BUCKET}/{object_name}"
    )