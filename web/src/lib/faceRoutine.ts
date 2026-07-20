import type {
  FaceRegionSample,
  FaceZoneMatch,
  LabColor,
  MakeupProduct,
  ProductCategory,
  SkinProfile,
} from '../types'
import { deltaE76, hexToLab, computeIta } from './color'
import {
  itaToFitzpatrick,
  resolveDepthFromItaAndFitzpatrick,
} from './fitzpatrick'
import { matchProducts } from './matchProducts'

function regionLab(regions: FaceRegionSample[], id: FaceRegionSample['id']): LabColor | null {
  return regions.find((r) => r.id === id)?.lab ?? null
}

function averageLab(labs: LabColor[]): LabColor | null {
  if (!labs.length) return null
  return {
    L: labs.reduce((s, l) => s + l.L, 0) / labs.length,
    a: labs.reduce((s, l) => s + l.a, 0) / labs.length,
    b: labs.reduce((s, l) => s + l.b, 0) / labs.length,
  }
}

function withReferenceLab(skin: SkinProfile, lab: LabColor | null): SkinProfile {
  if (!lab) return skin
  const ita = computeIta(lab)
  const fitzpatrick = itaToFitzpatrick(ita)
  return {
    ...skin,
    lab,
    ita,
    fitzpatrick,
    depth: resolveDepthFromItaAndFitzpatrick(ita, fitzpatrick),
  }
}

/**
 * Pick best catalog product for a category against a (possibly region-tuned) skin profile.
 */
function bestInCategory(
  catalog: MakeupProduct[],
  skin: SkinProfile,
  category: ProductCategory,
  tweak?: (product: MakeupProduct, baseScore: number) => number,
): FaceZoneMatch['match'] {
  const { byCategory } = matchProducts(catalog, skin, {
    perCategory: 12,
    overallLimit: 12,
  })
  const list = byCategory[category] ?? []
  if (!list.length) return null

  if (!tweak) return { ...list[0], reasons: list[0].reasons }

  let best = list[0]
  let bestScore = tweak(best.product, best.score)
  for (const item of list.slice(1)) {
    const s = tweak(item.product, item.score)
    if (s > bestScore) {
      best = item
      bestScore = s
    }
  }
  return { ...best, score: bestScore }
}

/**
 * Makeup routine: one best DM product per face zone, following basic makeup mapping.
 *
 * - Ten (foundation) → whole-face / jaw+cheeks
 * - Korektor → under-eye (slightly lighter preferred)
 * - Rumenilo → cheeks
 * - Bronzer → contour (warmer / a touch deeper)
 * - Ruž → lips (undertone + hair)
 * - Senka → eyes (undertone + hair)
 */
