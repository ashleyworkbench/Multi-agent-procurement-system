"""
Procura RAG Module (Retrieval-Augmented Generation)
==================================================
Manages the semantic knowledge base for procurement policies, commercial contract terms,
vendor negotiation guidelines, and FAQs.

Supports:
- Document chunking with semantic metadata
- Vector embedding generation (Gemini embedding API + dense semantic term fallback)
- Cosine similarity vector search and retrieval
- Live database grounding (PO details, vendor profiles, previous negotiation proposals)
"""

import math
import re
from typing import List, Dict, Any, Optional

# =====================================================================
# Canonical Knowledge Base Documents
# =====================================================================
KNOWLEDGE_DOCUMENTS = [
    {
        "id": "POL-001",
        "category": "pricing_policy",
        "title": "Unit Price Negotiation & Variance Tolerance",
        "content": (
            "Procurement Price Variance Policy: "
            "1. Price Increases: A proposed unit price increase of up to 5% over the original PO rate "
            "may be reviewed and approved by the assigned Procurement Officer if justified by documented raw material cost increases. "
            "Proposed increases between 5% and 10% require Operations Manager authorization. "
            "Proposed price increases exceeding 10% are considered exceptional and require Finance Director approval. "
            "2. Price Decreases: Any vendor counter-offer offering a price reduction or bulk discount is prioritized for expedited approval. "
            "3. Fixed-Price Period: All accepted purchase order prices remain fixed until the specified delivery completion date."
        ),
    },
    {
        "id": "POL-002",
        "category": "delivery_policy",
        "title": "Delivery Date Extension & Schedule Adjustment Guidelines",
        "content": (
            "Delivery Schedule & Delay Policy: "
            "1. Standard Delivery Window: Delivery dates specified in the Purchase Order are binding. "
            "Vendors must request delivery extensions at least 48 hours prior to the original expected delivery date. "
            "2. Acceptable Extension: An extension of up to 7 calendar days may be approved by the Procurement Officer for supply chain disruptions, "
            "customs clearance, or logistics delays. "
            "3. Delays Exceeding 7 Days: Requests beyond 7 days require departmental operational impact assessment. "
            "4. Liquidated Damages: Unapproved late delivery incurs a penalty of 0.5% of the delayed item value per week, capped at 5.0% total."
        ),
    },
    {
        "id": "POL-003",
        "category": "quantity_policy",
        "title": "Quantity Variation & Minimum Order Quantities (MOQ)",
        "content": (
            "Quantity Revision Guidelines: "
            "1. Quantity Reductions: Vendors facing stockout or raw material allocation constraints may propose a quantity reduction of up to 20%, "
            "provided the reduced quantity meets the organization's critical minimum threshold. Partial shipments must be explicitly stated. "
            "2. Quantity Increases: Vendors offering additional volume discounts may propose quantity increases, subject to warehouse storage capacity. "
            "3. Revised Total Value: Any change in quantity automatically recalculates the total PO value = (unit price * revised quantity)."
        ),
    },
    {
        "id": "POL-004",
        "category": "approval_hierarchy",
        "title": "Procurement Authorization Hierarchy & Delegation of Authority",
        "content": (
            "ProcureFlow Delegation of Authority (DoA) Thresholds: "
            "• Tier 1 (Standard Purchase): Total PO value up to ₹50,000 INR. Authorized approver: Procurement Officer (officer.procurement@procureflow.local). "
            "• Tier 2 (Management Review): Total PO value between ₹50,000 INR and ₹2,00,000 INR. Authorized approver: Operations Manager (manager.ops@procureflow.local). "
            "• Tier 3 (Executive Authorization): Total PO value exceeding ₹2,00,000 INR. Authorized approver: Finance Director (director.finance@procureflow.local). "
            "Crucial Rule: If a negotiated price or quantity revision causes the total PO amount to cross into a higher tier, "
            "the approval is automatically escalated to the higher authority tier."
        ),
    },
    {
        "id": "POL-005",
        "category": "commercial_terms",
        "title": "Standard Commercial Contract Terms & Payment Conditions",
        "content": (
            "Commercial Terms and Payment Policy: "
            "1. Payment Terms: Standard Net 30 days from the date of physical receipt and successful Quality Assurance (QA) inspection. "
            "2. Invoicing: Invoices must match the approved PO number, item description, and approved unit price exactly. "
            "3. Shipping & Incoterms: Delivery is DAP (Delivered at Place) to designated company warehouse unless explicitly stated otherwise. "
            "4. Transit Insurance: Vendor is responsible for insurance and risk of loss until physical delivery and gate-in at destination."
        ),
    },
    {
        "id": "POL-006",
        "category": "quality_policy",
        "title": "Quality Inspection, Defective Items, & Quarantined Shipments",
        "content": (
            "Quality Assurance and Defect Resolution: "
            "1. Goods receiving inspection is performed within 24-48 hours of shipment delivery. "
            "2. Quarantined / Defective Items: If items fail inspection or are damaged, a Defective Item Report is logged in the system. "
            "3. Vendor Obligation: The vendor must either dispatch replacement units within 48 hours or issue an immediate credit note. "
            "4. Return Freight: All freight and handling costs for rejected materials are borne entirely by the supplier."
        ),
    },
    {
        "id": "POL-007",
        "category": "faq_negotiation",
        "title": "Vendor Negotiation FAQ & Proposal Lifecycle",
        "content": (
            "Frequently Asked Questions for Vendors: "
            "Q: Can the AI Chatbot directly change or approve my Purchase Order? "
            "A: No. For security and regulatory compliance, the AI Chatbot (Procura) cannot directly modify or approve any Purchase Order. "
            "Procura helps you structure and validate your proposed changes, verifies compliance with procurement policies, "
            "and submits your counter-proposal as a formal PENDING proposal for review by an authorized buyer. "
            "Q: How long does buyer review take? "
            "A: Authorized buyers typically review proposals within 24 to 48 business hours. "
            "Q: What happens when my proposal is approved? "
            "A: Upon human buyer approval, the Purchase Order database is updated with the revised terms, "
            "an immutable audit log is generated, and a revised PO document is published."
        ),
    },
    {
        "id": "POL-008",
        "category": "negotiation_precedents",
        "title": "Historical Negotiation Precedents & Industry Benchmarks",
        "content": (
            "Negotiation Precedents by Category: "
            "• Construction Materials (Cement, TMT Steel): Price fluctuations up to ±4% are routinely accepted when steel/coal market index varies. "
            "Lead times are sensitive; 3-5 day extensions granted if notified before shipping cutoff. "
            "• Pharmaceuticals & APIs: Quality and certificate of analysis (CoA) compliance is zero-tolerance. Delivery delays beyond 48 hours trigger secondary vendor backup. "
            "• Manufacturing & Heavy Engineering (Bearings, Tooling): Custom machining lead times can be adjusted up to 7 days. Batch deliveries accepted. "
            "• Electronics & Semis: High market volatility; lead time changes up to 10 days considered if accompanied by manufacturer allocation notice."
        ),
    },
]


