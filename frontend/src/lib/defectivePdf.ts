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

  const refId = `DEF-${String(item.id).padStart(4, "0")}`;
  const filename = `${refId}.pdf`;

  const orderedQty = item.ordered_quantity ?? 0;
  const defectiveQty = item.defective_quantity ?? 0;
  const defectPercent =
    orderedQty > 0 ? Math.round((defectiveQty / orderedQty) * 100) : 0;
  const usableStock = Math.max(0, orderedQty - defectiveQty);
  const timestamp =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const descriptionLines = item.description?.trim()
    ? wrapText(item.description.trim(), 82)
    : ["None provided."];

  const resolutionLines = item.resolution_notes?.trim()
    ? wrapText(item.resolution_notes.trim(), 82)
    : ["No resolution notes logged yet."];

  const quarantineStatus =
    item.status === "RESOLVED"
      ? "RESOLVED - CLAIM SETTLED"
      : item.status === "REJECTED"
      ? "REJECTED - CLAIM DISMISSED"
      : "ACTIVE - SEGREGATED IN QUARANTINE HOLD";

  // Build PDF graphics stream commands
  const commands: string[] = [];

  // 1. Header Banner (Dark ProcureFlow Slate #0f172a)
  commands.push("q 0.06 0.09 0.16 rg 0 725 612 67 re f Q");
  commands.push(
    textCmd(
      "PROCUREFLOW - DEFECTIVE ITEM INSPECTION REPORT",
      40,
      762,
      "F2",
      15,
      [1, 1, 1]
    )
  );
  commands.push(
    textCmd(
      `Official Quality Control Inspection & Stock Quarantine Certificate | Document #${refId}`,
      40,
      742,
      "F1",
      9,
      [0.8, 0.85, 0.92]
    )
  );

  // 2. Section: Overview Metadata Box
  commands.push(rectCmd(40, 625, 532, 85));
  commands.push(
    textCmd(
      "REPORT OVERVIEW & IDENTIFIERS",
      55,
      690,
      "F2",
      11,
      [0.09, 0.14, 0.22]
    )
  );

  // Row 1
  commands.push(textCmd("Report Reference:", 55, 670, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(textCmd(`#${refId}`, 150, 670, "F2", 9, [0.1, 0.12, 0.18]));

  commands.push(textCmd("PO Number:", 240, 670, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.po_number || "N/A", 305, 670, "F2", 9, [0.1, 0.12, 0.18])
  );

  commands.push(textCmd("Inspection Date:", 415, 670, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.inspection_date || "N/A", 495, 670, "F1", 9, [0.1, 0.12, 0.18])
  );

  // Row 2
  commands.push(textCmd("Lifecycle Status:", 55, 648, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.status || "REPORTED", 150, 648, "F2", 9, [0.1, 0.35, 0.75])
  );

  commands.push(textCmd("Vendor Name:", 240, 648, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.vendor_name || "N/A", 305, 648, "F1", 9, [0.1, 0.12, 0.18])
  );

  commands.push(textCmd("Reported By:", 415, 648, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.reported_by || "Receiving Team", 495, 648, "F1", 9, [0.1, 0.12, 0.18])
  );

  // 3. Section: Item & Stock Quarantine Segregation Box
  commands.push(rectCmd(40, 500, 532, 112));
  commands.push(
    textCmd(
      "ITEM & STOCK QUARANTINE BREAKDOWN",
      55,
      593,
      "F2",
      11,
      [0.09, 0.14, 0.22]
    )
  );

  // Row 1
  commands.push(textCmd("Item Name:", 55, 573, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.item_name || "N/A", 150, 573, "F2", 9, [0.1, 0.12, 0.18])
  );

  commands.push(textCmd("Defect Category:", 330, 573, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(item.defect_type || "Unspecified", 420, 573, "F2", 9, [0.1, 0.12, 0.18])
  );

  // Row 2
  commands.push(textCmd("Total Ordered Qty:", 55, 553, "F2", 9, [0.35, 0.4, 0.48]));
  commands.push(
    textCmd(`${orderedQty.toLocaleString()} units`, 150, 553, "F1", 9, [0.1, 0.12, 0.18])
  );

  commands.push(textCmd("Defective Quantity:", 330, 553, "F2", 9, [0.78, 0.15, 0.15]));
  commands.push(
    textCmd(
      `${defectiveQty.toLocaleString()} units (${defectPercent}% of order)`,
      420,
      553,
      "F2",
      9,
      [0.78, 0.15, 0.15]
    )
  );

  // Row 3
  commands.push(textCmd("Quarantine Status:", 55, 533, "F2", 9, [0.75, 0.4, 0.0]));
  commands.push(
    textCmd(quarantineStatus, 150, 533, "F2", 8.5, [0.75, 0.4, 0.0])
  );

  commands.push(textCmd("Usable Stock Remaining:", 330, 533, "F2", 9, [0.1, 0.55, 0.2]));
  commands.push(
    textCmd(`${usableStock.toLocaleString()} units`, 460, 533, "F2", 9, [0.1, 0.55, 0.2])
  );

  // Notice
  commands.push(
    textCmd(
      `Stock Policy: Original Purchase Order ${item.po_number || ""} remains intact to preserve financial audit trail.`,
      55,
      514,
      "F1",
      8,
      [0.45, 0.5, 0.58]
    )
  );

  // 6. Section: Photographic Evidence Archive
  const photoBoxY = 430;
  commands.push(rectCmd(40, photoBoxY, 532, 38));
  commands.push(
    textCmd("PHOTOGRAPHIC EVIDENCE ARCHIVE", 55, photoBoxY + 23, "F2", 9.5, [0.09, 0.14, 0.22])
  );

  const hasPhoto = Boolean(item.evidence_photo_url);
  commands.push(
    textCmd(
      hasPhoto
        ? `Status: Evidence photo captured and stored in digital audit record (#${refId}).`
        : "Status: No photo evidence attached during receiving inspection.",
      55,
      photoBoxY + 10,
      "F1",
      8.5,
      hasPhoto ? [0.1, 0.55, 0.2] : [0.45, 0.5, 0.58]
    )
  );

  // 7. Footer Divider & System Verification
  commands.push("q 0.85 0.88 0.92 RG 0.75 w 40 70 532 0 re S Q");
  commands.push(
    textCmd(
      "ProcureFlow Multi-Agent Procurement System - Quality Assurance & Quarantine Module",
      40,
      55,
      "F1",
      8,
      [0.45, 0.5, 0.58]
    )
  );
  commands.push(
    textCmd(
      `Generated: ${timestamp} | Document Ref: ${refId} | Status: ${item.status || "REPORTED"}`,
      40,
      43,
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
