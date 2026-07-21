export type Locale = 'sr' | 'en'

const sr = {
  'landing.headline': 'Pronađi sminku koja odgovara tvom tonu.',
  'landing.lead':
    'Uslikaj se ili otpremi selfie — odmah probaš preporučene dm.rs proizvode na svom licu (ten, ispod očiju, jagodice, kontura, usne, oči).',
  'landing.catalogCount': 'Katalog: {count} artikala sa dm.rs',
  'landing.takeSelfie': 'Uslikaj selfie',
  'landing.uploadSelfie': 'Otpremi iz galerije',
  'lang.sr': 'SR',
  'lang.en': 'EN',
  'lang.toggle': 'Jezik',

  'analyze.detectFace': 'Detektujem lice…',
  'analyze.measure': 'Analiziram ton…',
  'analyze.pickProducts': 'Biram proizvode…',

  'camera.unsupported': 'Kamera nije podržana u ovom pregledaču.',
  'camera.denied':
    'Nije moguće pristupiti kameri. Dozvoli pristup u pregledaču i osveži stranicu.',
  'camera.preview': 'Pregled kamere',
  'camera.guide': 'Drži lice unutar linija',
  'camera.hintReady': 'Ravnomerno svetlo na licu (bez jake senke), pa uslikaj',
  'camera.hintStarting': 'Pokrećem kameru…',
  'camera.shutter': 'Uslikaj',

  'results.photoAlt': 'Tvoj snimak',
  'results.eyebrow': 'Analiza lica',
  'results.title': 'Podaci o licu',
  'results.depth': 'Dubina tena',
  'results.fitzpatrick': 'Fitzpatrick',
  'results.undertone': 'Undertone',
  'results.ita': 'ITA',
  'results.hair': 'Kosa',
  'results.bald': 'Celavo',
  'results.retake': 'Nova slika',
  'results.productsTitle': 'Preporučeni proizvodi',
  'results.emptyZone': 'Nema proizvoda u ovoj kategoriji.',
  'results.skin': 'Koža',
  'results.hairSwatch': 'Kosa',
  'results.testProducts': 'Testiraj proizvode',

  'tryon.canvasLabel': 'Probaj šminku na licu',
  'tryon.eyebrow': 'Virtuelna proba',
  'tryon.title': 'Testiraj proizvode',
  'tryon.back': 'Nova slika',
  'tryon.intensity': 'Intenzitet slojeva',
  'tryon.layers': '{pct}%',
  'tryon.editOn': 'Pomeranje tačaka',
  'tryon.editOff': 'Samo pregled',
  'tryon.reset': 'Vrati tačke',
  'tryon.regions': 'Zone šminke',
  'tryon.pickSelf': 'Izaberi sam',
  'tryon.pickTitle': 'Izaberi proizvod',
  'tryon.pickClose': 'Zatvori',
  'tryon.pickSearch': 'Pretraži brend ili naziv…',
  'tryon.pickEmpty': 'Nema proizvoda za ovu pretragu.',
  'tryon.lipsToggle': 'Karmin',
  'tryon.lipsOn': 'Uključen',
  'tryon.lipsOff': 'Isključen',
  'tryon.allFilters': 'Svi filteri',
  'tryon.allFiltersOn': 'Uključeni',
  'tryon.allFiltersOff': 'Isključeni',
  'tryon.hintLips':
    'Karmin je uključeno / isključeno — bez klizača intenziteta. Podrazumevano je uključen; isključi ga ili promeni nijansu.',
  'tryon.hintEdit':
    'Izaberi zonu, pa pomeri tačke da poravnaš poligon. Scroll ili klizač menja intenzitet.',
  'tryon.hintView': 'Klizač ili scroll pojačava / smanjuje koliko je šminke naneseno.',
  'tryon.hintZone':
    'Izaberi zonu i nijansu, pa klizačem podesi koliko je proizvoda naneseno.',
  'tryon.unavailable':
    'Virtuelna proba nije dostupna — lice nije detektovano dovoljno jasno.',
  'tryon.region.leftEye': 'Levo oko',
  'tryon.region.rightEye': 'Desno oko',
  'tryon.region.lips': 'Usne',
  'tryon.region.leftCheek': 'Leva jagodica',
  'tryon.region.rightCheek': 'Desna jagodica',
  'tryon.region.underEyeLeft': 'Ispod levog oka',
  'tryon.region.underEyeRight': 'Ispod desnog oka',
  'tryon.region.jawLeft': 'Leva kontura',
  'tryon.region.jawRight': 'Desna kontura',
  'tryon.region.faceOval': 'Ten',

  'tryon.addToCart': 'Dodaj u korpu',
  'tryon.inCart': 'Već u korpi',
  'tryon.cartTitle': 'Korpa',
  'tryon.cartCount': 'Korpa · {count}',
  'tryon.cartEmpty': 'Korpa je prazna.',
  'tryon.cartRemove': 'Ukloni',
  'tryon.viewInShop': 'View in shop',

  'product.priceUnavailable': 'Cena nije dostupna',
  'product.shade': 'nijansa {name}',
  'product.shades': 'Dostupne nijanse',
  'product.viewDm': 'Pogledaj na dm.rs →',
  'product.openDm': '{name}, {price}, otvori na dm.rs',

  'depth.very_light': 'Veoma svetla',
  'depth.light': 'Svetla',
  'depth.medium': 'Srednja',
  'depth.tan': 'Preplanula',
  'depth.deep': 'Tamna',
  'depth.very_deep': 'Veoma tamna',

  'undertone.cool': 'Hladan (cool)',
  'undertone.warm': 'Topao (warm)',
  'undertone.neutral': 'Neutralan',
  'undertone.olive': 'Maslinast (olive)',

  'hair.blonde': 'Plava',
  'hair.light_brown': 'Svetlo braon',
  'hair.brown': 'Braon',
  'hair.black': 'Crna',
  'hair.red': 'Crvena',
  'hair.gray': 'Seda / siva',
  'hair.bald': 'Celavo',
  'hair.unknown': 'Nedefinisano',
  'hair.temp.cool': 'hladan',
  'hair.temp.warm': 'topao',
  'hair.temp.neutral': 'neutralan',

  'fitz.1': 'I — veoma svetla',
  'fitz.2': 'II — svetla',
  'fitz.3': 'III — srednja',
  'fitz.4': 'IV — maslinasta / preplanula',
  'fitz.5': 'V — tamna',
  'fitz.6': 'VI — veoma tamna',

  'region.forehead': 'Čelo',
  'region.leftCheek': 'Leva jagodica',
  'region.rightCheek': 'Desna jagodica',
  'region.jaw': 'Vilica / vrat',
  'region.underEye': 'Ispod očiju',
  'region.hair': 'Kosa',
  'region.hairBald': 'Kosa (celavo)',

  'lighting.good':
    'Svetlo je normalizovano (white balance + ekspozicija) radi stabilnijeg tona.',
  'lighting.poor':
    'Previše tamno — rezultati mogu biti nestabilni. Probaj bliže prozoru / ravnomerno svetlo.',
  'lighting.fairUneven':
    'Svetlo je korigovano, ali scena je nejednaka (senka/sunce). Za najbolji match koristi ravnomerno dnevno svetlo.',
  'lighting.fairPartial':
    'Delimična korekcija svetla (nije nađen pouzdan referent). Najbolje pri prirodnom, ravnomernom svetlu.',

  'zone.faceBase.label': 'Ten',
  'zone.faceBase.target': 'Celo lice (jagodice, čelo, vilica)',
  'zone.faceBase.tip': 'Osnova šminke — nijansa što bliža prirodnom tenu.',
  'zone.underEye.label': 'Ispod očiju',
  'zone.underEye.target': 'Zona ispod očiju',
  'zone.underEye.tip': 'Korektor malo svetliji od tena radi osvetljavanja.',
  'zone.cheeks.label': 'Jagodice',
  'zone.cheeks.target': 'Leva i desna jagodica',
  'zone.cheeks.tip': 'Rumenilo u tonu undertone-a za svež izgled.',
  'zone.contour.label': 'Kontura',
  'zone.contour.target': 'Obodi lica / vilica',
  'zone.contour.tip': 'Bronzer ili kontura — topliji, dublji ton od pudera.',
  'zone.lips.label': 'Usne',
  'zone.lips.target': 'Usne',
  'zone.lips.tip':
    'Karmin po color theory: cool → plavo-crveni / berry; warm → narandžasto-crveni / coral — ne nijansa blizu kože.',
  'zone.lips.tipBald':
    'Karmin po undertone-u: cool → cherry/berry; warm → brick/coral — ne nude blizu tena.',
  'zone.eyes.label': 'Oči',
  'zone.eyes.target': 'Kapci',
  'zone.eyes.tip': 'Senka iz palete koja odgovara tvom undertone-u.',

  'reason.foundationRegions': 'Najbliži tenu sa jagodica / vilice / čela',
  'reason.concealerUnderEye':
    'Podešen za zonu ispod očiju (malo svetliji ton)',
  'reason.concealerFace': 'Korektor usklađen sa tonom lica',
  'reason.blush': 'Za jagodice — paleta po tvom undertone-u',
  'reason.bronzer': 'Kontura / bronzer — malo dublji i topliji od tena',
  'reason.lipstick': 'Usne — color theory (crveni / berry / coral po undertone-u)',
  'reason.lipstickRed': 'Klasičan crveni karmin koji odgovara tvom undertone-u',
  'reason.lipstickFamily': 'Porodica nijanse usklađena sa cool/warm pravilima',
  'reason.lipstickAvoidNude': 'Izbegava nude blizu tona kože',
  'reason.eyeshadow': 'Oči — nijansa u skladu sa undertone-om',
  'reason.sameUndertoneSkin': 'Isti undertone kao tvoja koža',
  'reason.compatibleUndertone': 'Kompatibilan undertone',
  'reason.depthMatch': 'Poklapa se sa dubinom tena',
  'reason.closeColor': 'Blizu izmerenoj boji kože',
  'reason.palette': 'Color-theory paleta za tvoj undertone',
  'reason.hairHarmony': 'U skladu sa tonom kose',
  'reason.sameUndertone': 'Isti undertone',
  'reason.fallback': 'Prihvatljiv match za MVP katalog',

  'category.foundation': 'Puder / foundation',
  'category.concealer': 'Korektor',
  'category.blush': 'Rumenilo',
  'category.lipstick': 'Ruž',
  'category.eyeshadow': 'Senka',
  'category.bronzer': 'Bronzer',
} as const

