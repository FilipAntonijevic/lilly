export type Undertone = 'cool' | 'warm' | 'neutral' | 'olive'
export type SkinDepth =
  | 'very_light'
  | 'light'
  | 'medium'
  | 'tan'
  | 'deep'
  | 'very_deep'

export type HairFamily = 'blonde' | 'brown' | 'black' | 'red' | 'gray' | 'unknown'
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
