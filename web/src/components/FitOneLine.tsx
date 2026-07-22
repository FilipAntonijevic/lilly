import { useEffect, useRef, type ElementType } from 'react'

/**
 * Keeps a single line of text fully visible by shrinking font-size to the
 * container width (used on the landing page for iPhone-safe copy).
 */
export function FitOneLine({
  text,
  className,
  as: Tag = 'p',
  maxPx,
  minPx = 11,
}: {
  text: string
  className?: string
  as?: ElementType
  maxPx: number
  minPx?: number
}) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function fit() {
      const node = ref.current
      if (!node) return
      let size = maxPx
      node.style.whiteSpace = 'nowrap'
      node.style.fontSize = `${size}px`
      // Width comes from the block layout; measure against parent if needed.
      const limit = Math.max(
        node.clientWidth,
        node.parentElement?.clientWidth ?? 0,
      )
      if (limit <= 0) return
      while (size > minPx && node.scrollWidth > limit + 1) {
        size -= 0.5
        node.style.fontSize = `${size}px`
      }
    }

    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [text, maxPx, minPx])

  return (
    <Tag ref={ref} className={className}>
      {text}
    </Tag>
  )
}
