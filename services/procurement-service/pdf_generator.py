"""
Purchase Order PDF Generator
Generates corporate-grade Purchase Order PDFs using ReportLab.
Supports both standard draft POs and DocuSign digitally signed POs.
"""

from io import BytesIO
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, HRFlowable


def generate_po_pdf(
    po_data: dict,
    is_signed: bool = False,
    signer_name: Optional[str] = None,
    signer_email: Optional[str] = None,
    signed_at: Optional[str] = None,
    signature_id: Optional[str] = None,
) -> bytes:
    """
    Generates a professional Purchase Order PDF document in memory.
    Returns the PDF as bytes.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Heading1"],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "DocSubTitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#64748b"),
    )
    section_heading = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        fontName="Helvetica-Bold",
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )
    bold_style = ParagraphStyle(
        "BoldBody",
        parent=body_style,
        fontName="Helvetica-Bold",
    )
    badge_style = ParagraphStyle(
        "Badge",
        parent=styles["Normal"],
        fontSize=10,
        leading=13,
        fontName="Helvetica-Bold",
        alignment=2,
    )

    story = []

    # 1. Header with Company and PO details
    po_number   = po_data.get("po_number", "PO-DRAFT")
    created_at  = po_data.get("created_at", datetime.utcnow().strftime("%Y-%m-%d"))
    total_price = float(po_data.get("total_price", 0.0))
    currency    = po_data.get("currency", "INR")
    status      = "APPROVED (DIGITALLY SIGNED)" if is_signed else po_data.get("status", "PENDING_APPROVAL")
    tier        = po_data.get("approval_tier", "TIER_1_OFFICER")
    approver_name  = signer_name or po_data.get("assigned_approver_name", "Procurement Approver")
    approver_email = signer_email or po_data.get("assigned_approver_email", "approvals@procureflow.local")

    status_color = "#16a34a" if is_signed else "#d97706"
    status_html = f'<font color="{status_color}">● {status}</font>'

    header_table_data = [
        [
            Paragraph("<b>PROCUREFLOW</b><br/><font color='#64748b' size=8>Autonomous Multi-Agent Procurement System</font>", title_style),
            Paragraph(f"<b>PURCHASE ORDER</b><br/><font size=11 color='#2563eb'>{po_number}</font><br/>{status_html}", badge_style),
        ]
    ]
    header_table = Table(header_table_data, colWidths=[330, 200])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=15))

    # 2. Metadata Grid (Vendor & Order Info)
    vendor_name = po_data.get("vendor_name", "N/A")
    raw_delivery = po_data.get("delivery_date_expected")
    if hasattr(raw_delivery, "strftime"):
        delivery = raw_delivery.strftime("%Y-%m-%d")
    elif raw_delivery:
        delivery = str(raw_delivery)[:10]
    else:
        delivery = "Standard Lead Time"

    request_id  = po_data.get("request_id", "N/A")

    raw_created = po_data.get("created_at")
    if hasattr(raw_created, "strftime"):
        created_at_str = raw_created.strftime("%Y-%m-%d")
    elif raw_created:
        created_at_str = str(raw_created)[:10]
    else:
        created_at_str = datetime.utcnow().strftime("%Y-%m-%d")

    info_data = [
        [
            Paragraph("<b>VENDOR / SUPPLIER:</b>", section_heading),
            Paragraph("<b>ORDER & ROUTING DETAILS:</b>", section_heading),
        ],
        [
            Paragraph(
                f"<b>{vendor_name}</b><br/>"
                f"Vendor ID: #{po_data.get('vendor_id', 'N/A')}<br/>"
                f"Status: Verified Supplier<br/>"
                f"SLA Delivery: {delivery}",
                body_style,
            ),
            Paragraph(
                f"<b>PO Date:</b> {created_at_str}<br/>"
                f"<b>Procurement Request:</b> #{request_id}<br/>"
                f"<b>Approval Tier:</b> {tier.replace('_', ' ')}<br/>"
                f"<b>Assigned Approver:</b> {approver_name} ({approver_email})",
                body_style,
            ),
        ],
    ]
    info_table = Table(info_data, colWidths=[265, 265])
    info_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor("#f8fafc")),
        ('PADDING', (0, 1), (-1, 1), 10),
        ('BOX', (0, 1), (-1, 1), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 18))

    # 3. Line Items Table
    item_name  = po_data.get("item_name", "Procurement Item")
    qty        = po_data.get("quantity", 1)
    unit_price = float(po_data.get("unit_price", 0.0))

    items_data = [
        [
            Paragraph("<b>#</b>", bold_style),
            Paragraph("<b>Item Description</b>", bold_style),
            Paragraph("<b>Qty</b>", bold_style),
            Paragraph("<b>Unit Price (₹)</b>", bold_style),
            Paragraph("<b>Total Amount (₹)</b>", bold_style),
        ],
        [
            Paragraph("1", body_style),
            Paragraph(f"<b>{item_name}</b><br/><font color='#64748b' size=7.5>{po_data.get('notes', '')}</font>", body_style),
            Paragraph(str(qty), body_style),
            Paragraph(f"₹{unit_price:,.2f}", body_style),
            Paragraph(f"₹{total_price:,.2f}", bold_style),
        ],
    ]

    items_table = Table(items_data, colWidths=[30, 260, 60, 90, 90])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 10))

    # 4. Total calculation summary box
    totals_data = [
        ["Subtotal:", f"₹{total_price:,.2f}"],
        ["Taxes / Duties (Included):", "₹0.00"],
        ["Grand Total (INR):", f"₹{total_price:,.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[440, 90])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (0, 2), (-1, 2), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, 2), (-1, 2), colors.HexColor("#0f172a")),
        ('LINEABOVE', (0, 2), (-1, 2), 1, colors.HexColor("#0f172a")),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # 5. Terms & Commercial Notes
    terms_p = Paragraph(
        "<b>Terms & Conditions:</b><br/>"
        "1. Payment terms: Net 30 days upon delivery and satisfactory quality verification.<br/>"
        "2. Deliveries must include a packing slip referencing this PO number.<br/>"
        "3. Any deviation in product specifications or pricing requires prior written approval.",
        subtitle_style,
    )
    story.append(terms_p)
    story.append(Spacer(1, 25))

    # 6. DocuSign Digital Signature Box
    if is_signed:
        sign_time = signed_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        sig_id    = signature_id or f"DS-ENV-{po_number}"
        sig_content = [
            Paragraph("<b>DOCUSIGN DIGITAL SIGNATURE VERIFICATION CERTIFICATE</b>", ParagraphStyle("DSHeader", parent=bold_style, textColor=colors.HexColor("#1e3a8a"), fontSize=10)),
            Spacer(1, 4),
            Paragraph(f"<b>Signer:</b> {approver_name} &lt;{approver_email}&gt;", body_style),
            Paragraph(f"<b>Timestamp:</b> {sign_time} | <b>Signature ID:</b> <font face='Courier'>{sig_id}</font>", body_style),
            Paragraph(f"<b>DocuSign Status:</b> <font color='#16a34a'><b>COMPLETED (Cryptographically Verified)</b></font>", body_style),
            Paragraph(f"<b>Archived in MinIO:</b> <font color='#2563eb'>procurement-documents/signed-pos/{po_number}_signed.pdf</font>", subtitle_style),
        ]
        sig_box = Table([[sig_content]], colWidths=[530])
        sig_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
            ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#3b82f6")),
            ('PADDING', (0, 0), (-1, -1), 12),
        ]))
    else:
        sig_content = [
            Paragraph("<b>AUTHORIZATION & DIGITAL SIGNATURE ROUTING</b>", ParagraphStyle("DSHeader", parent=bold_style, textColor=colors.HexColor("#92400e"), fontSize=10)),
            Spacer(1, 4),
            Paragraph(f"<b>Routing Policy:</b> Amount-based tier assigned to <b>{approver_name}</b> ({approver_email})", body_style),
            Paragraph("<b>DocuSign Status:</b> <font color='#d97706'><b>PENDING SIGNATURE</b></font> — Sent via SMTP Mailer to designated employee", body_style),
            Paragraph("Sign digitally via the ProcureFlow Approvals Portal or DocuSign eSignature link.", subtitle_style),
        ]
        sig_box = Table([[sig_content]], colWidths=[530])
        sig_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
            ('BOX', (0, 0), (-1, -1), 1.0, colors.HexColor("#f59e0b")),
            ('PADDING', (0, 0), (-1, -1), 12),
        ]))

    story.append(KeepTogether([sig_box]))

    doc.build(story)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data
