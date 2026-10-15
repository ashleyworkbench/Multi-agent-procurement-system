import json
import os
import time
import logging
import urllib.request

log = logging.getLogger("agent1-kafka-producer")

KAFKA_SERVER        = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
INVOICE_TOPIC       = "invoice-topic"           # agent1 internal: upload -> consumer
OCR_REQUEST_TOPIC   = os.getenv("KAFKA_TOPIC_OCR_REQUESTS", "ocr-request-topic")  # consumer -> agent2
PROCUREMENT_SVC_URL = os.getenv("PROCUREMENT_SERVICE_URL", "http://procurement-service:8004")
PROCUREMENT_KEY     = os.getenv("PROCUREMENT_KEY", "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")

_producer = None


def get_producer():
    global _producer
    if _producer is None:
        from kafka import KafkaProducer
        _producer = KafkaProducer(
            bootstrap_servers=KAFKA_SERVER,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        )
    return _producer


def log_procurement_event(event_data: dict):
    """Log Kafka event to procurement_events table for the Control Panel logs."""
    try:
        url = f"{PROCUREMENT_SVC_URL}/events"
        data = json.dumps(event_data).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-API-KEY": PROCUREMENT_KEY,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            pass
    except Exception as e:
        log.warning(f"Failed to log event to procurement service: {e}")


def publish_to_invoice_topic(processing_id: int, filename: str, file_path: str):
    """Publish an invoice event and raise if Kafka delivery fails."""
    event = {
        "event": "invoice.received",
        "processing_id": processing_id,
        "filename": filename,
        "file_path": file_path,
    }

    try:
        producer = get_producer()
        future = producer.send(INVOICE_TOPIC, value=event)
        future.get(timeout=10)
        producer.flush()
        log.info(
            f"Published to {INVOICE_TOPIC}: processing_id={processing_id}"
        )
    except Exception as e:
        log.exception(
            f"Kafka publish to invoice-topic failed: {e}"
        )
        raise

    # Also log into procurement_events for Kafka log display on control panel
    try:
        log_procurement_event({
            "event_id": f"evt_inv_{processing_id}_{int(time.time())}",
            "event_type": "INVOICE_QUEUED",
            "topic": INVOICE_TOPIC,
            "source_agent": "agent_1",
            "payload": {
                "processing_id": processing_id,
                "filename": filename,
                "file_path": file_path,
                "status": "QUEUED_FROM_FOLDER",
                "message": f"Document '{filename}' detected and queued on {INVOICE_TOPIC}",
            },
        })
    except Exception as e:
        log.warning(f"Could not record invoice queued event: {e}")

    return event


def publish_invoice_event(processing_id: int, filename: str, file_path: str, request_id: int = None):
    """Called by consumer after processing — notifies Agent 2."""
    event = {
        "event_type":    "OCR_REQUEST_CREATED",
        "source_agent":  "agent_1",
        "request_id":    request_id,
        "processing_id": processing_id,
        "filename":      filename,
        "file_path":     file_path,
    }
    try:
        producer = get_producer()
        future = producer.send(OCR_REQUEST_TOPIC, value=event)
        future.get(timeout=10)
        producer.flush()
        log.info(f"Published to {OCR_REQUEST_TOPIC}: request_id={request_id}")
    except Exception as e:
        log.warning(f"Kafka publish to ocr-request-topic failed: {e}")

    # Also log into procurement_events for Kafka log display on control panel
    try:
        log_procurement_event({
            "event_id": f"evt_ocr_{request_id or processing_id}_{int(time.time())}",
            "event_type": "OCR_REQUEST_CREATED",
            "topic": OCR_REQUEST_TOPIC,
            "source_agent": "agent_1",
            "payload": {
                "request_id": request_id,
                "processing_id": processing_id,
                "filename": filename,
                "file_path": file_path,
                "status": "EXTRACTION_COMPLETE",
                "message": f"OCR extraction complete for '{filename}'. Emitted to {OCR_REQUEST_TOPIC} for Agent 2 inventory check.",
            },
        })
    except Exception as e:
        log.warning(f"Could not record ocr request created event: {e}")

    return event

