import json
import py_compile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class TrainingAssetTests(unittest.TestCase):
    def test_colab_notebook_targets_public_repository_without_embedded_token(self):
        notebook_path = ROOT / "FunctionGemma_Colab.ipynb"
        notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
        text = json.dumps(notebook, ensure_ascii=False)
        self.assertIn("janyty/browsertools-functiongemma-270m", text)
        self.assertIn("userdata.get('HF_TOKEN')", text)
        self.assertIn("private=False", text)
        self.assertNotIn("hf_", text)

    def test_training_script_compiles(self):
        py_compile.compile(str(ROOT / "scripts" / "train_functiongemma.py"), doraise=True)


if __name__ == "__main__":
    unittest.main()
