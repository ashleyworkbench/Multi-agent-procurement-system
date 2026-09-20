"""
Agent 1 Kafka Consumer — runs as a background thread inside the FastAPI process.
Listens on invoice-topic, processes documents, publishes to ocr-request-topic.
"""
import json
import os
import tempfile
import threading
import logging
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
log = logging.getLogger("agent1-consumer")

KAFKA_SERVER = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC  = "invoice-topic"
ONBOARDING_URL = os.getenv("ONBOARDING_SERVICE_URL", "http://onboarding-service:8000")

# Industry detection keywords (same as Agent 2)
INDUSTRY_KEYWORDS = {
    "construction": [
        "cement", "steel", "sand", "concrete", "brick", "tmt", "rebar",
        "aggregate", "plywood", "roofing", "tile", "pvc pipe", "aac",
    ],
    "pharma": [
        "paracetamol", "ibuprofen", "amoxicillin", "ciprofloxacin",
        "metformin", "insulin", "tablet", "capsule", "syrup", "mg",
        "pharmaceutical", "medicine", "drug", "antibiotic",
    ],
    "manufacturing": [
        "bearing", "motor", "copper wire", "aluminium", "aluminum",
        "hydraulic", "gear", "v-belt", "solenoid", "pneumatic",
        "drill bit", "lathe", "cnc", "machining",
    ],
    "electronics": [
        "resistor", "capacitor", "microcontroller", "sensor", "led",
        "arduino", "raspberry", "esp32", "transistor", "mosfet",
        "pcb", "inductor", "voltage regulator", "ic", "relay",
    ],
}


def detect_industry(item_description: str) -> str:
    """Detect industry from item description using keyword matching."""
    desc_lower = item_description.lower()
    scores = {industry: 0 for industry in INDUSTRY_KEYWORDS}
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_lower:
                scores[industry] += 1
    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        log.warning(f"Could not detect industry for '{item_description}', defaulting to construction")
        return "construction"
    log.info(f"Detected industry '{best}' for item '{item_description}' (score={scores[best]})")
    return best


def detect_industries_from_items(items: list) -> set:
    """Detect all unique industries from a list of items."""
    industries = set()
    for item in items:
        desc = item.get("description", "")
        if desc:
            industry = detect_industry(desc)
            industries.add(industry)
    return industries


def get_connected_industries() -> set:
    """Fetch connected industries from onboarding service."""
    import httpx
    try:
        resp = httpx.get(f"{ONBOARDING_URL}/connections/industries", timeout=5.0)
        resp.raise_for_status()
        return set(resp.json().get("connected_industries", []))
    except Exception as e:
        log.warning(f"Could not fetch connected industries: {e} — blocking all requests for safety")
        return set()  # empty set = block all if we can't reach the registry


