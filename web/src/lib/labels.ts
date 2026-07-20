import type { HairFamily, SkinDepth, Undertone } from '../types'

export function depthLabel(depth: SkinDepth): string {
  const map: Record<SkinDepth, string> = {
    very_light: 'Veoma svetla',
    light: 'Svetla',
    medium: 'Srednja',
    tan: 'Preplanula',
    deep: 'Tamna',
    very_deep: 'Veoma tamna',
  }
  return map[depth]
}

export function undertoneLabel(u: Undertone): string {
  const map: Record<Undertone, string> = {
    cool: 'Hladan (cool)',
    warm: 'Topao (warm)',
    neutral: 'Neutralan',
    olive: 'Maslinast (olive)',
  }
  return map[u]
}

export function hairLabel(family: HairFamily): string {
  const map: Record<HairFamily, string> = {
    blonde: 'Plava',
    light_brown: 'Svetlo braon',
    brown: 'Braon',
    black: 'Crna',
    red: 'Crvena',
    gray: 'Seda / siva',
    unknown: 'Nedefinisano',
  }
  return map[family]
}
