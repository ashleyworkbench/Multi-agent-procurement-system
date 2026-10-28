"""
Procura Service Backend Logic
=============================
Handles:
- PO verification and vendor authorization token generation/validation
- Conversation lifecycle and message persistence in PostgreSQL
- Negotiation proposal registration, calculation, and safety validation
- Human buyer approval and rejection workflows
- Immutable audit logging in procurement_audit and PDF regeneration
"""

import os
import re
import time
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional, Tuple

import psycopg2
from psycopg2.extras import RealDictCursor
from jose import jwt, JWTError

from pdf_generator import generate_po_pdf
from minio_storage import upload_pdf_bytes

log = logging.getLogger("procura-service")

JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-procureflow-key-2024")
JWT_ALGORITHM = "HS256"
VENDOR_TOKEN_EXPIRE_SECONDS = 86400  # 24 hours


def ensure_procura_tables(conn):
    """
    Ensures all Procura relational tables exist in procurement_db.
    """
    with conn.cursor() as cur:
        # 1. Procura Conversations
        cur.execute("""
            CREATE TABLE IF NOT EXISTS procura_conversations (
                id SERIAL PRIMARY KEY,
                po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
                po_number VARCHAR(50) NOT NULL,
                vendor_id INTEGER NOT NULL,
                vendor_name VARCHAR(255) NOT NULL,
                session_id VARCHAR(100) NOT NULL UNIQUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_procura_conv_po ON procura_conversations(po_number);
            CREATE INDEX IF NOT EXISTS idx_procura_conv_session ON procura_conversations(session_id);
        """)

        # 2. Procura Chat Messages
        cur.execute("""
            CREATE TABLE IF NOT EXISTS procura_chat_messages (
                id SERIAL PRIMARY KEY,
                conversation_id INTEGER NOT NULL REFERENCES procura_conversations(id) ON DELETE CASCADE,
                po_number VARCHAR(50) NOT NULL,
                sender VARCHAR(50) NOT NULL, -- 'vendor' | 'assistant' | 'system'
                message TEXT NOT NULL,
                intent VARCHAR(50) DEFAULT 'general',
                structured_data JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_procura_msgs_conv ON procura_chat_messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_procura_msgs_po ON procura_chat_messages(po_number);
        """)

        # 3. Negotiation Proposals
        cur.execute("""
            CREATE TABLE IF NOT EXISTS po_negotiation_proposals (
                id SERIAL PRIMARY KEY,
                po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
                po_number VARCHAR(50) NOT NULL,
                vendor_id INTEGER NOT NULL,
                vendor_name VARCHAR(255) NOT NULL,
                conversation_id INTEGER REFERENCES procura_conversations(id) ON DELETE SET NULL,
                current_unit_price NUMERIC(15, 2) NOT NULL,
                proposed_unit_price NUMERIC(15, 2),
                current_quantity INTEGER NOT NULL,
                proposed_quantity INTEGER,
                current_delivery_date DATE,
                proposed_delivery_date DATE,
                current_total_price NUMERIC(15, 2) NOT NULL,
                proposed_total_price NUMERIC(15, 2) NOT NULL,
                price_variance_pct NUMERIC(6, 2) DEFAULT 0.00,
                status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'APPROVED' | 'REJECTED'
                reason TEXT,
                validation_notes TEXT,
                reviewed_by VARCHAR(255),
                reviewed_at TIMESTAMP,
                review_notes TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_proposals_po ON po_negotiation_proposals(po_number);
            CREATE INDEX IF NOT EXISTS idx_proposals_status ON po_negotiation_proposals(status);
        """)
    conn.commit()


