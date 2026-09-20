import logging

log = logging.getLogger("docling-structure")

_converter = None


def get_converter():
    global _converter
    if _converter is None:
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.datamodel.base_models import InputFormat

        log.info("Initializing fast Docling DocumentConverter (do_ocr=False)...")
        pipeline_options = PdfPipelineOptions(do_ocr=False)
        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )
    return _converter


def extract_document_structure(file_path: str) -> str:
    """
    Extract document structure using Docling and return markdown.
    """
    converter = get_converter()
    result = converter.convert(file_path)
    document = result.document

    # Export Docling's structured representation as Markdown
    markdown = document.export_to_markdown()
    return markdown