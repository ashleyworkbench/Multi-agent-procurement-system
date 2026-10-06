import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import _canonicalize_records
from suitability import evaluate_po_suitability


class TestPOSuitability(unittest.TestCase):
    def setUp(self):
        self.vendors = [
            {
                "vendor_id": "V-MFG-001",
                "purchase_vendor_id": 1,
                "company_id": "manufacturing",
                "vendor_name": "SKF India Ltd",
                "active_status": True,
                "supported_products": [{
                    "item_name": "Bearings (SKF 6205)",
                    "category": "Mechanical Components",
                    "capacity": 4,
                    "unit_price": 10,
                    "lead_time_days": 2,
                    "min_order_qty": 1,
                    "availability": "In Stock",
                }],
                "certifications": [],
            },
            {
                "vendor_id": "V-MFG-002",
                "purchase_vendor_id": 2,
                "company_id": "manufacturing",
                "vendor_name": "Bosch India",
                "active_status": True,
                "supported_products": [{
                    "item_name": "Bearings (SKF 6205)",
                    "category": "Mechanical Components",
                    "capacity": 6,
                    "unit_price": 12,
                    "lead_time_days": 4,
                    "min_order_qty": 1,
                    "availability": "In Stock",
                }],
                "certifications": [],
            },
        ]
        metrics = {
            "on_time_rate": 0.95,
            "delay_days": 1.0,
            "lead_time": 4.0,
            "defect_rate": 0.01,
            "return_rate": 0.005,
            "price_variance": 0.02,
            "compliance_score": 95.0,
            "violations": 0.0,
            "iso_certified": True,
            "spend_tier": "Medium",
            "ground_truth_risk": "Low",
        }
        self.history = [
            {
                **metrics,
                "vendor_id": vendor_id,
                "order_id": f"PO-{vendor_id}-{index}",
            }
            for vendor_id in ("V-MFG-001", "V-MFG-002")
            for index in range(3)
        ]

    def test_splits_shortage_across_capable_vendors(self):
        result = evaluate_po_suitability(
            {
                "company_id": "manufacturing",
                "item": "Bearings (SKF 6205)",
                "required_quantity": 13,
                "available_inventory": 3,
                "shortage_quantity": 10,
                "budget": 120,
                "max_delivery_days": 5,
            },
            self.vendors,
            self.history,
        )

        self.assertEqual(result["status"], "suitable")
        self.assertEqual(result["unfilled_quantity"], 0)
        self.assertEqual(sum(row["quantity"] for row in result["selected_vendors"]), 10)
        self.assertEqual(
            {row["vendor_id"] for row in result["selected_vendors"]},
            {"V-MFG-001", "V-MFG-002"},
        )
        self.assertTrue(all(row["risk_score"] is not None for row in result["selected_vendors"]))
        self.assertTrue(all(row["purchase_vendor_id"] in {1, 2} for row in result["selected_vendors"]))

    def test_insufficient_history_is_not_assigned_a_fake_risk(self):
        vendor = {
            **self.vendors[0],
            "supported_products": [{
                **self.vendors[0]["supported_products"][0],
                "capacity": 10,
            }],
        }
        result = evaluate_po_suitability(
            {
                "company_id": "manufacturing",
                "item": "Bearings (SKF 6205)",
                "required_quantity": 5,
                "available_inventory": 0,
                "shortage_quantity": 5,
            },
            [vendor],
            [],
        )

        selected = result["selected_vendor"]
        self.assertEqual(result["status"], "suitable")
        self.assertEqual(selected["risk_status"], "insufficient_data")
        self.assertIsNone(selected["risk_level"])
        self.assertIsNone(selected["risk_score"])

    def test_low_risk_vendor_without_requested_product_is_excluded(self):
        vendor = {
            **self.vendors[0],
            "supported_products": [{
                **self.vendors[0]["supported_products"][0],
                "item_name": "Electric Motors (1HP)",
            }],
        }
        result = evaluate_po_suitability(
            {
                "company_id": "manufacturing",
                "item": "Bearings (SKF 6205)",
                "required_quantity": 5,
                "available_inventory": 0,
                "shortage_quantity": 5,
            },
            [vendor],
            self.history,
        )

        self.assertEqual(result["status"], "no_suitable_vendor")
        self.assertIsNone(result["selected_vendor"])
        self.assertIn("Does not list", result["excluded_vendors"][0]["reason"])

    def test_matching_category_does_not_substitute_a_different_sku(self):
        vendor = {
            **self.vendors[0],
            "supported_products": [{
                **self.vendors[0]["supported_products"][0],
                "item_name": "Bearings (6202 Deep Groove)",
            }],
        }
        result = evaluate_po_suitability(
            {
                "company_id": "manufacturing",
                "item": "Bearings (SKF 6205)",
                "category": "Mechanical Components",
                "required_quantity": 5,
                "available_inventory": 0,
                "shortage_quantity": 5,
            },
            [vendor],
            self.history,
        )

        self.assertEqual(result["status"], "no_suitable_vendor")
        self.assertIsNone(result["selected_vendor"])

    def test_sync_validation_matches_by_vendor_id_and_quarantines_bad_rows(self):
        master = [{
            "vendor_id": "V-MFG-001",
            "company_id": "manufacturing",
            "purchase_vendor_id": 1,
            "vendor_name": "SKF India Ltd",
        }]
        base = {
            "vendor_id": "V-MFG-001",
            "vendor_name": "s k f india ltd",
            "company_id": "manufacturing",
            "order_date": "2026-01-01",
            "order_id": "PO-1",
            "on_time_rate": "84.1",
            "delay_days": "2",
            "lead_time": "5",
            "defect_rate": "3.78",
            "return_rate": "0.86",
            "price_variance": "2.05",
            "compliance_score": "91",
            "violations": "0",
            "rating": "4.5",
        }
        records = [
            base,
            {**base, "vendor_id": "V-MFG-999", "order_id": "PO-UNKNOWN"},
            {**base, "on_time_rate": "101", "order_id": "PO-RANGE"},
            {**base, "order_date": "not-a-date", "order_id": "PO-DATE"},
        ]

        accepted, logs = _canonicalize_records("manufacturing", records, {}, master)

        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]["vendor_name"], "SKF India Ltd")
        self.assertAlmostEqual(accepted[0]["on_time_rate"], 0.841)
        self.assertAlmostEqual(accepted[0]["defect_rate"], 0.0378)
        self.assertAlmostEqual(accepted[0]["price_variance"], 0.0205)
        self.assertEqual(
            {entry["order_id"] for entry in logs},
            {"PO-1", "PO-UNKNOWN", "PO-RANGE", "PO-DATE"},
        )
        self.assertTrue(any(entry["issue_type"] == "unknown_vendor" for entry in logs))
        self.assertTrue(any(entry["field_name"] == "order_date" for entry in logs))
        self.assertTrue(any(entry["field_name"] == "vendor_name" for entry in logs))


if __name__ == "__main__":
    unittest.main()