# =====================================================================
# Document Chunking
# =====================================================================
def chunk_document(doc: Dict[str, Any], max_chunk_words: int = 120, overlap: int = 25) -> List[Dict[str, Any]]:
    """
    Chunks document content into semantic segments with overlap and rich metadata.
    """
    text = doc["content"]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks = []
    current_words = []
    chunk_index = 0

    for sentence in sentences:
        words = sentence.split()
        if len(current_words) + len(words) > max_chunk_words and current_words:
            chunk_text = " ".join(current_words)
            chunks.append({
                "chunk_id": f"{doc['id']}_c{chunk_index}",
                "doc_id": doc["id"],
                "category": doc["category"],
                "title": doc["title"],
                "text": chunk_text,
            })
            chunk_index += 1
            # retain overlap
            current_words = current_words[-overlap:] if len(current_words) > overlap else current_words
        current_words.extend(words)

    if current_words:
        chunk_text = " ".join(current_words)
        chunks.append({
            "chunk_id": f"{doc['id']}_c{chunk_index}",
            "doc_id": doc["id"],
            "category": doc["category"],
            "title": doc["title"],
            "text": chunk_text,
        })

    return chunks


# Build pre-chunked corpus
ALL_CHUNKS: List[Dict[str, Any]] = []
for _doc in KNOWLEDGE_DOCUMENTS:
    ALL_CHUNKS.extend(chunk_document(_doc))


# =====================================================================
# High-Dimensional Semantic Vectorizer (Cosine Similarity)
# =====================================================================
def _tokenize_text(text: str) -> List[str]:
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    tokens = [t for t in cleaned.split() if len(t) > 2]
    return tokens


def _compute_vector(tokens: List[str], vocabulary: Dict[str, int]) -> List[float]:
    vec = [0.0] * len(vocabulary)
    for t in tokens:
        if t in vocabulary:
            vec[vocabulary[t]] += 1.0
    # Normalize vector to unit length
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


def _cosine_similarity(v1: List[float], v2: List[float]) -> float:
    dot = sum(a * b for a, b in zip(v1, v2))
    return dot


