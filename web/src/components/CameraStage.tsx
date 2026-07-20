import { useEffect, useRef, useState } from 'react'

interface CameraStageProps {
  onCapture: (canvas: HTMLCanvasElement) => void
  disabled?: boolean
}

export function CameraStage({ onCapture, disabled }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [flash, setFlash] = useState(false)

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
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  function handleCapture() {
    const video = videoRef.current
    if (!video || !ready || disabled) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Mirror to match preview
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    setFlash(true)
    window.setTimeout(() => setFlash(false), 180)
    onCapture(canvas)
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
            {ready ? 'Poravnaj lice u okvir i pritisni dugme' : 'Pokrećem kameru…'}
          </p>
        </div>
      )}
    </div>
  )
}
