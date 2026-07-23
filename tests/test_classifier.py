import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ClassifierArtifactTests(unittest.TestCase):
    def test_dataset_contains_exactly_150_labeled_examples(self):
        with (ROOT / "data" / "conversion_examples.csv").open(encoding="utf-8", newline="") as source:
            rows = list(csv.DictReader(source))
        self.assertEqual(len(rows), 150)
        self.assertEqual(len({row["text"] for row in rows}), 150)
        self.assertEqual(
            {row["label"] for row in rows},
            {"length", "area", "weight", "temperature", "currency", "english_number", "korean_amount"},
        )

    def test_report_and_exported_winner_agree(self):
        report = json.loads((ROOT / "reports" / "model_comparison.json").read_text(encoding="utf-8"))
        model = json.loads((ROOT / "app" / "static" / "conversion-classifier.json").read_text(encoding="utf-8"))
        self.assertEqual(report["dataset_count"], 150)
        self.assertEqual(len(report["results"]), 3)
        self.assertEqual(report["winner"], model["model"])
        self.assertEqual(model["feature_mode"], "tfidf")


if __name__ == "__main__":
    unittest.main()
