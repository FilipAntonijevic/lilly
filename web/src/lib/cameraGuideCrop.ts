/**
 * Crop a mirrored capture canvas to the face-guide oval band as shown in
 * the live preview (.camera-frame + object-fit: cover video).
 *
 * Keeps the full preview width; trims above/below the ellipse so try-on
 * has a shorter image and more room underneath.
 */

/** Matches `.camera-frame` in App.css */
const FRAME_CENTER_Y = 0.46
const FRAME_WIDTH_VW = 0.88
const FRAME_MAX_WIDTH_PX = 400
/** CSS `aspect-ratio: 3 / 4` → height = width × 4/3 */
const FRAME_HEIGHT_OVER_WIDTH = 4 / 3

export function cropCaptureToFaceGuide(
  video: HTMLVideoElement,
  source: HTMLCanvasElement,
): HTMLCanvasElement {
  const stage = video.getBoundingClientRect()
  const stageW = stage.width
  const stageH = stage.height
  if (stageW < 1 || stageH < 1) return source

  const videoW = source.width
  const videoH = source.height
  if (videoW < 1 || videoH < 1) return source

  // object-fit: cover mapping (video → stage)
  const scale = Math.max(stageW / videoW, stageH / videoH)
  const dispW = videoW * scale
  const dispH = videoH * scale
  const offX = (stageW - dispW) / 2
  const offY = (stageH - dispH) / 2

  const frameW = Math.min(stageW * FRAME_WIDTH_VW, FRAME_MAX_WIDTH_PX)
  const frameH = frameW * FRAME_HEIGHT_OVER_WIDTH
  const frameCy = stageH * FRAME_CENTER_Y
  const frameTop = frameCy - frameH / 2
  const frameBottom = frameCy + frameH / 2

  // Cover-visible rectangle in unmirrored video pixels
  const srcX = -offX / scale
  const srcY = -offY / scale
  const srcW = stageW / scale
  const srcH = stageH / scale

  let y0 = (frameTop - offY) / scale
  let y1 = (frameBottom - offY) / scale
  y0 = Math.max(srcY, Math.min(srcY + srcH, y0))
  y1 = Math.max(srcY, Math.min(srcY + srcH, y1))

  // Capture canvas is horizontally mirrored vs raw video pixels
  const mirroredX0 = videoW - srcX - srcW

  const cropX = Math.round(Math.max(0, Math.min(videoW, mirroredX0)))
  const cropY = Math.round(Math.max(0, Math.min(videoH, y0)))
  const cropW = Math.round(Math.max(0, Math.min(videoW - cropX, srcW)))
  const cropH = Math.round(Math.max(0, Math.min(videoH - cropY, y1 - y0)))

  if (cropW < 32 || cropH < 32) return source

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return out
}
