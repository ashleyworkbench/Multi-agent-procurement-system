import logging
import os
import tempfile

log = logging.getLogger("docling-structure")

_converter = None


def get_converter():
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions

        log.info("Initializing Docling DocumentConverter for PDF and image structure extraction...")
        pipeline_options = PdfPipelineOptions(do_ocr=False)
        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(
                    pipeline_options=pipeline_options
                ),
            }
        )
    return _converter


def extract_document_structure(file_path: str) -> str:
    """
    Extract document structure using Docling and return markdown.
    """
    converter = get_converter()
    source_path = file_path
    temporary_pdf = None

    try:
        if os.path.splitext(file_path)[1].lower() in {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}:
            from PIL import Image

            with Image.open(file_path) as image:
                rgb_image = image.convert("RGB")
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as output:
                    temporary_pdf = output.name
                rgb_image.save(temporary_pdf, format="PDF", resolution=150.0)
            source_path = temporary_pdf
            log.info("Normalized image invoice to temporary PDF for Docling structure extraction")

        result = converter.convert(source_path)
        return result.document.export_to_markdown()
    finally:
        if temporary_pdf:
            os.unlink(temporary_pdf)