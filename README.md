# Lilly

Web MVP za shade matching: uslikaj lice, analiziraj ton kože i dobij preporuke sminke.

**Live (GitHub Pages):** https://filipantonijevic.github.io/lilly/

## Šta radi

1. Traži dozvolu za kameru
2. Snima selfie
3. Računa ton kože u CIE L\*a\*b\* (ITA dubina + undertone)
4. Procenuje ton kose
5. Rangira proizvode (foundation, korektor, rumenilo, ruž, senka, bronzer)

## Katalog

- Pravi katalog: `web/src/data/products.json` (trenutno `[]`)
- Dok je prazan, UI koristi demo katalog iz `web/src/data/demoCatalog.ts` da matching bude vidljiv na prezentaciji

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
- ITA → dubina tena; undertone iz a\*/b\* (cool / warm / neutral / olive)
- Matching: undertone + dubina + ΔE76 za bazu; color-theory palete + ton kose za blush/lipstick/eyeshadow
- Ako face mesh ne nađe lice, koristi se rezervni heuristički režim