export type MessageKey = keyof typeof sr

const en: Record<MessageKey, string> = {
  'landing.headline': 'Find makeup that matches your skin tone.',
  'landing.lead':
    'Take or upload a selfie — instantly try recommended dm.rs products on your face (base, under-eyes, cheeks, contour, lips, eyes).',
  'landing.catalogCount': 'Catalog: {count} products from dm.rs',
  'landing.takeSelfie': 'Take a selfie',
  'landing.uploadSelfie': 'Upload from gallery',
  'lang.sr': 'SR',
  'lang.en': 'EN',
  'lang.toggle': 'Language',

  'analyze.detectFace': 'Detecting your face…',
  'analyze.measure': 'Analyzing your tone…',
  'analyze.pickProducts': 'Picking products…',

  'camera.unsupported': 'Camera is not supported in this browser.',
  'camera.denied':
    'Could not access the camera. Allow permission in the browser and refresh.',
  'camera.preview': 'Camera preview',
  'camera.guide': 'keep your face contained within the lines',
  'camera.hintReady': 'Use even light on your face (no hard shadows), then shoot',
  'camera.hintStarting': 'Starting camera…',
  'camera.shutter': 'Take photo',

  'results.photoAlt': 'Your photo',
  'results.eyebrow': 'Face analysis',
  'results.title': 'Face details',
  'results.depth': 'Skin depth',
  'results.fitzpatrick': 'Fitzpatrick',
  'results.undertone': 'Undertone',
  'results.ita': 'ITA',
  'results.hair': 'Hair',
  'results.bald': 'Bald',
  'results.retake': 'New photo',
  'results.productsTitle': 'Recommended products',
  'results.emptyZone': 'No products in this category.',
  'results.skin': 'Skin',
  'results.hairSwatch': 'Hair',
  'results.testProducts': 'Try products',

  'tryon.canvasLabel': 'Makeup try-on on your face',
  'tryon.eyebrow': 'Virtual try-on',
  'tryon.title': 'Try products',
  'tryon.back': 'New photo',
  'tryon.intensity': 'Layer intensity',
  'tryon.layers': '{pct}%',
  'tryon.editOn': 'Move points',
  'tryon.editOff': 'Preview only',
  'tryon.reset': 'Reset points',
  'tryon.regions': 'Makeup zones',
  'tryon.pickSelf': 'Choose myself',
  'tryon.pickTitle': 'Choose a product',
  'tryon.pickClose': 'Close',
  'tryon.pickSearch': 'Search brand or name…',
  'tryon.pickEmpty': 'No products match this search.',
  'tryon.lipsToggle': 'Lipstick',
  'tryon.lipsOn': 'On',
  'tryon.lipsOff': 'Off',
  'tryon.allFilters': 'All filters',
  'tryon.allFiltersOn': 'On',
  'tryon.allFiltersOff': 'Off',
  'tryon.hintLips':
    'Lipstick is on/off — no intensity slider. Pick a shade or product, then turn it on.',
  'tryon.hintEdit':
    'Pick a zone, then drag points to fit the polygon. Scroll or the slider sets intensity.',
  'tryon.hintView': 'Use the slider or scroll to strengthen or soften the makeup layers.',
  'tryon.hintZone':
    'Pick a zone and shade, then use the slider to set how much product is applied.',
  'tryon.unavailable':
    'Virtual try-on unavailable — the face was not detected clearly enough.',
  'tryon.region.leftEye': 'Left eye',
  'tryon.region.rightEye': 'Right eye',
  'tryon.region.lips': 'Lips',
  'tryon.region.leftCheek': 'Left cheek',
  'tryon.region.rightCheek': 'Right cheek',
  'tryon.region.underEyeLeft': 'Under left eye',
  'tryon.region.underEyeRight': 'Under right eye',
  'tryon.region.jawLeft': 'Left contour',
  'tryon.region.jawRight': 'Right contour',
  'tryon.region.faceOval': 'Base',

  'tryon.addToCart': 'Add to cart',
  'tryon.inCart': 'Already in cart',
  'tryon.cartTitle': 'Cart',
  'tryon.cartCount': 'Cart · {count}',
  'tryon.cartEmpty': 'Your cart is empty.',
  'tryon.cartRemove': 'Remove',
  'tryon.viewInShop': 'View in shop',

  'product.priceUnavailable': 'Price unavailable',
  'product.shade': 'shade {name}',
  'product.shades': 'Available shades',
  'product.viewDm': 'View on dm.rs →',
  'product.openDm': '{name}, {price}, open on dm.rs',

  'depth.very_light': 'Very light',
  'depth.light': 'Light',
  'depth.medium': 'Medium',
  'depth.tan': 'Tan',
  'depth.deep': 'Deep',
  'depth.very_deep': 'Very deep',

  'undertone.cool': 'Cool',
  'undertone.warm': 'Warm',
  'undertone.neutral': 'Neutral',
  'undertone.olive': 'Olive',

  'hair.blonde': 'Blonde',
  'hair.light_brown': 'Light brown',
  'hair.brown': 'Brown',
  'hair.black': 'Black',
  'hair.red': 'Red',
  'hair.gray': 'Gray',
  'hair.bald': 'Bald',
  'hair.unknown': 'Unknown',
  'hair.temp.cool': 'cool',
  'hair.temp.warm': 'warm',
  'hair.temp.neutral': 'neutral',

  'fitz.1': 'I — very light',
  'fitz.2': 'II — light',
  'fitz.3': 'III — medium',
  'fitz.4': 'IV — olive / tan',
  'fitz.5': 'V — deep',
  'fitz.6': 'VI — very deep',

  'region.forehead': 'Forehead',
  'region.leftCheek': 'Left cheek',
  'region.rightCheek': 'Right cheek',
  'region.jaw': 'Jaw / neck',
  'region.underEye': 'Under-eye',
  'region.hair': 'Hair',
  'region.hairBald': 'Hair (bald)',

  'lighting.good':
    'Light was normalized (white balance + exposure) for a more stable tone.',
  'lighting.poor':
    'Too dark — results may be unstable. Try nearer a window / even light.',
  'lighting.fairUneven':
    'Light was corrected, but the scene is uneven (shade/sun). Best match with even daylight.',
  'lighting.fairPartial':
    'Partial light correction (no reliable reference). Best in natural, even light.',

  'zone.faceBase.label': 'Base',
  'zone.faceBase.target': 'Full face (cheeks, forehead, jaw)',
  'zone.faceBase.tip': 'Makeup base — a shade as close as possible to your skin.',
  'zone.underEye.label': 'Under-eyes',
  'zone.underEye.target': 'Under-eye area',
  'zone.underEye.tip': 'Concealer a touch lighter than skin for brightening.',
  'zone.cheeks.label': 'Cheeks',
  'zone.cheeks.target': 'Left and right cheek',
  'zone.cheeks.tip': 'Blush in your undertone family for a fresh look.',
  'zone.contour.label': 'Contour',
  'zone.contour.target': 'Face edges / jaw',
  'zone.contour.tip': 'Bronzer or contour — warmer and deeper than foundation.',
  'zone.lips.label': 'Lips',
  'zone.lips.target': 'Lips',
  'zone.lips.tip':
    'Lipstick by color theory: cool → blue-red / berry; warm → orange-red / coral — not a shade near your skin.',
  'zone.lips.tipBald':
    'Lipstick by undertone: cool → cherry/berry; warm → brick/coral — not a nude close to skin.',
  'zone.eyes.label': 'Eyes',
  'zone.eyes.target': 'Lids',
  'zone.eyes.tip': 'Eyeshadow from a palette that suits your undertone.',

  'reason.foundationRegions': 'Closest to tone from cheeks / jaw / forehead',
  'reason.concealerUnderEye':
    'Tuned for the under-eye area (slightly lighter)',
  'reason.concealerFace': 'Concealer matched to face tone',
  'reason.blush': 'For cheeks — palette for your undertone',
  'reason.bronzer': 'Contour / bronzer — a bit deeper and warmer than skin',
  'reason.lipstick': 'Lips — color theory (red / berry / coral by undertone)',
  'reason.lipstickRed': 'A classic red that flatters your undertone',
  'reason.lipstickFamily': 'Shade family aligned with cool/warm rules',
  'reason.lipstickAvoidNude': 'Avoids a nude close to skin tone',
  'reason.eyeshadow': 'Eyes — shade aligned with undertone',
  'reason.sameUndertoneSkin': 'Same undertone as your skin',
  'reason.compatibleUndertone': 'Compatible undertone',
  'reason.depthMatch': 'Matches your skin depth',
  'reason.closeColor': 'Close to measured skin color',
  'reason.palette': 'Color-theory palette for your undertone',
  'reason.hairHarmony': 'In harmony with hair tone',
  'reason.sameUndertone': 'Same undertone',
  'reason.fallback': 'Acceptable match for the MVP catalog',

  'category.foundation': 'Foundation / powder',
  'category.concealer': 'Concealer',
  'category.blush': 'Blush',
  'category.lipstick': 'Lipstick',
  'category.eyeshadow': 'Eyeshadow',
  'category.bronzer': 'Bronzer',
}

export const messages = { sr, en } as const

export type TranslateFn = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text: string = messages[locale][key] ?? messages.sr[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v))
    }
  }
  return text
}

export function isMessageKey(value: string): value is MessageKey {
  return value in messages.sr
}