# =====================================================================
# Vendor Authentication & Authorization Tokens
# =====================================================================
def create_vendor_token(po_data: Dict[str, Any]) -> str:
    """
    Issues a cryptographically signed JWT identifying the authorized vendor for a specific PO.
    """
    payload = {
        "sub": f"vendor_{po_data['vendor_id']}",
        "po_number": po_data["po_number"],
        "po_id": po_data["id"],
        "vendor_id": po_data["vendor_id"],
        "vendor_name": po_data["vendor_name"],
        "role": "Vendor",
        "exp": int(time.time()) + VENDOR_TOKEN_EXPIRE_SECONDS,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_vendor_portal_token(vendor_id: int, vendor_name: str) -> str:
    """
    Issues a vendor company-level JWT for the Vendor Portal session.
    """
    payload = {
        "sub": f"vendor_{vendor_id}",
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "role": "Vendor",
        "exp": int(time.time()) + VENDOR_TOKEN_EXPIRE_SECONDS,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_vendor_token(token: str, expected_po_number: Optional[str] = None) -> Dict[str, Any]:
    """
    Verifies that the provided vendor token is valid and authorized.
    Supports both PO-scoped vendor tokens and company-scoped vendor portal tokens.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_po = payload.get("po_number")
        if expected_po_number and token_po:
            if token_po.strip().lower() != expected_po_number.strip().lower():
                raise ValueError(f"Token is authorized for PO {token_po}, not {expected_po_number}")
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid or expired vendor authorization token: {e}")



def verify_po_access(conn, po_number: str, vendor_identifier: str) -> Tuple[Dict[str, Any], str]:
    """
    Verifies that the PO exists in the database and the vendor identifier matches the PO.
    Returns (po_data, vendor_session_token).
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM purchase_orders WHERE LOWER(po_number) = LOWER(%s)
        """, (po_number.strip(),))
        row = cur.fetchone()

        if not row:
            raise LookupError(f"Purchase Order '{po_number}' was not found in the procurement registry.")

        po_data = dict(row)

        # Check vendor authorization
        clean_id = vendor_identifier.strip().lower()
        actual_name = po_data["vendor_name"].strip().lower()
        actual_id = str(po_data["vendor_id"]).strip()

        # Match either vendor name (substring or exact) or vendor ID
        is_authorized = (
            clean_id == actual_name
            or clean_id in actual_name
            or clean_id == actual_id
            or actual_name in clean_id
        )

        if not is_authorized:
            raise PermissionError(
                f"Vendor '{vendor_identifier}' is not authorized to access Purchase Order '{po_number}'."
            )

        token = create_vendor_token(po_data)
        return po_data, token


# =====================================================================
# Conversation Management
# =====================================================================
def get_or_create_conversation(conn, po_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Retrieves or initializes the unique conversation thread for this PO and vendor.
    """
    session_id = f"sess_{po_data['po_number']}_{po_data['vendor_id']}"
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM procura_conversations WHERE session_id = %s
        """, (session_id,))
        row = cur.fetchone()
        if row:
            return dict(row)

        cur.execute("""
            INSERT INTO procura_conversations (po_id, po_number, vendor_id, vendor_name, session_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """, (
            po_data["id"],
            po_data["po_number"],
            po_data["vendor_id"],
            po_data["vendor_name"],
            session_id
        ))
        new_conv = dict(cur.fetchone())
        conn.commit()

        # Seed initial greeting message
        welcome_msg = (
            f"Hello! I am Procura, your AI Procurement & Negotiation Assistant for Purchase Order {po_data['po_number']}. "
            f"I have loaded your live PO details for '{po_data['item_name']}' ({po_data['quantity']} units at ₹{float(po_data['unit_price']):,.2f}/unit). "
            f"You can ask questions about item specifications, payment terms, or propose revisions to price, quantity, or delivery dates."
        )
        cur.execute("""
            INSERT INTO procura_chat_messages (conversation_id, po_number, sender, message, intent)
            VALUES (%s, %s, 'assistant', %s, 'general')
        """, (new_conv["id"], po_data["po_number"], welcome_msg))
        conn.commit()

        return new_conv


def get_conversation_messages(conn, conversation_id: int) -> List[Dict[str, Any]]:
    """
    Retrieves chronological chat messages for a conversation.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, conversation_id, po_number, sender, message, intent, structured_data, created_at
            FROM procura_chat_messages
            WHERE conversation_id = %s
            ORDER BY created_at ASC
        """, (conversation_id,))
        return [dict(r) for r in cur.fetchall()]


def record_chat_message(
    conn,
    conversation_id: int,
    po_number: str,
    sender: str,
    message: str,
    intent: str = "general",
    structured_data: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Appends a new message to the conversation log.
    """
    import json
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO procura_chat_messages (conversation_id, po_number, sender, message, intent, structured_data)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            conversation_id,
            po_number,
            sender,
            message,
            intent,
            json.dumps(structured_data or {})
        ))
        row = dict(cur.fetchone())
        # Update conversation updated_at
        cur.execute("""
            UPDATE procura_conversations SET updated_at = NOW() WHERE id = %s
        """, (conversation_id,))
        conn.commit()
        return row


# =====================================================================
# Proposal Registration & Calculation Logic
# =====================================================================
def register_negotiation_proposal(
    conn,
    po_data: Dict[str, Any],
    conversation_id: int,
    proposed_unit_price: Optional[float] = None,
    proposed_quantity: Optional[int] = None,
    proposed_delivery_date: Optional[str] = None,
    reason: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validates proposed terms, calculates revised totals and variances,
    and safely registers a PENDING proposal without modifying the underlying PO.
    """
    current_unit_price = float(po_data["unit_price"])
    current_quantity = int(po_data["quantity"])
    current_delivery = po_data.get("delivery_date_expected")
    current_total = float(po_data["total_price"])

    # Determine effective values
    eff_unit_price = float(proposed_unit_price) if proposed_unit_price is not None and proposed_unit_price > 0 else current_unit_price
    eff_quantity = int(proposed_quantity) if proposed_quantity is not None and proposed_quantity > 0 else current_quantity
    eff_delivery = proposed_delivery_date if proposed_delivery_date else current_delivery

    # Calculations
    proposed_total = round(eff_unit_price * eff_quantity, 2)
    price_variance_pct = round(((eff_unit_price - current_unit_price) / current_unit_price) * 100, 2)

    # Determine resulting approval tier
    if proposed_total > 200000:
        resulting_tier = "TIER_3_DIRECTOR (Finance Director)"
    elif proposed_total >= 50000:
        resulting_tier = "TIER_2_MANAGER (Operations Manager)"
    else:
        resulting_tier = "TIER_1_OFFICER (Procurement Officer)"

    validation_notes = (
        f"Price delta: ₹{eff_unit_price - current_unit_price:+,.2f} ({price_variance_pct:+,.2f}%). "
        f"Quantity delta: {eff_quantity - current_quantity:+d} units. "
        f"Revised Total: ₹{proposed_total:,.2f}. Target Approval Authority: {resulting_tier}."
    )

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO po_negotiation_proposals (
                po_id, po_number, vendor_id, vendor_name, conversation_id,
                current_unit_price, proposed_unit_price,
                current_quantity, proposed_quantity,
                current_delivery_date, proposed_delivery_date,
                current_total_price, proposed_total_price,
                price_variance_pct, status, reason, validation_notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, %s)
            RETURNING *
        """, (
            po_data["id"],
            po_data["po_number"],
            po_data["vendor_id"],
            po_data["vendor_name"],
            conversation_id,
            current_unit_price,
            proposed_unit_price,
            current_quantity,
            proposed_quantity,
            current_delivery,
            proposed_delivery_date,
            current_total,
            proposed_total,
            price_variance_pct,
            reason or "Vendor counter-proposal submitted via Procura AI",
            validation_notes
        ))
        proposal = dict(cur.fetchone())
        conn.commit()
        return proposal


def get_proposals_for_po(conn, po_number: str) -> List[Dict[str, Any]]:
    """
    Fetches all negotiation proposals for a given PO.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT * FROM po_negotiation_proposals
            WHERE LOWER(po_number) = LOWER(%s)
            ORDER BY created_at DESC
        """, (po_number.strip(),))
        return [dict(r) for r in cur.fetchall()]


