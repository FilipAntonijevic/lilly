import { useEffect, useRef, useState } from 'react'
import { preloadFaceLandmarker } from '../lib/faceLandmarker'
import {
  FRAME_BUFFER_SIZE,
  FRAME_INTERVAL_MS,
  FrameRingBuffer,
  grabVideoFrame,
} from '../lib/frameBuffer'
import type { CaptureBundle } from '../types'

interface CameraStageProps {
  onCapture: (bundle: CaptureBundle) => void
  disabled?: boolean
}

export function CameraStage({ onCapture, disabled }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const bufferRef = useRef(new FrameRingBuffer(FRAME_BUFFER_SIZE))
  const sampleTimerRef = useRef<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    preloadFaceLandmarker()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Kamera nije podržana u ovom pregledaču.')
          return
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play()
          setReady(true)
        }
      } catch {
        setError(
          'Nije moguće pristupiti kameri. Dozvoli pristup u pregledaču i osveži stranicu.',
        )
      }
    }

    void start()

    return () => {
      cancelled = true
      if (sampleTimerRef.current != null) {
        window.clearInterval(sampleTimerRef.current)
        sampleTimerRef.current = null
      }
      bufferRef.current.clear()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // Silent ring-buffer sampling while preview is live
  useEffect(() => {
    if (!ready) return

    sampleTimerRef.current = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      const dataUrl = grabVideoFrame(video, { maxWidth: 640, quality: 0.72 })
      if (!dataUrl) return
      bufferRef.current.push({
        dataUrl,
        capturedAt: Date.now(),
      })
    }, FRAME_INTERVAL_MS)

    return () => {
      if (sampleTimerRef.current != null) {
        window.clearInterval(sampleTimerRef.current)
        sampleTimerRef.current = null
      }
    }
  }, [ready])

  function handleCapture() {
    const video = videoRef.current
    if (!video || !ready || disabled) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    const calibrationFrames = bufferRef.current.snapshot()

    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    onCapture({ main: canvas, calibrationFrames })
  }

  return (
    <div className="camera-stage">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        autoPlay
        aria-label="Pregled kamere"
      />
      <div className="camera-frame" aria-hidden="true" />
      {!error && ready && !disabled && (
        <p className="camera-guide">keep your face contained within the lines</p>
      )}
      {flash && <div className="camera-flash" aria-hidden="true" />}

      {error ? (
        <div className="camera-error">
          <p>{error}</p>
        </div>
      ) : (
        <div className="camera-controls">
          <button
            type="button"
            className="shutter-btn"
            onClick={handleCapture}
            disabled={!ready || disabled}
            aria-label="Uslikaj"
          >
            <span className="shutter-ring" />
            <span className="shutter-core" />
          </button>
          <p className="camera-hint">
            {ready
              ? 'Ravnomerno svetlo na licu (bez jake senke), pa uslikaj'
              : 'Pokrećem kameru…'}
          </p>
        </div>
      )}
    </div>
  )
}
