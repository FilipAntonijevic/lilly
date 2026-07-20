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
  | 'unknown'
export type HairTemperature = 'cool' | 'warm' | 'neutral'

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

export interface SkinProfile {
  lab: LabColor
  hex: string
  ita: number
  depth: SkinDepth
  undertone: Undertone
  undertoneConfidence: number
  hair: {
    family: HairFamily
    temperature: HairTemperature
    hex: string
  }
  sampledPixels: number
  /** True when MediaPipe Face Landmarker located facial landmarks */
  usedFaceMesh: boolean
  /** Per-region color samples (cheeks, forehead, jaw, …) */
  regions: FaceRegionSample[]
}

export interface MakeupProduct {
  id: string
  name: string
  brand: string
  category: ProductCategory
  /** Hex of the product shade / swatch */
  shadeHex: string
  undertone: Undertone
  /** Inclusive depth range this shade suits */
  depthMin: SkinDepth
  depthMax: SkinDepth
  /** Color family tags used by the matcher (e.g. peach, berry, bronze) */
  paletteTags: string[]
  /** Optional product URL on the store site */
  url?: string
  isDemo?: boolean
}

export interface ProductMatch {
  product: MakeupProduct
  score: number
  reasons: string[]
}

export type AppPhase = 'idle' | 'camera' | 'analyzing' | 'results'
