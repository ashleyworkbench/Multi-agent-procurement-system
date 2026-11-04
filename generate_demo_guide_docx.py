import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, left=180, right=180):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def add_heading_styled(doc, text, level=1):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after = Pt(6)
    run = h.runs[0]
    run.font.name = "Calibri"
    if level == 1:
        run.font.size = Pt(18)
        run.bold = True
        run.font.color.rgb = RGBColor(0x0F, 0x29, 0x4A)
    elif level == 2:
        run.font.size = Pt(14)
        run.bold = True
        run.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
    elif level == 3:
        run.font.size = Pt(12)
        run.bold = True
        run.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    return h

def add_para(doc, text, bold_prefix="", italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        r_pre.bold = True
        r_pre.font.name = "Calibri"
        r_pre.font.size = Pt(10.5)
        r_pre.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    r = p.add_run(text)
    r.italic = italic
    r.font.name = "Calibri"
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    return p

def add_bullet(doc, text, bold_prefix=""):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        r_pre.bold = True
        r_pre.font.name = "Calibri"
        r_pre.font.size = Pt(10.5)
        r_pre.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    r = p.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    return p

def add_action_box(doc, text):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.8)
    set_cell_background(cell, "EFF6FF")
    set_cell_margins(cell, top=100, bottom=100, left=160, right=160)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="20" w:space="0" w:color="2563EB"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_t = p.add_run("🖥️ WHAT TO SHOW ON SCREEN / CLICK:\n")
    run_t.bold = True
    run_t.font.name = "Calibri"
    run_t.font.size = Pt(10.5)
    run_t.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
    
    run_c = p.add_run(text)
    run_c.font.name = "Calibri"
    run_c.font.size = Pt(10)
    run_c.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(2)
    p_after.paragraph_format.space_after = Pt(2)

def add_spoken_script(doc, text):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.8)
    set_cell_background(cell, "F0FDF4")
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="24" w:space="0" w:color="16A34A"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run_t = p.add_run("🎙️ WHAT TO SAY (EXACT PRESENTATION SCRIPT):\n")
    run_t.bold = True
    run_t.font.name = "Calibri"
    run_t.font.size = Pt(10.5)
    run_t.font.color.rgb = RGBColor(0x15, 0x80, 0x3D)
    
    run_c = p.add_run(f'"{text}"')
    run_c.italic = True
    run_c.font.name = "Calibri"
    run_c.font.size = Pt(10)
    run_c.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(2)
    p_after.paragraph_format.space_after = Pt(2)

def add_qa_card(doc, num, q, category, ans):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(6.8)
    set_cell_background(cell, "F8FAFC")
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="20" w:space="0" w:color="64748B"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    
    r_tag = p.add_run(f"Q{num} [{category.upper()}]: ")
    r_tag.bold = True
    r_tag.font.name = "Calibri"
    r_tag.font.size = Pt(10.5)
    r_tag.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    
    r_q = p.add_run(f"{q}\n\n")
    r_q.bold = True
    r_q.font.name = "Calibri"
    r_q.font.size = Pt(10.5)
    r_q.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    
    r_ans_lbl = p.add_run("💡 Recommended Answer: ")
    r_ans_lbl.bold = True
    r_ans_lbl.font.name = "Calibri"
    r_ans_lbl.font.size = Pt(10)
    r_ans_lbl.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)
    
    r_ans = p.add_run(ans)
    r_ans.font.name = "Calibri"
    r_ans.font.size = Pt(10)
    r_ans.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(2)
    p_after.paragraph_format.space_after = Pt(2)

