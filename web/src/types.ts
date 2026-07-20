export type Undertone = 'cool' | 'warm' | 'neutral' | 'olive'
export type SkinDepth =
  | 'very_light'
  | 'light'
  | 'medium'
  | 'tan'
  | 'deep'
  | 'very_deep'

export type HairFamily =
  | 'blonde'
  | 'light_brown'
  | 'brown'
  | 'black'
  | 'red'
  | 'gray'
  | 'bald'
  | 'unknown'
export type HairTemperature = 'cool' | 'warm' | 'neutral'

/** Fitzpatrick Skin Type I–VI (Fitzpatrick17k scale). */
export type FitzpatrickType = 1 | 2 | 3 | 4 | 5 | 6

export type ProductCategory =
  | 'foundation'
  | 'concealer'
  | 'blush'
  | 'lipstick'
  | 'eyeshadow'
  | 'bronzer'

export interface LabColor {
  L: number
  a: number
  b: number
}

export type FaceRegionId =
  | 'forehead'
  | 'leftCheek'
  | 'rightCheek'
  | 'jaw'
  | 'underEye'
  | 'hair'

export interface FaceRegionSample {
  id: FaceRegionId
  label: string
  hex: string
  lab: LabColor
  pixelCount: number
}

export interface LightingInfo {
  corrected: boolean
  quality: 'good' | 'fair' | 'poor'
  note: string
  illuminantSource: 'scene' | 'fallback' | 'none'
  exposureGain: number
}

export interface SkinProfile {
  lab: LabColor
  hex: string
  ita: number
  depth: SkinDepth
  /** Fitzpatrick Skin Type from ITA (Fitzpatrick17k-aligned thresholds) */
  fitzpatrick: FitzpatrickType
  fitzpatrickSource: 'ita' | 'ml'
  undertone: Undertone
  undertoneConfidence: number
  hair: {
    family: HairFamily
    temperature: HairTemperature
    hex: string
    bald: boolean
    confidence: number
    source: 'ml' | 'heuristic' | 'ml+heuristic'
  }
  sampledPixels: number
  /** True when MediaPipe Face Landmarker located facial landmarks */
  usedFaceMesh: boolean
  /** Per-region color samples (cheeks, forehead, jaw, …) */
  regions: FaceRegionSample[]
  lighting: LightingInfo
}

export interface MakeupProduct {
  id: string
  name: string
  brand: string
  category: ProductCategory
  /** Hex of the product shade / swatch */
  shadeHex: string
  /** Human shade label from retailer (e.g. "20 Velvet sand") */
  shadeName?: string
  undertone: Undertone
  /** Inclusive depth range this shade suits */
  depthMin: SkinDepth
  depthMax: SkinDepth
  /** Color family tags used by the matcher (e.g. peach, berry, bronze) */
  paletteTags: string[]
  /** Optional product URL on the store site */
  url?: string
  imageUrl?: string
  priceRsd?: number
  gtin?: string
  dan?: string
  source?: 'dm' | 'demo'
  isDemo?: boolean
}

export interface ProductMatch {
  product: MakeupProduct
  score: number
  reasons: string[]
}

export type FaceZoneId =
  | 'faceBase'
  | 'underEye'
  | 'cheeks'
  | 'contour'
  | 'lips'
  | 'eyes'

/** One recommended product mapped to a makeup face zone */
export interface FaceZoneMatch {
  zoneId: FaceZoneId
  zoneLabel: string
  faceTarget: string
  category: ProductCategory
  match: ProductMatch | null
  tip: string
}

export type AppPhase = 'idle' | 'camera' | 'analyzing' | 'results'

export interface CaptureBundle {
  main: HTMLCanvasElement
  /** Up to 10 JPEG data-URLs from the last ~1s */
  calibrationFrames: Array<{ dataUrl: string; capturedAt: number }>
}
