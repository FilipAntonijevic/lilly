import type { FitzpatrickType, HairFamily, HairTemperature, SkinDepth, Undertone } from '../types'
import type { Locale } from '../i18n/messages'
import { translate } from '../i18n/messages'

export function depthLabel(depth: SkinDepth, locale: Locale): string {
  return translate(locale, `depth.${depth}`)
}

export function undertoneLabel(u: Undertone, locale: Locale): string {
  return translate(locale, `undertone.${u}`)
}

export function hairLabel(family: HairFamily, locale: Locale): string {
  return translate(locale, `hair.${family}`)
}

export function hairTemperatureLabel(
  temperature: HairTemperature,
  locale: Locale,
): string {
  return translate(locale, `hair.temp.${temperature}`)
}

export function fitzpatrickLabel(type: FitzpatrickType, locale: Locale): string {
  return translate(locale, `fitz.${type}`)
}
