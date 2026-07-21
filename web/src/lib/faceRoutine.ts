import type {
  FaceRegionSample,
  FaceZoneMatch,
  LabColor,
  MakeupProduct,
  ProductCategory,
  SkinProfile,
} from '../types'
import type { MessageKey } from '../i18n/messages'
import { deltaE76, hexToLab, computeIta } from './color'
import {
  itaToFitzpatrick,
  resolveDepthFromItaAndFitzpatrick,
} from './fitzpatrick'
import { matchProducts } from './matchProducts'
import { lipstickTheoryBonus } from './lipstickTheory'

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
 * Makeup routine: one best DM product per face zone.
 * Labels / tips / reasons are i18n keys (translate in UI).
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
      'reason.foundationRegions',
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
      const lift = pLab.L - ref.L
      const liftBonus = lift >= 1 && lift <= 10 ? 8 : lift > 10 ? -4 : 0
      const close = Math.max(0, 12 - deltaE76(pLab, ref))
      return base + liftBonus + close * 0.4
    },
  )
  if (concealer) {
    concealer.reasons = [
      underEye ? 'reason.concealerUnderEye' : 'reason.concealerFace',
      ...concealer.reasons.slice(0, 1),
    ]
  }

  const blush = bestInCategory(catalog, blushSkin, 'blush', (product, base) => {
    const pLab = hexToLab(product.shadeHex)
    const ref = blushSkin.lab
    const chroma = Math.hypot(pLab.a, pLab.b)
    const chromaBonus = chroma > 18 ? 6 : 0
    return base + chromaBonus + Math.max(0, 10 - deltaE76(pLab, ref)) * 0.25
  })
  if (blush) {
    blush.reasons = ['reason.blush', ...blush.reasons.slice(0, 1)]
  }

  const bronzer = bestInCategory(catalog, foundationSkin, 'bronzer', (product, base) => {
    const pLab = hexToLab(product.shadeHex)
    const warmer = pLab.b > foundationSkin.lab.b ? 5 : 0
    const deeper = pLab.L < foundationSkin.lab.L - 2 ? 5 : 0
    return base + warmer + deeper
  })
  if (bronzer) {
    bronzer.reasons = ['reason.bronzer', ...bronzer.reasons.slice(0, 1)]
  }

  const lipstick = bestInCategory(catalog, skin, 'lipstick', (product, base) => {
    const { bonus } = lipstickTheoryBonus(product, skin)
    return base + bonus
  })
  if (lipstick) {
    const { reasonKeys } = lipstickTheoryBonus(lipstick.product, skin)
    lipstick.reasons = [
      reasonKeys[0] ?? 'reason.lipstick',
      'reason.lipstick',
      ...lipstick.reasons.slice(0, 1),
    ]
  }

  const eyeshadow = bestInCategory(catalog, skin, 'eyeshadow')
  if (eyeshadow) {
    eyeshadow.reasons = ['reason.eyeshadow', ...eyeshadow.reasons.slice(0, 1)]
  }

  type ZoneDef = {
    zoneId: FaceZoneMatch['zoneId']
    labelKey: MessageKey
    targetKey: MessageKey
    tipKey: MessageKey
    category: ProductCategory
    match: FaceZoneMatch['match']
  }

  const zones: ZoneDef[] = [
    {
      zoneId: 'faceBase',
      labelKey: 'zone.faceBase.label',
      targetKey: 'zone.faceBase.target',
      tipKey: 'zone.faceBase.tip',
      category: 'foundation',
      match: foundation,
    },
    {
      zoneId: 'underEye',
      labelKey: 'zone.underEye.label',
      targetKey: 'zone.underEye.target',
      tipKey: 'zone.underEye.tip',
      category: 'concealer',
      match: concealer,
    },
    {
      zoneId: 'cheeks',
      labelKey: 'zone.cheeks.label',
      targetKey: 'zone.cheeks.target',
      tipKey: 'zone.cheeks.tip',
      category: 'blush',
      match: blush,
    },
    {
      zoneId: 'contour',
      labelKey: 'zone.contour.label',
      targetKey: 'zone.contour.target',
      tipKey: 'zone.contour.tip',
      category: 'bronzer',
      match: bronzer,
    },
    {
      zoneId: 'lips',
      labelKey: 'zone.lips.label',
      targetKey: 'zone.lips.target',
      tipKey: skin.hair.bald ? 'zone.lips.tipBald' : 'zone.lips.tip',
      category: 'lipstick',
      match: lipstick,
    },
    {
      zoneId: 'eyes',
      labelKey: 'zone.eyes.label',
      targetKey: 'zone.eyes.target',
      tipKey: 'zone.eyes.tip',
      category: 'eyeshadow',
      match: eyeshadow,
    },
  ]

  // Store keys in the string fields; UI translates via isMessageKey / t()
  return zones.map((z) => ({
    zoneId: z.zoneId,
    zoneLabel: z.labelKey,
    faceTarget: z.targetKey,
    category: z.category,
    match: z.match,
    tip: z.tipKey,
  }))
}
