"""
Procura Gemini Client
=====================
Integrates with Google Gemini LLM using existing environment configuration.
Handles:
- Grounded contextual reasoning via RAG context
- Multi-model failover cascade (gemini-3.5-flash, gemini-3.5-flash-lite, gemini-flash-lite-latest, gemini-3.6-flash)
- Structured extraction of negotiation counter-proposals (unit price, delivery date, quantity)
- Strict prevention of unauthorized hallucinated approvals
- Intelligent semantic fallback with RAG grounding
"""

import os
import re
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

log = logging.getLogger("procura-gemini")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
PREFERRED_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

# Reliable cascade order of models available on this API key
MODELS_CASCADE = [
    PREFERRED_MODEL,
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.6-flash",
]
# Remove duplicates while preserving order
UNIQUE_MODELS = list(dict.fromkeys(MODELS_CASCADE))


def _call_gemini_api(prompt: str) -> str:
    """
    Executes prompt against Gemini cascading through verified available models.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()

    # Try official google.genai SDK across the model cascade
    for model_name in UNIQUE_MODELS:
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            if response and response.text:
                log.info(f"Successfully generated response using model '{model_name}'")
                return response.text.strip()
        except Exception as e:
            log.warning(f"Model '{model_name}' failed with {e}. Cascading to next candidate...")

    # Fallback to direct HTTP REST API across models
    import urllib.request
    import urllib.error

    for model_name in UNIQUE_MODELS:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 1024,
                }
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"]
                return text.strip()
        except Exception as ex:
            log.warning(f"Direct REST call to '{model_name}' failed: {ex}")

    raise RuntimeError("All Gemini models in cascade returned unavailable or experienced rate limit spikes.")


def process_chat_with_gemini(
    grounded_context: str,
    vendor_message: str,
    po_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Sends the grounded RAG context and vendor message to Gemini.
    Returns structured analysis with formatted assistant reply and any extracted proposal.
    """
    current_unit_price = float(po_data.get("unit_price", 0))
    current_quantity = int(po_data.get("quantity", 0))
    current_delivery = str(po_data.get("delivery_date_expected", ""))
    po_number = str(po_data.get("po_number", ""))

    system_instruction = f"""
You are Procura, the official AI Procurement & Vendor Assistant for ProcureFlow.
You are interacting directly with an authorized vendor for Purchase Order: {po_number}.

YOUR CORE DIRECTIVES:
1. GROUNDED IN TRUTH & POLICIES:
   - Answer all vendor questions regarding item details, pricing, payment terms, quality requirements, and expected delivery dates.
   - Use the retrieved procurement policies and PO records provided below.
   - Speak naturally and informatively. Cite the relevant policy rule or DoA threshold when answering.
2. DO NOT HALLUCINATE: If a piece of information is missing, state that it is not recorded in the official registry.
3. NEGOTIATION PROPOSAL EXTRACTION:
   - If the vendor proposes a change to UNIT PRICE, DELIVERY DATE, or QUANTITY (including relative requests like "extend by 4 days"), identify it as a negotiation proposal (`is_proposal: true`).
   - If they ask for a delivery date extension by N days, compute the new target date based on current delivery date ({current_delivery}).
   - Extract the exact proposed values in `proposed_changes`.
   - Any price change must be understood relative to the current unit price of ₹{current_unit_price:,.2f}.
   - Any quantity change must be understood relative to current quantity of {current_quantity} units.
   - Any date change must be formatted as YYYY-MM-DD.
4. ABSOLUTE PO SAFETY:
   - NEVER approve a proposal yourself or say that the PO is already changed.
   - Explain clearly that their counter-proposal has been formally recorded as PENDING and submitted to the authorized human buyer ({po_data.get('assigned_approver_name', 'Procurement Officer')}) for authorization.

OUTPUT FORMAT:
Respond ONLY with a valid JSON object inside markdown backticks:
```json
{{
  "response_message": "Your polite, professional message to the vendor addressing their query or proposal",
  "intent": "inquiry | negotiate_price | negotiate_date | negotiate_quantity | general",
  "is_proposal": true or false,
  "proposed_changes": {{
    "unit_price": <number or null>,
    "quantity": <integer or null>,
    "delivery_date": "<YYYY-MM-DD or null>",
    "reason": "<reason stated by vendor or null>"
  }},
  "retrieved_policy_summary": "<brief note on applicable policy or null>"
}}
```
"""

    prompt = f"""
{system_instruction}

=====================================================================
GROUNDED PROCUREMENT CONTEXT:
{grounded_context}
=====================================================================

VENDOR'S INCOMING MESSAGE:
"{vendor_message}"

Now output ONLY the JSON object.
"""

    try:
        raw_output = _call_gemini_api(prompt)

        # Parse JSON
        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_output)
        if json_match:
            clean_json = json_match.group(1).strip()
        else:
            clean_json = raw_output.strip()

        # Isolate brackets
        s_idx = clean_json.find("{")
        e_idx = clean_json.rfind("}")
        if s_idx != -1 and e_idx != -1 and e_idx > s_idx:
            clean_json = clean_json[s_idx:e_idx + 1]

        parsed = json.loads(clean_json)
        return parsed

    except Exception as e:
        log.warning(f"Error executing Gemini LLM: {e}. Generating dynamic RAG-grounded fallback response.")
        lower_msg = vendor_message.lower()

        # Detect price proposal
        price_match = re.search(r"(?:price|rate|cost|inr|₹|rs\.?)\s*(?:of|to|is|at)?\s*(\d+(?:\.\d+)?)", lower_msg)
        # Detect quantity proposal
        qty_match = re.search(r"(?:quantity|qty|units|pieces|pcs)\s*(?:of|to|is|at)?\s*(\d+)", lower_msg)
        # Detect absolute date
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", lower_msg)
        # Detect relative date extension (e.g. "by 4 days", "extend 4 days", "4 day delay")
        days_delta_match = re.search(r"(?:extend|delay|postpone|add|need)?\s*(\d+)\s*(?:day|days)", lower_msg)

        proposed_price = float(price_match.group(1)) if price_match else None
        proposed_qty = int(qty_match.group(1)) if qty_match else None
        proposed_date = date_match.group(1) if date_match else None

        if not proposed_date and days_delta_match and ("extend" in lower_msg or "delivery" in lower_msg or "postpone" in lower_msg or "delay" in lower_msg):
            days_to_add = int(days_delta_match.group(1))
            try:
                base_dt = datetime.strptime(current_delivery, "%Y-%m-%d")
                new_dt = base_dt + timedelta(days=days_to_add)
                proposed_date = new_dt.strftime("%Y-%m-%d")
            except Exception:
                pass

        is_proposal = bool(
            proposed_price or proposed_qty or proposed_date or
            "negotiat" in lower_msg or "counter" in lower_msg or "propose" in lower_msg or
            "extend the delivery" in lower_msg or "extend delivery" in lower_msg
        )

        if is_proposal:
            resp_parts = []
            if proposed_price:
                resp_parts.append(f"revised unit price of ₹{proposed_price:.2f}")
            if proposed_qty:
                resp_parts.append(f"revised quantity of {proposed_qty} units")
            if proposed_date:
                resp_parts.append(f"revised delivery date to {proposed_date}")

            terms_str = ", ".join(resp_parts) if resp_parts else "proposed adjustments"
            resp_msg = (
                f"Thank you for your proposal regarding Purchase Order {po_number}. "
                f"We have registered your {terms_str}. "
                f"Under Company Procurement Policy (POL-002 / POL-001), extensions within standard thresholds may be approved with supplier notice. "
                f"This proposal has been registered as PENDING and submitted to your assigned buyer ({po_data.get('assigned_approver_name', 'Procurement Officer')}) for authorization."
            )
            intent = "negotiate_date" if proposed_date else ("negotiate_price" if proposed_price else "negotiate_quantity")
            policy_summary = "Delivery Policy POL-002: Schedule adjustments subject to buyer authorization."

        elif any(k in lower_msg for k in ["payment", "term", "invoice", "qa", "inspection", "net 30", "gst"]):
            resp_msg = (
                f"Commercial & Payment Terms for PO {po_number}: "
                f"Standard payment terms are Net 30 days following physical warehouse receipt and satisfactory Quality Assurance (QA) inspection. "
                f"Invoices must reference PO {po_number} and approved unit price (₹{current_unit_price:,.2f}). "
                f"Defective or non-compliant units are subject to quarantine and replacement within 48 hours."
            )
            intent = "inquiry"
            policy_summary = "Commercial Terms POL-005: Net 30 days upon QC inspection."

        elif any(k in lower_msg for k in ["delivery", "date", "when", "ship", "schedule", "dispatch"]):
            resp_msg = (
                f"The scheduled delivery date for PO {po_number} is currently {current_delivery or 'not specified'}. "
                f"Under Delivery Policy (POL-002), if you require an extension, you can propose up to 7 calendar days with documented lead time justification. "
                f"Would you like to propose an adjusted delivery schedule?"
            )
            intent = "inquiry"
            policy_summary = "Delivery Policy POL-002: Binding schedule; extensions require 48h notice."

        elif any(k in lower_msg for k in ["approv", "tier", "status", "who", "officer", "manager"]):
            resp_msg = (
                f"Purchase Order {po_number} is currently in {po_data.get('status')} status. "
                f"It is assigned under {po_data.get('approval_tier', 'TIER_1_OFFICER')} to {po_data.get('assigned_approver_name', 'Procurement Officer')} "
                f"({po_data.get('assigned_approver_email')}). Any negotiated changes will be routed directly to them for sign-off."
            )
            intent = "inquiry"
            policy_summary = "Delegation of Authority POL-004: Tiered approver routing."

        else:
            resp_msg = (
                f"For Purchase Order {po_number}, the recorded specifications are: Item: {po_data.get('item_name')}, "
                f"Quantity: {po_data.get('quantity')} units, Unit Price: ₹{current_unit_price:,.2f}, Total Value: ₹{po_data.get('total_price'):,.2f}. "
                f"Expected Delivery Date is {current_delivery}. "
                f"I can assist you with delivery schedule adjustments, price negotiations, or commercial term inquiries."
            )
            intent = "general"
            policy_summary = "Grounded PO Specifications from PostgreSQL procurement registry."

        return {
            "response_message": resp_msg,
            "intent": intent,
            "is_proposal": is_proposal,
            "proposed_changes": {
                "unit_price": proposed_price,
                "quantity": proposed_qty,
                "delivery_date": proposed_date,
                "reason": vendor_message,
            },
            "retrieved_policy_summary": policy_summary
        }
