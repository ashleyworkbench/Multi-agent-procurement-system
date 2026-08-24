import os
import json

from dotenv import load_dotenv
from google import genai


# ============================================================
# Load Environment Variables
# ============================================================

load_dotenv()


# ============================================================
# Initialize Gemini Client
# ============================================================

client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY")
)


# ============================================================
# Gemini Information Extraction
# ============================================================

def extract_information(
    ocr_text: str,
    document_structure: str
):
    """
    Sends both Tesseract OCR text and Docling document
    structure to Gemini and returns structured procurement
    information.
    """

    prompt = f"""
You are an AI Information Extraction Agent for a Smart
Procurement System.

Your task is to extract procurement information from an invoice.

You are given TWO sources of information:

1. TESSERACT OCR TEXT
2. DOCLING DOCUMENT STRUCTURE

Use BOTH sources together to understand the invoice.

============================================================
TESSERACT OCR TEXT
============================================================

{ocr_text}


============================================================
DOCLING DOCUMENT STRUCTURE
============================================================

{document_structure}


============================================================
OUTPUT FORMAT
============================================================

Return ONLY valid JSON using exactly this structure:

{{
    "requester_name": "",
    "address": "",
    "phone_number": "",

    "items": [
        {{
            "description": "",
            "quantity": 0,
            "estimated_cost": 0
        }}
    ],

    "subtotal": 0,
    "tax_amount": 0,
    "tax_details": {{}},
    "total_estimated_cost": 0
}}


============================================================
REQUESTER INFORMATION
============================================================

1. Extract the requester/buyer name.

2. Extract the requester/buyer's address when available.

3. Extract the requester/buyer's phone number when available.

4. If the address is genuinely missing, return "".

5. If the phone number is genuinely missing, return "".

6. Preserve phone numbers as TEXT.

7. Preserve country codes, + signs, leading zeros, and
   meaningful formatting whenever possible.

8. If both buyer/requester and vendor/supplier information
   exist, do NOT confuse them.

9. Prefer the buyer/requester's information when the invoice
   clearly distinguishes the buyer from the supplier.


============================================================
ITEM EXTRACTION
============================================================

10. Extract EVERY procurement item listed in the invoice.

11. Preserve the relationship between:

    - description
    - quantity
    - unit price
    - amount

12. Do NOT treat table columns as independent lists.

13. Use Docling's table structure to determine row and
    column relationships.

14. Use Tesseract OCR to recover information that Docling
    may have missed or represented incorrectly.

15. If Tesseract and Docling differ slightly, determine the
    most consistent interpretation using the complete invoice.

16. Do not invent information.

17. Do not merge separate invoice items.

18. Do not create items from:

    - invoice numbers
    - dates
    - GST numbers
    - phone numbers
    - addresses
    - bank details
    - subtotal
    - tax
    - final total
    - other non-item information

19. estimated_cost must be the amount associated with the
    individual item.

20. Never use subtotal, tax, GST, CGST, SGST, IGST, discount,
    or final invoice total as an item's estimated_cost.


============================================================
FINANCIAL EXTRACTION
============================================================

21. Extract the invoice subtotal separately.

22. subtotal represents the sum of invoice item amounts before
    applicable taxes, when clearly available.

23. Extract the total tax amount separately.

24. tax_amount must represent the combined amount of all
    applicable taxes.

25. Extract each individual tax component in tax_details.

26. For example:

    CGST = 1426.50
    SGST = 1426.50

    must produce:

    "tax_amount": 2853.00,
    "tax_details": {{
        "CGST": 1426.50,
        "SGST": 1426.50
    }}

27. For IGST:

    "tax_amount": 2853.00,
    "tax_details": {{
        "IGST": 2853.00
    }}

28. If the invoice contains NO tax:

    "tax_amount": 0,
    "tax_details": {{}}

29. Do NOT assume GST or any other tax.

30. Only extract tax when it is actually present or clearly
    stated on the invoice.

31. Discounts, shipping charges, handling charges, and other
    non-tax charges must NOT be included in tax_amount.

32. total_estimated_cost must represent the FINAL PAYABLE
    TOTAL shown on the invoice when clearly available.

33. Do NOT confuse subtotal with final total.

34. If taxes or other clearly stated charges make the final
    amount different from the subtotal, use the final invoice
    total for total_estimated_cost.

35. If no explicit subtotal is shown but item amounts are
    available, calculate subtotal from the item amounts.

36. If no tax exists, tax_amount must be 0 and tax_details
    must be an empty object.

37. Do not invent subtotal, tax, or final-total values.


============================================================
TAX INVOICE EXAMPLE
============================================================

Items:

Item A = 4500
Item B = 3200
Item C = 1900
Item D = 6250

Subtotal = 15850

CGST = 1426.50
SGST = 1426.50

Final Total = 18703

The correct output is:

"subtotal": 15850,
"tax_amount": 2853,
"tax_details": {{
    "CGST": 1426.50,
    "SGST": 1426.50
}},
"total_estimated_cost": 18703


============================================================
NON-TAX INVOICE EXAMPLE
============================================================

Items:

Item A = 5000
Item B = 3000

Subtotal = 8000

No tax exists.

Final Total = 8000

The correct output is:

"subtotal": 8000,
"tax_amount": 0,
"tax_details": {{}},
"total_estimated_cost": 8000


============================================================
MISSING VALUE RULES
============================================================

38. Missing text → "".

39. Missing numeric value → 0.

40. quantity must be numeric.

41. estimated_cost must be numeric.

42. subtotal must be numeric.

43. tax_amount must be numeric.

44. tax_details must be a JSON object.

45. total_estimated_cost must be numeric.


============================================================
FINAL VALIDATION
============================================================

Before returning the JSON, verify:

- Requester name is correct.
- Requester address is correct when available.
- Requester phone number is correct when available.
- Vendor information has not been confused with requester
  information.
- Every visible invoice item is represented.
- Each quantity belongs to the correct item.
- Each item amount belongs to the correct item.
- Subtotal is separate from item amounts and taxes.
- Taxes are not treated as item costs.
- Individual tax components are represented in tax_details.
- tax_amount equals the sum of individual tax components when
  those components are available.
- No tax is invented when the invoice has no tax.
- total_estimated_cost represents the final payable amount.
- Subtotal is not incorrectly used as the final total.
- The JSON is syntactically valid.

Return ONLY the JSON.
"""

    # ========================================================
    # Call Gemini
    # ========================================================

    try:

        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt
        )

        result = response.text.strip()

        # ----------------------------------------------------
        # Remove Markdown Code Fences
        # ----------------------------------------------------

        if result.startswith("```"):

            result = result.replace(
                "```json",
                ""
            )

            result = result.replace(
                "```",
                ""
            )

            result = result.strip()

        # ----------------------------------------------------
        # Parse JSON
        # ----------------------------------------------------

        structured_data = json.loads(result)

        return structured_data

    except Exception as e:

        print("Gemini Error:", e)

        # Propagate the error so the processing pipeline
        # can mark the extraction as failed.

        raise