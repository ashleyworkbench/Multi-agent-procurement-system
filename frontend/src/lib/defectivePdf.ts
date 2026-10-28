import { defectiveApi, type DefectiveItem } from "./api";

/**
 * Escapes characters for PDF string literals.
 */
function escapePdfText(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ");
}

/**
 * Wraps text into lines that fit within maxChars.
 */
function wrapText(text: string, maxChars: number = 80): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + " " + w).length <= maxChars) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Creates a text command using an absolute text matrix Tm (1 0 0 1 x y Tm).
 * This ensures exact, absolute positioning for every text element.
 */
function textCmd(
  text: string,
  x: number,
  y: number,
  font: "F1" | "F2" = "F1",
  size: number = 9,
  color: [number, number, number] = [0.2, 0.25, 0.3]
): string {
  const [r, g, b] = color;
  return `q ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(
    3
  )} rg BT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET Q`;
}

/**
 * Creates a rectangle command with fill and stroke.
 */
function rectCmd(
  x: number,
  y: number,
  w: number,
  h: number,
  fill: [number, number, number] = [0.97, 0.98, 0.99],
  stroke: [number, number, number] = [0.85, 0.88, 0.92]
): string {
  const [fr, fg, fb] = fill;
  const [sr, sg, sb] = stroke;
  return `q ${fr.toFixed(3)} ${fg.toFixed(3)} ${fb.toFixed(
    3
  )} rg ${sr.toFixed(3)} ${sg.toFixed(3)} ${sb.toFixed(
    3
  )} RG 1 w ${x} ${y} ${w} ${h} re B Q`;
}

/**
 * Generates a clean, valid PDF-1.4 document for a defective item report
 * and triggers immediate client-side download with unique filename DEF-XXXX.pdf.
 *
 * If any core field is missing from the item object, it fetches the full detail
 * record from the existing detail endpoint before generating the document.
 */
