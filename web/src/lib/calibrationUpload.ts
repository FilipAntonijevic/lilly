import type { BufferedFrame } from './frameBuffer'
import type { SkinProfile } from '../types'

export interface CaptureUploadPayload {
  mainDataUrl: string
  calibrationFrames: BufferedFrame[]
  capturedAt: number
  userAgent: string
  analysis?: Pick<
    SkinProfile,
    'fitzpatrick' | 'undertone' | 'depth' | 'ita' | 'hair'
  > | null
}

function resolveEndpoint(): string | null {
  const fromEnv = import.meta.env.VITE_CALIBRATION_API_URL as string | undefined
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  // Local receiver used during development
  if (import.meta.env.DEV) return 'http://127.0.0.1:8787/calibration'

  return null
}

/**
 * Fire-and-forget upload of main + calibration frames (+ optional analysis draft).
 * Failures are swallowed — no UI feedback.
 */
export function uploadCaptureBundle(payload: CaptureUploadPayload): void {
  const endpoint = resolveEndpoint()
  if (!endpoint) return

  const body = JSON.stringify({
    main: payload.mainDataUrl,
    frames: payload.calibrationFrames.map((f) => ({
      dataUrl: f.dataUrl,
      capturedAt: f.capturedAt,
    })),
    capturedAt: payload.capturedAt,
    userAgent: payload.userAgent,
    analysis: payload.analysis
      ? {
          fitzpatrick: payload.analysis.fitzpatrick,
          undertone: payload.analysis.undertone,
          depth: payload.analysis.depth,
          ita: payload.analysis.ita,
          hair: payload.analysis.hair,
        }
      : null,
  })

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      mode: 'cors',
    }).catch(() => {
      /* ignore */
    })
  } catch {
    /* ignore */
  }
}
