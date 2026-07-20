# Lilly ML pipeline

Hair color (incl. **bald**) + Fitzpatrick17k skin-type training / labeling.

## Runtime (web app)

- Browser loads `enzostvs/hair-color` via `@huggingface/transformers` (classes: black, blond, **completely bald**, red, white).
- Brown / light-brown recovered with Lab refinement; sparse hairline samples also vote **bald**.
- Fitzpatrick I–VI from ITA using Fitzpatrick17k-aligned Chardon thresholds (`web/src/lib/fitzpatrick.ts`).

## Capture → label → train

1. Run calibration server and collect selfies (`server/`).
2. Prepare bundles:

```bash
cd ml
npm install
npm run prepare:captures -- --uploads ../server/uploads
```

3. Optional auto hair drafts:

```bash
npm run infer:hair
```

4. Label (bald is a first-class option):

```bash
npm run label
# open http://127.0.0.1:8790
```

5. Export JSONL:

```bash
npm run export:dataset
```

6. Train (Python 3.10+):

```bash
cd python
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Hair fine-tune on your labels (adds brown + bald head)
python train_hair.py --jsonl ../data/datasets/hair-YYYY-MM-DD.jsonl

# Fitzpatrick17k (download CSV + images from mattgroh/fitzpatrick17k)
python train_fitzpatrick17k.py --csv path/to/fitzpatrick17k.csv --images path/to/images

# Export ONNX for transformers.js
python export_onnx.py --checkpoint ./artifacts/hair/best --out ./artifacts/hair/onnx
```

## Label schema

See `label_schema.json`. Approved rows (`status: labeled|approved`) are exported.
