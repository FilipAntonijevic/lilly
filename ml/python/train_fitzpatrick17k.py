#!/usr/bin/env python3
"""
Fine-tune a ViT image classifier on Fitzpatrick17k skin types (I–VI).

Expects:
  --csv path/to/fitzpatrick17k.csv   (columns include md5hash / url + fitzpatrick)
  --images path/to/images            (files named {md5hash}.jpg when available)

Usage:
  python train_fitzpatrick17k.py --csv fitzpatrick17k.csv --images ./images --out ./artifacts/fitzpatrick

Then export ONNX:
  python export_onnx.py --checkpoint ./artifacts/fitzpatrick/best --out ./artifacts/fitzpatrick/onnx
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from transformers import ViTForImageClassification, ViTImageProcessor


class FitzpatrickDataset(Dataset):
    def __init__(self, rows: pd.DataFrame, image_dir: Path, processor: ViTImageProcessor):
        self.rows = rows.reset_index(drop=True)
        self.image_dir = image_dir
        self.processor = processor
        self.fallback = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
            ]
        )

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, idx: int):
        row = self.rows.iloc[idx]
        key = str(row.get("md5hash") or row.get("md5") or row.name)
        path = self.image_dir / f"{key}.jpg"
        if not path.exists():
            path = self.image_dir / f"{key}.png"
        image = Image.open(path).convert("RGB")
        inputs = self.processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].squeeze(0)
        # Fitzpatrick17k uses 1–6; unknown often -1
        label = int(row["fitzpatrick"]) - 1
        return {"pixel_values": pixel_values, "labels": label}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--images", required=True)
    parser.add_argument("--out", default="./artifacts/fitzpatrick")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.csv)
    if "fitzpatrick" not in df.columns:
        raise SystemExit("CSV must contain a 'fitzpatrick' column (1–6)")
    df = df[df["fitzpatrick"].isin([1, 2, 3, 4, 5, 6])].copy()

    processor = ViTImageProcessor.from_pretrained("google/vit-base-patch16-224-in21k")
    model = ViTForImageClassification.from_pretrained(
        "google/vit-base-patch16-224-in21k",
        num_labels=6,
        id2label={i: f"type_{i+1}" for i in range(6)},
        label2id={f"type_{i+1}": i for i in range(6)},
    )

    # Simple random split
    df = df.sample(frac=1.0, random_state=17).reset_index(drop=True)
    split = int(len(df) * 0.9)
    train_ds = FitzpatrickDataset(df.iloc[:split], Path(args.images), processor)
    val_ds = FitzpatrickDataset(df.iloc[split:], Path(args.images), processor)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    best_acc = 0.0
    history = []
    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            pixel_values = batch["pixel_values"].to(device)
            labels = batch["labels"].to(device)
            out_t = model(pixel_values=pixel_values, labels=labels)
            loss = out_t.loss
            opt.zero_grad()
            loss.backward()
            opt.step()
            total_loss += float(loss.item())

        model.eval()
        correct = 0
        n = 0
        with torch.no_grad():
            for batch in val_loader:
                pixel_values = batch["pixel_values"].to(device)
                labels = batch["labels"].to(device)
                logits = model(pixel_values=pixel_values).logits
                pred = logits.argmax(dim=-1)
                correct += int((pred == labels).sum().item())
                n += int(labels.numel())
        acc = correct / max(n, 1)
        history.append({"epoch": epoch + 1, "loss": total_loss / max(len(train_loader), 1), "val_acc": acc})
        print(f"epoch {epoch+1}: loss={history[-1]['loss']:.4f} val_acc={acc:.3f}")
        if acc >= best_acc:
            best_acc = acc
            model.save_pretrained(out / "best")
            processor.save_pretrained(out / "best")

    (out / "history.json").write_text(json.dumps(history, indent=2), encoding="utf-8")
    print(f"Best val_acc={best_acc:.3f} → {out / 'best'}")


if __name__ == "__main__":
    main()
