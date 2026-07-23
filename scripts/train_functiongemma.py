"""GPU 환경에서 FunctionGemma 270M을 단숨 함수 호출 데이터로 미세조정한다."""

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="google/functiongemma-270m-it")
    parser.add_argument("--output", default="dansum-functiongemma-270m")
    parser.add_argument("--hub-repo", default="")
    parser.add_argument("--epochs", type=int, default=5)
    args = parser.parse_args()
    if not torch.cuda.is_available():
        raise SystemExit("CUDA GPU가 필요합니다. Google Colab의 L4/A100 런타임을 사용하세요.")

    files = {
        split: str(ROOT / "data" / "functiongemma" / f"{split}.jsonl")
        for split in ("train", "validation", "test")
    }
    dataset = load_dataset("json", data_files=files)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    major, _minor = torch.cuda.get_device_capability()
    use_bf16 = major >= 8
    # T4(Compute Capability 7.5)는 FP16 파라미터를 직접 최적화할 때
    # GradScaler가 "Attempting to unscale FP16 gradients"를 발생시킨다.
    # 파라미터는 FP32로 유지하고 autocast만 FP16으로 실행한다.
    model_dtype = torch.bfloat16 if use_bf16 else torch.float32
    model = AutoModelForCausalLM.from_pretrained(
        args.model, dtype=model_dtype, device_map="auto", attn_implementation="eager"
    )
    config = SFTConfig(
        output_dir=args.output,
        max_length=512,
        packing=False,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=4,
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=5e-5,
        lr_scheduler_type="constant",
        fp16=not use_bf16,
        bf16=use_bf16,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        push_to_hub=bool(args.hub_repo),
        hub_model_id=args.hub_repo or None,
        report_to="none",
    )
    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)

    model = trainer.model
    model.eval()
    correct = 0
    per_tool = defaultdict(Counter)
    failures = []
    for row in dataset["test"]:
        messages = row["messages"][:2]
        inputs = tokenizer.apply_chat_template(
            messages,
            tools=row["tools"],
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
        ).to(model.device)
        with torch.inference_mode():
            generated = model.generate(
                **inputs,
                do_sample=False,
                max_new_tokens=32,
                pad_token_id=tokenizer.eos_token_id,
            )
        output = tokenizer.decode(generated[0][inputs["input_ids"].shape[1]:], skip_special_tokens=False)
        expected = row["expected_tool"]
        matched = output.startswith(f"<start_function_call>call:{expected}")
        correct += int(matched)
        per_tool[expected]["total"] += 1
        per_tool[expected]["correct"] += int(matched)
        if not matched and len(failures) < 50:
            failures.append({"input": messages[1]["content"], "expected": expected, "output": output})
        if (correct + sum(v["total"] for v in per_tool.values()) - correct) % 25 == 0:
            print(f"test progress: {sum(v['total'] for v in per_tool.values())}/{len(dataset['test'])}", flush=True)

    evaluation = {
        "test_count": len(dataset["test"]),
        "correct": correct,
        "tool_call_accuracy": round(correct / len(dataset["test"]), 6),
        "per_tool": {
            tool: {
                "correct": values["correct"],
                "total": values["total"],
                "accuracy": round(values["correct"] / values["total"], 6),
            }
            for tool, values in sorted(per_tool.items())
        },
        "sample_failures": failures,
    }
    evaluation_path = Path(args.output) / "functiongemma_evaluation.json"
    evaluation_path.write_text(json.dumps(evaluation, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(evaluation, ensure_ascii=False, indent=2))
    if args.hub_repo:
        trainer.push_to_hub()
        from huggingface_hub import HfApi
        HfApi().upload_file(
            path_or_fileobj=str(evaluation_path),
            path_in_repo="functiongemma_evaluation.json",
            repo_id=args.hub_repo,
            repo_type="model",
        )


if __name__ == "__main__":
    main()
