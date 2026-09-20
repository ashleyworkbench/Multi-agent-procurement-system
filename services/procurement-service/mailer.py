"""
SMTP Mailer & Notification Service for Purchase Order Approvals
Routes approval emails with DocuSign signing links based on PO amount tiers.
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from typing import Optional
from dotenv import load_dotenv

load_dotenv()
log = logging.getLogger("procurement-mailer")

SMTP_HOST     = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", "procureflow-approvals@company.com")
SMTP_USE_TLS  = os.getenv("SMTP_USE_TLS", "false").lower() == "true"
APP_URL       = os.getenv("FRONTEND_APP_URL", "http://localhost:3000")


def send_po_approval_email(po_data: dict, pdf_bytes: Optional[bytes] = None) -> dict:
    """
    Sends an approval request email to the designated employee based on PO amount tier.
    Includes PO summary, itemized details, and DocuSign signing link.
    Falls back gracefully to logging if an active SMTP server is not reachable.
    """
    po_number       = po_data.get("po_number", "PO-UNKNOWN")
    recipient_email = po_data.get("assigned_approver_email", "approver@procureflow.local")
    recipient_name  = po_data.get("assigned_approver_name", "Procurement Approver")
    tier            = po_data.get("approval_tier", "TIER_1_OFFICER")
    total_price     = float(po_data.get("total_price", 0.0))
    currency        = po_data.get("currency", "INR")
    vendor_name     = po_data.get("vendor_name", "Vendor")
    item_name       = po_data.get("item_name", "Item")
    quantity        = po_data.get("quantity", 1)
    po_id           = po_data.get("id", "")

    signing_url = f"{APP_URL}/approvals?po_id={po_id}&sign=true"

    subject = f"ACTION REQUIRED: Purchase Order Approval Needed — {po_number} (₹{total_price:,.2f})"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 20px; }}
        .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
        .header {{ background: #0f172a; color: #ffffff; padding: 24px; text-align: left; }}
        .header h1 {{ margin: 0; font-size: 20px; font-weight: 700; }}
        .header p {{ margin: 4px 0 0 0; color: #94a3b8; font-size: 13px; }}
        .content {{ padding: 24px; color: #334155; }}
        .tier-badge {{ display: inline-block; background: #eff6ff; color: #1d4ed8; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 16px; border: 1px solid #bfdbfe; }}
        .details-table {{ width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }}
        .details-table td {{ padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }}
        .details-table td.label {{ color: #64748b; font-weight: 500; width: 40%; }}
        .details-table td.value {{ color: #0f172a; font-weight: 600; }}
        .total-box {{ background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px; margin: 20px 0; border-radius: 4px; }}
        .total-box .amount {{ font-size: 22px; font-weight: 700; color: #0f172a; }}
        .btn {{ display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 12px 0; }}
        .footer {{ background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; font-size: 12px; color: #94a3b8; text-align: center; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>ProcureFlow Approval Request</h1>
          <p>Autonomous AI Multi-Agent Procurement System</p>
        </div>
        <div class="content">
          <span class="tier-badge">Routing Policy: {tier.replace('_', ' ')}</span>
          <p>Hello <b>{recipient_name}</b>,</p>
          <p>Agent 4 has generated a new Purchase Order that requires your review and digital signature authorization based on the company's financial threshold rules.</p>
          
          <table class="details-table">
            <tr><td class="label">PO Number:</td><td class="value font-mono">{po_number}</td></tr>
            <tr><td class="label">Vendor:</td><td class="value">{vendor_name}</td></tr>
            <tr><td class="label">Item Description:</td><td class="value">{item_name}</td></tr>
            <tr><td class="label">Quantity:</td><td class="value">{quantity:,} units</td></tr>
            <tr><td class="label">Expected Delivery:</td><td class="value">{po_data.get('delivery_date_expected', 'SLA Standard')}</td></tr>
          </table>

          <div class="total-box">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase;">Total Purchase Order Value</span>
            <div class="amount">₹{total_price:,.2f} {currency}</div>
          </div>

          <p style="text-align: center; margin-top: 24px;">
            <a href="{signing_url}" class="btn">Review & Sign with DocuSign</a>
          </p>
          <p style="font-size: 12px; color: #64748b; text-align: center;">
            Once signed, the document will be cryptographically certified and archived automatically in MinIO storage.
          </p>
        </div>
        <div class="footer">
          Sent by ProcureFlow Agent 4 via SMTP Approval Service &bull; DocuSign Integrated Workflow
        </div>
      </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"]    = SMTP_FROM
    msg["To"]      = recipient_email

    msg.attach(MIMEText(html_content, "html"))

    if pdf_bytes:
        pdf_attachment = MIMEApplication(pdf_bytes, _subtype="pdf")
        pdf_attachment.add_header(
            "Content-Disposition",
            "attachment",
            filename=f"{po_number}.pdf",
        )
        msg.attach(pdf_attachment)

    # Attempt SMTP transmission
    sent_live = False
    try:
        if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10)
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [recipient_email], msg.as_string())
            server.quit()
            sent_live = True
            log.info(f"Live approval email sent to {recipient_email} for PO {po_number}")
        else:
            log.info(f"[SIMULATED SMTP] Email queued for {recipient_name} <{recipient_email}> for PO {po_number} (₹{total_price:,.2f})")
    except Exception as e:
        log.warning(f"SMTP delivery failed to {recipient_email} ({e}). Fallback to simulation log.")

    return {
        "po_number": po_number,
        "recipient": recipient_email,
        "recipient_name": recipient_name,
        "tier": tier,
        "subject": subject,
        "live_smtp_sent": sent_live,
        "signing_url": signing_url,
        "status": "SENT",
    }