def process_message(event: dict, db):
    from . import schemas, crud
    from .ocr import extract_text
    from .document_structure import extract_document_structure
    from .llm.llm_client import extract_information
    from .minio_client import download_file
    from .kafka_producer import publish_invoice_event
    import httpx

    processing_id     = event.get("processing_id")
    minio_object_name = event.get("file_path")
    filename          = event.get("filename")

    if not processing_id or not minio_object_name or not filename:
        log.warning("Incomplete event, skipping")
        return

    processing = crud.get_document_processing(db, processing_id)
    if not processing or processing.minio_status != "completed":
        log.warning(f"Processing {processing_id} not ready")
        return

    crud.update_processing_status(db, processing_id, "processing")
    temporary_file_path = None

    try:
        # Download from MinIO
        file_data = download_file(minio_object_name)
        ext = os.path.splitext(filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(file_data)
            temporary_file_path = tmp.name

        # OCR
        crud.update_ocr_status(db, processing_id, "processing")
        ocr_text = extract_text(temporary_file_path)
        if not ocr_text or not ocr_text.strip():
            crud.update_ocr_status(db, processing_id, "failed")
            crud.save_processing_error(db, processing_id, "OCR returned no text")
            return
        crud.update_ocr_status(db, processing_id, "completed", ocr_text)
        log.info(f"OCR done for {processing_id}")

        # Docling Document Structure Extraction
        document_structure = ""
        try:
            crud.update_docling_status(db, processing_id, "processing")
            log.info(f"Extracting document structure with Docling for {processing_id}...")
            document_structure = extract_document_structure(temporary_file_path)
            crud.update_docling_status(db, processing_id, "completed")
            log.info(f"Docling extraction completed for {processing_id}")
        except Exception as docling_err:
            log.warning(f"Docling extraction failed for {processing_id} ({docling_err}). Proceeding with OCR text.")
            crud.update_docling_status(db, processing_id, "failed")

        # LLM
        crud.update_gemini_status(db, processing_id, "processing")
        structured_data = extract_information(ocr_text, document_structure)
        if not structured_data:
            crud.update_gemini_status(db, processing_id, "failed")
            crud.save_processing_error(db, processing_id, "LLM returned empty data")
            return
        crud.update_gemini_status(db, processing_id, "completed", structured_data)
        log.info(f"LLM done for {processing_id}")
        
        # Check connected industries BEFORE creating procurement request
        detected_industries = detect_industries_from_items(structured_data.get("items", []))
        connected_industries = get_connected_industries()
        
        unconnected = [ind for ind in detected_industries if ind not in connected_industries]
        
        if unconnected:
            error_msg = (
                f"Cannot process request: Industries {unconnected} are not connected. "
                f"Please connect these data sources in the Data Sources page before uploading invoices for these industries. "
                f"Currently connected: {list(connected_industries)}"
            )
            log.error(f"Processing {processing_id} blocked: {error_msg}")
            crud.update_gemini_status(db, processing_id, "failed")
            crud.save_processing_error(db, processing_id, error_msg)
            return

        # Validate & save
        validated = schemas.ProcurementExtraction(**structured_data)
        db_request = crud.create_procurement_request(db, validated)

        crud.save_processing_result(
            db=db,
            processing_id=processing_id,
            ocr_text=ocr_text,
            structured_data=structured_data,
            request_id=db_request.id
        )

        # Publish to Agent 2
        publish_invoice_event(
            processing_id=processing_id,
            filename=filename,
            file_path=minio_object_name,
            request_id=db_request.id
        )
        log.info(f"Processing complete for {processing_id}, request_id={db_request.id}")

    except Exception as e:
        log.error(f"Processing failed for {processing_id}: {e}")
        crud.save_processing_error(db, processing_id, str(e))
    finally:
        if temporary_file_path and os.path.exists(temporary_file_path):
            os.remove(temporary_file_path)


def consumer_loop():
    """Background thread — consumes from invoice-topic."""
    from .database import SessionLocal

    # Wait for Kafka to be ready
    time.sleep(15)

    while True:
        try:
            from kafka import KafkaConsumer
            log.info(f"Connecting to Kafka at {KAFKA_SERVER}, topic: {KAFKA_TOPIC}")
            consumer = KafkaConsumer(
                KAFKA_TOPIC,
                bootstrap_servers=KAFKA_SERVER,
                auto_offset_reset="earliest",
                enable_auto_commit=True,
                group_id="document-intelligence-agent",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
            )
            log.info("Kafka consumer connected, waiting for messages...")

            for message in consumer:
                event = message.value
                log.info(f"Received: {event}")
                if event.get("event") != "invoice.received":
                    continue
                db = SessionLocal()
                try:
                    process_message(event, db)
                finally:
                    db.close()

        except Exception as e:
            log.error(f"Consumer error: {e}, retrying in 10s...")
            time.sleep(10)


def start_consumer_thread():
    """Start the Kafka consumer as a daemon thread."""
    try:
        t = threading.Thread(target=consumer_loop, daemon=True, name="kafka-consumer")
        t.start()
        log.info("Kafka consumer thread started")
        print(f"✓ Kafka consumer thread started successfully (thread: {t.name}, alive: {t.is_alive()})")
    except Exception as e:
        log.error(f"Failed to start Kafka consumer thread: {e}")
        print(f"✗ ERROR starting Kafka consumer thread: {e}")
        raise
