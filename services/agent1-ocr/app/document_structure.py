from docling.document_converter import DocumentConverter


# Initialize Docling once
converter = DocumentConverter()


def extract_document_structure(file_path: str):
    """
    Extract document structure using Docling.
    """

    result = converter.convert(file_path)

    document = result.document

    # Export Docling's structured representation as Markdown
    markdown = document.export_to_markdown()

    return markdown