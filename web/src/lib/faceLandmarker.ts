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
