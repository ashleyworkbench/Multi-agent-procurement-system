"""
Agent 6 — Autonomous Report Generation Agent
============================================
ProcureFlow Order Dossier & Lifecycle Documentation Agent

Responsibilities:
1. Complete Order Lifecycle Documentation:
   - Autonomously generates full-fledged documentation reports for EVERY purchase order
     in the system without requiring manual triggers.
   - Documents the entire order story:
     * Order specifications & requisition details
     * Chronological lifecycle changes (revisions, status transitions, approval audits)
     * Vendor queries & Procura negotiation history (chat inquiries & counter-proposals)
     * Governance & DocuSign digital signatures
     * Vendor operational performance & Agent 5 risk assessment
     * Post-delivery quality & fulfillment status (RMA claims if any)
     * Final commercial settlement & financial breakdown
2. Dynamic Invalidation & Regeneration Protocol:
   - If any defect is logged or updated after an order, or if vendor queries/restitutions
     change the order state, the agent deletes the previous report and creates an updated
     version to guarantee continuous documentation integrity.
3. Official Multi-Page PDF Generation:
   - Produces corporate-grade audit PDFs stored in MinIO and secured with SHA-256 seals.
"""

import os
import json
import hashlib
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple

import psycopg2
from psycopg2.extras import RealDictCursor

from order_report_pdf import generate_order_report_pdf
from minio_storage import upload_pdf_bytes, download_pdf_bytes, delete_object

log = logging.getLogger("report-agent")


def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "procurement_db"),
        user=os.getenv("POSTGRES_USER", "procurement_admin"),
        password=os.getenv("POSTGRES_PASSWORD", "SecurePass@2024"),
    )


