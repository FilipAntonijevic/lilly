import type { FitzpatrickType, SkinDepth } from '../types'
import { itaToDepth } from './color'

/**
 * ITA → Fitzpatrick Skin Type mapping used in Fitzpatrick17k analyses
 * (Chardon et al. thresholds; see Groh et al. 2021).
 *
 * Type I:  ITA > 55
 * Type II: 41–55
 * Type III: 28–41
 * Type IV: 10–28
 * Type V:  −30–10
 * Type VI: ITA ≤ −30
 */
export function itaToFitzpatrick(ita: number): FitzpatrickType {
  if (ita > 55) return 1
  if (ita > 41) return 2
  if (ita > 28) return 3
  if (ita > 10) return 4
  if (ita > -30) return 5
  return 6
}

/** Align product depth buckets with Fitzpatrick when ML/ITA agree. */
export function fitzpatrickToDepth(type: FitzpatrickType): SkinDepth {
  switch (type) {
    case 1:
      return 'very_light'
    case 2:
      return 'light'
    case 3:
      return 'medium'
    case 4:
      return 'tan'
    case 5:
      return 'deep'
    case 6:
      return 'very_deep'
  }
}

/**
 * Prefer Fitzpatrick-derived depth when it is adjacent to ITA depth
 * (avoids wild jumps from borderline ITA).
 */
export function resolveDepthFromItaAndFitzpatrick(
  ita: number,
  fitzpatrick: FitzpatrickType,
): SkinDepth {
  const itaDepth = itaToDepth(ita)
  const fitzDepth = fitzpatrickToDepth(fitzpatrick)
  return fitzDepth === itaDepth ? fitzDepth : itaDepth
}

export const FITZPATRICK_LABELS: Record<FitzpatrickType, string> = {
  1: 'I — veoma svetla',
  2: 'II — svetla',
  3: 'III — srednja',
  4: 'IV — maslinasta / preplanula',
  5: 'V — tamna',
  6: 'VI — veoma tamna',
}