# =====================================================================
# Buyer Review Workflow (PO Safety Enforcement)
# =====================================================================
def review_proposal_by_buyer(
    conn,
    proposal_id: int,
    action: str,  # 'APPROVE' or 'REJECT'
    buyer_user: Dict[str, Any],
    review_notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Authorized buyer review action.
    - If APPROVED: updates the actual PO, generates audit record, regenerates PDF, and updates proposal status.
    - If REJECTED: leaves PO intact, updates audit log and proposal status.
    """
    action = action.upper().strip()
    if action not in ("APPROVE", "REJECT"):
        raise ValueError("Action must be 'APPROVE' or 'REJECT'")

    buyer_name = buyer_user.get("name", "Authorized Buyer")
    buyer_email = buyer_user.get("email", "buyer@procureflow.local")

    with conn.cursor() as cur:
        # 1. Fetch proposal
        cur.execute("SELECT * FROM po_negotiation_proposals WHERE id = %s", (proposal_id,))
        p_row = cur.fetchone()
        if not p_row:
            raise LookupError(f"Proposal #{proposal_id} does not exist.")

        proposal = dict(p_row)
        if proposal["status"] != "PENDING":
            raise ValueError(f"Proposal #{proposal_id} is already '{proposal['status']}'. Cannot review again.")

        po_id = proposal["po_id"]
        po_number = proposal["po_number"]

        # 2. Fetch target PO
        cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
        po_row = cur.fetchone()
        if not po_row:
            raise LookupError(f"Purchase order for proposal #{proposal_id} not found.")
        po_data = dict(po_row)

        if action == "APPROVE":
            # Determine new PO terms
            new_unit_price = float(proposal["proposed_unit_price"]) if proposal["proposed_unit_price"] is not None else float(po_data["unit_price"])
            new_quantity = int(proposal["proposed_quantity"]) if proposal["proposed_quantity"] is not None else int(po_data["quantity"])
            new_total = round(new_unit_price * new_quantity, 2)
            new_delivery = proposal["proposed_delivery_date"] or po_data["delivery_date_expected"]

            # Compute next revision PO number (e.g. PO-2026-XXXX-R1)
            base_po = re.sub(r"-R\d+$", "", po_number)
            match = re.search(r"-R(\d+)$", po_number)
            rev_num = int(match.group(1)) + 1 if match else 1
            new_po_number = f"{base_po}-R{rev_num}"

            # Ensure new_po_number is unique
            while True:
                cur.execute("SELECT id FROM purchase_orders WHERE LOWER(po_number) = LOWER(%s)", (new_po_number,))
                if cur.fetchone():
                    rev_num += 1
                    new_po_number = f"{base_po}-R{rev_num}"
                else:
                    break

            # Tier recalculation based on revised total
            if new_total > 200000:
                new_tier = "TIER_3_DIRECTOR"
                app_name = "Finance Director"
                app_email = "director.finance@procureflow.local"
            elif new_total >= 50000:
                new_tier = "TIER_2_MANAGER"
                app_name = "Operations Manager"
                app_email = "manager.ops@procureflow.local"
            else:
                new_tier = "TIER_1_OFFICER"
                app_name = "Procurement Officer"
                app_email = "officer.procurement@procureflow.local"

            # 1. Mark the OLD PO as SUPERSEDED (voided by new revision)
            old_status = po_data["status"]
            superseded_notes = (
                f"{po_data.get('notes') or ''}\n"
                f"[SUPERSEDED]: Voided and superseded by revised purchase order {new_po_number} "
                f"following accepted vendor counter-offer ({review_notes or 'Negotiation approved by ' + buyer_name})."
            ).strip()

            cur.execute("""
                UPDATE purchase_orders
                SET status = 'SUPERSEDED',
                    notes = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (superseded_notes, po_id))

            # Audit log for superseding the old PO
            cur.execute("""
                INSERT INTO procurement_audit (po_id, po_number, action, old_status, new_status, performed_by, notes)
                VALUES (%s, %s, 'SUPERSEDED', %s, 'SUPERSEDED', %s, %s)
            """, (
                po_id,
                po_number,
                old_status,
                buyer_email,
                f"Original contract superseded by {new_po_number} following accepted vendor negotiation."
            ))

            # Refresh old PO's PDF in MinIO so it displays SUPERSEDED (VOIDED)
            try:
                cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
                superseded_row = dict(cur.fetchone())
                superseded_pdf = generate_po_pdf(superseded_row, is_signed=False)
                upload_pdf_bytes(superseded_pdf, f"pos/{po_number}.pdf")
            except Exception as e:
                log.warning(f"Could not refresh superseded PDF in MinIO: {e}")

            # 2. Insert NEW REVISED PO in PENDING_APPROVAL status
            new_po_notes = (
                f"Revision {rev_num} generated from vendor negotiation on {po_number} (Proposal #{proposal_id}). "
                f"Previous PO {po_number} is SUPERSEDED. "
                f"Pending formal DocuSign re-signature by authorized approver ({app_name})."
            )

            cur.execute("""
                INSERT INTO purchase_orders (
                    po_number, request_id, vendor_id, vendor_name, item_name,
                    quantity, unit_price, total_price, currency, status,
                    delivery_date_expected, notes, approval_tier,
                    assigned_approver_name, assigned_approver_email,
                    docusign_status
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, 'PENDING_APPROVAL',
                    %s, %s, %s,
                    %s, %s,
                    'NOT_SENT'
                ) RETURNING *
            """, (
                new_po_number,
                po_data["request_id"],
                po_data["vendor_id"],
                po_data["vendor_name"],
                po_data["item_name"],
                new_quantity,
                new_unit_price,
                new_total,
                po_data.get("currency", "INR"),
                new_delivery,
                new_po_notes,
                new_tier,
                app_name,
                app_email,
            ))
            new_po_dict = dict(cur.fetchone())
            new_po_id = new_po_dict["id"]

            # Generate initial draft PDF for the new revised PO
            try:
                draft_pdf = generate_po_pdf(new_po_dict, is_signed=False)
                new_pdf_path = upload_pdf_bytes(draft_pdf, f"pos/{new_po_number}.pdf")
                cur.execute("UPDATE purchase_orders SET pdf_path = %s WHERE id = %s", (new_pdf_path, new_po_id))
            except Exception as e:
                log.warning(f"Could not generate initial PDF for revised PO {new_po_number}: {e}")

            # Audit log for creation of new revised PO
            cur.execute("""
                INSERT INTO procurement_audit (po_id, po_number, action, old_status, new_status, performed_by, notes)
                VALUES (%s, %s, 'REVISED_PO_GENERATED', 'NONE', 'PENDING_APPROVAL', %s, %s)
            """, (
                new_po_id,
                new_po_number,
                buyer_email,
                f"Generated Revision {rev_num} ({new_po_number}) from Proposal #{proposal_id}. Awaiting DocuSign signature."
            ))

            # 3. Update Proposal record
            cur.execute("""
                UPDATE po_negotiation_proposals
                SET status = 'APPROVED',
                    reviewed_by = %s,
                    reviewed_at = NOW(),
                    review_notes = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (
                f"{buyer_name} <{buyer_email}>",
                f"{review_notes or 'Counter-offer accepted'}. Superseded {po_number} -> Created {new_po_number}.",
                proposal_id,
            ))

            # 4. Bridge Procura conversation
            if proposal["conversation_id"]:
                sys_msg = (
                    f"🎉 [PROPOSAL ACCEPTED & REVISED PO GENERATED] Buyer {buyer_name} has accepted the counter-proposal!\n"
                    f"• Original PO **{po_number}** has been marked as **SUPERSEDED**.\n"
                    f"• New Revised PO **{new_po_number}** has been generated with: Unit Price ₹{new_unit_price:,.2f}, "
                    f"Quantity: {new_quantity}, Expected Delivery: {new_delivery}.\n"
                    f"• It is now in the **Approvals Queue** waiting for official DocuSign digital signature."
                )
                cur.execute("""
                    INSERT INTO procura_chat_messages (conversation_id, po_number, sender, message, intent)
                    VALUES (%s, %s, 'system', %s, 'proposal_update')
                """, (proposal["conversation_id"], new_po_number, sys_msg))

            conn.commit()
            return {
                "success": True,
                "proposal_id": proposal_id,
                "status": "APPROVED",
                "message": f"Proposal #{proposal_id} accepted. {po_number} superseded -> Revised PO {new_po_number} generated for DocuSign signature.",
                "superseded_po_number": po_number,
                "new_po_number": new_po_number,
                "new_po_id": new_po_id,
                "updated_po": new_po_dict
            }

        else:  # REJECT
            cur.execute("""
                UPDATE po_negotiation_proposals
                SET status = 'REJECTED',
                    reviewed_by = %s,
                    reviewed_at = NOW(),
                    review_notes = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (f"{buyer_name} <{buyer_email}>", review_notes, proposal_id))

            # Audit Trail
            cur.execute("""
                INSERT INTO procurement_audit (po_id, po_number, action, old_status, new_status, performed_by, notes)
                VALUES (%s, %s, 'NEGOTIATION_PROPOSAL_REJECTED', %s, %s, %s, %s)
            """, (
                po_id,
                po_number,
                po_data["status"],
                po_data["status"],
                buyer_email,
                f"Rejected Proposal #{proposal_id}. Feedback: {review_notes or 'Terms not acceptable'}"
            ))

            # Notify conversation
            if proposal["conversation_id"]:
                sys_msg = (
                    f"⚠️ [PROPOSAL REJECTED] Buyer {buyer_name} reviewed and REJECTED the counter-proposal. "
                    f"Reason / Feedback: {review_notes or 'Terms not acceptable under current project budget and schedule.'} "
                    f"The original Purchase Order terms remain active."
                )
                cur.execute("""
                    INSERT INTO procura_chat_messages (conversation_id, po_number, sender, message, intent)
                    VALUES (%s, %s, 'system', %s, 'proposal_update')
                """, (proposal["conversation_id"], po_number, sys_msg))

            conn.commit()
            return {
                "success": True,
                "proposal_id": proposal_id,
                "status": "REJECTED",
                "message": f"Proposal #{proposal_id} was rejected. Purchase Order {po_number} remains unchanged."
            }
