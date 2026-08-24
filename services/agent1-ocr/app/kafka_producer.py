import json
import os
import logging

log = logging.getLogger("agent1-kafka-producer")

KAFKA_SERVER      = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
INVOICE_TOPIC     = "invoice-topic"           # agent1 internal: upload → consumer
OCR_REQUEST_TOPIC = os.getenv("KAFKA_TOPIC_OCR_REQUESTS", "ocr-request-topic")  # consumer → agent2

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


def publish_to_invoice_topic(processing_id: int, filename: str, file_path: str):
    """Called by upload endpoint — queues document for OCR processing."""
    event = {
        "event":         "invoice.received",
        "processing_id": processing_id,
        "filename":      filename,
        "file_path":     file_path,
    }
    try:
        producer = get_producer()
        future = producer.send(INVOICE_TOPIC, value=event)
        future.get(timeout=10)
        producer.flush()
        log.info(f"Published to {INVOICE_TOPIC}: processing_id={processing_id}")
    except Exception as e:
        log.warning(f"Kafka publish to invoice-topic failed: {e}")
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
    return event
