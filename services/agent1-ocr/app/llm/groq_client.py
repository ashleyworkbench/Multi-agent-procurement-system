import os
import json

from dotenv import load_dotenv
from openai import OpenAI


# ============================================================
# Load Environment Variables
# ============================================================

load_dotenv()


# ============================================================
# Initialize Groq Client
# ============================================================

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)


# ============================================================
# Groq Information Extraction
# ============================================================

def extract_information(
    ocr_text: str,
    document_structure: str
):
    """
    Sends both Tesseract OCR text and Docling document
    structure to Groq and returns structured procurement
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
REQUESTER INFORMATION RULES
============================================================

1. Extract the requester/buyer name from the invoice.

2. Extract the requester/buyer's address when available.

3. Extract the requester/buyer's phone number when available.

4. If the address is genuinely missing, return "".

5. If the phone number is genuinely missing, return "".

6. Preserve the phone number as TEXT.

7. Do not convert the phone number into a numeric value.

8. Preserve country codes, + signs, leading zeros, and
   meaningful formatting whenever possible.

9. If the invoice contains both buyer/requester and
   vendor/supplier information, do NOT confuse them.

10. Extract the buyer/requester's information when the invoice
    clearly identifies the buyer/requester separately from
    the vendor/supplier.


============================================================
ITEM EXTRACTION RULES
============================================================

11. Extract EVERY procurement item listed in the invoice.

12. For EACH item, preserve the relationship between:

    - description
    - quantity
    - unit price
    - amount

13. Do NOT treat table columns as independent lists.

14. For example, if an invoice contains:

    Description:
    Item A
    Item B
    Item C

    Quantity:
    2
    5
    1

    Amount:
    1000
    2500
    800

    Item A must have:
    quantity = 2
    estimated_cost = 1000

    Item B must have:
    quantity = 5
    estimated_cost = 2500

    Item C must have:
    quantity = 1
    estimated_cost = 800

15. Use the table structure from Docling to determine
    row and column relationships.

16. Use Tesseract OCR to recover text that may have been
    missed or incorrectly represented by Docling.

17. If Tesseract and Docling contain slightly different
    representations of the same value, use the most
    consistent interpretation based on the complete invoice.

18. Do not invent procurement items.

19. Do not merge separate invoice items into one item.

20. Do not create items from:

    - bank details
    - invoice numbers
    - dates
    - GST numbers
    - phone numbers
    - addresses
    - tax lines
    - subtotal lines
    - total lines
    - other non-item information

21. estimated_cost must represent the amount for that
    individual invoice item.

22. Do not use subtotal, tax, GST, CGST, SGST, IGST,
    discounts, or final invoice total as an item's
    estimated_cost.


============================================================
FINANCIAL EXTRACTION RULES
============================================================

23. Extract the invoice SUBTOTAL separately.

24. The subtotal is the amount representing the sum of the
    invoice items before taxes, when such a value is clearly
    available.

25. Do NOT confuse subtotal with the final invoice total.

26. Extract the TOTAL TAX amount separately.

27. If the invoice contains GST, CGST, SGST, IGST, VAT,
    sales tax, or other taxes, include them in tax_amount.

28. tax_amount must represent the TOTAL amount of all
    applicable taxes.

29. Extract individual tax components in tax_details.

30. Example:

    If the invoice contains:

    CGST = 1426.50
    SGST = 1426.50

    return:

    "tax_amount": 2853.00,
    "tax_details": {{
        "CGST": 1426.50,
        "SGST": 1426.50
    }}

31. If the invoice contains:

    IGST = 2853.00

    return:

    "tax_amount": 2853.00,
    "tax_details": {{
        "IGST": 2853.00
    }}

32. If the invoice does NOT contain any tax:

    "tax_amount": 0,
    "tax_details": {{}}

33. Do NOT assume GST or any other tax merely because the
    invoice is from India.

34. Only extract taxes that are actually present or clearly
    stated on the invoice.

35. Do not treat discounts, shipping charges, handling charges,
    or other non-tax charges as taxes.

36. The final total_estimated_cost must represent the FINAL
    PAYABLE TOTAL shown on the invoice when clearly available.

37. Do NOT use the subtotal as total_estimated_cost when the
    invoice clearly provides a different final total.

38. Do NOT use the sum of item amounts as total_estimated_cost
    when taxes or other clearly stated charges make the final
    invoice total different.

39. If no explicit subtotal is shown but the item amounts are
    clearly available, calculate subtotal as the sum of the
    individual item amounts.

40. If no tax is present and the invoice clearly provides a
    final total equal to the subtotal, tax_amount must be 0.

41. Do not invent taxes, subtotal values, or final totals.


============================================================
FINANCIAL EXAMPLE — TAX INVOICE
============================================================

If the invoice contains:

Item A = 4500
Item B = 3200
Item C = 1900
Item D = 6250

Subtotal = 15850

CGST = 1426.50
SGST = 1426.50

Final Total = 18703

return:

"subtotal": 15850,
"tax_amount": 2853,
"tax_details": {{
    "CGST": 1426.50,
    "SGST": 1426.50
}},
"total_estimated_cost": 18703


============================================================
FINANCIAL EXAMPLE — NON-TAX INVOICE
============================================================

If the invoice contains:

Item A = 5000
Item B = 3000

Subtotal = 8000

No tax is present.

Final Total = 8000

return:

"subtotal": 8000,
"tax_amount": 0,
"tax_details": {{}},
"total_estimated_cost": 8000


============================================================
MISSING VALUE RULES
============================================================

42. If a missing text value is genuinely unavailable,
    use "".

43. If a missing numeric value is genuinely unavailable,
    use 0.

44. Quantity must be numeric.

45. estimated_cost must be numeric.

46. subtotal must be numeric.

47. tax_amount must be numeric.

48. tax_details must be a JSON object.

49. total_estimated_cost must be numeric.


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
- Tax is separate from item amounts.
- All individual tax components are represented in tax_details.
- tax_amount equals the sum of the extracted tax components
  whenever the individual tax components are available.
- No tax is invented when the invoice has no tax.
- total_estimated_cost represents the final payable invoice
  amount.
- The final total is not confused with the subtotal.
- The JSON is syntactically valid.

Return ONLY the JSON.
"""

    # ========================================================
    # Call Groq
    # ========================================================

    try:

        print(
            "Sending OCR text and Docling "
            "document structure to Groq..."
        )

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.1
        )

        result = response.choices[0].message.content.strip()

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

        print("Groq Error:", e)

        # Propagate the error so the fallback mechanism
        # can automatically use Gemini.

        raise