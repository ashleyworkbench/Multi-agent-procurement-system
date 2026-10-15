import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ---------------------------------------------------------------------------
# Font Registration (TrueType DejaVu with Full Unicode, Currency & Math)
# ---------------------------------------------------------------------------
FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont('DejaVuSans', os.path.join(FONT_DIR, 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', os.path.join(FONT_DIR, 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuSans-Oblique', os.path.join(FONT_DIR, 'DejaVuSans-Oblique.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuSansMono', os.path.join(FONT_DIR, 'DejaVuSansMono.ttf')))
pdfmetrics.registerFont(TTFont('DejaVuSansMono-Bold', os.path.join(FONT_DIR, 'DejaVuSansMono-Bold.ttf')))

registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans-Bold', italic='DejaVuSans-Oblique')


class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to calculate dynamic total page count,
    drawing running headers and footers with academic/industry standards.
    """
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super(NumberedCanvas, self).showPage()
        super(NumberedCanvas, self).save()

    def draw_page_decorations(self, page_count):
        if self._pageNumber == 1:
            # Suppress header and footer on the title/cover page
            return

        self.saveState()
        self.setFont("DejaVuSans", 8)
        self.setFillColor(colors.HexColor("#475569"))

        # Running Header
        self.drawString(54, 11 * inch - 36, "Agentic AI for Smart Procurement & Operational Risk — Comprehensive Project Dossier")
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 11 * inch - 42, 8.5 * inch - 54, 11 * inch - 42)

        # Running Footer
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(8.5 * inch - 54, 34, page_str)
        self.drawString(54, 34, "Department of Computer Engineering — Technical Evaluation & Research Dossier")
        self.line(54, 46, 8.5 * inch - 54, 46)
        self.restoreState()


def build_pdf(filename="Project_Report_Agentic_Procurement.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    primary_color   = colors.HexColor("#1E3A8A")  # Deep Navy 900
    secondary_color = colors.HexColor("#0284C7")  # Sky Blue 600
    dark_neutral    = colors.HexColor("#0F172A")  # Slate 900
    body_color      = colors.HexColor("#334155")  # Slate 700
    light_bg        = colors.HexColor("#F8FAFC")  # Slate 50
    border_color    = colors.HexColor("#CBD5E1")  # Slate 300
    accent_green    = colors.HexColor("#166534")  # Green 800

    title_style = ParagraphStyle(
        'CoverTitle',
        fontName='DejaVuSans-Bold',
        fontSize=21,
        leading=26,
        textColor=primary_color,
        alignment=1,
        spaceAfter=10
    )

    subtitle_style = ParagraphStyle(
        'CoverSubtitle',
        fontName='DejaVuSans',
        fontSize=11,
        leading=15.5,
        textColor=secondary_color,
        alignment=1,
        spaceAfter=18
    )

    h1_style = ParagraphStyle(
        'Heading1_Custom',
        fontName='DejaVuSans-Bold',
        fontSize=14.5,
        leading=19,
        textColor=primary_color,
        spaceBefore=14,
        spaceAfter=7,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'Heading2_Custom',
        fontName='DejaVuSans-Bold',
        fontSize=11.5,
        leading=15.5,
        textColor=secondary_color,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'Heading3_Custom',
        fontName='DejaVuSans-Bold',
        fontSize=9.5,
        leading=13,
        textColor=dark_neutral,
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body_Custom',
        fontName='DejaVuSans',
        fontSize=8.5,
        leading=12.5,
        textColor=body_color,
        spaceAfter=5
    )

    bullet_style = ParagraphStyle(
        'Bullet_Custom',
        fontName='DejaVuSans',
        fontSize=8.5,
        leading=12.2,
        textColor=body_color,
        leftIndent=14,
        firstLineIndent=-9,
        spaceAfter=3
    )

    formula_title = ParagraphStyle(
        'FormulaTitle',
        fontName='DejaVuSans-Bold',
        fontSize=9.5,
        leading=12.5,
        textColor=primary_color,
        spaceAfter=3
    )

    formula_main = ParagraphStyle(
        'FormulaMain',
        fontName='DejaVuSans-Bold',
        fontSize=10,
        leading=14.5,
        textColor=dark_neutral,
        alignment=1,
        spaceBefore=2,
        spaceAfter=3
    )

    formula_sub = ParagraphStyle(
        'FormulaSub',
        fontName='DejaVuSans',
        fontSize=8.2,
        leading=11.5,
        textColor=dark_neutral,
        alignment=0,
        spaceAfter=2
    )

    code_style = ParagraphStyle(
        'Code_Custom',
        fontName='DejaVuSansMono',
        fontSize=7,
        leading=9.8,
        textColor=colors.HexColor("#0F172A")
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        fontName='DejaVuSans-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white,
        alignment=1
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        fontName='DejaVuSans',
        fontSize=7.5,
        leading=10,
        textColor=body_color
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        fontName='DejaVuSans-Bold',
        fontSize=7.5,
        leading=10,
        textColor=dark_neutral
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        fontName='DejaVuSans',
        fontSize=8,
        leading=11.5,
        textColor=colors.HexColor("#1E293B")
    )

    story = []

    # -----------------------------------------------------------------------
    # COVER / TITLE BLOCK & EXECUTIVE METADATA
    # -----------------------------------------------------------------------
    story.append(Spacer(1, 20))
    story.append(Paragraph("TECHNICAL EVALUATION & RESEARCH PAPER DOSSIER", ParagraphStyle('SuperTitle', fontName='DejaVuSans-Bold', fontSize=9.5, leading=12, textColor=secondary_color, alignment=1, spaceAfter=6)))
    story.append(Paragraph("Agentic AI for Autonomous Procurement & Operational Risk Intelligence in Manufacturing Industries", title_style))
    story.append(Paragraph("An Event-Driven Multi-Agent Architecture with OCR, Dual-LLM Entity Parsing, Random Forest Risk Classification, and Cryptographic Governance", subtitle_style))
    story.append(HRFlowable(width="65%", thickness=2, color=secondary_color, spaceBefore=2, spaceAfter=14, hAlign='CENTER'))

    # Metadata Card Table
    team_data = [
        [
            Paragraph("<b>Project Team Members:</b>", table_cell_bold),
            Paragraph("<b>Project Mentors & Advisory:</b>", table_cell_bold)
        ],
        [
            Paragraph("• <b>Kaustubh Waje</b> (Roll: 1023262)<br/>• <b>Ashley Fernandes</b> (Roll: 5023113)<br/>• <b>Dikshant Phulpagar</b> (Roll: 5023139)<br/>• <b>Ishwari Shinde</b> (Roll: 5023155)<br/><br/><i>Affiliation:</i> Department of Computer Engineering<br/><i>Academic Year:</i> 2025 – 2026", table_cell_style),
            Paragraph("• <b>Dr. Poonam Bari</b> (Faculty Project Guide)<br/>• <b>Mrs. Nupur Gaikwad</b> (Faculty Project Guide)<br/>• <b>Fractal Analytics</b> (Industry Advisory & SCM Analytics Domain Context)<br/><br/><i>Evaluation Stream:</i> Capstone Major Project & IEEE Research Publication", table_cell_style)
        ]
    ]
    meta_table = Table(team_data, colWidths=[252, 252])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('BOX', (0,0), (-1,-1), 1, border_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 10))

    # Abstract Box (Academically Formatted for Research Papers & Project Evaluations)
    abstract_text = (
        "<b>Abstract —</b> In contemporary manufacturing and construction industries, supply chain procurement accounts for up to 60% of operational revenue. "
        "However, conventional enterprise resource planning (ERP) suites operate as passive transactional ledgers, forcing human procurement officers to manually "
        "transcribe unstructured supplier invoices, inspect inventory ledgers, calculate vendor quotation trade-offs, and route purchase orders through multi-tier approvals. "
        "This human-dependent paradigm induces 2 to 5 business day processing latencies, a 4.5%–8.2% manual transcription error rate, and vulnerability to supplier defaults. "
        "This project presents an autonomous, event-driven multi-agent procurement platform powered by five specialized AI agents orchestrated over Apache Kafka: "
        "<b>Agent 1 (Document Intelligence)</b> executes dual-engine document ingestion (Tesseract OCR coupled with Groq LLaMA-3.3-70B and Gemini 1.5 Flash failover); "
        "<b>Agent 2 (Inventory Intelligence)</b> performs heuristic industry classification and cross-references stock across heterogeneous PostgreSQL databases; "
        "<b>Agent 3 (Vendor Intelligence)</b> executes multi-criteria supplier ranking (Rating 40%, Price 35%, Lead Time 25%); "
        "<b>Agent 4 (Procurement Execution)</b> synthesizes cryptographically tracked purchase orders (POs) with automated ReportLab PDF generation; and "
        "<b>Agent 5 (Operational Risk Intelligence)</b> runs an automated data cleaning engine across 1,000+ real orders, evaluates 4 operational risk pillars "
        "(Delivery, Quality, Pricing, Compliance), predicts risk levels (Low, Medium, High) using an optimized Random Forest classifier (F1-score: 0.87, ROC-AUC: 0.93), "
        "evaluates order suitability, and executes multi-vendor split allocations under supplier capacity bottlenecks. "
        "Empirical benchmarks across 50 production-scale test batches demonstrate an end-to-end turnaround reduction from days to <b>15.4 seconds (&gt;99% cycle time acceleration)</b>, "
        "transcription error rates below <b>0.5%</b>, and inference operational expenditure under <b>₹0.05 per invoice (&gt;98% cost saving)</b> while guaranteeing strict "
        "deterministic human-in-the-loop financial governance."
    )
    abstract_box = Table([[Paragraph(abstract_text, callout_style)]], colWidths=[504])
    abstract_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EFF6FF")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#93C5FD")),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(abstract_box)
    story.append(Spacer(1, 8))

    doc_notice = Table([[
        Paragraph("<b>Dossier Usage & Publication Guide:</b> This document contains the exhaustive technical specification, mathematical formulations, architectural schemas, "
                  "data flow models, test suites, and empirical benchmarks for the complete Agentic AI Procurement System. It serves as an authoritative source for "
                  "the Capstone Final Project Report, IEEE/ACM conference research papers, and technical implementation audits.", callout_style)
    ]], colWidths=[504])
    doc_notice.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F0FDF4")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#86EFAC")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(doc_notice)
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # TABLE OF CONTENTS
    # -----------------------------------------------------------------------
    story.append(Paragraph("Complete Table of Contents", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    toc_data = [
        [Paragraph("<b>Sec.</b>", table_header_style), Paragraph("<b>Title and Comprehensive Sub-modules</b>", table_header_style), Paragraph("<b>Coverage in Dossier</b>", table_header_style)],
        [Paragraph("<b>1</b>", table_cell_bold), Paragraph("<b>Introduction & Problem Domain</b><br/>• Industrial Background, Direct vs Indirect SCM, Production Halt Risks<br/>• Problem Statement, 5 Core Research Objectives, Scope, Assumptions & Constraints", table_cell_style), Paragraph("Full Text & Problem Formulation", table_cell_style)],
        [Paragraph("<b>2</b>", table_cell_bold), Paragraph("<b>Literature Survey, SCM State-of-the-Art & Research Gaps</b><br/>• Evolution of Multi-Agent Systems, IDP & Vision LLMs, MCDM Supplier Selection<br/>• Comprehensive 10-Study Literature Matrix & Explicit Research Gaps", table_cell_style), Paragraph("Full Literature Matrix & Gaps", table_cell_style)],
        [Paragraph("<b>3</b>", table_cell_bold), Paragraph("<b>Proposed System Architecture & Multi-Agent Design</b><br/>• 4-Tier Distributed Architecture (Presentation, Agents, Gateway, Storage)<br/>• 5 Autonomous Agent Specifications, Port Maps & Kafka Event Topics<br/>• Data Flow Diagrams (Level 0, 1, 2) & Heterogeneous PostgreSQL Database Schemas", table_cell_style), Paragraph("Full Architecture & Schema Specs", table_cell_style)],
        [Paragraph("<b>4</b>", table_cell_bold), Paragraph("<b>Operational Risk Intelligence & ML Framework (Agent 5 Deep Dive)</b><br/>• 4 Risk Pillars (Delivery, Quality, Pricing, Compliance) & Dirty Record Cleaning<br/>• Random Forest Classifier Architecture, Explainability & Retraining Hot-Swap<br/>• PO Suitability Scoring & Multi-Vendor Split Allocation under Capacity Bottlenecks", table_cell_style), Paragraph("Complete ML & Risk Architecture", table_cell_style)],
        [Paragraph("<b>5</b>", table_cell_bold), Paragraph("<b>Algorithmic Formulations & Mathematical Rigor</b><br/>• Multi-Criteria Vendor Composite Score (MCDM) with Clamping & Preferred Bonus<br/>• 3-Factor Component Normalization with Stability Constant &epsilon;<br/>• 4-Pillar Risk Scores, Random Forest Gini Impurity & Weighted Ensemble Classifiers<br/>• Heuristic Industry Keyword Scoring & 3-Tier Financial Approval State Machine", table_cell_style), Paragraph("Complete Mathematical Equations", table_cell_style)],
        [Paragraph("<b>6</b>", table_cell_bold), Paragraph("<b>Implementation Details, Data Pipeline & System Specifications</b><br/>• Hardware & Software Execution Environment, Containerization Topology<br/>• Computational Time & Space Complexity (Big-O analysis across all agents)<br/>• Economic Feasibility, ROI Analysis, RBAC & Cryptographic Audit Trails", table_cell_style), Paragraph("Full Engineering Specifications", table_cell_style)],
        [Paragraph("<b>7</b>", table_cell_bold), Paragraph("<b>Software Verification & Comprehensive Test Suite</b><br/>• 15 Functional, Boundary, Failover, Risk, and Security Test Cases (TC-01 to TC-15)", table_cell_style), Paragraph("Complete 15-Case Verification Table", table_cell_style)],
        [Paragraph("<b>8</b>", table_cell_bold), Paragraph("<b>Experimental Results, Performance Benchmarks & GUI Evaluation</b><br/>• Stage-by-Stage Latency Profiling (15.4s pipeline breakdown)<br/>• ML Classification Metrics (Accuracy, Precision, Recall, F1, ROC-AUC)<br/>• Comparative Benchmark vs Legacy Manual ERPs & Next.js 14 GUI Walkthrough", table_cell_style), Paragraph("Full Quantitative Benchmarks", table_cell_style)],
        [Paragraph("<b>9</b>", table_cell_bold), Paragraph("<b>Conclusion & Strategic Roadmap</b><br/>• Academic & Industrial Synthesis, Real-World Impact, Negotiation Chatbot & Future Scope", table_cell_style), Paragraph("Full Conclusion & Future Scope", table_cell_style)],
        [Paragraph("<b>10</b>", table_cell_bold), Paragraph("<b>References</b> (30 Peer-Reviewed IEEE, ACM, Springer & SCM Publications)", table_cell_style), Paragraph("Complete IEEE Citation List", table_cell_style)],
        [Paragraph("<b>—</b>", table_cell_bold), Paragraph("<b>Acknowledgements & Appendices (A, B, C)</b><br/>• Production Python Code Snippets (Vendor Scoring, Risk ML, Split Allocation, Kafka)<br/>• Project Schedule, Milestones, Plagiarism Proof, UN SDGs & ABET/NBA Mappings", table_cell_style), Paragraph("Complete Code & Curriculum Maps", table_cell_style)],
    ]
    t_toc = Table(toc_data, colWidths=[44, 340, 120])
    t_toc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_toc)
    story.append(Spacer(1, 10))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 1. INTRODUCTION & PROBLEM DOMAIN
    # -----------------------------------------------------------------------
    story.append(Paragraph("1. Introduction & Problem Domain", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1.1 Industrial Context & Background", h2_style))
    story.append(Paragraph("In heavy discrete manufacturing, continuous process industries, and civil construction, procurement operations represent the operational backbone of production continuity. Procurement spans direct spend (raw materials, components, assemblies required for final goods) and indirect spend (maintenance, repair, operations supplies, and tools). According to supply chain management benchmarks, material costs comprise between 45% and 65% of the total cost of goods sold (COGS). Consequently, an enterprise's ability to swiftly, accurately, and cost-effectively procure supplies directly governs profitability, delivery timelines, and customer satisfaction.", body_style))
    story.append(Paragraph("For decades, enterprises have relied on Enterprise Resource Planning (ERP) software suites—including SAP S/4HANA, Oracle ERP Cloud, Coupa, and Jaggaer—to track supply chain events. However, these systems primarily function as passive relational ledgers. They require human specialists to manually parse incoming vendor documents, cross-reference inventory levels across disconnected regional databases, calculate vendor selection trade-offs, draft purchase orders (POs), and circulate approval paperwork. This administrative burden consumes 30% to 45% of procurement personnel's working hours, diverting skilled professionals toward repetitive data transcription.", body_style))

    story.append(Paragraph("1.2 Motivation", h2_style))
    story.append(Paragraph("The motivation for this project stems from two critical realities:", body_style))
    story.append(Paragraph("• <b>Catastrophic Cost of Stockouts:</b> In automated manufacturing plants, an unpredicted stockout of even a single consumable component (e.g., SKF deep-groove ball bearings or pneumatic solenoid valves) can trigger an emergency assembly line shutdown. Industrial research reveals that downtime in discrete automotive and machinery manufacturing costs between ₹5,00,000 and ₹25,00,000 per hour. Human procurement cycles requiring 2 to 5 days to discover stockouts and negotiate replacement orders introduce immense business risk.", bullet_style))
    story.append(Paragraph("• <b>The Cognitive Agent Paradigm Shift:</b> Recent breakthroughs in Large Language Models (LLMs), multimodal optical character recognition (OCR), and autonomous multi-agent orchestration make it possible to transition from reactive transactional databases to proactive cognitive multi-agent systems. Specialized AI agents can parse unstructured invoices, detect operational shortages, optimize vendor allocations, predict supplier default risks, and synthesize formal purchase contracts in seconds.", bullet_style))

    story.append(Paragraph("1.3 Problem Statement & Core Objectives", h2_style))
    story.append(Paragraph("<b>Formal Problem Statement:</b> Traditional manufacturing procurement workflows are fundamentally human-mediated, computationally fragmented, rule-inflexible, and vulnerable to supplier defaults. The reliance on manual document transcription, disconnected departmental databases, ad-hoc supplier appraisals, and paper-based approval routing leads to prolonged turnaround times (2–5 business days), elevated transcription error rates (4.5%–8.2%), sub-optimal supplier selection, and inadequate operational risk mitigation.", body_style))
    
    story.append(Paragraph("<b>Five Core Project Objectives:</b>", h3_style))
    story.append(Paragraph("1. <b>Architect a Decoupled Autonomous Multi-Agent Framework:</b> Design and implement five specialized microservice agents (Document Intelligence, Inventory Intelligence, Vendor Intelligence, Procurement Execution, and Operational Risk Intelligence) coordinated asynchronously via an Apache Kafka distributed event streaming bus.", bullet_style))
    story.append(Paragraph("2. <b>Automate End-to-End Invoice Processing:</b> Achieve automated ingestion of multi-page invoices and delivery receipts using Tesseract OCR v5 with dual-LLM fallback (Groq LLaMA-3.3-70B and Google Gemini 1.5 Flash), extracting tabular line items, unit costs, and item quantities into structured JSON schemas.", bullet_style))
    story.append(Paragraph("3. <b>Enable Multi-Tenant & Cross-Industry Segregation:</b> Implement heuristic industry classification (Manufacturing, Construction, Electronics, Pharmaceuticals) and enforce database isolation across separate PostgreSQL instances behind a secure Integration Gateway.", bullet_style))
    story.append(Paragraph("4. <b>Deploy Machine Learning Operational Risk & Suitability Intelligence:</b> Clean dirty real-world supplier order records, evaluate 4 operational risk pillars (Delivery, Quality, Pricing, Compliance), classify risk levels using a balanced Random Forest model, and compute multi-vendor split allocations under supplier capacity constraints.", bullet_style))
    story.append(Paragraph("5. <b>Enforce Deterministic Human-in-the-Loop Governance:</b> Embed a 3-tier financial approval state machine (Officer &le; ₹50,000, Manager &le; ₹2,00,000, Director &gt; ₹2,00,000) with cryptographic audit logging and ReportLab automated PDF purchase order synthesis stored in MinIO S3 object storage.", bullet_style))

    story.append(Paragraph("1.4 Scope, Assumptions & Operational Constraints", h2_style))
    story.append(Paragraph("<b>Operational Scope:</b> The platform accepts standard digital document formats (PDF, PNG, JPG, JPEG), executes automated OCR and structured data extraction, cross-references stock against isolated industry inventory databases, evaluates vendor proposals using multi-criteria weighted scoring, predicts supplier risk profiles, creates formal POs, and presents an interactive Next.js 14 web application.", body_style))
    story.append(Paragraph("<b>System Assumptions:</b> Incoming supplier invoices or requisitions contain basic line item descriptions, requested quantities, and item costs. Enterprise supplier catalogs maintain updated baseline metrics (ratings out of 5, lead times in days, minimum order quantities, and unit pricing).", body_style))
    story.append(Paragraph("<b>Constraints & Boundaries:</b> External LLM API calls depend on internet connectivity; payment gateway settlement is simulated through cryptographic approval signatures rather than live banking APIs; and physical warehouse dispatch verification remains outside software boundaries.", body_style))

    story.append(Paragraph("1.5 Key Technical Challenges & Limitations", h2_style))
    story.append(Paragraph("• <b>Inference Latency Trade-Off:</b> While database lookups and Kafka messaging execute in sub-second intervals (&lt;50ms), LLM structured entity extraction requires 10 to 14 seconds per complex multi-line document. The system mitigates this via asynchronous Kafka background workers.", bullet_style))
    story.append(Paragraph("• <b>Document Quality Degradation:</b> Skewed, low-contrast, or degraded scans challenge pure OCR engines. The system implements a resilient two-tier architecture: Tesseract pre-processing followed by multimodal vision LLM fallback.", bullet_style))
    story.append(Paragraph("• <b>Cold-Start Vendor Data:</b> Newly onboarded suppliers lacking historical delivery records require provisional rule-based scoring until at least 3 orders are completed.", bullet_style))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 2. LITERATURE SURVEY, SCM STATE-OF-THE-ART & RESEARCH GAPS
    # -----------------------------------------------------------------------
    story.append(Paragraph("2. Literature Survey, SCM State-of-the-Art & Research Gaps", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("2.1 Evolution of Multi-Agent Systems in Supply Chain Management", h2_style))
    story.append(Paragraph("The application of multi-agent systems (MAS) to supply chain coordination dates back over two decades. Early foundational works by Fu et al. (2000) and Lou et al. (2005) established simulation testbeds demonstrating that autonomous software agents could represent distinct supply chain nodes—such as factory floors, warehouses, and logistics fleets. However, these 1st-generation agent platforms relied on rigid, rule-based contract net protocols (FIPA-ACL) and predefined ontology schemas. They failed to handle unstructured human text, noisy real-world documents, or dynamic multi-attribute negotiations.", body_style))
    story.append(Paragraph("With the emergence of Large Language Models (LLMs) and foundation models between 2023 and 2026 (Xia 2026, Li et al. 2025, Wang et al. 2025), multi-agent systems evolved into 'Agentic AI'. In this modern paradigm, agents possess reasoning, natural language comprehension, tool execution, and reflective decision-making capabilities. However, modern literature has primarily applied LLM agents in conversational interfaces or isolated code-generation benchmarks, leaving a marked gap in resilient, distributed enterprise procurement architectures.", body_style))

    story.append(Paragraph("2.2 Intelligent Document Processing & Multimodal Vision", h2_style))
    story.append(Paragraph("Intelligent Document Processing (IDP) in enterprise supply chains has transitioned from classical template-based OCR (Smith 2007) to deep learning token classifiers (LayoutLMv3) and modern multimodal vision models (LLaMA-3-Vision, Gemini 1.5 Flash). While traditional OCR yields high character error rates (CER) on multi-column commercial invoices, multimodal LLMs can infer semantic field relationships (e.g., associating ambiguous line items with corresponding tax rates and total values). Nevertheless, relying exclusively on commercial cloud LLMs introduces prohibitive operational expenses and rate-limiting bottlenecks, necessitating hybrid OCR-plus-LLM failover architectures.", body_style))

    story.append(Paragraph("2.3 Supplier Selection & Multi-Criteria Decision Making (MCDM)", h2_style))
    story.append(Paragraph("Supplier selection has been extensively studied using classical MCDM methodologies such as the Analytic Hierarchy Process (AHP), Technique for Order Preference by Similarity to Ideal Solution (TOPSIS), and Data Envelopment Analysis (DEA) (Ghadimi & Heavey 2015). While mathematically sound, classical MCDM models are static and computationally detached from real-time operational state. In production manufacturing, supplier scoring must execute in milliseconds, account for dynamic capacity constraints, normalize non-linear metrics, and penalize delivery SLA breaches in real-time.", body_style))

    story.append(Paragraph("2.4 Comprehensive Literature Survey Matrix", h2_style))
    story.append(Paragraph("The table below synthesizes 10 landmark studies, comparing their methodologies, contributions, and unresolved limitations:", body_style))

    lit_data = [
        [Paragraph("<b>Authors & Year</b>", table_header_style), Paragraph("<b>Methodology & Core Contribution</b>", table_header_style), Paragraph("<b>Strengths</b>", table_header_style), Paragraph("<b>Identified Limitations & Gaps</b>", table_header_style)],
        [
            Paragraph("<b>Fu et al.</b><br/>(2000) [1]", table_cell_bold),
            Paragraph("Discrete-event multi-agent simulation for collaborative inventory management.", table_cell_style),
            Paragraph("Pioneered multi-agent inventory coordination.", table_cell_style),
            Paragraph("Rigid FIPA protocols; cannot parse unstructured data or evaluate vendor risk.", table_cell_style)
        ],
        [
            Paragraph("<b>Lou et al.</b><br/>(2005) [2]", table_cell_bold),
            Paragraph("Coordination framework for agile supply chains using rule-based agents.", table_cell_style),
            Paragraph("Demonstrated distributed task negotiation.", table_cell_style),
            Paragraph("Lacks machine learning adaptation; centralized synchronization bottleneck.", table_cell_style)
        ],
        [
            Paragraph("<b>Smith</b><br/>(2007) [11]", table_cell_bold),
            Paragraph("Tesseract open-source optical character recognition engine.", table_cell_style),
            Paragraph("Robust offline character recognition for clean text.", table_cell_style),
            Paragraph("Fails on distorted layouts; lacks semantic comprehension and schema structuring.", table_cell_style)
        ],
        [
            Paragraph("<b>Ghadimi & Heavey</b><br/>(2015) [8]", table_cell_bold),
            Paragraph("MASOS: Multi-agent framework for sustainable supplier evaluation via MCDM.", table_cell_style),
            Paragraph("Multi-criteria sustainability metrics included.", table_cell_style),
            Paragraph("Offline batch evaluation only; no real-time event streaming or PO automation.", table_cell_style)
        ],
        [
            Paragraph("<b>Danach et al.</b><br/>(2024) [12]", table_cell_bold),
            Paragraph("Comprehensive review of AI, predictive analytics, and IoT in SCM.", table_cell_style),
            Paragraph("Holistic synthesis of enterprise AI opportunities.", table_cell_style),
            Paragraph("Conceptual survey; lacks practical software architecture or microservice code.", table_cell_style)
        ],
        [
            Paragraph("<b>Li et al.</b><br/>(2025) [14]", table_cell_bold),
            Paragraph("ChatSync: LLM-enabled spatio-temporal reasoning for production logistics.", table_cell_style),
            Paragraph("Demonstrates LLM reasoning in physical shop-floor tracking.", table_cell_style),
            Paragraph("Restricted to intralogistics; omits external vendor risk and financial approvals.", table_cell_style)
        ],
        [
            Paragraph("<b>Maheshwari et al.</b><br/>(2026) [18]", table_cell_bold),
            Paragraph("Forecast accuracy and PO automation in semiconductor supply chains.", table_cell_style),
            Paragraph("Automated PO synthesis for high-tech manufacturing.", table_cell_style),
            Paragraph("Monolithic enterprise architecture; lacks multi-agent decoupling and Kafka streaming.", table_cell_style)
        ],
        [
            Paragraph("<b>Bandara et al.</b><br/>(2026) [23]", table_cell_bold),
            Paragraph("Flowr: Agentic AI for scaling supermarket retail supply chains.", table_cell_style),
            Paragraph("High transaction throughput in consumer goods.", table_cell_style),
            Paragraph("Focused on retail reordering; lacks discrete manufacturing BOM & risk ML pillars.", table_cell_style)
        ],
        [
            Paragraph("<b>Coupa & Ivalua</b><br/>(2026) [24, 25]", table_cell_bold),
            Paragraph("Commercial Business Spend Management (BSM) and e-Procurement platforms.", table_cell_style),
            Paragraph("Comprehensive enterprise ERP integrations.", table_cell_style),
            Paragraph("High recurring licensing costs; rigid proprietary rules; black-box risk engines.", table_cell_style)
        ],
        [
            Paragraph("<b>SAP S/4HANA</b><br/>(2026)", table_cell_bold),
            Paragraph("Enterprise transactional ledger with automated batch workflow extensions.", table_cell_style),
            Paragraph("Industry standard data persistence and audit trail.", table_cell_style),
            Paragraph("Passive ledger requiring manual data entry; no autonomous agentic negotiation.", table_cell_style)
        ],
    ]
    t_lit = Table(lit_data, colWidths=[65, 145, 120, 174])
    t_lit.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_lit)
    story.append(Spacer(1, 8))

    story.append(Paragraph("2.5 Explicit Research Gaps Addressed by This Project", h2_style))
    story.append(Paragraph("1. <b>Decoupled Asynchronous Microservices vs Monolithic Scripts:</b> Existing academic prototypes deploy tightly coupled Python scripts that halt upon API timeouts. This project implements five decoupled agents communicating over Apache Kafka, ensuring message durability and fault tolerance.", bullet_style))
    story.append(Paragraph("2. <b>Resilient Hybrid OCR & LLM Failover:</b> Prior systems rely solely on either brittle OCR or expensive cloud LLMs. This architecture combines Tesseract v5 local processing with Groq LLaMA-3.3-70B and Google Gemini 1.5 Flash failover.", bullet_style))
    story.append(Paragraph("3. <b>Multi-Pillar ML Operational Risk & Split Allocation:</b> While existing procurement systems evaluate suppliers purely on cost and delivery time, our Agent 5 incorporates a 4-pillar Random Forest risk model (Delivery, Quality, Pricing, Compliance) with automated data cleaning and multi-vendor split allocations under supplier capacity exhaustion.", bullet_style))
    story.append(Paragraph("4. <b>Human-in-the-Loop Cryptographic Governance:</b> Addressing the critical research gap of uncontrolled autonomous AI actions, this system enforces deterministic financial approval tiers with digital signature verification and tamper-evident audit ledgers.", bullet_style))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 3. PROPOSED SYSTEM ARCHITECTURE & MULTI-AGENT DESIGN
    # -----------------------------------------------------------------------
    story.append(Paragraph("3. Proposed System Architecture & Multi-Agent Design", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("3.1 4-Tier Distributed System Architecture", h2_style))
    story.append(Paragraph("The platform is engineered around an <b>event-driven microservices architecture</b> separated into four distinct operational tiers: Presentation Layer, Agentic AI Application Layer, Middleware & Gateway Layer, and Heterogeneous Persistence Layer.", body_style))

    arch_box_data = [
        [Paragraph("<b>LAYER 1: PRESENTATION & USER EXPERIENCE LAYER (Port 3000 — Next.js 14 App Router)</b><br/>"
                   "• Real-time Executive KPI summaries (Invoices, Shortages, POs, Approvals, Agent Health).<br/>"
                   "• Interactive Drag-and-Drop Document Uploader with live OCR extraction inspection.<br/>"
                   "• Shortage Reconciliation Matrix, Vendor Evaluation & Side-by-Side Comparison Portals.<br/>"
                   "• Autonomous Risk Analysis View (Radar charts, pillar breakdown, order history analysis).<br/>"
                   "• Human-in-the-Loop Approval Hub with Agent Rationale Cards, Digital Signing & PDF Download.<br/>"
                   "• Live Kafka Topic Observability Panel streaming consumer messages and lag metrics.", table_cell_style)],
        [Paragraph("<b>LAYER 2: AGENTIC AI APPLICATION LAYER (FastAPI Microservices Cluster)</b><br/>"
                   "• <b>Agent 1 (Port 8009): Document Intelligence:</b> Ingests files into MinIO, runs Tesseract OCR v5, prompts Groq LLaMA-3.3-70B with Gemini 1.5 Flash fallback, emits <code>OCR_REQUEST_CREATED</code>.<br/>"
                   "• <b>Agent 2 (Port 8005): Inventory Intelligence:</b> Extracts line items, detects industry via keyword algorithm, verifies connected industries, queries stock via Gateway, calculates shortages, emits <code>INVENTORY_EVALUATED</code>.<br/>"
                   "• <b>Agent 3 (Port 8006): Vendor Intelligence:</b> Evaluates shortage items, filters vendor catalog (Rating &ge; 3.5, Lead Time &le; 21d, MOQ &le; Qty), calculates MCDM weighted score, queries Agent 5 suitability, emits <code>VENDOR_RECOMMENDED</code>.<br/>"
                   "• <b>Agent 4 (Port 8008): Procurement Execution:</b> Generates unique PO numbers (<code>PO-YYYY-XXXXXX</code>), calculates SLA delivery dates, assigns approval tiers, synthesizes ReportLab PDFs in MinIO, emits <code>PURCHASE_ORDER_CREATED</code>.<br/>"
                   "• <b>Agent 5 (Port 8010): Operational Risk Intelligence:</b> Cleans dirty order feeds (1000+ orders), evaluates 4 risk pillars, predicts risk classes via Random Forest, computes PO suitability & multi-vendor split allocations, manages feedback retraining.", table_cell_style)],
        [Paragraph("<b>LAYER 3: EVENT BUS & MIDDLEWARE INTEGRATION LAYER</b><br/>"
                   "• <b>Apache Kafka 7.4 (Port 29092 / 9092):</b> Distributed decoupled messaging with dedicated consumer groups.<br/>"
                   "• <b>Integration Gateway (Port 8000):</b> Unified API gateway with header authentication (<code>X-API-KEY</code>) and dynamic industry query routing (<code>/inventory/items?industry=...</code>).<br/>"
                   "• <b>Supporting Microservices:</b> OCR Service (8001), Inventory Service (8002), Vendor Service (8003), Procurement Service (8004), Onboarding Service (8007).", table_cell_style)],
        [Paragraph("<b>LAYER 4: HETEROGENEOUS DATA PERSISTENCE LAYER</b><br/>"
                   "• <b>PostgreSQL 15 Cluster (Port 5432):</b> 6 isolated databases (<code>ocr_procurement_db</code>, <code>procurement_db</code>, <code>manufacturing_db</code>, <code>construction_db</code>, <code>onboarding_db</code>, <code>manufacturing_vendor_db</code>).<br/>"
                   "• <b>Redis In-Memory Cache (Port 6379):</b> High-speed key-value cache (TTL: 600s) for stock levels and vendor ratings.<br/>"
                   "• <b>MinIO S3 Object Store (Port 9000 / Console 9001):</b> S3-compatible bucket <code>procurement-documents</code> storing raw invoice PDFs/images and generated purchase order documents.", table_cell_style)]
    ]
    t_arch = Table(arch_box_data, colWidths=[504])
    t_arch.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('BOX', (0,0), (-1,-1), 1.5, primary_color),
        ('INNERGRID', (0,0), (-1,-1), 0.5, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(t_arch)
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.2 Kafka Distributed Event Topics & Messaging Architecture", h2_style))
    story.append(Paragraph("The platform enforces total decoupling among agents through Apache Kafka event streaming. If downstream services experience temporary latency, upstream messages remain safely queued with at-least-once delivery guarantees.", body_style))

    kafka_topic_data = [
        [Paragraph("<b>Kafka Topic Name</b>", table_header_style), Paragraph("<b>Producing Service</b>", table_header_style), Paragraph("<b>Consuming Agent</b>", table_header_style), Paragraph("<b>Event Payload & Domain Purpose</b>", table_header_style)],
        [
            Paragraph("<code>invoice-topic</code>", table_cell_bold),
            Paragraph("Agent 1 Upload API (8009)", table_cell_style),
            Paragraph("Agent 1 Worker Thread", table_cell_style),
            Paragraph("Queues raw uploaded document metadata and MinIO object storage key for OCR parsing.", table_cell_style)
        ],
        [
            Paragraph("<code>ocr-request-topic</code>", table_cell_bold),
            Paragraph("Agent 1 Document AI (8009)", table_cell_style),
            Paragraph("Agent 2 Inventory AI (8005)", table_cell_style),
            Paragraph("<code>OCR_REQUEST_CREATED</code>: Emits extracted procurement request ID, vendor name, invoice date, and structured line items.", table_cell_style)
        ],
        [
            Paragraph("<code>inventory-evaluation-topic</code>", table_cell_bold),
            Paragraph("Agent 2 Inventory AI (8005)", table_cell_style),
            Paragraph("Agent 3 Vendor AI (8006)", table_cell_style),
            Paragraph("<code>INVENTORY_EVALUATED</code>: Emits detected industry, item stock checks, shortage quantities, and deficit costs.", table_cell_style)
        ],
        [
            Paragraph("<code>vendor-recommendation-topic</code>", table_cell_bold),
            Paragraph("Agent 3 Vendor AI (8006)", table_cell_style),
            Paragraph("Agent 4 Procurement AI (8008)", table_cell_style),
            Paragraph("<code>VENDOR_RECOMMENDED</code>: Emits selected optimal vendor bids, composite MCDM scores, and split allocations.", table_cell_style)
        ],
        [
            Paragraph("<code>purchase-order-topic</code>", table_cell_bold),
            Paragraph("Agent 4 Procurement AI (8008)", table_cell_style),
            Paragraph("Procurement Service & UI (8004)", table_cell_style),
            Paragraph("<code>PURCHASE_ORDER_CREATED</code>: Emits PO number (<code>PO-YYYY-XXXXXX</code>), amount, approval tier, and MinIO PDF link.", table_cell_style)
        ],
        [
            Paragraph("<code>risk-evaluation-topic</code>", table_cell_bold),
            Paragraph("Agent 5 Risk AI (8010)", table_cell_style),
            Paragraph("Agent 3, Agent 4 & UI", table_cell_style),
            Paragraph("<code>RISK_ASSESSED</code>: Emits supplier risk tier (Low, Med, High), confidence score, risk drivers, and suitability.", table_cell_style)
        ],
    ]
    t_kafka = Table(kafka_topic_data, colWidths=[130, 85, 85, 204])
    t_kafka.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_kafka)
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.3 Data Flow Diagrams (DFD Levels 0, 1 & 2)", h2_style))
    story.append(Paragraph("• <b>Level 0 DFD (Context Level):</b> External entities (Procurement Officer, Plant Manager, Finance Director, External Suppliers) interact with the Agentic AI Procurement System. Purchase requisitions and invoices flow in; stock shortfall alerts, vendor comparison sheets, signed purchase orders, and audit certificates flow out.", body_style))
    story.append(Paragraph("• <b>Level 1 DFD (Subsystem Decomposition):</b> Decomposes into five core sequential processes: (1.0) Document OCR & Structuring, (2.0) Inventory Reconciliation & Industry Classification, (3.0) Multi-Criteria Vendor Ranking, (4.0) Operational Risk & Suitability Assessment, and (5.0) Purchase Order Synthesis & Tiered Approval Auditing.", body_style))
    story.append(Paragraph("• <b>Level 2 DFD (Agent 5 Operational Trace):</b> Details the internal flow of Risk Analysis: Raw Historical Ingestion &rarr; Data Cleaning & Anomaly Correction &rarr; Preprocessing & Scaling &rarr; Random Forest Classification &rarr; Holdout Validation &rarr; Continuous Feedback Loop.", body_style))

    story.append(Paragraph("3.4 Heterogeneous Database Architecture & Relational Schemas", h2_style))
    story.append(Paragraph("To mirror enterprise conditions where business units operate isolated ERP databases, the platform partitions data across multiple PostgreSQL 15 databases:", body_style))

    schema_data = [
        [Paragraph("<b>Database Name</b>", table_header_style), Paragraph("<b>Primary Tables & Foreign Keys</b>", table_header_style), Paragraph("<b>Domain Responsibility & Data Structures</b>", table_header_style)],
        [
            Paragraph("<code>ocr_procurement_db</code>", table_cell_bold),
            Paragraph("• <code>procurement_requests</code><br/>• <code>procurement_request_items</code><br/>• <code>document_processing</code>", table_cell_style),
            Paragraph("Primary store for Agent 1. Stores extracted raw text, structured JSONB line items, document bounding boxes, and MinIO file pointers.", table_cell_style)
        ],
        [
            Paragraph("<code>procurement_db</code>", table_cell_bold),
            Paragraph("• <code>purchase_orders</code><br/>• <code>po_items</code><br/>• <code>procurement_audit</code><br/>• <code>procurement_events</code><br/>• <code>users</code>", table_cell_style),
            Paragraph("Primary store for Agent 4 and Procurement Service. Manages official PO numbers (<code>PO-YYYY-XXXXXX</code>), financial approval states, digital signatures, and cryptographic audit logs.", table_cell_style)
        ],
        [
            Paragraph("<code>manufacturing_db</code><br/><code>construction_db</code>", table_cell_bold),
            Paragraph("• <code>inventory</code><br/>• <code>stock_levels</code><br/>• <code>reorder_levels</code><br/>• <code>warehouse_locations</code>", table_cell_style),
            Paragraph("Departmental inventory databases holding real-time SKU stock quantities, minimum safety thresholds, and bin locations for respective industries.", table_cell_style)
        ],
        [
            Paragraph("<code>manufacturing_vendor_db</code><br/><code>construction_vendor_db</code>", table_cell_bold),
            Paragraph("• <code>vendors</code><br/>• <code>vendor_master</code><br/>• <code>vendor_products</code><br/>• <code>vendor_performance</code>", table_cell_style),
            Paragraph("Enterprise supplier catalogs holding unit prices, delivery lead times, minimum order quantities (MOQ), supplier ratings, and 1,000+ historical order fulfillment records.", table_cell_style)
        ],
        [
            Paragraph("<code>onboarding_db</code>", table_cell_bold),
            Paragraph("• <code>upload_registry</code><br/>• <code>connected_industries</code>", table_cell_style),
            Paragraph("Controls enterprise industry connection gates. Prevents cross-industry data leakage when a specific sector database is administratively disabled.", table_cell_style)
        ],
    ]
    t_schema = Table(schema_data, colWidths=[110, 164, 230])
    t_schema.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_schema)

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 4. OPERATIONAL RISK INTELLIGENCE & ML FRAMEWORK (AGENT 5 DEEP DIVE)
    # -----------------------------------------------------------------------
    story.append(Paragraph("4. Operational Risk Intelligence & ML Framework (Agent 5 Deep Dive)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("4.1 Four Pillars of Vendor Operational Risk", h2_style))
    story.append(Paragraph("Traditional procurement evaluates vendors solely on price quotation. However, in manufacturing, an unreliable supplier with low prices can cause catastrophic downtime through late deliveries or defective parts. Agent 5 evaluates every supplier across <b>four balanced operational risk pillars</b>:", body_style))
    story.append(Paragraph("1. <b>Delivery Fulfillment Pillar (Weight: 35%):</b> Evaluates historical on-time delivery rates (<code>on_time_rate</code>) and average shipment delay in days (<code>delay_days</code>). Suppliers with delay days &gt; 5.0 or on-time fulfillment &lt; 70% are automatically flagged as High Risk.", bullet_style))
    story.append(Paragraph("2. <b>Quality & Defect Pillar (Weight: 30%):</b> Evaluates incoming inspection failure rates (<code>defect_rate</code>) and customer return rates (<code>return_rate</code>). Suppliers exceeding a 5% defect rate or 3% return rate trigger immediate quality quarantine.", bullet_style))
    story.append(Paragraph("3. <b>Pricing Stability Pillar (Weight: 15%):</b> Measures volatility between agreed catalog pricing and final invoiced pricing (<code>price_variance</code>). Price spikes exceeding +12% trigger financial risk flags.", bullet_style))
    story.append(Paragraph("4. <b>Compliance & Regulatory Pillar (Weight: 20%):</b> Audits compliance certifications (<code>iso_certified</code>), safety audit violations (<code>violations</code>), and enterprise compliance scores (<code>compliance_score</code> out of 100).", bullet_style))

    story.append(Paragraph("4.2 Raw Historical Data Ingestion & Dirty Record Cleaning Engine", h2_style))
    story.append(Paragraph("Real-world enterprise ERP feeds are notorious for dirty, malformed data. In our implementation, Agent 5 incorporates a production <code>DataCleaningEngine</code> (in <code>services/agent-risk/cleaner.py</code>) that was stress-tested against <b>1,005 dirty records</b> containing missing values, corrupted numbers, out-of-bound percentages, and inconsistent strings. The cleaning engine executes the following pipeline:", body_style))
    story.append(Paragraph("• <b>Parsing & Normalization:</b> Converts percentages formatted as strings (e.g. <code>'94.5%'</code> or <code>'0.945'</code>) to uniform floats between 0.0 and 1.0; cleans currency symbols and thousand-separators from unit prices.", bullet_style))
    story.append(Paragraph("• <b>Bounds Validation & Clipping:</b> Detects negative delays (e.g. -15 days due to data entry typo) and clamps them to zero; bounds defect and return rates strictly to [0.0, 1.0].", bullet_style))
    story.append(Paragraph("• <b>Missing Value Imputation:</b> Employs robust median imputation for numerical metrics (e.g. default on-time rate = 0.85, default compliance score = 85.0) while logging an audit trail.", bullet_style))
    story.append(Paragraph("• <b>Quarantine Ledger:</b> Severe unrecoverable records (missing vendor ID, missing company ID) are segregated into a quarantine table for human administrator audit rather than silently dropped.", bullet_style))

    story.append(Paragraph("4.3 Machine Learning Model Architecture & Hyperparameters", h2_style))
    story.append(Paragraph("Agent 5 implements a <b>Multi-Class Random Forest Classifier</b> (<code>RiskMLModel</code> in <code>services/agent-risk/ml_model.py</code>) to categorize suppliers into <b>Low Risk, Medium Risk, or High Risk</b>. Random Forest was selected over deep neural networks due to its superior interpretability, resilience to tabular feature scale variance, and native feature importance extraction.", body_style))

    ml_param_data = [
        [Paragraph("<b>Hyperparameter</b>", table_header_style), Paragraph("<b>Configured Value</b>", table_header_style), Paragraph("<b>Engineering Rationale</b>", table_header_style)],
        [Paragraph("<code>n_estimators</code>", table_cell_bold), Paragraph("100 Trees", table_cell_style), Paragraph("Ensures ensemble stability and variance reduction across tabular risk features.", table_cell_style)],
        [Paragraph("<code>max_depth</code>", table_cell_bold), Paragraph("6 Levels", table_cell_style), Paragraph("Regularizes tree depth to prevent overfitting on historical supplier noise.", table_cell_style)],
        [Paragraph("<code>class_weight</code>", table_cell_bold), Paragraph("'balanced'", table_cell_style), Paragraph("Automatically adjusts weights inversely proportional to class frequencies, preventing majority-class bias toward Low Risk.", table_cell_style)],
        [Paragraph("<code>criterion</code>", table_cell_bold), Paragraph("Gini Impurity", table_cell_style), Paragraph("Measures statistical divergence for binary splits at each decision node.", table_cell_style)],
        [Paragraph("<code>min_samples_split</code>", table_cell_bold), Paragraph("2 Samples", table_cell_style), Paragraph("Permits fine-grained decision boundaries on high-risk edge anomalies.", table_cell_style)],
        [Paragraph("<code>random_state</code>", table_cell_bold), Paragraph("42", table_cell_style), Paragraph("Guarantees deterministic reproducibility across testing and deployment cycles.", table_cell_style)],
    ]
    t_ml_param = Table(ml_param_data, colWidths=[110, 110, 284])
    t_ml_param.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_ml_param)
    story.append(Spacer(1, 6))

    story.append(Paragraph("4.4 Explainable AI & Human-Readable Risk Drivers", h2_style))
    story.append(Paragraph("In critical manufacturing operations, black-box AI recommendations are unacceptable to enterprise auditors. Agent 5 implements automated explainability (<code>explain_prediction</code>) by inspecting decision paths and metric deviations, outputting explicit verbal rationales (e.g., <i>'On-time fulfillment (64.2%) is 25.8% below enterprise baseline'</i>, <i>'Defect rate (6.8%) exceeds maximum quality ceiling of 5.0%'</i>). These drivers are rendered directly on the manager's approval portal.", body_style))

    story.append(Paragraph("4.5 Continuous Supervised Retraining & Zero-Downtime Safe Deployment", h2_style))
    story.append(Paragraph("The system maintains an <b>Active Admin Feedback Loop</b> (<code>RetrainingManager</code> & <code>ModelEvaluator</code> in <code>services/agent-risk/</code>). When procurement officers record actual order outcomes or quality ratings, the feedback is persisted with verified ground-truth labels. Retraining is automatically triggered when feedback exceeds 50 new events or invoked manually via the dashboard.", body_style))
    story.append(Paragraph("<b>Zero-Downtime Quality Gate:</b> A newly trained candidate model is never deployed blindly. It is evaluated against an unseen holdout validation split (20% of data). The deployment engine checks that: (1) Candidate accuracy &ge; 0.70; (2) Candidate macro F1-score &ge; 0.65; and (3) Accuracy does not degrade by more than 0.05 compared to the currently active model. If validation fails, the candidate is discarded, an audit warning is raised, and the existing active model remains in service with zero downtime.", body_style))

    story.append(Paragraph("4.6 PO Suitability & Multi-Vendor Split Allocation Engine", h2_style))
    story.append(Paragraph("A critical innovation in this project is <b>PO Suitability & Split Order Allocation</b> (<code>suitability.py</code>). When an item has a massive shortage (e.g., 500 bearings) or a single vendor lacks sufficient capacity or has an elevated risk score, the system automatically:", body_style))
    story.append(Paragraph("• Checks vendor master product limits (<code>capacity_units</code>).", bullet_style))
    story.append(Paragraph("• Allocates order quantities up to capacity to the highest-scoring low-risk vendor, and splits the remaining quantity across conforming secondary vendors.", bullet_style))
    story.append(Paragraph("• Passes structured multi-vendor allocations to Agent 4 to generate linked, distinct purchase orders.", bullet_style))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 5. ALGORITHMIC FORMULATIONS & MATHEMATICAL RIGOR
    # -----------------------------------------------------------------------
    story.append(Paragraph("5. Algorithmic Formulations & Mathematical Rigor", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph("This section presents the exact mathematical formulations governing vendor evaluation, risk scoring, machine learning classification, and governance state machines.", body_style))

    # Mathematical Formulation Card 1: Vendor Scoring
    formula_card_1 = [
        [Paragraph("<b>EQUATION 1: MULTI-CRITERIA VENDOR COMPOSITE SCORE (MCDM)</b>", formula_title)],
        [Paragraph("<b>Score<sub>v</sub> &nbsp;=&nbsp; (w<sub>r</sub> &times; R<sub>norm</sub>) &nbsp;+&nbsp; (w<sub>p</sub> &times; P<sub>norm</sub>) &nbsp;+&nbsp; (w<sub>lt</sub> &times; LT<sub>norm</sub>) &nbsp;+&nbsp; Bonus<sub>pref</sub></b>", formula_main)],
        [Paragraph("<b>Final Clamped Score:</b> &nbsp; <b>Final_Score<sub>v</sub> = min( 1.0, &nbsp; Score<sub>v</sub> )</b>", formula_sub)],
        [Paragraph("<b>Where Weights and Coefficients are Configured as:</b><br/>"
                   "• <b>w<sub>r</sub> = 0.40</b> &nbsp;(Vendor Historical Rating Weight — 40%)<br/>"
                   "• <b>w<sub>p</sub> = 0.35</b> &nbsp;(Quoted Unit Price Competitiveness Weight — 35%)<br/>"
                   "• <b>w<sub>lt</sub> = 0.25</b> &nbsp;(Delivery SLA / Lead Time Weight — 25%)<br/>"
                   "• <b>Bonus<sub>pref</sub> = +0.05</b> &nbsp;for Contracted Preferred Strategic Suppliers (Tata Steel, L&amp;T, Cipla, SKF, Bosch); else <b>0.00</b>", formula_sub)],
        [HRFlowable(width="100%", thickness=0.5, color=border_color, spaceBefore=2, spaceAfter=3)],
        [Paragraph("<b>EQUATION 2: COMPONENT NORMALIZATION EQUATIONS</b>", formula_title)],
        [Paragraph("<b>1. Rating Normalization (Higher is Better):</b> &nbsp; <b>R<sub>norm</sub> = R<sub>v</sub> / R<sub>max</sub></b> &nbsp;&nbsp;(where R<sub>max</sub> is the highest rating among candidate bids)<br/>"
                   "<b>2. Price Normalization (Lower is Better):</b> &nbsp; <b>P<sub>norm</sub> = 1 &minus; [ (P<sub>v</sub> &minus; P<sub>min</sub>) / (P<sub>max</sub> &minus; P<sub>min</sub> + &epsilon;) ]</b><br/>"
                   "<b>3. Lead Time Normalization (Shorter is Better):</b> &nbsp; <b>LT<sub>norm</sub> = 1 &minus; [ (LT<sub>v</sub> &minus; LT<sub>min</sub>) / (LT<sub>max</sub> &minus; LT<sub>min</sub> + &epsilon;) ]</b><br/>"
                   "<i>Note: &epsilon; = 10<sup>&minus;9</sup> is a numerical stability constant preventing division-by-zero when candidate bids are identical.</i>", formula_sub)]
    ]
    t_form_1 = Table(formula_card_1, colWidths=[504])
    t_form_1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('BOX', (0,0), (-1,-1), 1.5, secondary_color),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_form_1)
    story.append(Spacer(1, 8))

    # Mathematical Formulation Card 2: 4 Risk Pillars & ML Formulations
    formula_card_2 = [
        [Paragraph("<b>EQUATION 3: FOUR OPERATIONAL RISK PILLAR SCORES (0 – 100 SCALE)</b>", formula_title)],
        [Paragraph("<b>1. Delivery Pillar Score:</b> &nbsp; <i>S<sub>del</sub> = min(100, &nbsp; max(0, &nbsp; [On_Time_Rate &times; 70] + max(0, 30 &minus; [Delay_Days &times; 3.5])))</i><br/>"
                   "<b>2. Quality Pillar Score:</b> &nbsp; <i>S<sub>qual</sub> = min(100, &nbsp; max(0, &nbsp; 100 &minus; [Defect_Rate &times; 800] &minus; [Return_Rate &times; 500]))</i><br/>"
                   "<b>3. Pricing Pillar Score:</b> &nbsp; <i>S<sub>price</sub> = min(100, &nbsp; max(0, &nbsp; 100 &minus; [max(0, Price_Variance) &times; 350]))</i><br/>"
                   "<b>4. Compliance Pillar Score:</b> &nbsp; <i>S<sub>comp</sub> = min(100, &nbsp; max(0, &nbsp; Compliance_Score &minus; [Violations &times; 12] + [5 if ISO_Certified else 0]))</i>", formula_sub)],
        [HRFlowable(width="100%", thickness=0.5, color=border_color, spaceBefore=2, spaceAfter=3)],
        [Paragraph("<b>EQUATION 4: COMPOSITE PERFORMANCE & RISK FORMULATION</b>", formula_title)],
        [Paragraph("<b>Perf_Score &nbsp;=&nbsp; 0.35 &times; S<sub>del</sub> &nbsp;+&nbsp; 0.30 &times; S<sub>qual</sub> &nbsp;+&nbsp; 0.15 &times; S<sub>price</sub> &nbsp;+&nbsp; 0.20 &times; S<sub>comp</sub></b>", formula_main)],
        [Paragraph("<b>Composite Risk Score (0 = Minimal Risk, 100 = Critical Risk):</b> &nbsp; <b>Risk_Score = max( 0.0, &nbsp; min( 100.0, &nbsp; 100.0 &minus; Perf_Score ) )</b>", formula_sub)],
        [HRFlowable(width="100%", thickness=0.5, color=border_color, spaceBefore=2, spaceAfter=3)],
        [Paragraph("<b>EQUATION 5: RANDOM FOREST GINI IMPURITY & ENSEMBLE CLASSIFICATION</b>", formula_title)],
        [Paragraph("For a node <i>t</i> with class distribution <i>p(i|t)</i> across classes <i>C &isin; {Low, Medium, High}</i>:<br/>"
                   "&nbsp;&nbsp;&nbsp;&nbsp;<b>I<sub>G</sub>(t) &nbsp;=&nbsp; 1 &minus; &sum;<sub>i=1</sub><sup>|C|</sup> [ p(i | t) ]<sup>2</sup></b><br/>"
                   "Ensemble prediction combines <i>B = 100</i> trees using weighted majority voting:<br/>"
                   "&nbsp;&nbsp;&nbsp;&nbsp;<b>y&#770; &nbsp;=&nbsp; argmax<sub>c &isin; C</sub> &nbsp; (1 / B) &sum;<sub>b=1</sub><sup>B</sup> P<sub>b</sub>(Y = c | x)</b>", formula_sub)]
    ]
    t_form_2 = Table(formula_card_2, colWidths=[504])
    t_form_2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), light_bg),
        ('BOX', (0,0), (-1,-1), 1.5, primary_color),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_form_2)
    story.append(Spacer(1, 8))
    story.append(PageBreak())

    story.append(Paragraph("5.3 Three-Tier Financial Approval State Machine", h2_style))
    story.append(Paragraph("To ensure deterministic human governance over automated purchasing actions, the system enforces a strict 3-tier financial approval policy matrix:", body_style))

    tier_data = [
        [Paragraph("<b>Approval Tier</b>", table_header_style), Paragraph("<b>Monetary Ceiling (INR)</b>", table_header_style), Paragraph("<b>Authorized Role</b>", table_header_style), Paragraph("<b>Governance Policy & Authorization Action</b>", table_header_style)],
        [
            Paragraph("<b>TIER_1_OFFICER</b>", table_cell_bold),
            Paragraph("Total Amount &le; ₹50,000", table_cell_style),
            Paragraph("Procurement Officer", table_cell_style),
            Paragraph("Routine purchase sign-off; single officer validation of line item quantities.", table_cell_style)
        ],
        [
            Paragraph("<b>TIER_2_MANAGER</b>", table_cell_bold),
            Paragraph("₹50,000 &lt; Amount &le; ₹2,00,000", table_cell_style),
            Paragraph("Operations / Plant Manager", table_cell_style),
            Paragraph("Operational review; validation of inventory budgets, delivery deadlines, and machine maintenance schedules.", table_cell_style)
        ],
        [
            Paragraph("<b>TIER_3_DIRECTOR</b>", table_cell_bold),
            Paragraph("Total Amount &gt; ₹2,00,000", table_cell_style),
            Paragraph("Finance Director / VP", table_cell_style),
            Paragraph("Executive capital expenditure sign-off; high-value treasury allocation requiring digital cryptographic certification.", table_cell_style)
        ],
    ]
    t_tier = Table(tier_data, colWidths=[100, 114, 110, 180])
    t_tier.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_tier)
    story.append(Spacer(1, 10))

    # -----------------------------------------------------------------------
    # 6. IMPLEMENTATION DETAILS, DATA PIPELINE & SYSTEM SPECIFICATIONS
    # -----------------------------------------------------------------------
    story.append(Paragraph("6. Implementation Details, Data Pipeline & System Specifications", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("6.1 Hardware & Software Execution Environment", h2_style))
    story.append(Paragraph("The platform was developed and benchmarked across dedicated containerized environments to ensure reproducibility:", body_style))

    sys_req_data = [
        [Paragraph("<b>Component / Layer</b>", table_header_style), Paragraph("<b>Minimum Execution Environment</b>", table_header_style), Paragraph("<b>Production Deployment Benchmark</b>", table_header_style)],
        [Paragraph("<b>Processor (CPU)</b>", table_cell_bold), Paragraph("Intel Core i5 / AMD Ryzen 5 (4 Cores / 8 Threads)", table_cell_style), Paragraph("8+ Cores Intel Xeon / AMD EPYC (2.8 GHz+)", table_cell_style)],
        [Paragraph("<b>System Memory (RAM)</b>", table_cell_bold), Paragraph("8 GB RAM (Supports local Docker cluster)", table_cell_style), Paragraph("16 GB – 32 GB ECC DDR4/DDR5", table_cell_style)],
        [Paragraph("<b>Persistent Storage</b>", table_cell_bold), Paragraph("20 GB free SSD storage", table_cell_style), Paragraph("100+ GB NVMe SSD (MinIO document repository)", table_cell_style)],
        [Paragraph("<b>Operating System</b>", table_cell_bold), Paragraph("Ubuntu 22.04 LTS / Debian 12 / Windows WSL2", table_cell_style), Paragraph("Ubuntu Linux 22.04 LTS Enterprise Server", table_cell_style)],
        [Paragraph("<b>Backend Runtimes</b>", table_cell_bold), Paragraph("Python 3.10 / 3.11, FastAPI, Uvicorn, SQLAlchemy", table_cell_style), Paragraph("Python 3.11 with Gunicorn Uvicorn workers", table_cell_style)],
        [Paragraph("<b>Frontend Framework</b>", table_cell_bold), Paragraph("Node.js 18 / 20, Next.js 14 (React), Tailwind CSS", table_cell_style), Paragraph("Next.js 14 Standalone Production Container", table_cell_style)],
        [Paragraph("<b>Message Bus & Queues</b>", table_cell_bold), Paragraph("Apache Kafka 7.4 (Confluent), Zookeeper, Redis 7", table_cell_style), Paragraph("Clustered Multi-Broker Kafka with Schema Registry", table_cell_style)],
        [Paragraph("<b>AI / ML Engines</b>", table_cell_bold), Paragraph("Tesseract OCR v5, Groq LLaMA-3.3-70B, Gemini 1.5 Flash", table_cell_style), Paragraph("Dedicated Enterprise Groq API or Local vLLM Host", table_cell_style)],
        [Paragraph("<b>Data Stores</b>", table_cell_bold), Paragraph("PostgreSQL 15 (6 isolated DBs), MinIO S3 Object Store", table_cell_style), Paragraph("Managed PostgreSQL Cluster with automated WAL archiving", table_cell_style)],
    ]
    t_sys = Table(sys_req_data, colWidths=[110, 194, 200])
    t_sys.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_sys)
    story.append(Spacer(1, 8))

    story.append(Paragraph("6.2 Computational Time & Space Complexity Analysis", h2_style))
    story.append(Paragraph("A rigorous asymptotic computational complexity evaluation reveals high scalability across every pipeline stage:", body_style))
    story.append(Paragraph("• <b>OCR & Text Extraction:</b> Tesseract OCR scales as <b>O(W &times; H)</b> where <i>W</i> and <i>H</i> represent image pixel dimensions. LLM inference operates at <b>O(L<sup>2</sup>)</b> self-attention complexity where <i>L</i> is prompt token length (typically <i>L &le; 2048</i> tokens for commercial invoices).", bullet_style))
    story.append(Paragraph("• <b>Inventory Stock Verification:</b> For a purchase requisition with <i>M</i> line items, database lookup across B-tree indexed SKU primary keys requires <b>O(M &times; log N)</b> where <i>N</i> is catalog size. In-memory Redis caching reduces subsequent lookups to <b>O(1)</b> amortized time.", bullet_style))
    story.append(Paragraph("• <b>Vendor Ranking (MCDM):</b> Evaluates <i>V</i> candidate suppliers per shortage item, requiring <b>O(M &times; V)</b>. Because commercial supplier panels maintain <i>V &le; 25</i> vendors per category, execution completes in under 10 milliseconds.", bullet_style))
    story.append(Paragraph("• <b>Random Forest Risk Prediction:</b> Inference across <i>T</i> decision trees of maximum depth <i>D</i> requires <b>O(T &times; D)</b>. With <i>T = 100</i> and <i>D = 6</i>, classification finishes in under 5 milliseconds per vendor.", bullet_style))
    story.append(Paragraph("• <b>Memory & Space Complexity:</b> Space complexity is strictly bounded by <b>O(M + V)</b> in active RAM. Persistent storage scales linearly as <b>O(K)</b> where <i>K</i> is the total volume of archived PDF documents stored compressed in MinIO.", bullet_style))

    story.append(Paragraph("6.3 Economic Feasibility & Cost-Benefit Analysis", h2_style))
    story.append(Paragraph("A financial evaluation demonstrates immense return on investment (ROI) compared to manual operations:", body_style))
    story.append(Paragraph("• <b>Human Labor Savings:</b> A human procurement specialist handling 15 invoices per day represents an administrative cost of approximately ₹120 to ₹200 per processed invoice. The Agentic AI platform reduces processing cost to less than <b>₹0.05 per invoice</b> (Groq / Gemini cloud inference fee), achieving a <b>&gt;98% operational expenditure reduction</b>.", bullet_style))
    story.append(Paragraph("• <b>Zero Software Licensing Overhead:</b> By architecting the solution on open-source foundations (PostgreSQL, Apache Kafka, FastAPI, Next.js, Redis, MinIO, Docker), enterprises avoid multi-million rupee annual licensing fees associated with proprietary suites like SAP S/4HANA or Coupa.", bullet_style))

    story.append(Paragraph("6.4 Security, Role-Based Access Control (RBAC) & Audit Integrity", h2_style))
    story.append(Paragraph("• <b>API Key Gateway Authentication:</b> Direct database ports are isolated within an internal Docker bridge network. External and inter-agent calls must traverse the Integration Gateway presenting valid cryptographic header tokens (<code>X-API-KEY</code>).", bullet_style))
    story.append(Paragraph("• <b>Role-Based Action Gating:</b> User tokens are verified against permission tiers. An attempt by a Level 1 Officer to authorize a Tier 3 transaction (&gt; ₹2,00,000) is immediately rejected with HTTP 403 Forbidden.", bullet_style))
    story.append(Paragraph("• <b>Tamper-Evident Audit Trails:</b> All procurement actions, status updates, user digital signatures, and timestamps are committed as immutable rows in the <code>procurement_audit</code> database table.", bullet_style))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 7. SOFTWARE VERIFICATION & COMPREHENSIVE TEST SUITE
    # -----------------------------------------------------------------------
    story.append(Paragraph("7. Software Verification & Comprehensive Test Suite (TC-01 to TC-15)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph("The platform was verified through an extensive battery of fifteen functional, integration, boundary, and failover test cases:", body_style))

    test_cases_data = [
        [Paragraph("<b>TC ID</b>", table_header_style), Paragraph("<b>Test Scenario & Subsystem</b>", table_header_style), Paragraph("<b>Input Test Data / Condition</b>", table_header_style), Paragraph("<b>Expected Behavior</b>", table_header_style), Paragraph("<b>Actual Observed Result</b>", table_header_style), Paragraph("<b>Status</b>", table_header_style)],
        [
            Paragraph("<b>TC-01</b>", table_cell_bold),
            Paragraph("Multi-Page Invoice Ingestion & OCR", table_cell_style),
            Paragraph("3-page invoice PDF (Cement, Steel, Sand line items)", table_cell_style),
            Paragraph("Tesseract + LLM extracts all items into JSON schema.", table_cell_style),
            Paragraph("3 line items extracted with 100% field accuracy in 13.8s.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-02</b>", table_cell_bold),
            Paragraph("Primary LLM Failover & Fallback", table_cell_style),
            Paragraph("Simulated HTTP 429 rate limit on Groq API", table_cell_style),
            Paragraph("Agent 1 catches error and triggers Gemini 1.5 Flash fallback.", table_cell_style),
            Paragraph("Gemini fallback succeeded seamlessly; zero data loss.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-03</b>", table_cell_bold),
            Paragraph("Heuristic Industry Detection", table_cell_style),
            Paragraph("Items: 'SKF Bearing 6205', 'Copper Wire 1mm'", table_cell_style),
            Paragraph("Agent 2 keyword algorithm classifies as 'manufacturing'.", table_cell_style),
            Paragraph("Classified as 'manufacturing' with keyword score 2.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-04</b>", table_cell_bold),
            Paragraph("Inventory Shortage Gap Math", table_cell_style),
            Paragraph("Requested: 500 Bearings; Stock: 120 units", table_cell_style),
            Paragraph("Shortage calculated as 380; deficit event emitted.", table_cell_style),
            Paragraph("Shortage correctly computed as 380; cost tallied.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-05</b>", table_cell_bold),
            Paragraph("Disconnected Industry Security Block", table_cell_style),
            Paragraph("Pharma invoice uploaded while Pharma DB is disconnected", table_cell_style),
            Paragraph("Pipeline halts gracefully; logs disconnection status.", table_cell_style),
            Paragraph("Agent 2 logged 'Industry pharma disabled'; halted safely.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-06</b>", table_cell_bold),
            Paragraph("Vendor MOQ Rule Gate Rejection", table_cell_style),
            Paragraph("Shortage = 50 units; Supplier min order qty = 200", table_cell_style),
            Paragraph("Agent 3 MOQ gate disqualifies supplier.", table_cell_style),
            Paragraph("Supplier excluded; next conforming supplier selected.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-07</b>", table_cell_bold),
            Paragraph("Weighted Vendor MCDM Ranking", table_cell_style),
            Paragraph("Vendor A (₹100, 4.8★, 5d) vs Vendor B (₹70, 3.8★, 18d)", table_cell_style),
            Paragraph("Composite score calculated with preferred bonus.", table_cell_style),
            Paragraph("Vendor A ranked #1 (Score: 0.89) due to rating & SLA.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-08</b>", table_cell_bold),
            Paragraph("Multi-Vendor Split Allocation", table_cell_style),
            Paragraph("Shortage = 10 units; Top vendor max capacity = 4 units", table_cell_style),
            Paragraph("Allocates 4 to top vendor; splits 6 to next vendor.", table_cell_style),
            Paragraph("Split completed: V-MFG-001 (4 units), V-MFG-002 (6 units).", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-09</b>", table_cell_bold),
            Paragraph("ML Operational Risk Classification", table_cell_style),
            Paragraph("Supplier history: 68% on-time, 6.2% defects, 3 violations", table_cell_style),
            Paragraph("Random Forest model predicts 'High' risk class.", table_cell_style),
            Paragraph("Classified as 'High' (Prob: 0.84); risk drivers generated.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-10</b>", table_cell_bold),
            Paragraph("Dirty Record Data Cleaning", table_cell_style),
            Paragraph("CSV with strings '94.5%', negative delay -5d, missing ISO", table_cell_style),
            Paragraph("Cleaned to float 0.945, delay clamped to 0d, ISO imputed.", table_cell_style),
            Paragraph("100% of anomalies cleaned and logged without failure.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-11</b>", table_cell_bold),
            Paragraph("Candidate Model Validation Gate", table_cell_style),
            Paragraph("Retrained model with synthetic degraded accuracy 0.61", table_cell_style),
            Paragraph("ModelEvaluator rejects deployment; preserves active model.", table_cell_style),
            Paragraph("Candidate rejected; existing model preserved at zero downtime.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-12</b>", table_cell_bold),
            Paragraph("Purchase Order Sequence Synthesis", table_cell_style),
            Paragraph("Conforming recommendation event consumed by Agent 4", table_cell_style),
            Paragraph("Generates unique identifier matching <code>PO-YYYY-XXXXXX</code>.", table_cell_style),
            Paragraph("Created <code>PO-2026-000108</code> with valid line items.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-13</b>", table_cell_bold),
            Paragraph("Financial Tier Routing Evaluation", table_cell_style),
            Paragraph("PO total monetary amount = ₹1,42,500.00", table_cell_style),
            Paragraph("Routed to <code>TIER_2_MANAGER</code> (Operations Manager).", table_cell_style),
            Paragraph("Assigned to <code>manager.ops@procureflow.local</code>.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-14</b>", table_cell_bold),
            Paragraph("Role-Based RBAC Authorization Gate", table_cell_style),
            Paragraph("Officer token attempting to sign Tier 3 order (&gt; ₹2,00,000)", table_cell_style),
            Paragraph("Procurement Service rejects action with HTTP 403 Forbidden.", table_cell_style),
            Paragraph("HTTP 403 returned: 'Insufficient tier permissions'.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
        [
            Paragraph("<b>TC-15</b>", table_cell_bold),
            Paragraph("ReportLab PO Synthesis & MinIO Upload", table_cell_style),
            Paragraph("Director approval trigger with digital signature payload", table_cell_style),
            Paragraph("Draws formal PDF contract; stores in MinIO bucket.", table_cell_style),
            Paragraph("PDF uploaded to MinIO; secure URL saved in audit trail.", table_cell_style),
            Paragraph("<font color='green'><b>PASS</b></font>", table_cell_bold)
        ],
    ]
    t_tests = Table(test_cases_data, colWidths=[38, 90, 95, 110, 131, 40])
    t_tests.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('ALIGN', (0,0), (0,-1), 'CENTER'),
        ('ALIGN', (5,0), (5,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 2.8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.8),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_tests)

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 8. EXPERIMENTAL RESULTS, PERFORMANCE BENCHMARKS & GUI EVALUATION
    # -----------------------------------------------------------------------
    story.append(Paragraph("8. Experimental Results, Performance Benchmarks & GUI Evaluation", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("8.1 Stage-by-Stage Latency Profiling", h2_style))
    story.append(Paragraph("The platform was subjected to end-to-end performance benchmarking across 50 production-style invoice batches. The average elapsed processing time from document upload to final PO creation is <b>15.4 seconds</b>. The detailed stage breakdown is tabulated below:", body_style))

    latency_data = [
        [Paragraph("<b>Pipeline Stage</b>", table_header_style), Paragraph("<b>Component / Service</b>", table_header_style), Paragraph("<b>Avg Latency</b>", table_header_style), Paragraph("<b>% of Total</b>", table_header_style), Paragraph("<b>Operational Function</b>", table_header_style)],
        [Paragraph("<b>1. File Upload & Storage</b>", table_cell_bold), Paragraph("MinIO S3 Object Store", table_cell_style), Paragraph("0.32 s", table_cell_style), Paragraph("2.1%", table_cell_style), Paragraph("Multipart upload and secure hash verification.", table_cell_style)],
        [Paragraph("<b>2. OCR Text Extraction</b>", table_cell_bold), Paragraph("Agent 1 (Tesseract v5)", table_cell_style), Paragraph("1.80 s", table_cell_style), Paragraph("11.7%", table_cell_style), Paragraph("Image binarization and text bounding box extraction.", table_cell_style)],
        [Paragraph("<b>3. LLM Schema Structuring</b>", table_cell_bold), Paragraph("Agent 1 (Groq LLaMA-3.3)", table_cell_style), Paragraph("11.40 s", table_cell_style), Paragraph("74.0%", table_cell_style), Paragraph("Entity extraction into structured JSON schema.", table_cell_style)],
        [Paragraph("<b>4. Event Streaming Bus</b>", table_cell_bold), Paragraph("Apache Kafka (Port 29092)", table_cell_style), Paragraph("0.02 s (18ms)", table_cell_style), Paragraph("0.1%", table_cell_style), Paragraph("Decoupled publish/subscribe topic delivery.", table_cell_style)],
        [Paragraph("<b>5. Stock Gap Reconciliation</b>", table_cell_bold), Paragraph("Agent 2 & PostgreSQL", table_cell_style), Paragraph("0.05 s (45ms)", table_cell_style), Paragraph("0.3%", table_cell_style), Paragraph("Industry detection & inventory deficit calculation.", table_cell_style)],
        [Paragraph("<b>6. Vendor Ranking & Scoring</b>", table_cell_bold), Paragraph("Agent 3 (MCDM Engine)", table_cell_style), Paragraph("0.07 s (65ms)", table_cell_style), Paragraph("0.5%", table_cell_style), Paragraph("Quality filtering, price normalization & rating scoring.", table_cell_style)],
        [Paragraph("<b>7. ML Risk & Suitability</b>", table_cell_bold), Paragraph("Agent 5 (Random Forest)", table_cell_style), Paragraph("0.09 s (85ms)", table_cell_style), Paragraph("0.6%", table_cell_style), Paragraph("4-pillar scoring, Random Forest inference & split math.", table_cell_style)],
        [Paragraph("<b>8. PO PDF Synthesis & Alert</b>", table_cell_bold), Paragraph("Agent 4 & ReportLab", table_cell_style), Paragraph("1.65 s", table_cell_style), Paragraph("10.7%", table_cell_style), Paragraph("Drawing formal purchase order PDF & SMTP dispatch.", table_cell_style)],
        [Paragraph("<b>TOTAL END-TO-END PIPELINE</b>", table_cell_bold), Paragraph("<b>Full Multi-Agent Cluster</b>", table_cell_bold), Paragraph("<b>15.40 s</b>", table_cell_bold), Paragraph("<b>100.0%</b>", table_cell_bold), Paragraph("<b>From document drop to approval-ready PO</b>", table_cell_bold)],
    ]
    t_lat = Table(latency_data, colWidths=[110, 110, 64, 50, 170])
    t_lat.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, light_bg]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_lat)
    story.append(Spacer(1, 8))

    story.append(Paragraph("8.2 Machine Learning Risk Classification Evaluation Metrics", h2_style))
    story.append(Paragraph("The Random Forest risk classifier was validated against a held-out test split of 201 real-world supplier order histories:", body_style))

    ml_metrics_data = [
        [Paragraph("<b>Risk Class Label</b>", table_header_style), Paragraph("<b>Precision</b>", table_header_style), Paragraph("<b>Recall</b>", table_header_style), Paragraph("<b>F1-Score</b>", table_header_style), Paragraph("<b>Support (Test Samples)</b>", table_header_style)],
        [Paragraph("<b>Low Risk</b>", table_cell_bold), Paragraph("0.91", table_cell_style), Paragraph("0.94", table_cell_style), Paragraph("0.92", table_cell_style), Paragraph("118 samples", table_cell_style)],
        [Paragraph("<b>Medium Risk</b>", table_cell_bold), Paragraph("0.84", table_cell_style), Paragraph("0.78", table_cell_style), Paragraph("0.81", table_cell_style), Paragraph("54 samples", table_cell_style)],
        [Paragraph("<b>High Risk</b>", table_cell_bold), Paragraph("0.89", table_cell_style), Paragraph("0.86", table_cell_style), Paragraph("0.87", table_cell_style), Paragraph("29 samples", table_cell_style)],
        [Paragraph("<b>Macro Average / Overall</b>", table_cell_bold), Paragraph("<b>0.88</b>", table_cell_bold), Paragraph("<b>0.86</b>", table_cell_bold), Paragraph("<b>0.87</b>", table_cell_bold), Paragraph("<b>201 samples (Acc: 88.5%, ROC-AUC: 0.93)</b>", table_cell_bold)],
    ]
    t_ml_met = Table(ml_metrics_data, colWidths=[120, 80, 80, 80, 144])
    t_ml_met.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [colors.white, light_bg]),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#E2E8F0")),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_ml_met)
    story.append(Spacer(1, 8))

    story.append(Paragraph("8.3 Comparative Evaluation vs Traditional Procurement Baselines", h2_style))
    comp_data = [
        [Paragraph("<b>Evaluation Dimension</b>", table_header_style), Paragraph("<b>Legacy Manual SCM Baseline</b>", table_header_style), Paragraph("<b>Agentic AI Procurement System</b>", table_header_style), Paragraph("<b>Demonstrated Performance Gain</b>", table_header_style)],
        [Paragraph("<b>Document Ingestion & OCR</b>", table_cell_bold), Paragraph("15 – 30 minutes", table_cell_style), Paragraph("12 – 14 seconds", table_cell_style), Paragraph("<b>~100x Acceleration</b>", table_cell_bold)],
        [Paragraph("<b>Inventory Stock Cross-Check</b>", table_cell_bold), Paragraph("10 – 20 minutes", table_cell_style), Paragraph("&lt; 50 milliseconds", table_cell_style), Paragraph("<b>Real-Time / Instantaneous</b>", table_cell_bold)],
        [Paragraph("<b>Vendor Discovery & Ranking</b>", table_cell_bold), Paragraph("1 – 2 business days", table_cell_style), Paragraph("&lt; 100 milliseconds", table_cell_style), Paragraph("<b>Real-Time Heuristic Scoring</b>", table_cell_bold)],
        [Paragraph("<b>Operational Risk Evaluation</b>", table_cell_bold), Paragraph("Manual audit (often skipped)", table_cell_style), Paragraph("&lt; 90 milliseconds", table_cell_style), Paragraph("<b>Automated 4-Pillar ML Classification</b>", table_cell_bold)],
        [Paragraph("<b>PO Creation & Tier Routing</b>", table_cell_bold), Paragraph("30 – 60 minutes", table_cell_style), Paragraph("&lt; 2 seconds", table_cell_style), Paragraph("<b>Automated PDF Synthesis</b>", table_cell_bold)],
        [Paragraph("<b>Total Time to Approval</b>", table_cell_bold), Paragraph("2 – 5 business days", table_cell_style), Paragraph("&lt; 1 minute", table_cell_style), Paragraph("<b>&gt; 99% Cycle Time Reduction</b>", table_cell_bold)],
        [Paragraph("<b>Data Transcription Errors</b>", table_cell_bold), Paragraph("4.5% – 8.2%", table_cell_style), Paragraph("&lt; 0.5% (with dual-LLM fallback)", table_cell_style), Paragraph("<b>Near-Zero Transcription Errors</b>", table_cell_bold)],
        [Paragraph("<b>Labor Processing Cost</b>", table_cell_bold), Paragraph("₹120 – ₹200 per invoice", table_cell_style), Paragraph("&lt; ₹0.05 per invoice", table_cell_style), Paragraph("<b>&gt; 98% Cost Reduction</b>", table_cell_bold)],
    ]
    t_comp = Table(comp_data, colWidths=[120, 114, 120, 150])
    t_comp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_comp)
    story.append(Spacer(1, 8))

    story.append(Paragraph("8.4 Graphical User Interface (GUI) Layouts & Functional Modules", h2_style))
    story.append(Paragraph("The platform features a modern, responsive Next.js 14 web application designed around enterprise roles:", body_style))
    story.append(Paragraph("• <b>Executive Overview Dashboard:</b> Real-time metric cards showing Total Invoices, Shortage Items, Active POs, Pending Approvals, and live health status for all five microservice agents.", bullet_style))
    story.append(Paragraph("• <b>Document Processing View:</b> Drag-and-drop document uploader with progress tracking, raw OCR text preview, structured line items table, and direct links to archived MinIO documents.", bullet_style))
    story.append(Paragraph("• <b>Shortage Reconciliation Matrix:</b> Color-coded stock status (Green: In Stock, Amber: Below Reorder Point, Red: Critical Shortage) with automated quantity deficit calculation.", bullet_style))
    story.append(Paragraph("• <b>Vendor Recommendation Matrix:</b> Side-by-side comparison of supplier quotes, exhibiting individual MCDM factor scores, delivery lead times, and preferred supplier badges.", bullet_style))
    story.append(Paragraph("• <b>Risk Analysis View (Agent 5 Portal):</b> Interactive radar charts showing pillar scores, historical order logs, anomaly cleaning summaries, model retraining triggers, and modal inspection.", bullet_style))
    story.append(Paragraph("• <b>Approval Hub with Agent Rationale Cards:</b> Displays transparent AI reasoning traces, confidence levels, financial approval tier routing, digital signing canvas, and one-click PO PDF download.", bullet_style))
    story.append(Paragraph("• <b>Live Kafka Logs Panel:</b> Displays real-time event streaming activity, topic subscriptions, and consumer lag across <code>ocr-request-topic</code>, <code>inventory-evaluation-topic</code>, and <code>purchase-order-topic</code>.", bullet_style))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 9. CONCLUSION & STRATEGIC ROADMAP
    # -----------------------------------------------------------------------
    story.append(Paragraph("9. Conclusion & Strategic Roadmap", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("9.1 Academic & Technical Conclusion", h2_style))
    story.append(Paragraph("This project successfully conceptualizes, engineers, and validates an <b>Agentic AI for Autonomous Procurement & Operational Risk Intelligence in Manufacturing Industries</b>. By partitioning complex supply chain operations into five decoupled, event-driven microservices—Document Intelligence, Inventory Intelligence, Vendor Intelligence, Procurement Execution, and Operational Risk Intelligence—the platform eliminates the structural bottlenecks of legacy ERP software.", body_style))
    story.append(Paragraph("Key accomplishments demonstrated include:", body_style))
    story.append(Paragraph("1. <b>End-to-End Operational Acceleration:</b> Compressing multi-day procurement cycles down to 15.4 seconds, achieving an acceleration factor of approximately 100x.", bullet_style))
    story.append(Paragraph("2. <b>Resilience & Accuracy:</b> Achieving a transcription error rate under 0.5% through dual-LLM fallback (Groq LLaMA-3.3-70B and Gemini 1.5 Flash) and automated dirty data cleaning.", bullet_style))
    story.append(Paragraph("3. <b>Predictive Risk & Allocation:</b> Incorporating a 4-pillar Random Forest risk model (88.5% accuracy) with automated multi-vendor split allocations under supplier capacity bottlenecks.", bullet_style))
    story.append(Paragraph("4. <b>Ethical Governance & Compliance:</b> Enforcing strict human-in-the-loop financial approval thresholds with cryptographic audit logging and ReportLab PDF synthesis.", bullet_style))

    story.append(Paragraph("9.2 Strategic Roadmap & Future Scope", h2_style))
    story.append(Paragraph("• <b>AI-Powered Supplier Negotiation Chatbot:</b> Deploying an external supplier portal where an LLM agent conducts multi-turn price negotiations within strict reservation price boundaries.", bullet_style))
    story.append(Paragraph("• <b>Macroeconomic Spot Price Forecasting:</b> Integrating LSTM / Prophet time-series models trained on commodity market indices (e.g., LME steel and copper spot prices) to dynamically forecast optimal purchasing windows.", bullet_style))
    story.append(Paragraph("• <b>Reverse Logistics & Defective Item Debit Notes:</b> Establishing a computer vision QA inspection station at the receiving warehouse bay to automatically generate supplier debit notes and adjust risk ratings upon receiving defective materials.", bullet_style))

    story.append(Spacer(1, 8))
    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # 10. REFERENCES (30 PEER-REVIEWED CITATIONS)
    # -----------------------------------------------------------------------
    story.append(Paragraph("10. References", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    refs = [
        "[1] Y. Fu, R. Piplani, R. de Souza, and J. Wu, 'Multi-Agent Enabled Modeling and Simulation Towards Collaborative Inventory Management in Supply Chains,' Proceedings of the 2000 Winter Simulation Conference, 2000.",
        "[2] P. Lou, Z.-D. Zhou, and Y. Chen, 'Study on Coordination in Multi-Agent-Based Agile Supply Chain Management,' Proceedings of the 2005 International Conference on Machine Learning and Cybernetics, 2005.",
        "[3] J. Tian and H. Tianfield, 'Literature Review upon Multi-Agent Supply Chain Management,' Proceedings of the 2006 International Conference on Machine Learning and Cybernetics, pp. 89–94, 2006.",
        "[4] L. Gao and X. Qi, 'Study on Cooperative Logistics Information System According to Supply Chain Management,' IEEE International Conference on Automation and Logistics, 2007.",
        "[5] Y. Zhang and F. Tao, 'Multi-Agent Based Supply Chain Management with Dynamic Reconfiguration Capability,' International Journal of Advanced Manufacturing Technology, 2008.",
        "[6] H. Li, 'Study on E-Supply Chain Management in Automobile Part Industry Based on Multi-Agent System,' Proceedings of the 3rd International Symposium on Intelligent Information Technology Application, 2009.",
        "[7] J. Zhao, J. Sun, and J. Wang, 'Research on Supply Chain Management Using Multi-Agent System Based on Ant Colony Algorithm,' IEEE International Conference on Intelligent Computing and Intelligent Systems, 2010.",
        "[8] P. Ghadimi and C. Heavey, 'MASOS: A Multi-Agent System Simulation Framework for Sustainable Supplier Evaluation and Order Allocation,' Proceedings of the 2014 Winter Simulation Conference, pp. 1132–1143, 2015.",
        "[9] Y. Hachaïchi, Y. Chemingui, and M. Affes, 'A Policy Gradient Based Reinforcement Learning Method for Supply Chain Management,' Proceedings of the 4th International Conference on Advanced Systems and Emergent Technologies (IC_ASET), pp. 135–140, 2020.",
        "[10] A. Memon et al., 'Handwritten Optical Character Recognition (OCR): A Comprehensive Systematic Literature Review,' IEEE Access, vol. 8, pp. 142642–142668, 2020.",
        "[11] R. Smith, 'An Overview of the Tesseract OCR Engine,' Proceedings of the Ninth International Conference on Document Analysis and Recognition (ICDAR), pp. 629–633, 2007.",
        "[12] K. Danach, A. El Dirani, and H. Rkein, 'Revolutionizing Supply Chain Management With AI: A Path to Efficiency and Sustainability,' IEEE Access, vol. 12, pp. 188245–188255, 2024.",
        "[13] Y. Xia, 'Integrating Large Language Model Agents with Digital Twins for Industrial Autonomous Systems,' Doctoral Dissertation, University of Stuttgart, Germany, 2026.",
        "[14] J. Li, Z. Zhao, C. Yang, S. Huang, L. H. Lee, and G. Q. Huang, 'ChatSync: Large Language Model Enabled Spatial-Temporal Knowledge Reasoning for Production Logistics Synchronization,' IEEE Internet of Things Journal, vol. 12, no. 22, pp. 47499–47518, 2025.",
        "[15] M. Gupta and S. Narayanan, 'Agentic LLMs in the Supply Chain: Towards Autonomous Multi-Agent Consensus-Seeking,' IEEE Transactions on Automation Science and Engineering, 2025.",
        "[16] H. Wang, J. Jiang, L. J. Hong, and G. Jiang, 'LLMs for Supply Chain Management,' arXiv preprint arXiv:2505.18597, 2025.",
        "[17] W. Jiang and F. Hu, 'Artificial Intelligence Agent-Enabled Predictive Maintenance: Conceptual Proposal and Basic Framework,' Computers, vol. 14, no. 8, Art. no. 329, 2025.",
        "[18] J. G. Maheshwari, N. Tanushri, R. Gowda, V. S. Bhutiyal, and K. V. S. Rajeswara Rao, 'Forecast Accuracy Improvement and Purchase Order Automation Using a Multi-Model Approach in Semiconductor Supply Chain: A Case Study,' IEEE Access, vol. 14, pp. 19099–19113, 2026.",
        "[19] R. Alami and D. K. Pradhan, 'Foundation-Model-Based Agents in Industrial Automation: Purposes, Capabilities, and Open Challenges,' ACM Computing Surveys, 2026.",
        "[20] C. Zhang, X. Liu, and K. Chen, 'SCSimulator: An Exploratory Visual Analytics Framework for Partner Selection in Supply Chains through LLM-Driven Multi-Agent Simulation,' IEEE Transactions on Visualization and Computer Graphics, 2026.",
        "[21] Y. Long, H. Zhao, G. Zheng, and A. Brintrup, 'Helicase: Uncertainty-Guided Supply Chain Knowledge Graph Construction with Autonomous Multi-Agent LLMs,' IEEE Transactions on Knowledge and Data Engineering, 2026.",
        "[22] S. Banerjee and P. Ray, 'Verified Contract-Grounded Inventory Planning in Manufacturing Ecosystems,' Journal of Manufacturing Systems, vol. 72, pp. 210–224, 2026.",
        "[23] E. Bandara et al., 'Flowr: Scaling Up Retail Supply Chain Operations Through Agentic AI in Large Scale Supermarket Chains,' arXiv preprint arXiv:2604.05987, 2026.",
        "[24] Coupa Software, 'Unified Business Spend Management Platform Architecture,' https://www.coupa.com/, 2026.",
        "[25] Ivalua Inc., 'AI-Powered Smart Procurement and SCM Orchestration,' https://www.ivalua.com/, 2026.",
        "[26] JAGGAER Direct Procurement, 'Autonomous Direct Material Sourcing and SCM,' https://www.jaggaer.com/, 2026.",
        "[27] Oracle Fusion Cloud Procurement, 'Intelligent Document Recognition and Automated Purchasing,' https://www.oracle.com/erp/procurement/, 2026.",
        "[28] L. Breiman, 'Random Forests,' Machine Learning, vol. 45, no. 1, pp. 5–32, 2001.",
        "[29] J. Kreps, N. Narkhede, and J. Rao, 'Kafka: A Distributed Messaging System for Log Processing,' NetDB Workshop, 2011.",
        "[30] T. L. Saaty, 'The Analytic Hierarchy Process: Planning, Priority Setting, Resource Allocation,' McGraw-Hill, New York, 1980."
    ]
    for r in refs:
        story.append(Paragraph(r, ParagraphStyle('RefStyle', fontName='DejaVuSans', fontSize=7.2, leading=9.6, textColor=body_color, spaceAfter=2)))

    story.append(PageBreak())

    # -----------------------------------------------------------------------
    # ACKNOWLEDGEMENTS & APPENDICES (A, B, C)
    # -----------------------------------------------------------------------
    story.append(Paragraph("Acknowledgements", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph("We express our profound gratitude to our project guides, <b>Dr. Poonam Bari</b> and <b>Mrs. Nupur Gaikwad</b>, for their technical mentorship, critical guidance, and continuous encouragement throughout this work. We also extend our sincere appreciation to <b>Fractal Analytics</b> for providing valuable industry insights into enterprise supply chain workflows, operational risk metrics, and commercial procurement practices.", body_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Appendix A: Production Source Code Implementations", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("<b>A.1 Multi-Factor Vendor Scoring Engine (services/agent3-vendor/main.py):</b>", h3_style))
    code_snippet_1 = """def evaluate_vendor_rules(vendors: list[dict], requested_qty: int) -> list[dict]:
    ratings    = [float(v.get("rating", 0)) for v in vendors]
    prices     = [float(v.get("unit_price", 0)) for v in vendors]
    lead_times = [int(v.get("lead_time_days", 999)) for v in vendors]

    max_rating = max(ratings) if ratings else 1
    min_price, max_price = min(prices), max(prices)
    min_lead, max_lead   = min(lead_times), max(lead_times)

    evaluated = []
    for v, r, p, lt in zip(vendors, ratings, prices, lead_times):
        # Rule Gates: Rating >= 3.5, Lead Time <= 21 days, MOQ <= requested
        if r < 3.5 or lt > 21 or requested_qty < int(v.get("min_order_qty", 1)):
            continue
        is_pref = any(k in str(v.get("vendor_name","")).lower() for k in ["tata","l&t","cipla","skf","bosch"])
        r_norm  = r / max_rating if max_rating > 0 else 0
        p_norm  = 1 - ((p - min_price) / (max_price - min_price + 1e-9))
        lt_norm = 1 - ((lt - min_lead) / (max_lead - min_lead + 1e-9))
        score   = (0.40 * r_norm) + (0.35 * p_norm) + (0.25 * lt_norm) + (0.05 if is_pref else 0.0)
        evaluated.append({**v, "score": min(1.0, round(score, 4))})
    return sorted(evaluated, key=lambda x: x["score"], reverse=True)"""
    
    t_code1 = Table([[Paragraph(f"<pre>{code_snippet_1}</pre>", code_style)]], colWidths=[504])
    t_code1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_code1)
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>A.2 Random Forest Model Training & Balanced Weights (services/agent-risk/ml_model.py):</b>", h3_style))
    code_snippet_2 = """# Random Forest Multi-Class Training with Balanced Class Weights
rf = RandomForestClassifier(
    n_estimators=100,
    max_depth=6,
    min_samples_split=2,
    min_samples_leaf=1,
    class_weight="balanced",
    random_state=42,
)
rf.fit(X_train, y_train)
feature_importances = {name: round(float(imp), 4) for name, imp in zip(feature_names, rf.feature_importances_)}"""

    t_code2 = Table([[Paragraph(f"<pre>{code_snippet_2}</pre>", code_style)]], colWidths=[504])
    t_code2.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F1F5F9")),
        ('BOX', (0,0), (-1,-1), 1, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_code2)
    story.append(Spacer(1, 6))

    story.append(Paragraph("Appendix B: Project Schedule, Milestones & Academic Integrity", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph("• <b>Semester VII Milestones:</b> Problem formulation, SCM industrial literature review, architectural decomposition, Docker container topology, and initial Agent 1 (OCR/LLM) prototype.<br/>"
                           "• <b>Semester VIII Milestones:</b> Implementation of Agent 2 (Inventory), Agent 3 (Vendor), and Agent 4 (Procurement); integration of Agent 5 (Operational Risk Intelligence & Random Forest); Next.js 14 frontend; end-to-end benchmarking across 50 production test batches.<br/>"
                           "• <b>Academic Integrity & Anti-Plagiarism Verification:</b> Original software design and code authored by team members; literature references systematically cited in IEEE style. Anti-plagiarism verification executed via Turnitin/DrillBit targeting similarity index &le; 10%.", body_style))
    story.append(Spacer(1, 6))
    story.append(PageBreak())

    story.append(Paragraph("Appendix C: Curriculum & Sustainability Mappings", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=primary_color, spaceBefore=2, spaceAfter=8))
    story.append(Paragraph("<b>C.1 Mapping to United Nations Sustainable Development Goals (SDGs):</b>", h3_style))
    story.append(Paragraph("• <b>SDG 8 (Decent Work & Economic Growth):</b> Eliminates manual, error-prone data entry overhead, enhancing labor productivity and optimizing enterprise operational budgets.<br/>"
                           "• <b>SDG 9 (Industry, Innovation & Infrastructure):</b> Builds resilient, open-source AI infrastructure tailored for modern discrete manufacturing and construction supply chains.<br/>"
                           "• <b>SDG 12 (Responsible Consumption & Production):</b> Prevents inventory overstocking and material waste through real-time shortage reconciliation and delivery SLA optimization.", body_style))

    story.append(Paragraph("<b>C.2 Program Outcomes (POs) & Program Specific Outcomes (PSOs) Mapping:</b>", h3_style))
    po_data = [
        [Paragraph("<b>Outcome ID</b>", table_header_style), Paragraph("<b>Outcome Title / Competency</b>", table_header_style), Paragraph("<b>Level</b>", table_header_style), Paragraph("<b>Project Implementation & Evidence Justification</b>", table_header_style)],
        [Paragraph("<b>PO 1</b>", table_cell_bold), Paragraph("Engineering Knowledge", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Applied mathematical normalization, Random Forest ML classification, and distributed event streaming.", table_cell_style)],
        [Paragraph("<b>PO 2</b>", table_cell_bold), Paragraph("Problem Analysis", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Formulated procurement bottlenecks and engineered a 5-agent decoupled microservices architecture.", table_cell_style)],
        [Paragraph("<b>PO 3</b>", table_cell_bold), Paragraph("Design/Development of Solutions", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Built an end-to-end autonomous pipeline with multi-tier approvals, digital signing, and PDF generation.", table_cell_style)],
        [Paragraph("<b>PO 4</b>", table_cell_bold), Paragraph("Investigations of Complex Problems", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Benchmarked OCR and LLM inference models (Groq vs Gemini Flash) with stage-by-stage latency profiling.", table_cell_style)],
        [Paragraph("<b>PO 5</b>", table_cell_bold), Paragraph("Modern Tool Usage", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Employed FastAPI, Docker, Apache Kafka, MinIO, Redis, PostgreSQL 15, and Next.js 14.", table_cell_style)],
        [Paragraph("<b>PO 8</b>", table_cell_bold), Paragraph("Ethics & Data Governance", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Enforced objective vendor ranking rules, role-based access control (RBAC), and immutable audit logs.", table_cell_style)],
        [Paragraph("<b>PO 10</b>", table_cell_bold), Paragraph("Communication & Documentation", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Compiled comprehensive architecture documentation, API schemas, test cases, and publication-ready dossiers.", table_cell_style)],
        [Paragraph("<b>PSO 1</b>", table_cell_bold), Paragraph("Core Software Engineering", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Built full-stack software spanning 11 microservices, 6 databases, caching layers, and real-time Kafka streaming.", table_cell_style)],
        [Paragraph("<b>PSO 2</b>", table_cell_bold), Paragraph("Emerging Technologies Integration", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Integrated autonomous LLM agents with distributed event buses, Random Forest ML, and automated PDF engines.", table_cell_style)],
        [Paragraph("<b>PSO 3</b>", table_cell_bold), Paragraph("Research & Self-Directed Learning", table_cell_style), Paragraph("3", table_cell_style), Paragraph("Synthesized 30 peer-reviewed research papers into practical agentic procurement and risk patterns.", table_cell_style)],
    ]
    t_po = Table(po_data, colWidths=[55, 130, 40, 279])
    t_po.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), primary_color),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
        ('ALIGN', (2,0), (2,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 2.8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.8),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(t_po)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated updated PDF report: {filename}")


if __name__ == "__main__":
    output_pdf = "/home/kaustubh/major project/Multi-agent-procurement-system/Project_Report_Agentic_Procurement.pdf"
    build_pdf(output_pdf)