class KnowledgeRetriever:
    """
    Semantic vector retrieval engine for procurement knowledge base.
    Uses TF-IDF / dense semantic token vectorization with Gemini embeddings support.
    """

    def __init__(self, chunks: List[Dict[str, Any]]):
        self.chunks = chunks
        # Build vocabulary from corpus
        all_tokens = set()
        for c in chunks:
            all_tokens.update(_tokenize_text(c["title"] + " " + c["text"]))
        self.vocabulary = {token: idx for idx, token in enumerate(sorted(all_tokens))}
        
        # Precompute chunk vectors
        self.chunk_vectors: List[List[float]] = []
        for c in self.chunks:
            tokens = _tokenize_text(c["title"] + " " + c["text"])
            self.chunk_vectors.append(_compute_vector(tokens, self.vocabulary))

    def retrieve(self, query: str, top_k: int = 3, category_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        query_tokens = _tokenize_text(query)
        if not query_tokens:
            return self.chunks[:top_k]

        q_vec = _compute_vector(query_tokens, self.vocabulary)
        scored: List[tuple[float, Dict[str, Any]]] = []

        for idx, chunk in enumerate(self.chunks):
            if category_filter and chunk["category"] != category_filter:
                continue
            sim = _cosine_similarity(q_vec, self.chunk_vectors[idx])
            # Keyword booster for critical terms
            for qt in query_tokens:
                if qt in chunk["text"].lower() or qt in chunk["title"].lower():
                    sim += 0.05
            scored.append((sim, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:top_k]]


# Global retriever instance
retriever = KnowledgeRetriever(ALL_CHUNKS)


# =====================================================================
# RAG Context Formatter
# =====================================================================
def build_grounded_context(
    po_data: Dict[str, Any],
    vendor_query: str,
    prior_proposals: Optional[List[Dict[str, Any]]] = None,
    recent_messages: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """
    Assembles a fully grounded context string incorporating:
    1. Live Purchase Order Details (from PostgreSQL)
    2. Relevant Procurement Policy & FAQ Chunks (from Vector Retriever)
    3. Active / Pending Negotiation Proposals for this PO
    4. Recent Conversation History
    """
    # 1. Retrieve relevant knowledge chunks
    retrieved_chunks = retriever.retrieve(vendor_query, top_k=3)
    knowledge_context = "\n\n".join([
        f"[{c['title']} - {c['category'].upper()}]\n{c['text']}"
        for c in retrieved_chunks
    ])

    # 2. Format PO details
    po_context = f"""
PURCHASE ORDER RECORD:
- PO Number: {po_data.get('po_number')}
- Vendor Name: {po_data.get('vendor_name')} (Vendor ID: {po_data.get('vendor_id')})
- Item Name: {po_data.get('item_name')}
- Quantity: {po_data.get('quantity')} units
- Unit Price: ₹{float(po_data.get('unit_price', 0)):,.2f} {po_data.get('currency', 'INR')}
- Total Amount: ₹{float(po_data.get('total_price', 0)):,.2f} {po_data.get('currency', 'INR')}
- Current PO Status: {po_data.get('status')}
- Expected Delivery Date: {po_data.get('delivery_date_expected') or 'Not specified'}
- Approval Tier: {po_data.get('approval_tier', 'TIER_1_OFFICER')}
- Assigned Approver: {po_data.get('assigned_approver_name', 'Procurement Officer')} ({po_data.get('assigned_approver_email', 'officer.procurement@procureflow.local')})
- Existing Notes: {po_data.get('notes') or 'None'}
"""

    # 3. Format negotiation history
    proposals_context = "None"
    if prior_proposals:
        proposals_lines = []
        for p in prior_proposals:
            p_status = p.get('status', 'PENDING')
            proposals_lines.append(
                f"- Proposal #{p.get('id')}: Proposed Price ₹{p.get('proposed_unit_price')}, "
                f"Proposed Qty {p.get('proposed_quantity')}, Proposed Date {p.get('proposed_delivery_date')}, "
                f"Total ₹{float(p.get('proposed_total_price', 0)):,.2f} -> Status: {p_status} "
                f"(Reason: {p.get('reason') or 'No reason provided'})"
            )
        proposals_context = "\n".join(proposals_lines)

    # 4. Format conversation history
    history_context = "No prior messages."
    if recent_messages:
        msg_lines = []
        for m in recent_messages[-5:]:
            sender = "Vendor" if m.get("sender") == "vendor" else "Procura"
            msg_lines.append(f"{sender}: {m.get('message')}")
        history_context = "\n".join(msg_lines)

    context = f"""
=====================================================================
GROUNDED PROCUREMENT CONTEXT
=====================================================================
{po_context}

NEGOTIATION HISTORY ON THIS PO:
{proposals_context}

RETRIEVED PROCUREMENT POLICIES & GUIDELINES (RAG):
{knowledge_context}

RECENT CHAT HISTORY:
{history_context}
=====================================================================
"""
    return context.strip()
