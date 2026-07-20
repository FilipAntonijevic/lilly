#!/usr/bin/env python3
"""
Fine-tune hair classifier (incl. bald) on exported Lilly JSONL + optional base model.

JSONL rows: { "image": ".../main.jpg", "hair_family": "brown"|"bald"|..., "bald": true|false }

Usage:
  python train_hair.py --jsonl ../data/datasets/hair-2026-07-20.jsonl --out ./artifacts/hair
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import ViTForImageClassification, ViTImageProcessor

LABELS = ["blonde", "light_brown", "brown", "black", "red", "gray", "bald", "unknown"]
LABEL2ID = {k: i for i, k in enumerate(LABELS)}
ID2LABEL = {i: k for k, i in LABEL2ID.items()}


class HairDataset(Dataset):
    def __init__(self, rows: list[dict], processor: ViTImageProcessor):
        self.rows = rows
        self.processor = processor

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows[idx]
        image = Image.open(row["image"]).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")
        family = row["hair_family"]
        if row.get("bald") is True:
            family = "bald"
        label = LABEL2ID.get(family, LABEL2ID["unknown"])
        return {"pixel_values": inputs["pixel_values"].squeeze(0), "labels": label}


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jsonl", required=True)
    parser.add_argument("--base", default="enzostvs/hair-color")
    parser.add_argument("--out", default="./artifacts/hair")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    rows = load_jsonl(Path(args.jsonl))
    if len(rows) < 8:
        raise SystemExit(f"Need more labeled rows (have {len(rows)}). Label captures first.")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    processor = ViTImageProcessor.from_pretrained(args.base)
    # New head for expanded label set (includes brown + bald)
    model = ViTForImageClassification.from_pretrained(
        args.base,
        num_labels=len(LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    split = max(1, int(len(rows) * 0.85))
    train_ds = HairDataset(rows[:split], processor)
    val_ds = HairDataset(rows[split:] or rows[-1:], processor)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    best = 0.0
    for epoch in range(args.epochs):
        model.train()
        for batch in train_loader:
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].to(device)
            loss = model(pixel_values=pixel_values, labels=labels).loss
            opt.zero_grad()
            loss.backward()
            opt.step()

        model.eval()
        correct = n = 0
        with torch.no_grad():
            for batch in val_loader:
                pixel_values = batch["pixel_values"].to(device)
                labels = batch["labels"].to(device)
                pred = model(pixel_values=pixel_values).logits.argmax(dim=-1)
                correct += int((pred == labels).sum().item())
                n += int(labels.numel())
        acc = correct / max(n, 1)
        print(f"epoch {epoch+1}: val_acc={acc:.3f}")
        if acc >= best:
            best = acc
            model.save_pretrained(out / "best")
            processor.save_pretrained(out / "best")

    print(f"Saved best (acc={best:.3f}) → {out / 'best'}")


if __name__ == "__main__":
    main()