export function buildFaceRoutine(
  catalog: MakeupProduct[],
  skin: SkinProfile,
): FaceZoneMatch[] {
  const left = regionLab(skin.regions, 'leftCheek')
  const right = regionLab(skin.regions, 'rightCheek')
  const jaw = regionLab(skin.regions, 'jaw')
  const forehead = regionLab(skin.regions, 'forehead')
  const underEye = regionLab(skin.regions, 'underEye')
  const cheekLab = averageLab([left, right].filter(Boolean) as LabColor[])
  const faceLab =
    averageLab([cheekLab, jaw, forehead].filter(Boolean) as LabColor[]) || skin.lab

  const foundationSkin = withReferenceLab(skin, faceLab)
  const concealerSkin = withReferenceLab(skin, underEye || faceLab)
  const blushSkin = withReferenceLab(skin, cheekLab || faceLab)

  const foundation = bestInCategory(catalog, foundationSkin, 'foundation')
  if (foundation) {
    foundation.reasons = [
      'Najbliži tenu sa jagodica / vilice / čela',
      ...foundation.reasons.slice(0, 1),
    ]
  }

  const concealer = bestInCategory(
    catalog,
    concealerSkin,
    'concealer',
    (product, base) => {
      const pLab = hexToLab(product.shadeHex)
      const ref = concealerSkin.lab
      // Prefer a touch lighter for brightening under-eye
      const lift = pLab.L - ref.L
      const liftBonus = lift >= 1 && lift <= 10 ? 8 : lift > 10 ? -4 : 0
      const close = Math.max(0, 12 - deltaE76(pLab, ref))
      return base + liftBonus + close * 0.4
    },
  )
  if (concealer) {
    concealer.reasons = [
      underEye
        ? 'Podešen za zonu ispod očiju (malo svetliji ton)'
        : 'Korektor usklađen sa tonom lica',
      ...concealer.reasons.slice(0, 1),
    ]
  }

  const blush = bestInCategory(catalog, blushSkin, 'blush', (product, base) => {
    const pLab = hexToLab(product.shadeHex)
    const ref = blushSkin.lab
    // Blush should be chroma-rich relative to skin, same undertone family
    const chroma = Math.hypot(pLab.a, pLab.b)
    const chromaBonus = chroma > 18 ? 6 : 0
    return base + chromaBonus + Math.max(0, 10 - deltaE76(pLab, ref)) * 0.25
  })
  if (blush) {
    blush.reasons = [
      'Za jagodice — paleta po tvom undertone-u',
      ...blush.reasons.slice(0, 1),
    ]
  }

  const bronzer = bestInCategory(catalog, foundationSkin, 'bronzer', (product, base) => {
    const pLab = hexToLab(product.shadeHex)
    const warmer = pLab.b > foundationSkin.lab.b ? 5 : 0
    const deeper = pLab.L < foundationSkin.lab.L - 2 ? 5 : 0
    return base + warmer + deeper
  })
  if (bronzer) {
    bronzer.reasons = [
      'Kontura / bronzer — malo dublji i topliji od tena',
      ...bronzer.reasons.slice(0, 1),
    ]
  }

  const lipstick = bestInCategory(catalog, skin, 'lipstick')
  if (lipstick) {
    lipstick.reasons = [
      'Usne — color theory za undertone i kosu',
      ...lipstick.reasons.slice(0, 1),
    ]
  }

  const eyeshadow = bestInCategory(catalog, skin, 'eyeshadow')
  if (eyeshadow) {
    eyeshadow.reasons = [
      'Oči — nijansa u skladu sa undertone-om',
      ...eyeshadow.reasons.slice(0, 1),
    ]
  }

  return [
    {
      zoneId: 'faceBase',
      zoneLabel: 'Ten',
      faceTarget: 'Celo lice (jagodice, čelo, vilica)',
      category: 'foundation',
      match: foundation,
      tip: 'Osnova šminke — nijansa što bliža prirodnom tenu.',
    },
    {
      zoneId: 'underEye',
      zoneLabel: 'Ispod očiju',
      faceTarget: 'Zona ispod očiju',
      category: 'concealer',
      match: concealer,
      tip: 'Korektor malo svetliji od tena radi osvetljavanja.',
    },
    {
      zoneId: 'cheeks',
      zoneLabel: 'Jagodice',
      faceTarget: 'Leva i desna jagodica',
      category: 'blush',
      match: blush,
      tip: 'Rumenilo u tonu undertone-a za svež izgled.',
    },
    {
      zoneId: 'contour',
      zoneLabel: 'Kontura',
      faceTarget: 'Obodi lica / vilica',
      category: 'bronzer',
      match: bronzer,
      tip: 'Bronzer ili kontura — topliji, dublji ton od pudera.',
    },
    {
      zoneId: 'lips',
      zoneLabel: 'Usne',
      faceTarget: 'Usne',
      category: 'lipstick',
      match: lipstick,
      tip: skin.hair.bald
        ? 'Ruž usklađen sa undertone-om kože.'
        : 'Ruž usklađen sa undertone-om kože i tonom kose.',
    },
    {
      zoneId: 'eyes',
      zoneLabel: 'Oči',
      faceTarget: 'Kapci',
      category: 'eyeshadow',
      match: eyeshadow,
      tip: 'Senka iz palete koja odgovara tvom undertone-u.',
    },
  ]
}
