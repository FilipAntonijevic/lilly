# Lilly

Web MVP za shade matching: uslikaj lice, analiziraj ton kože i dobij preporuke sminke.

**Live (GitHub Pages):** https://filipantonijevic.github.io/lilly/

## Šta radi

1. Traži dozvolu za kameru
2. Snima selfie
3. Računa ton kože u CIE L\*a\*b\* (ITA dubina + undertone)
4. Procenuje ton kose
5. Rangira proizvode (foundation, korektor, rumenilo, ruž, senka, bronzer)

## Katalog (dm.rs)

- Pravi katalog: `web/src/data/products.json` (scraped sa dm.rs — nijansa + hex)
- Siovi podaci: `web/src/data/dm-raw.json`
- Osvežavanje:

```bash
cd web
npm run scrape:dm
```

Scraper koristi javni DM product-search API (`product-search.services.dmtech.com/rs/search`), uzima `tileColors[].hex` i naziv nijanse iz naslova. Dok je katalog prazan, UI pada na demo katalog.

Primer stavke u `products.json`:

```json
{
  "id": "store-f-01",
  "name": "Shade 02",
  "brand": "Tvoja prodavnica",
  "category": "foundation",
  "shadeHex": "#E8C4A8",
  "undertone": "warm",
  "depthMin": "light",
  "depthMax": "medium",
  "paletteTags": ["peach", "warm-nude"],
  "url": "https://primer.rs/proizvod"
}
```

## Lokalni razvoj

```bash
cd web
npm install
npm run dev
```

Preview produkcijskog builda:

```bash
cd web
npm run build
npm run preview
```

Kamera radi na `localhost` i na HTTPS (GitHub Pages).

## Deploy

Push na `main` pokreće GitHub Actions workflow koji hostuje `web/dist` na Pages.

Ručno:

```bash
cd web
npm run deploy
```

## Algoritam (MVP)

- **MediaPipe Face Landmarker** (478 tačaka) deli lice na regione bitne za sminku: jagodice, čelo, vilica, ispod očiju, hairline
- **Lighting normalization**: white balance (sclera/pozadina), ekspozicija, izravnanje senki na licu — manje razlike senka vs sunce
- Foundation / undertone se računa iz jagodica + vilice (stabilnije od čela)
- **Fitzpatrick I–VI** iz ITA (Fitzpatrick17k / Chardon pragovi) → dubina tena
- **Kosa (ML)**: ViT `enzostvs/hair-color` u browseru — black / blond / **completely bald** / red / white; braon se dopunjava Lab heuristikom; celavost i preko retkih hairline piksela
- Matching: undertone + dubina + ΔE76 za bazu; color-theory palete + ton kose (preskače se ako je celavo)

## ML / labeling pipeline

Vidi `ml/README.md`:

1. Lokalni upload server: `cd server && node index.mjs`
2. `cd ml && npm run prepare:captures`
3. `npm run label` → http://127.0.0.1:8790 (obavezno labeluj **bald**)
4. `npm run export:dataset` + Python `train_hair.py` / `train_fitzpatrick17k.py`
- Ako face mesh ne nađe lice, koristi se rezervni heuristički režim