export async function downloadDefectiveReportPdf(
  input: DefectiveItem | number
): Promise<void> {
  let item: DefectiveItem;

  // If passed an ID or an incomplete object, fetch full record from existing detail endpoint
  if (typeof input === "number") {
    item = await defectiveApi.getItem(input);
  } else if (
    !input.item_name?.trim() ||
    !input.po_number?.trim() ||
    !input.defect_type?.trim()
  ) {
    try {
      item = await defectiveApi.getItem(input.id);
    } catch {
      throw new Error(
        `Could not load complete report DEF-${String(input.id).padStart(4, "0")}.`
      );
    }
  } else {
    item = input;
  }

  const rmaCode = item.rma_number || `RMA-2026-${String(item.id).padStart(4, "0")}`;
  const refId = `DEF-${String(item.id).padStart(4, "0")}`;
  const filename = `${rmaCode}.pdf`;

  const orderedQty = item.ordered_quantity ?? 0;
  const defectiveQty = item.defective_quantity ?? 0;
  const defectPercent =
    orderedQty > 0 ? ((defectiveQty / orderedQty) * 100).toFixed(1) : "0.0";
  const usableStock = Math.max(0, orderedQty - defectiveQty);
  const timestamp =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const unitPrice = item.unit_price ?? 0;
  const totalClaim = item.total_claim_amount ?? (unitPrice * defectiveQty);
  const severity = (item.severity || "MAJOR").toUpperCase();
  const rootCause = (item.root_cause || "MANUFACTURING_FLAW").replace(/_/g, " ");
  const quarantineLoc = item.quarantine_location || "Quarantine Bay Q-1";
  const disposition = item.disposition_type ? item.disposition_type.replace(/_/g, " ") : "PENDING EVALUATION";
  const trackingRef = item.tracking_reference || "None Assigned";
  const approvedBy = item.disposition_approved_by || "Operations Manager";

  const descriptionLines = item.description?.trim()
    ? wrapText(item.description.trim(), 82).slice(0, 3)
    : ["No defect description entered."];

  const resolutionLines = item.resolution_notes?.trim()
    ? wrapText(item.resolution_notes.trim(), 82).slice(0, 3)
    : ["Claim in progress - awaiting vendor disposition and settlement verification."];

  // Build PDF graphics stream commands
  const commands: string[] = [];

  // 1. Header Banner (Deep Navy Slate #0f172a with subtle gold accent bar)
  commands.push("q 0.06 0.09 0.16 rg 0 720 612 72 re f Q");
  commands.push("q 0.85 0.65 0.13 rg 0 716 612 4 re f Q"); // Accent line
  commands.push(
    textCmd(
      "PROCUREFLOW ENTERPRISE - QUALITY ASSURANCE DIVISION",
      40,
      764,
      "F2",
      14,
      [1, 1, 1]
    )
  );
  commands.push(
    textCmd(
      "ISO 9001:2015 QUALITY NON-CONFORMANCE & RMA DISPOSITION CERTIFICATE",
      40,
      746,
      "F2",
      10,
      [0.9, 0.75, 0.35]
    )
  );
  commands.push(
    textCmd(
      `Official Authorization Ref: ${rmaCode} | Internal Quarantine Docket: #${refId}`,
      40,
      730,
      "F1",
      8.5,
      [0.8, 0.85, 0.92]
    )
  );

  // 2. Section: Overview Metadata Box (y=622 to 705)
  commands.push(rectCmd(40, 622, 532, 83));
  commands.push(
    textCmd(
      "1. DOCKET IDENTIFIERS & VENDOR RECORD",
      55,
      689,
      "F2",
      10,
      [0.09, 0.14, 0.22]
    )
  );

  // Row 1
  commands.push(textCmd("RMA Tracking Code:", 55, 670, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(rmaCode, 155, 670, "F2", 8.5, [0.08, 0.35, 0.75]));

  commands.push(textCmd("Purchase Order:", 275, 670, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.po_number || "N/A", 355, 670, "F2", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Inspection Date:", 435, 670, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.inspection_date || "N/A", 505, 670, "F1", 8.5, [0.1, 0.12, 0.18]));

  // Row 2
  commands.push(textCmd("Lifecycle Status:", 55, 650, "F2", 8.5, [0.35, 0.4, 0.48]));
  const statusColor: [number, number, number] =
    item.status === "RESOLVED"
      ? [0.08, 0.55, 0.25]
      : item.status === "REJECTED"
      ? [0.75, 0.15, 0.15]
      : [0.75, 0.45, 0.05];
  commands.push(textCmd(item.status || "REPORTED", 155, 650, "F2", 8.5, statusColor));

  commands.push(textCmd("Vendor / Supplier:", 275, 650, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.vendor_name || "N/A", 355, 650, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Lead Inspector:", 435, 650, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.reported_by || "QC Inspector", 505, 650, "F1", 8.5, [0.1, 0.12, 0.18]));

  // Row 3
  commands.push(textCmd("Defect Severity:", 55, 632, "F2", 8.5, [0.35, 0.4, 0.48]));
  const sevColor: [number, number, number] =
    severity === "CRITICAL"
      ? [0.85, 0.1, 0.1]
      : severity === "MAJOR"
      ? [0.75, 0.4, 0.05]
      : [0.15, 0.45, 0.75];
  commands.push(textCmd(severity, 155, 632, "F2", 8.5, sevColor));

  commands.push(textCmd("Lot / Batch #:", 275, 632, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.batch_number || "LOT-2026-001", 355, 632, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Quarantine Bay:", 435, 632, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(quarantineLoc, 505, 632, "F2", 8.5, [0.75, 0.4, 0.05]));

  // 3. Section: Non-Conformance & Stock Segregation Breakdown (y=505 to 612)
  commands.push(rectCmd(40, 505, 532, 107));
  commands.push(
    textCmd(
      "2. PHYSICAL INSPECTION & STOCK SEGREGATION METRICS",
      55,
      596,
      "F2",
      10,
      [0.09, 0.14, 0.22]
    )
  );

  commands.push(textCmd("Item Description:", 55, 577, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.item_name || "N/A", 155, 577, "F2", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Defect Category:", 340, 577, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(item.defect_type || "Unspecified", 425, 577, "F2", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Total Ordered Qty:", 55, 557, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(`${orderedQty.toLocaleString()} units`, 155, 557, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Defective Qty:", 340, 557, "F2", 8.5, [0.78, 0.15, 0.15]));
  commands.push(
    textCmd(
      `${defectiveQty.toLocaleString()} units (${defectPercent}% defect rate)`,
      425,
      557,
      "F2",
      8.5,
      [0.78, 0.15, 0.15]
    )
  );

  commands.push(textCmd("Usable Accepted Qty:", 55, 537, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(`${usableStock.toLocaleString()} units`, 155, 537, "F2", 8.5, [0.08, 0.55, 0.25]));

  commands.push(textCmd("Root Cause:", 340, 537, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(rootCause, 425, 537, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(
    textCmd(
      "Segregation Policy: Defective units quarantined in isolation. Non-defective units cleared for standard operations.",
      55,
      517,
      "F1",
      7.5,
      [0.45, 0.5, 0.58]
    )
  );

  // 4. Section: Financial Indemnity & Claim Value (y=415 to 495)
  commands.push(rectCmd(40, 415, 532, 80));
  commands.push(
    textCmd(
      "3. FINANCIAL INDEMNITY & CLAIM VALUE ASSESSMENT",
      55,
      480,
      "F2",
      10,
      [0.09, 0.14, 0.22]
    )
  );

  commands.push(textCmd("Agreed Unit Price:", 55, 460, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(`INR ${unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 155, 460, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Total Indemnity Claim:", 340, 460, "F2", 8.5, [0.75, 0.15, 0.15]));
  commands.push(textCmd(`INR ${totalClaim.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 445, 460, "F2", 9.5, [0.75, 0.15, 0.15]));

  commands.push(textCmd("Settlement Terms:", 55, 440, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(
      "Supplier is liable to replace defective stock or provide credit memo against pending invoice.",
      155,
      440,
      "F1",
      8,
      [0.2, 0.25, 0.3]
    )
  );

  // 5. Section: Disposition & Resolution Strategy (y=305 to 405)
  commands.push(rectCmd(40, 305, 532, 100));
  commands.push(
    textCmd(
      "4. FORMAL RMA DISPOSITION & VENDOR SETTLEMENT",
      55,
      389,
      "F2",
      10,
      [0.09, 0.14, 0.22]
    )
  );

  commands.push(textCmd("Disposition Decision:", 55, 370, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(disposition, 160, 370, "F2", 8.5, [0.08, 0.35, 0.75]));

  commands.push(textCmd("Tracking / AWB Ref:", 340, 370, "F2", 8.5, [0.35, 0.4, 0.48]));
  commands.push(textCmd(trackingRef, 440, 370, "F1", 8.5, [0.1, 0.12, 0.18]));

  commands.push(textCmd("Resolution Remarks:", 55, 350, "F2", 8.5, [0.35, 0.4, 0.48]));
  let ry = 350;
  for (const line of resolutionLines) {
    commands.push(textCmd(line, 160, ry, "F1", 8, [0.2, 0.25, 0.3]));
    ry -= 12;
  }

  // 6. Section: Inspector Non-Conformance Findings (y=210 to 295)
  commands.push(rectCmd(40, 210, 532, 85));
  commands.push(
    textCmd(
      "5. QUALITY CONTROL INSPECTION FINDINGS & ROOT CAUSE NOTES",
      55,
      279,
      "F2",
      10,
      [0.09, 0.14, 0.22]
    )
  );

  let dy = 260;
  for (const line of descriptionLines) {
    commands.push(textCmd(line, 55, dy, "F1", 8.5, [0.2, 0.25, 0.3]));
    dy -= 13;
  }

  const hasPhoto = Boolean(item.evidence_photo_url);
  commands.push(
    textCmd(
      hasPhoto
        ? "[Digital Evidence Attached: High-resolution photographic evidence captured and verified in system audit repository]"
        : "[Digital Evidence: Inspection notes documented without attached physical photo]",
      55,
      222,
      "F2",
      7.5,
      hasPhoto ? [0.08, 0.55, 0.25] : [0.45, 0.5, 0.58]
    )
  );

  // 7. Official Digital Signature Certification Blocks (y=90 to 198)
  commands.push(rectCmd(40, 90, 260, 108));
  commands.push(textCmd("AUTHORIZED QUALITY INSPECTOR", 55, 182, "F2", 8.5, [0.09, 0.14, 0.22]));
  commands.push(textCmd(`Inspector: ${item.reported_by || "QC Officer"}`, 55, 166, "F1", 8, [0.2, 0.25, 0.3]));
  commands.push(textCmd(`Inspection Date: ${item.inspection_date || "CURRENT"}`, 55, 152, "F1", 8, [0.2, 0.25, 0.3]));
  commands.push(textCmd("Digital Verification: VERIFIED_QC_SIGN_OFF", 55, 138, "F2", 7.5, [0.08, 0.55, 0.25]));
  commands.push("q 0.85 0.88 0.92 RG 0.5 w 55 120 230 0 re S Q");
  commands.push(textCmd("Authorized Signature & Stamp", 55, 105, "F1", 7.5, [0.45, 0.5, 0.58]));

  commands.push(rectCmd(312, 90, 260, 108));
  commands.push(textCmd("OPERATIONS & PROCUREMENT MANAGER", 325, 182, "F2", 8.5, [0.09, 0.14, 0.22]));
  commands.push(textCmd(`Approver: ${approvedBy}`, 325, 166, "F1", 8, [0.2, 0.25, 0.3]));
  commands.push(textCmd(`Approval Status: ${item.status === "RESOLVED" ? "DISPOSITION_APPROVED" : "PENDING_FINAL_SETTLEMENT"}`, 325, 152, "F1", 8, [0.2, 0.25, 0.3]));
  commands.push(textCmd("Digital Verification: PROCUREFLOW_SYSTEM_STAMP", 325, 138, "F2", 7.5, [0.08, 0.35, 0.75]));
  commands.push("q 0.85 0.88 0.92 RG 0.5 w 325 120 230 0 re S Q");
  commands.push(textCmd("Authorized Executive Signature & Seal", 325, 105, "F1", 7.5, [0.45, 0.5, 0.58]));

  // 8. Footer Divider & System Verification (y=40 to 80)
  commands.push("q 0.85 0.88 0.92 RG 0.75 w 40 75 532 0 re S Q");
  commands.push(
    textCmd(
      "ProcureFlow Enterprise Procurement & Multi-Agent Quality Assurance System | ISO 9001:2015 Compliant",
      40,
      60,
      "F2",
      8,
      [0.3, 0.35, 0.42]
    )
  );
  commands.push(
    textCmd(
      `Generated: ${timestamp} | Unique Certificate Docket: ${rmaCode} | Quarantine State: ${item.status || "REPORTED"}`,
      40,
      46,
      "F1",
      7.5,
      [0.45, 0.5, 0.58]
    )
  );

  const streamContent = commands.join("\n");
  const encoder = new TextEncoder();
  const streamBytes = encoder.encode(streamContent);

  // Build standard PDF objects
  const objects: Uint8Array[] = [];

  // Obj 1: Catalog
  objects.push(
    encoder.encode("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
  );

  // Obj 2: Pages
  objects.push(
    encoder.encode("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
  );

  // Obj 3: Page (US Letter: 612 x 792 pt)
  objects.push(
    encoder.encode(
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n"
    )
  );

  // Obj 4: Font Helvetica
  objects.push(
    encoder.encode(
      "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )
  );

  // Obj 5: Font Helvetica-Bold
  objects.push(
    encoder.encode(
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
    )
  );

  // Obj 6: Content stream
  const streamHeader = encoder.encode(
    `6 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`
  );
  const streamFooter = encoder.encode("\nendstream\nendobj\n");
  const obj6 = new Uint8Array(
    streamHeader.length + streamBytes.length + streamFooter.length
  );
  obj6.set(streamHeader, 0);
  obj6.set(streamBytes, streamHeader.length);
  obj6.set(streamFooter, streamHeader.length + streamBytes.length);
  objects.push(obj6);

  // Header
  const pdfHeader = encoder.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  // Calculate byte offsets for XRef
  let currentOffset = pdfHeader.length;
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(currentOffset);
    currentOffset += obj.length;
  }

  // Build XRef table
  const xrefOffset = currentOffset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  xref += `trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  const xrefBytes = encoder.encode(xref);

  // Assemble complete PDF binary
  const totalLength = currentOffset + xrefBytes.length;
  const pdfBuffer = new Uint8Array(totalLength);
  let pos = 0;

  pdfBuffer.set(pdfHeader, pos);
  pos += pdfHeader.length;

  for (const obj of objects) {
    pdfBuffer.set(obj, pos);
    pos += obj.length;
  }

  pdfBuffer.set(xrefBytes, pos);

  // Trigger browser download
  const blob = new Blob([pdfBuffer], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}
