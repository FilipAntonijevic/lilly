#!/usr/bin/env python3
"""Export a Hugging Face ViT checkpoint to ONNX for transformers.js."""

from __future__ import annotations

import argparse
from pathlib import Path

from optimum.onnxruntime import ORTModelForImageClassification
from transformers import ViTImageProcessor


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    model = ORTModelForImageClassification.from_pretrained(
        args.checkpoint, export=True
    )
    processor = ViTImageProcessor.from_pretrained(args.checkpoint)
    model.save_pretrained(out)
    processor.save_pretrained(out)
    print(f"ONNX model written to {out}")
    print("Point the web app HAIR_ML_MODEL / local models path at this folder after upload.")


if __name__ == "__main__":
    main()
