import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FunctionGemmaDataTests(unittest.TestCase):
    def test_dataset_is_large_and_covers_boundaries(self):
        manifest = json.loads((ROOT / "data" / "functiongemma" / "manifest.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(manifest["total"], 2000)
        self.assertGreater(manifest["tools"]["request_clarification"], 150)
        self.assertGreaterEqual(manifest["tools"]["unsupported_request"], 100)
        self.assertGreater(manifest["splits"]["validation"], 100)
        self.assertGreater(manifest["splits"]["test"], 100)

    def test_every_row_has_official_function_call_shape(self):
        for split in ("train", "validation", "test"):
            path = ROOT / "data" / "functiongemma" / f"{split}.jsonl"
            with path.open(encoding="utf-8") as source:
                for line in source:
                    row = json.loads(line)
                    self.assertEqual(row["messages"][0]["role"], "developer")
                    self.assertEqual(row["messages"][2]["role"], "assistant")
                    self.assertIn("tool_calls", row["messages"][2])


if __name__ == "__main__":
    unittest.main()
