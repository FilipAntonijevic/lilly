import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const WASM_ROOT =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

export type Landmark = { x: number; y: number; z: number }

let landmarkerPromise: Promise<FaceLandmarker> | null = null

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
    })().catch((err) => {
      landmarkerPromise = null
      throw err
    })
  }
  return landmarkerPromise
}

/** Warm up model download while user is on camera screen. */
export function preloadFaceLandmarker(): void {
  void getFaceLandmarker().catch(() => {
    /* ignore preload errors — analysis will surface them */
  })
}

export async function detectFaceLandmarks(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<Landmark[] | null> {
  const landmarker = await getFaceLandmarker()
  const result = landmarker.detect(source)
  const face = result.faceLandmarks[0]
  return face?.length ? face : null
}

/**
 * Makeup-relevant MediaPipe Face Mesh landmark clusters.
 * Indices from the 478-point Face Landmarker mesh.
 */
export const MAKEUP_REGIONS = {
  forehead: [10, 67, 69, 104, 108, 151, 9, 8, 107, 336, 297, 299, 337],
  leftCheek: [50, 101, 118, 119, 100, 36, 205, 187, 123, 117, 116, 207],
  rightCheek: [280, 330, 347, 348, 329, 266, 425, 411, 352, 346, 345, 427],
  jaw: [152, 176, 149, 150, 136, 397, 365, 379, 378, 400, 377, 172, 148],
  underEyeLeft: [111, 117, 118, 119, 100, 47, 114],
  underEyeRight: [340, 346, 347, 348, 329, 277, 343],
  /** Hairline anchors — we sample upward from these toward hair */
  hairline: [10, 67, 109, 108, 69, 338, 297, 332, 284],
} as const

export type MakeupRegionKey = keyof typeof MAKEUP_REGIONS

/**
 * Editable rings (polygons). Soft circular brushes (cheeks, etc.) are built
 * in tryOnRegions from single mesh anchors — not listed here.
 * Eyes: lid outline for handles; paint uses lid/crease/outer layers in tryOnRender.
 */
export const TRYON_POLYGON_INDICES = {
  leftEye: [247, 30, 29, 27, 28, 56, 190, 173, 157, 158, 159, 160, 161, 246],
  rightEye: [467, 260, 259, 257, 258, 286, 414, 398, 384, 385, 386, 387, 388, 466],
  lips: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
    181, 91, 146,
  ],
  leftCheek: [205],
  rightCheek: [425],
  underEyeLeft: [111],
  underEyeRight: [340],
  jawLeft: [172],
  jawRight: [397],
  faceOval: [10, 297, 332, 454, 361, 397, 152, 172, 58, 234, 127, 54, 103],
} as const

export type TryOnPolygonId = keyof typeof TRYON_POLYGON_INDICES
