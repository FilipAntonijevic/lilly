/**
 * Shrink an element's font until its text fits inside its CSS height box
 * (typically a fixed 2-line clamp). Restores clamp styles after measuring.
 */
export function fitFontToLineBox(
  el: HTMLElement,
  options: { maxPx: number; minPx: number; step?: number },
): void {
  const styles = getComputedStyle(el)
  const targetHeight =
    parseFloat(styles.maxHeight) ||
    parseFloat(styles.height) ||
    el.clientHeight
  if (!targetHeight) return

  const step = options.step ?? 0.25
  let size = options.maxPx

  el.style.setProperty('display', 'block')
  el.style.setProperty('-webkit-line-clamp', 'unset')
  el.style.setProperty('height', 'auto')
  el.style.setProperty('max-height', 'none')
  el.style.setProperty('overflow', 'visible')
  el.style.fontSize = `${size}px`

  while (size > options.minPx && el.scrollHeight > targetHeight + 0.5) {
    size -= step
    el.style.fontSize = `${size}px`
  }

  el.style.removeProperty('display')
  el.style.removeProperty('-webkit-line-clamp')
  el.style.removeProperty('height')
  el.style.removeProperty('max-height')
  el.style.removeProperty('overflow')
}
