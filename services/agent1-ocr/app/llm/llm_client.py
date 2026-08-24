from .groq_client import extract_information as extract_with_groq
from .gemini_client import extract_information as extract_with_gemini


# ============================================================
# LLM Information Extraction
# ============================================================

def extract_information(
    ocr_text: str,
    document_structure: str
):
    """
    Primary LLM: Groq
    Fallback LLM: Gemini

    Groq is attempted first.
    If Groq fails, Gemini is automatically used.
    """

    # ========================================================
    # Try Groq First
    # ========================================================

    print("\n========================================")
    print("PRIMARY LLM: GROQ")
    print("========================================")

    try:

        structured_data = extract_with_groq(
            ocr_text,
            document_structure
        )

        print(
            "Groq extraction completed successfully."
        )

        print(
            "LLM Provider: GROQ"
        )

        return structured_data

    except Exception as groq_error:

        print("\n========================================")
        print("GROQ FAILED")
        print("========================================")

        print(
            f"Groq error: {groq_error}"
        )

        print(
            "Falling back to Gemini..."
        )

        # ====================================================
        # Gemini Fallback
        # ====================================================

        try:

            structured_data = extract_with_gemini(
                ocr_text,
                document_structure
            )

            print(
                "Gemini extraction completed successfully."
            )

            print(
                "LLM Provider: GEMINI (FALLBACK)"
            )

            return structured_data

        except Exception as gemini_error:

            print("\n========================================")
            print("BOTH LLM PROVIDERS FAILED")
            print("========================================")

            print(
                f"Groq error: {groq_error}"
            )

            print(
                f"Gemini error: {gemini_error}"
            )

            raise Exception(
                "Both Groq and Gemini extraction failed."
            ) from gemini_error