def build_presentation_word_doc(output_path):
    doc = docx.Document()
    
    # Page setup - Margins
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
    
    # -------------------------------------------------------------
    # TITLE & HEADER
    # -------------------------------------------------------------
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(10)
    title_p.paragraph_format.space_after = Pt(4)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    
    r_title = title_p.add_run("FINAL PROJECT PRESENTATION & LIVE DEMO GUIDE\n")
    r_title.bold = True
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(24)
    r_title.font.color.rgb = RGBColor(0x0F, 0x29, 0x4A)
    
    r_sub = title_p.add_run("ProcureFlow: Autonomous Multi-Agent AI Smart Procurement & Supply Chain System\n")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(14)
    r_sub.bold = True
    r_sub.font.color.rgb = RGBColor(0x1D, 0x4E, 0xD8)
    
    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_before = Pt(2)
    meta_p.paragraph_format.space_after = Pt(16)
    meta_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_meta = meta_p.add_run("Complete End-to-End Walkthrough (0% to 100%) • Scripted Narration • Evaluator Q&A Defense")
    r_meta.italic = True
    r_meta.font.name = "Calibri"
    r_meta.font.size = Pt(10.5)
    r_meta.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    
    # Divider line
    p_hr = doc.add_paragraph()
    p_hr.paragraph_format.space_after = Pt(12)
    r_hr = p_hr.add_run("―" * 65)
    r_hr.font.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)
    
    # -------------------------------------------------------------
    # SECTION 1: EXECUTIVE BRIEFING
    # -------------------------------------------------------------
    add_heading_styled(doc, "1. Executive Briefing & Architecture Overview", level=1)
    add_para(doc, "ProcureFlow is an autonomous, enterprise-grade multi-agent procurement system designed to eliminate manual delays, supply chain stockouts, and rogue purchasing. The platform orchestrates 6 intelligent agents communicating asynchronously through Apache Kafka event streaming, backed by dual relational databases (PostgreSQL and MySQL), MinIO S3-compatible object storage, and machine learning models for predictive risk analysis.")
    
    add_heading_styled(doc, "Core Architectural Components:", level=3)
    add_bullet(doc, "Agent 1 (OCR & Document Intelligence): Uses Docling deep parsing and Gemini 2.5 Flash LLM to parse unstructured PDF/image invoices into structured procurement line items.", "• ")
    add_bullet(doc, "Agent 2 (Inventory Intelligence Agent): Real-time Kafka consumer that detects requested materials, inspects cross-industry warehouse balances (PostgreSQL Construction DB & MySQL Manufacturing DB), and computes net shortages.", "• ")
    add_bullet(doc, "Agent 3 & Risk Analysis Agent (Vendor Intelligence & ML Scoring): Implements multi-criteria decision analysis (MCDA) across 6 weighted dimensions and a Random Forest Classifier to assign vendor risk tiers (LOW, MEDIUM, HIGH).", "• ")
    add_bullet(doc, "Agent 4 (Procurement & Sourcing Agent): Automatically drafts compliant purchase orders, applies 3-tier financial threshold approval routing, generates cryptographically verified PO PDFs, and dispatches approval emails.", "• ")
    add_bullet(doc, "Procura AI Chatbot Subsystem: RAG-grounded supplier negotiation chatbot powered by Google Gemini, enabling vendors to inquire and submit counter-proposals that trigger formal buyer approvals and revision POs.", "• ")
    add_bullet(doc, "Quality & Defective Items Subsystem: Tracks return merchandise authorizations (RMAs), quarantine workflows, and automated PDF claim generation.", "• ")
    add_bullet(doc, "Agent 6 (Order Documentation & Audit Agent): Compiles comprehensive, tamper-evident audit dossiers with SHA-256 cryptographic hashes for full traceability.", "• ")

    # -------------------------------------------------------------
    # SECTION 2: END-TO-END DEMO WORKFLOW (0% TO 100%)
    # -------------------------------------------------------------
    doc.add_page_break()
    add_heading_styled(doc, "2. Complete End-to-End Live Demonstration Workflow", level=1)
    add_para(doc, "Follow this exact sequence during your live presentation. Each stage specifies what to show on screen, what actions to perform, the word-for-word spoken dialogue, and the behind-the-scenes technical architecture to highlight.")
    
    # Step 1
    add_heading_styled(doc, "Step 1: System Startup & Architecture Health Check", level=2)
    add_action_box(doc, "1. Open your browser to http://localhost:3000 (Control Panel / Dashboard).\n2. Optionally have a terminal window showing 'docker ps' or your system status bar showing all 19 microservices healthy.")
    add_spoken_script(doc, "Good morning, respected guides and evaluators. Today we are presenting ProcureFlow, an autonomous multi-agent procurement platform. Before diving into live operations, let us examine our running infrastructure. As you can see, our application runs as an event-driven microservices architecture comprising 19 decoupled Docker containers. We have Apache Kafka for distributed asynchronous event streaming, PostgreSQL and MySQL for enterprise multi-tenant databases, MinIO for S3 object storage, and specialized AI agent services communicating over an API Gateway. Every transaction in this system is completely event-driven, observable, and auditable.")
    add_bullet(doc, "Microservices decoupled via Docker; Apache Kafka event broker handles topic message queues without blocking API threads.", "Behind the Scenes: ")

    # Step 2
    add_heading_styled(doc, "Step 2: Control Panel Dashboard & Real-Time Event Pipeline", level=2)
    add_action_box(doc, "1. On http://localhost:3000, point out the Top KPI Cards (Active Requests, Purchase Orders, Total Spend, Defective Items).\n2. Scroll to the Live Kafka Logs & Automation Pipeline panel.\n3. Show the Agent Status Panel (Agent 2 Inventory, Agent 3 Vendor, Agent 4 Procurement) and Recent Activity.")
    add_spoken_script(doc, "This is the System Control Panel. At the top, procurement officers get real-time operational visibility into spend metrics, active requisitions, and warehouse alerts. Immediately below is our real-time Kafka event streaming monitor. As our AI agents process requests, every state change emits a structured Kafka event across topics like invoice-topic, ocr-request-topic, inventory-evaluation-topic, and purchase-order-topic. Below that, our Agent Monitor displays real-time health, latency, and heartbeat status for our autonomous background workers.")
    add_bullet(doc, "Kafka logs panel polls Kafka event store with live visual filters by topic and source agent.", "Behind the Scenes: ")

    # Step 3
    add_heading_styled(doc, "Step 3: Document Ingestion & Agent 1 (OCR Extraction)", level=2)
    add_action_box(doc, "1. Click on 'Requests' in the sidebar (/requests).\n2. In the upload dropzone, select a sample invoice PDF (e.g., invoices/invoice_1.pdf or drag & drop).\n3. Click 'Process Invoice'.\n4. Observe the progress modal: OCR Parsing -> Gemini LLM Extraction -> Saved to DB.\n5. Click on the extracted request card to expand line items.")
    add_spoken_script(doc, "Let us trigger the procurement lifecycle from scratch. In enterprise procurement, requisitions frequently arrive as scanned PDF invoices or purchase requests. Here, we upload a supplier requisition. Behind the scenes, Agent 1 ingests the file, stores the raw binary in MinIO storage, and passes it to Docling for structural layout parsing. Then, our multimodal LLM extracts normalized line items, quantities, and GST totals into the database, emitting an OCR_REQUEST_CREATED event to Kafka topic 'ocr-request-topic'. Notice how no manual human data entry was required.")
    add_bullet(doc, "Data persisted in ocr_procurement_db.procurement_requests; emitted event carries request_id to trigger downstream agents.", "Behind the Scenes: ")

    # Step 4
    add_heading_styled(doc, "Step 4: Autonomous Inventory Check (Agent 2)", level=2)
    add_action_box(doc, "1. Click on 'Workflows' (/workflows) or 'Inventory' (/inventory).\n2. Select the newly created Request ID.\n3. Show the interactive pipeline graph moving from Agent 1 to Agent 2.\n4. Show the warehouse comparison: Current Stock vs Required Stock -> Shortage calculated.")
    add_spoken_script(doc, "The moment Agent 1 published to Kafka, Agent 2—the Inventory Intelligence Agent—consumed the event autonomously. It queried our multi-industry inventory databases: the Construction database in PostgreSQL and the Manufacturing database in MySQL. Agent 2 detected that our warehouse stock is below the safety threshold, calculated the exact shortage delta, and emitted an INVENTORY_EVALUATED event containing the shortage items directly into the next topic.")
    add_bullet(doc, "Agent 2 handles multi-database aggregation without data coupling; shortage delta prevents over-purchasing.", "Behind the Scenes: ")

    # Step 5
    add_heading_styled(doc, "Step 5: Vendor Recommendation & Risk Analysis (Agent 3 & Risk ML)", level=2)
    add_action_box(doc, "1. In the Workflow view, show Agent 3's recommendation card.\n2. Click 'Risk Analysis' in the sidebar (/risk-analysis).\n3. Show the Vendor Risk Leaderboard, Radar Chart of 6 dimensions, and Risk Classification badge (e.g. LOW_RISK with 96% probability).")
    add_spoken_script(doc, "Now Agent 3, our Vendor Intelligence Agent, evaluates all approved suppliers capable of supplying the shortage items. To select the optimal vendor, Agent 3 consults our Machine Learning Risk Analysis Agent. As seen on this Risk Analysis dashboard, vendors are evaluated through a two-layer intelligence engine: first, a Random Forest Classifier evaluating 10 canonical performance features such as on-time delivery rate, defect rate, and price variance; and second, a Multi-Criteria Suitability Scoring algorithm that weights Risk at 20%, Delivery at 20%, Quality at 15%, Pricing at 15%, Compliance at 15%, and Capacity at 15%. UltraTech Cement or Ambuja Cements is selected as the optimal, lowest-risk supplier.")
    add_bullet(doc, "Machine Learning model trained on historical vendor performance; balanced class weights prevent majority bias.", "Behind the Scenes: ")

    # Step 6
    add_heading_styled(doc, "Step 6: Purchase Order Generation & Routing (Agent 4)", level=2)
    add_action_box(doc, "1. In Workflow view or Control Panel, observe Agent 4 generating the PO (e.g., PO-2026-XXXX).\n2. Click 'Purchase Orders' (/purchase-orders) to show the new PO in PENDING_APPROVAL status.\n3. Click 'View PO PDF' to preview the generated official Purchase Order document.")
    add_spoken_script(doc, "With the vendor selected, Agent 4—the Procurement Sourcing Agent—generates a formal Purchase Order. It automatically assigns a unique PO number, calculates tax-compliant totals, and applies our company's 3-tier financial threshold routing policy. Orders below ₹50,000 route to the Procurement Officer; between ₹50,000 and ₹200,000 route to the Operations Manager; and orders above ₹200,000 escalate to the Finance Director. Agent 4 compiles a formal PDF in ReportLab, archives it in MinIO, and dispatches an approval notification.")
    add_bullet(doc, "PO stored in procurement_db.purchase_orders; PDF generated and synced to MinIO pos/ bucket.", "Behind the Scenes: ")

    # Step 7
    add_heading_styled(doc, "Step 7: Multi-Tier Approval & DocuSign Digital Signature", level=2)
    add_action_box(doc, "1. Click on 'Approvals' in the sidebar (/approvals).\n2. Show the pending approval card with financial tier badge (e.g., TIER 1 OFFICER).\n3. Click 'Review & Sign with DocuSign'.\n4. Show the simulated DocuSign signing ceremony: click to affix the digital signature, type signer name, and click 'Complete Digital Signature'.\n5. Show the updated status: APPROVED / ORDERED with green badge and verified signature timestamp.")
    add_spoken_script(doc, "Now we switch to the executive approval stage. In the Approvals queue, the assigned manager reviews the contract terms and executes our integrated DocuSign ceremony. When the manager signs, the system cryptographically certifies the PDF, records an immutable audit ledger entry in our procurement_audit table, updates the PO status to APPROVED, and automatically notifies the supplier portal.")
    add_bullet(doc, "Audit ledger logs action, old_status, new_status, performed_by, and timestamp; prevents unauthorized status bypass.", "Behind the Scenes: ")

    # Step 8
    add_heading_styled(doc, "Step 8: Supplier Portal & Procura AI Negotiation Chatbot", level=2)
    add_action_box(doc, "1. Click on 'Procura AI Chat' (/procura) or switch to 'Vendor Portal' (/vendor-portal).\n2. Verify the PO Number (e.g. PO-2026-XXXX).\n3. In Procura chat, type: 'Can we deliver 9,500 units instead of 10,000 units due to truck capacity?' or 'Can we offer a revised price of ₹7.20 per unit?'\n4. Show Procura's intelligent RAG response validating policy compliance.\n5. Click 'Submit Counter-Proposal' -> Fill proposed quantity/price.\n6. Switch to 'Approvals' tab -> Under 'Pending Supplier Counter-Proposals', show the proposal.\n7. Click 'Accept Proposal' -> Show that the original PO is marked SUPERSEDED and a new revised PO (e.g. PO-2026-XXXX-R1) is created.\n8. Highlight: An approval email is automatically re-sent with the new terms for re-signature!")
    add_spoken_script(doc, "A breakthrough capability of ProcureFlow is Procura, our Gemini-powered RAG Supplier Chatbot. Suppliers can access the portal and negotiate delivery schedules or quantity adjustments. Procura is strictly bound by procurement RAG constraints—it cannot unilaterally alter contracts. Instead, when a vendor proposes an adjustment, Procura validates price variance tolerances and drafts a structured Counter-Proposal. When our internal buyer reviews and accepts it, our backend automatically marks the old PO as SUPERSEDED, issues a new revised PO, regenerates the contract PDF, and immediately re-dispatches an approval email for formal re-signature.")
    add_bullet(doc, "Conversations saved in procura_conversations & procura_chat_messages; revised PO created with clean audit trail.", "Behind the Scenes: ")

    # Step 9
    add_heading_styled(doc, "Step 9: Quality Control & Defective Items Subsystem", level=2)
    add_action_box(doc, "1. Click on 'Defective Items' in the sidebar (/defective-items).\n2. Show the KPI summary (Critical, Major, Claims Value, Quarantined).\n3. Click 'Log Defective Shipment' -> Select PO, enter defective quantity, defect type (e.g. Dimensional Inaccuracy), severity (CRITICAL).\n4. Submit and show the new entry with an automated RMA number (e.g. RMA-2026-XXXX).\n5. Click 'Download RMA Certificate' to preview the official PDF.")
    add_spoken_script(doc, "Procurement does not end with delivery; quality assurance is essential. Our Defective Items subsystem allows warehouse inspectors to record damaged or non-compliant shipments. When logged, the system assigns a unique Return Merchandise Authorization (RMA) tracking code, isolates the batch in a quarantine bay, calculates total financial claim value, and auto-generates a formal RMA Certificate PDF for debit memo or replacement stock resolution.")
    add_bullet(doc, "Records stored in defective_items; auto-updates vendor performance metrics for future risk evaluations.", "Behind the Scenes: ")

    # Step 10
    add_heading_styled(doc, "Step 10: Closed-Loop Feedback & Supervised Model Retraining", level=2)
    add_action_box(doc, "1. Return to 'Risk Analysis' (/risk-analysis).\n2. Click 'Submit Performance Feedback' -> Select vendor, order ID, rating, and actual outcome (e.g. 'Defective shipment' -> 'HIGH_RISK').\n3. Click 'Submit Feedback' -> Show '1 Unconsumed Feedback Sample'.\n4. Click 'Trigger Retraining' button -> Observe model training progress, confusion matrix update, and new model version (e.g. v20261030) promoted.")
    add_spoken_script(doc, "Notice how the defective shipment creates an active feedback loop. Here in the Risk Analysis module, administrators submit ground-truth operational feedback. This feedback is stored in our database and flagged for model retraining. When we trigger retraining, our Retraining Engine extracts unconsumed feedback, merges it with historical records, retrains the Random Forest Classifier, evaluates accuracy and F1 score against validation thresholds, and promotes the updated model to production. The AI actively learns from real-world operations!")
    add_bullet(doc, "Retraining pipeline in services/agent-risk/retrainer.py; consumes vendor_risk_feedback records.", "Behind the Scenes: ")

    # Step 11
    add_heading_styled(doc, "Step 11: Comprehensive Order Dossier & Audit Reports (Agent 6)", level=2)
    add_action_box(doc, "1. Click 'Reports' (/reports) in the sidebar.\n2. Select the PO report dossier.\n3. Show the compilation: PO Metadata, Agent Chronology, Audit Trail, Quality Log, and Chat Transcripts.\n4. Show the SHA-256 Cryptographic Hash at the bottom.\n5. Click 'Download PDF Report' to preview the comprehensive multi-page compiled audit dossier.")
    add_spoken_script(doc, "Finally, our compliance agent, Agent 6, compiles the Order Documentation Dossier. This document consolidates the entire end-to-end lifecycle into an immutable audit package: the original requisition, inventory decisions, vendor risk evaluation, DocuSign signing stamps, vendor chatbot inquiries, and defect inspections. It generates a cryptographic SHA-256 integrity hash, guaranteeing compliance with enterprise corporate governance and SOX audit standards.")
    add_bullet(doc, "Generated via services/procurement-service/order_report_pdf.py; stores verification date and SHA-256 hash.", "Behind the Scenes: ")

    # Step 12
    add_heading_styled(doc, "Step 12: Backend Verification for Evaluators (SQL Tables & MinIO)", level=2)
    add_action_box(doc, "1. Open a terminal or browser window at http://localhost:8085 (Adminer) or http://localhost:9001 (MinIO Console).\n2. Run: docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db\n3. Run: \\dt\n4. Run: SELECT po_number, vendor_name, total_price, status, docusign_status FROM purchase_orders LIMIT 5;\n5. In MinIO Console, show the 'procurement-documents' bucket with archived PDFs.")
    add_spoken_script(doc, "To prove that all UI operations are backed by true persistent enterprise infrastructure, let us inspect the database directly. In our PostgreSQL database procurement_db, we see our relational tables: purchase_orders, procurement_audit, defective_items, and vendor_risk_feedback. In MinIO, we see all certified PDF contracts and invoice artifacts cryptographically archived. This concludes our end-to-end demonstration.")
    add_bullet(doc, "PostgreSQL on port 5433, MySQL on port 3307, MinIO S3 API on 9000/9001; fully decoupled and production-ready.", "Behind the Scenes: ")

    # -------------------------------------------------------------
    # SECTION 3: VIVA & EVALUATION Q&A DEFENSE
    # -------------------------------------------------------------
    doc.add_page_break()
    add_heading_styled(doc, "3. Evaluator Viva Q&A Defense (Anticipated Questions & Answers)", level=1)
    add_para(doc, "Here is a curated compilation of the toughest technical and architectural questions that project evaluators and external examiners are likely to ask, along with comprehensive, defensible answers.")
    
    # Q1
    add_qa_card(doc, 1, 
        "Why did you choose a Multi-Agent architecture instead of a single large LLM prompt or monolithic script?",
        "Architecture",
        "A monolithic LLM prompt suffers from context window saturation, non-deterministic execution, and a single point of failure. By decoupling into specialized autonomous agents (OCR, Inventory, Vendor Intelligence, Sourcing, Risk, and Audit), each agent executes a discrete responsibility with strict input/output schemas. Furthermore, agents run asynchronously—Agent 2 checks inventory across multiple database engines without waiting for vendor ranking, making the system scalable, fault-tolerant, and maintainable.")
    
    # Q2
    add_qa_card(doc, 2, 
        "Why use Apache Kafka instead of simple REST API calls between agents?",
        "Event Streaming",
        "REST APIs are synchronous and create tight coupling; if the Vendor Service is slow or temporarily down, the entire procurement pipeline hangs. Apache Kafka provides a distributed, durable event log. When Agent 1 emits an OCR event, it is persisted to a Kafka topic. Downstream consumers can process events at their own pace, retry on failure without losing data, and support horizontal scaling by adding more consumer worker instances.")
    
    # Q3
    add_qa_card(doc, 3, 
        "Why do you have both PostgreSQL and MySQL in the same project?",
        "Data Engineering",
        "In real-world enterprise procurement, companies operate heterogeneous legacy systems across acquired business units or manufacturing plants. Our PostgreSQL database manages construction supplies, transactional purchase orders, and audit logs, while our MySQL database manages manufacturing inventory and supplier catalogs. Agent 2 demonstrates cross-database federation, checking balances across both SQL engines seamlessly.")
    
    # Q4
    add_qa_card(doc, 4, 
        "What machine learning algorithms power the Risk Analysis Agent, and how are features defined?",
        "Machine Learning",
        "The Risk Analysis Agent uses a Random Forest Classifier (with Gradient Boosting as an alternative). It evaluates 10 canonical features: 8 numerical (on-time delivery rate, average delay days, lead time, defect rate, return rate, price variance, compliance audit score, violations count) and 2 categorical (ISO certification status and spend tier volume). It uses balanced class weights ('balanced') to prevent bias toward majority classes and outputs class probabilities for LOW_RISK, MEDIUM_RISK, and HIGH_RISK.")
    
    # Q5
    add_qa_card(doc, 5, 
        "What are the exact weightages used in the Vendor Suitability Multi-Criteria Decision Analysis (MCDA)?",
        "Algorithms",
        "The suitability scoring algorithm computes a weighted score from 0 to 100 based on company rules: Risk Score (ML Model probability) = 20%, Delivery Performance (on-time rate and lead time) = 20%, Quality Score (defect and return rate) = 15%, Pricing & Budget Fit = 15%, Compliance & Governance (violations and ISO certs) = 15%, and Capability/Capacity = 15%. Total equals exactly 100%.")
    
    # Q6
    add_qa_card(doc, 6, 
        "How does the system prevent LLM hallucinations in the Procura Vendor Chatbot?",
        "Generative AI / RAG",
        "We implement Retrieval-Augmented Generation (RAG) with strict prompt boundaries. Procura is injected with exact PO line item context, company negotiation boundaries (maximum 10% price variance, ±14 days delivery shift), and a deterministic policy that forbids Procura from approving changes. When a vendor asks for an adjustment, Procura calculates the mathematical variance deterministically and requires a formal buyer approval workflow before any PO is revised.")
    
    # Q7
    add_qa_card(doc, 7, 
        "How is security and role-based access control (RBAC) enforced?",
        "Security",
        "Security is enforced using cryptographically signed JWT tokens (HS256) with role claims. Roles include Admin, Procurement Officer, Operations Manager, Finance Director, and Vendor. Endpoints enforce strict route-level dependencies. For example, approving a purchase order or reviewing a Procura counter-offer strictly requires buyer authorization, and vendors can only view purchase orders matching their assigned vendor_id.")
    
    # Q8
    add_qa_card(doc, 8, 
        "What happens if a supplier submits a counter-offer through the chatbot?",
        "Workflow",
        "The counter-offer is validated against company thresholds and saved in po_negotiation_proposals with 'PENDING' status. It appears in the buyer's Approvals Queue. If the buyer approves it, the original PO is marked 'SUPERSEDED' (voided), a new revised PO (e.g., PO-XXXX-R1) is created in PENDING_APPROVAL status, a fresh draft PDF is generated, and an automated approval email is dispatched to the approver for formal digital signature.")
    
    # Q9
    add_qa_card(doc, 9, 
        "How does the system ensure audit trails cannot be tampered with?",
        "Compliance",
        "Every status transition writes an immutable append-only record to the procurement_audit table capturing po_id, action, old_status, new_status, performed_by, and timestamp. There are no UPDATE or DELETE operations exposed on this table. Furthermore, Agent 6 generates a SHA-256 cryptographic digest across the entire order dossier so any tampering with the historical records immediately invalidates the document hash.")
    
    # Q10
    add_qa_card(doc, 10, 
        "How does the model retraining feedback loop work in production?",
        "MLOps",
        "When quality inspectors or managers submit operational ratings in the Risk Analysis tab, feedback is saved to vendor_risk_feedback with used_in_retraining = FALSE. During scheduled or manual retraining, the retrainer queries unconsumed records, treats them as verified ground-truth labels, retrains the Random Forest model, computes F1 and precision scores against validation splits, and if performance thresholds are met, serializes and promotes the new model artifact while flipping used_in_retraining to TRUE.")

    # -------------------------------------------------------------
    # SECTION 4: DATABASE & VERIFICATION CHEATSHEET
    # -------------------------------------------------------------
    doc.add_page_break()
    add_heading_styled(doc, "4. Database & Verification Cheatsheet", level=1)
    add_para(doc, "Keep these exact credentials, ports, and queries handy if your guide asks to inspect the database live:")
    
    # Table of connection details
    t_conn = doc.add_table(rows=5, cols=4)
    t_conn.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_conn.autofit = False
    
    headers = ["Service / Engine", "Host & Port", "Database Name", "Default User / Pass"]
    for i, h_text in enumerate(headers):
        cell = t_conn.cell(0, i)
        cell.paragraphs[0].text = h_text
        cell.paragraphs[0].runs[0].bold = True
        set_cell_background(cell, "0F294A")
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        set_cell_margins(cell, top=100, bottom=100, left=120, right=120)
        
    rows_data = [
        ("PostgreSQL (Procurement)", "localhost:5433", "procurement_db", "procurement_admin / SecurePass@2024"),
        ("PostgreSQL (Agent 1 OCR)", "localhost:5433", "ocr_procurement_db", "procurement_admin / SecurePass@2024"),
        ("MySQL (Manufacturing)", "localhost:3307", "manufacturing_procurement_db", "procurement_admin / SecurePass@2024"),
        ("MinIO Object Storage", "http://localhost:9001", "procurement-documents", "minioadmin / SecurePass@2024"),
    ]
    
    for row_idx, r_data in enumerate(rows_data):
        for col_idx, text_val in enumerate(r_data):
            cell = t_conn.cell(row_idx + 1, col_idx)
            cell.paragraphs[0].text = text_val
            cell.paragraphs[0].runs[0].font.name = "Calibri"
            cell.paragraphs[0].runs[0].font.size = Pt(9.5)
            set_cell_background(cell, "F8FAFC" if row_idx % 2 == 0 else "FFFFFF")
            set_cell_margins(cell, top=80, bottom=80, left=120, right=120)
            
    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    
    add_heading_styled(doc, "Essential Terminal Commands to Run Live:", level=2)
    add_para(doc, "1. Connect to Main Procurement Database:\n   docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db\n\n2. View Live Purchase Orders:\n   SELECT po_number, vendor_name, total_price, status, docusign_status, created_at FROM purchase_orders ORDER BY id DESC LIMIT 5;\n\n3. View Procura Chat Messages Stored in Database:\n   SELECT po_number, sender, intent, message, created_at FROM procura_chat_messages ORDER BY id DESC LIMIT 5;\n\n4. View Defective Items & RMA Records:\n   SELECT po_number, rma_number, defect_type, severity, total_claim_amount FROM defective_items ORDER BY id DESC LIMIT 5;\n\n5. View OCR Extracted Invoices (Agent 1):\n   docker exec -it procurement_postgres psql -U procurement_admin -d ocr_procurement_db -c 'SELECT id, requester_name, total_estimated_cost, created_at FROM procurement_requests ORDER BY id DESC LIMIT 5;'")

    # Save document
    doc.save(output_path)
    print(f"Document saved successfully to {output_path}")

if __name__ == "__main__":
    out_file = "/home/kaustubh/major project/Multi-agent-procurement-system/FINAL_PROJECT_PRESENTATION_AND_DEMO_GUIDE.docx"
    build_presentation_word_doc(out_file)
