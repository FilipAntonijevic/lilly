import type { HairFamily, HairTemperature, LabColor } from '../types'
import { rgbToHex } from './color'

/** HuggingPics ViT fine-tune — includes explicit "completely bald". */
export const HAIR_ML_MODEL = 'enzostvs/hair-color'

export type HairMlLabel =
  | 'black hair'
  | 'blond hair'
  | 'completely bald'
  | 'red hair'
  | 'white hair'

export interface HairMlPrediction {
  family: HairFamily
  temperature: HairTemperature
  hex: string
  bald: boolean
  confidence: number
  source: 'ml' | 'heuristic' | 'ml+heuristic'
  rawLabel?: string
  scores?: Partial<Record<HairMlLabel, number>>
}

type ClassificationOutput = Array<{ label: string; score: number }>

type ImageClassifier = (
  input: string,
  options?: { topk?: number },
) => Promise<ClassificationOutput>

let classifierPromise: Promise<ImageClassifier> | null = null

async function getClassifier(): Promise<ImageClassifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      // Models download from HF Hub; cache in browser Cache API.
      env.allowLocalModels = false
      env.useBrowserCache = true
      const pipe = await pipeline('image-classification', HAIR_ML_MODEL, {
        dtype: 'fp32',
      })
      return pipe as unknown as ImageClassifier
    })()
  }
  return classifierPromise
}

/** Warm-start the model in the background (first shutter is faster). */
export function preloadHairMl(): void {
  void getClassifier().catch(() => {
    classifierPromise = null
  })
}

function normalizeLabel(label: string): HairMlLabel | null {
  const key = label.trim().toLowerCase()
  if (key.includes('bald')) return 'completely bald'
  if (key.includes('black')) return 'black hair'
  if (key.includes('blond')) return 'blond hair'
  if (key.includes('red')) return 'red hair'
  if (key.includes('white') || key.includes('gray') || key.includes('grey')) {
    return 'white hair'
  }
  return null
}

/**
 * Refine coarse ML classes with Lab heuristics.
 * The public model has no brown class — recover light_brown / brown from L*.
 */
export function refineHairFamily(
  mlLabel: HairMlLabel | null,
  mlScore: number,
  lab: LabColor,
  hairPixelCount: number,
  expectedHairPixels: number,
): { family: HairFamily; bald: boolean; source: HairMlPrediction['source'] } {
  const sparseHair =
    expectedHairPixels > 0 && hairPixelCount < expectedHairPixels * 0.12

  if (mlLabel === 'completely bald' && mlScore >= 0.35) {
    return { family: 'bald', bald: true, source: 'ml' }
  }
  if (sparseHair && (mlLabel === 'completely bald' || mlScore < 0.45)) {
    return {
      family: 'bald',
      bald: true,
      source: mlLabel === 'completely bald' ? 'ml+heuristic' : 'heuristic',
    }
  }

  if (!mlLabel || mlScore < 0.28) {
    return { family: 'unknown', bald: false, source: 'heuristic' }
  }

  const chroma = Math.hypot(lab.a, lab.b)

  if (mlLabel === 'red hair') {
    return { family: 'red', bald: false, source: 'ml' }
  }
  if (mlLabel === 'white hair') {
    return { family: 'gray', bald: false, source: 'ml' }
  }
  if (mlLabel === 'blond hair') {
    // Mid L* blond predictions are often light brown in real selfies
    if (lab.L < 52 && chroma < 30) {
      return { family: 'light_brown', bald: false, source: 'ml+heuristic' }
    }
    return { family: 'blonde', bald: false, source: 'ml' }
  }
  if (mlLabel === 'black hair') {
    if (lab.L >= 42) {
      return { family: 'light_brown', bald: false, source: 'ml+heuristic' }
    }
    if (lab.L >= 22) {
      return { family: 'brown', bald: false, source: 'ml+heuristic' }
    }
    return { family: 'black', bald: false, source: 'ml' }
  }

  return { family: 'unknown', bald: false, source: 'heuristic' }
}

function temperatureFromLab(lab: LabColor): HairTemperature {
  if (lab.b > lab.a + 3) return 'warm'
  if (lab.a >= lab.b + 1) return 'cool'
  return 'neutral'
}

/**
 * Run hair-color ViT on a face/hair crop (data URL or canvas export).
 */
export async function classifyHairMl(
  imageDataUrl: string,
  lab: LabColor,
  rgb: [number, number, number],
  hairPixelCount: number,
  expectedHairPixels: number,
): Promise<HairMlPrediction | null> {
  try {
    const classifier = await getClassifier()
    const raw = await classifier(imageDataUrl, { topk: 5 })
    const scores: Partial<Record<HairMlLabel, number>> = {}
    let topLabel: HairMlLabel | null = null
    let topScore = 0

    for (const row of raw) {
      const label = normalizeLabel(row.label)
      if (!label) continue
      scores[label] = Math.max(scores[label] ?? 0, row.score)
      if (row.score > topScore) {
        topScore = row.score
        topLabel = label
      }
    }

    const refined = refineHairFamily(
      topLabel,
      topScore,
      lab,
      hairPixelCount,
      expectedHairPixels,
    )

    // If ML path collapsed to unknown, signal caller to use Lab heuristic
    if (refined.family === 'unknown' && !refined.bald) {
      return null
    }

    return {
      family: refined.family,
      temperature: refined.bald ? 'neutral' : temperatureFromLab(lab),
      hex: refined.bald ? '#c4a484' : rgbToHex(rgb[0], rgb[1], rgb[2]),
      bald: refined.bald,
      confidence: topScore,
      source: refined.source,
      rawLabel: topLabel ?? undefined,
      scores,
    }
  } catch {
    classifierPromise = null
    return null
  }
}