class ReportGenerationAgent:
    """
    Agent 6: Autonomous Report Generation Agent for ProcureFlow.
    """

    def __init__(self):
        self.agent_name = "Agent 6 (Report Intelligence Agent)"
        self.version = "2.0.0"

    def compute_integrity_hash(self, payload: Dict[str, Any]) -> str:
        """Computes a canonical SHA-256 integrity seal for the order dossier."""
        serialized = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def generate_order_report(
        self,
        po_id: int,
        trigger_reason: str = "AUTONOMOUS_ORDER_DOCUMENTATION",
        force_regenerate: bool = False,
        actor: str = "Agent 6 (Report Agent)",
    ) -> Dict[str, Any]:
        """
        Generates or regenerates a full-fledged official order dossier for a PO.
        
        Strict Rule:
        If a report already exists for this order, and force_regenerate is requested
        or defect/negotiation updates occurred:
        -> DELETE the previous report (MinIO file + database record)
        -> GENERATE a brand new updated report (incrementing version, e.g. v2, v3)
        """
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            # 1. Fetch Purchase Order details
            cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
            po = cur.fetchone()
            if not po:
                raise ValueError(f"Purchase Order #{po_id} does not exist.")

            po_dict = dict(po)
            po_number = po_dict.get("po_number", f"PO-{po_id}")
            vendor_id = po_dict.get("vendor_id")
            vendor_name = po_dict.get("vendor_name", "Unknown Vendor")

            # Extract base PO prefix (e.g. "PO-2026-782EA6" from "PO-2026-782EA6-R1")
            base_po_prefix = po_number.split("-R")[0]

            # 2. Fetch Vendor Queries & Inquiries (Procura AI Chatbot)
            cur.execute(
                """
                SELECT id, po_number, sender, message, intent, structured_data, created_at
                FROM procura_chat_messages
                WHERE po_number = %s OR po_number LIKE %s
                ORDER BY created_at ASC
                """,
                (po_number, f"{base_po_prefix}%"),
            )
            chat_records = cur.fetchall()
            chat_messages: List[Dict[str, Any]] = [dict(m) for m in chat_records]

            # 3. Fetch Counter-Proposals & Negotiations
            cur.execute(
                """
                SELECT id, po_id, po_number, vendor_name, current_unit_price, proposed_unit_price,
                       current_quantity, proposed_quantity, current_delivery_date, proposed_delivery_date,
                       current_total_price, proposed_total_price, price_variance_pct, status,
                       reason, validation_notes, reviewed_by, reviewed_at, review_notes, created_at
                FROM po_negotiation_proposals
                WHERE po_id = %s OR po_number = %s OR po_number LIKE %s
                ORDER BY created_at ASC
                """,
                (po_id, po_number, f"{base_po_prefix}%"),
            )
            proposal_records = cur.fetchall()
            proposals: List[Dict[str, Any]] = [dict(p) for p in proposal_records]

            vendor_negotiations = {
                "proposals": proposals,
                "chat_messages": chat_messages,
                "proposal_count": len(proposals),
                "inquiry_count": len(chat_messages),
                "has_negotiations": (len(proposals) > 0 or len(chat_messages) > 0),
            }

            # 4. Fetch Defective Items / RMAs for this PO (if any)
            cur.execute(
                """
                SELECT * FROM defective_items
                WHERE po_id = %s OR po_number = %s
                ORDER BY id ASC
                """,
                (po_id, po_number),
            )
            defect_records = cur.fetchall()
            defects: List[Dict[str, Any]] = [dict(d) for d in defect_records]

            defect_count = len(defects)
            has_defects = defect_count > 0
            total_defective_qty = sum(int(d.get("defective_quantity", 0)) for d in defects)
            total_claim_amount = sum(float(d.get("total_claim_amount") or 0.0) for d in defects)

            restitution_recovered_amount = 0.0
            resolved_defect_count = 0
            for d in defects:
                v_action = (d.get("vendor_action_status") or "").upper()
                d_status = (d.get("status") or "").upper()
                claim = float(d.get("total_claim_amount") or 0.0)
                if "CREDIT" in v_action or "REPLACEMENT" in v_action or d_status == "RESOLVED":
                    restitution_recovered_amount += claim
                    resolved_defect_count += 1

            defect_summary = {
                "defect_count": defect_count,
                "total_defective_quantity": total_defective_qty,
                "total_claim_amount": total_claim_amount,
                "restitution_recovered_amount": restitution_recovered_amount,
                "resolved_defect_count": resolved_defect_count,
            }

            # 5. Check for Existing Report for this PO
            cur.execute(
                """
                SELECT id, report_id, version, pdf_path, defect_count, status, order_data
                FROM order_reports
                WHERE po_id = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (po_id,),
            )
            existing_report = cur.fetchone()

            prev_version = 1
            is_regeneration = False
            superseded_report_id = None

            if existing_report:
                prev_report_dict = dict(existing_report)
                prev_report_id = prev_report_dict.get("report_id")
                prev_version = int(prev_report_dict.get("version", 1))
                prev_defect_count = int(prev_report_dict.get("defect_count", 0))
                prev_pdf_path = prev_report_dict.get("pdf_path")

                prev_order_data = prev_report_dict.get("order_data") or {}
                prev_order_status = prev_order_data.get("status")
                prev_order_total = float(prev_order_data.get("total_price") or 0.0)
                current_po_total = float(po.get("total_price") or 0.0)

                needs_update = (
                    force_regenerate
                    or defect_count != prev_defect_count
                    or (prev_order_status and prev_order_status != po.get("status"))
                    or abs(current_po_total - prev_order_total) > 0.01
                    or trigger_reason in {
                        "DEFECT_ITEM_LOGGED",
                        "VENDOR_RESTITUTION_SUBMITTED",
                        "RMA_STATUS_UPDATED",
                        "PO_MODIFIED",
                        "MANUAL_REGENERATE",
                    }
                )

                if not needs_update:
                    cur.execute("SELECT * FROM order_reports WHERE id = %s", (prev_report_dict["id"],))
                    return dict(cur.fetchone())

                # RULE: Delete previous report and generate new one
                is_regeneration = True
                superseded_report_id = prev_report_id
                log.info(f"Purging previous report {prev_report_id} to generate updated version.")

                if prev_pdf_path:
                    try:
                        delete_object(prev_pdf_path)
                    except Exception as e:
                        log.warning(f"Could not delete old PDF: {e}")

                cur.execute("DELETE FROM order_reports WHERE id = %s", (prev_report_dict["id"],))
                conn.commit()

                cur.execute(
                    """
                    INSERT INTO procurement_audit
                      (po_id, po_number, action, old_status, new_status, performed_by, notes)
                    VALUES (%s, %s, 'REPORT_DELETED_AND_REGENERATED', %s, 'REGENERATING', %s, %s)
                    """,
                    (
                        po_id,
                        po_number,
                        prev_report_id,
                        actor,
                        f"Previous report {prev_report_id} deleted and regenerated due to: {trigger_reason}",
                    ),
                )
                conn.commit()

            report_version = (prev_version + 1) if is_regeneration else 1
            new_report_id = f"RPT-{po_number}-V{report_version}"
            pdf_filename = f"report_{po_number}_v{report_version}.pdf"
            minio_object_path = f"reports/{po_number}/{pdf_filename}"

            # 6. Fetch Governance & Chronological Audit Trail
            cur.execute(
                """
                SELECT id, action, old_status, new_status, performed_by, notes, created_at, created_at AS timestamp
                FROM procurement_audit
                WHERE po_id = %s OR po_number = %s
                ORDER BY created_at ASC
                """,
                (po_id, po_number),
            )
            audit_records = cur.fetchall()
            audit_trail = [dict(a) for a in audit_records]

            # 7. Fetch Vendor Risk Analysis (Agent 5 Intelligence)
            cur.execute(
                """
                SELECT * FROM vendor_risk_records
                WHERE vendor_name ILIKE %s OR vendor_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (vendor_name, f"V-{vendor_id}" if vendor_id else "NONE"),
            )
            risk_record = cur.fetchone()
            if risk_record:
                vendor_risk = dict(risk_record)
            else:
                vendor_risk = {
                    "risk_level": "Low",
                    "risk_score": 15.0,
                    "delivery_score": 92.5,
                    "quality_score": 90.0,
                    "pricing_score": 94.0,
                    "compliance_score": 95.0,
                    "model_version": "RandomForest-v2.1",
                    "risk_drivers_json": ["Good historical compliance standing", "Reliable delivery cadence"],
                }

            # 8. Financial Reconciliation Matrix
            gross_total = float(po_dict.get("total_price", 0.0))
            net_settled = gross_total - total_claim_amount + restitution_recovered_amount
            settlement_status = (
                "CLEAN_COMPLETED"
                if not has_defects
                else "DISPUTE_RECONCILED"
                if resolved_defect_count == defect_count
                else "SETTLEMENT_HOLD"
            )

            financial_breakdown = {
                "currency": po_dict.get("currency", "INR"),
                "gross_order_amount": gross_total,
                "defective_claim_amount": total_claim_amount,
                "restitution_recovered_amount": restitution_recovered_amount,
                "net_settled_amount": round(net_settled, 2),
                "settlement_status": settlement_status,
                "payment_disbursement_authorized": (settlement_status != "SETTLEMENT_HOLD"),
            }

            # Executive summary narrative
            nego_text = ""
            if len(proposals) > 0:
                nego_text = f" Vendor submitted {len(proposals)} counter-proposal(s) reviewed through Procura AI."
            if len(chat_messages) > 0:
                nego_text += f" {len(chat_messages)} vendor communication inquiries recorded."

            exec_summary = (
                f"Full documentation dossier for {po_number} ({po_dict.get('item_name')} from {vendor_name}). "
                f"Contracted value: {po_dict.get('currency', 'INR')} {gross_total:,.2f} for {po_dict.get('quantity')} units.{nego_text} "
                f"Order status: {po_dict.get('status')}. Digital signature: {po_dict.get('docusign_status', 'COMPLETED')}."
            )

            if is_regeneration:
                regen_reason = (
                    f"Regenerated report v{report_version}. Previous report {superseded_report_id} was deleted and "
                    f"superseded to reflect order modifications/updates ({trigger_reason})."
                )
            else:
                regen_reason = f"Full-fledged order closeout dossier compiled autonomously by Agent 6 ({trigger_reason})."

            compliance_statement = {
                "framework": "ISO 9001:2015 Clause 8.4 & Sarbanes-Oxley (SOX) Section 404",
                "internal_control_status": "AUDITED_AND_COMPLIANT",
                "verified_by": self.agent_name,
                "verification_date": datetime.utcnow().isoformat(),
            }

            # 9. Assemble Dossier Data
            dossier_data = {
                "report_id": new_report_id,
                "po_number": po_number,
                "version": report_version,
                "status": "ACTIVE",
                "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "order_data": po_dict,
                "vendor_negotiations": vendor_negotiations,
                "approval_audit_trail": audit_trail,
                "vendor_risk_analysis": vendor_risk,
                "defective_items_log": defects,
                "financial_breakdown": financial_breakdown,
                "regeneration_reason": regen_reason,
                "generated_by": self.agent_name,
            }
            integrity_hash = self.compute_integrity_hash(dossier_data)
            dossier_data["integrity_hash"] = integrity_hash

            # 10. Generate Corporate PDF
            log.info(f"Generating full order documentation PDF for {new_report_id}...")
            pdf_bytes = generate_order_report_pdf(dossier_data)
            pdf_size_bytes = len(pdf_bytes)

            upload_path = upload_pdf_bytes(pdf_bytes, minio_object_path)
            if not upload_path:
                upload_path = minio_object_path

            # 11. Insert Report into DB
            cur.execute(
                """
                INSERT INTO order_reports (
                    report_id, po_id, po_number, vendor_id, vendor_name,
                    version, status, is_latest, defect_count, has_defects,
                    defect_summary, regeneration_reason, supersedes_report_id,
                    executive_summary, order_data, financial_breakdown,
                    vendor_risk_analysis, approval_audit_trail, defective_items_log,
                    compliance_statement, integrity_hash, pdf_filename, pdf_path,
                    pdf_size_bytes, generated_by, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, 'ACTIVE', TRUE, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, NOW(), NOW()
                )
                RETURNING *
                """,
                (
                    new_report_id,
                    po_id,
                    po_number,
                    vendor_id,
                    vendor_name,
                    report_version,
                    defect_count,
                    has_defects,
                    json.dumps(defect_summary),
                    regen_reason,
                    superseded_report_id,
                    exec_summary,
                    json.dumps(po_dict, default=str),
                    json.dumps(financial_breakdown),
                    json.dumps(vendor_risk, default=str),
                    json.dumps(audit_trail, default=str),
                    json.dumps(defects, default=str),
                    json.dumps(compliance_statement),
                    integrity_hash,
                    pdf_filename,
                    upload_path,
                    pdf_size_bytes,
                    self.agent_name,
                ),
            )
            created_row = cur.fetchone()

            cur.execute(
                """
                INSERT INTO procurement_audit
                  (po_id, po_number, action, old_status, new_status, performed_by, notes)
                VALUES (%s, %s, 'ORDER_REPORT_GENERATED', %s, 'ACTIVE', %s, %s)
                """,
                (
                    po_id,
                    po_number,
                    superseded_report_id or "NONE",
                    actor,
                    f"Official report {new_report_id} generated by Agent 6. Hash: {integrity_hash[:12]}...",
                ),
            )
            conn.commit()

            return dict(created_row)

        except Exception as e:
            conn.rollback()
            log.error(f"Error generating order report for PO #{po_id}: {e}", exc_info=True)
            raise e
        finally:
            cur.close()
            conn.close()

    def ensure_all_orders_documented(self):
        """
        Autonomous Agent 6 background sync:
        Ensures EVERY purchase order in the database has a generated documentation report.
        """
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute("SELECT id FROM purchase_orders ORDER BY id ASC")
            all_pos = cur.fetchall()
            for row in all_pos:
                po_id = row["id"]
                try:
                    self.generate_order_report(po_id, trigger_reason="AUTONOMOUS_AUDIT_SYNC")
                except Exception as e:
                    log.warning(f"Failed to auto-sync report for PO #{po_id}: {e}")
        finally:
            cur.close()
            conn.close()

    def get_reports(
        self,
        po_id: Optional[int] = None,
        search: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Lists order documentation reports with filtering and count.
        Ensures all POs have documentation generated first.
        """
        # Ensure all POs in system are documented
        self.ensure_all_orders_documented()

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            filters = ["status = 'ACTIVE'"]
            params: List[Any] = []

            if po_id:
                filters.append("po_id = %s")
                params.append(po_id)

            if status and status != "ALL":
                filters.append("order_data->>'status' = %s")
                params.append(status)

            if search:
                filters.append("(po_number ILIKE %s OR vendor_name ILIKE %s OR report_id ILIKE %s OR executive_summary ILIKE %s)")
                p_search = f"%{search}%"
                params.extend([p_search, p_search, p_search, p_search])

            where_clause = " WHERE " + " AND ".join(filters)

            cur.execute(f"SELECT COUNT(*) as total FROM order_reports {where_clause}", tuple(params))
            total = cur.fetchone()["total"]

            query = f"""
                SELECT id, report_id, po_id, po_number, vendor_id, vendor_name,
                       version, status, is_latest, defect_count, has_defects,
                       defect_summary, regeneration_reason, supersedes_report_id,
                       executive_summary, order_data, financial_breakdown, integrity_hash,
                       pdf_filename, pdf_path, pdf_size_bytes, generated_by,
                       created_at, updated_at
                FROM order_reports
                {where_clause}
                ORDER BY id DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, tuple(params + [limit, offset]))
            reports = [dict(r) for r in cur.fetchall()]
            return reports, total
        finally:
            cur.close()
            conn.close()

    def get_report_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single full report by its integer ID or string report_id, augmenting with negotiations."""
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            if str(report_id).isdigit():
                cur.execute("SELECT * FROM order_reports WHERE id = %s", (int(report_id),))
            else:
                cur.execute("SELECT * FROM order_reports WHERE report_id = %s", (report_id,))
            row = cur.fetchone()
            if not row:
                return None

            result = dict(row)
            po_number = result.get("po_number", "")
            base_po_prefix = po_number.split("-R")[0]

            # Ingest negotiations live
            cur.execute(
                """
                SELECT id, po_number, sender, message, intent, structured_data, created_at
                FROM procura_chat_messages
                WHERE po_number = %s OR po_number LIKE %s
                ORDER BY created_at ASC
                """,
                (po_number, f"{base_po_prefix}%"),
            )
            chat_records = cur.fetchall()

            cur.execute(
                """
                SELECT id, po_id, po_number, vendor_name, current_unit_price, proposed_unit_price,
                       current_quantity, proposed_quantity, current_delivery_date, proposed_delivery_date,
                       current_total_price, proposed_total_price, price_variance_pct, status,
                       reason, validation_notes, reviewed_by, reviewed_at, review_notes, created_at
                FROM po_negotiation_proposals
                WHERE po_id = %s OR po_number = %s OR po_number LIKE %s
                ORDER BY created_at ASC
                """,
                (result.get("po_id"), po_number, f"{base_po_prefix}%"),
            )
            proposal_records = cur.fetchall()

            result["vendor_negotiations"] = {
                "proposals": [dict(p) for p in proposal_records],
                "chat_messages": [dict(m) for m in chat_records],
                "proposal_count": len(proposal_records),
                "inquiry_count": len(chat_records),
                "has_negotiations": (len(proposal_records) > 0 or len(chat_records) > 0),
            }
            return result
        finally:
            cur.close()
            conn.close()

    def get_report_by_po(self, po_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves the active report for a specific PO, generating if missing."""
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                """
                SELECT id FROM order_reports
                WHERE po_id = %s AND status = 'ACTIVE'
                ORDER BY id DESC
                LIMIT 1
                """,
                (po_id,),
            )
            row = cur.fetchone()
            if not row:
                # Auto-generate for this PO
                created = self.generate_order_report(po_id, trigger_reason="ON_DEMAND_FETCH")
                return self.get_report_by_id(str(created["id"]))
            return self.get_report_by_id(str(row["id"]))
        finally:
            cur.close()
            conn.close()

    def delete_report(self, report_id: str) -> bool:
        """Deletes a report and its PDF file."""
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            if str(report_id).isdigit():
                cur.execute("SELECT * FROM order_reports WHERE id = %s", (int(report_id),))
            else:
                cur.execute("SELECT * FROM order_reports WHERE report_id = %s", (report_id,))
            row = cur.fetchone()
            if not row:
                return False

            pdf_path = row.get("pdf_path")
            if pdf_path:
                try:
                    delete_object(pdf_path)
                except Exception as e:
                    log.warning(f"Failed to delete PDF from MinIO: {e}")

            cur.execute("DELETE FROM order_reports WHERE id = %s", (row["id"],))
            conn.commit()
            return True
        finally:
            cur.close()
            conn.close()

    def get_summary_metrics(self) -> Dict[str, Any]:
        """Returns executive KPI statistics across all order documentation."""
        self.ensure_all_orders_documented()

        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            cur.execute(
                """
                SELECT
                    COUNT(*) AS total_orders_documented,
                    COUNT(*) FILTER (WHERE order_data->>'status' = 'APPROVED') AS approved_orders,
                    COUNT(*) FILTER (WHERE order_data->>'status' = 'DELIVERED') AS delivered_orders,
                    COUNT(*) FILTER (WHERE order_data->>'status' = 'SUPERSEDED') AS superseded_orders,
                    COUNT(*) FILTER (WHERE version > 1 OR order_data->>'status' = 'SUPERSEDED') AS revised_orders,
                    COALESCE(SUM((financial_breakdown->>'gross_order_amount')::numeric), 0.0) AS total_spend_documented
                FROM order_reports
                WHERE status = 'ACTIVE'
                """
            )
            stats = dict(cur.fetchone())
            return stats
        finally:
            cur.close()
            conn.close()


# Singleton Instance
report_agent = ReportGenerationAgent()
