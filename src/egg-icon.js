// Shared egg shape — one <path> reused for the 3-egg logo and the colored
// today-count row, so they stay visually consistent.
import { COLORS } from './config.js'

const EGG_PATH =
  'M11 1.5 C 6 1.5, 3.5 8, 3.5 15 C 3.5 22, 7 26.5, 11 26.5 C 15 26.5, 18.5 22, 18.5 15 C 18.5 8, 16 1.5, 11 1.5 Z'

// A single egg as an inline-SVG string, filled with `fill`.
export function eggSvg(fill, cls = 'egg-ic') {
  return `<svg class="${cls}" viewBox="0 0 22 28" aria-hidden="true"><path d="${EGG_PATH}" fill="${fill}" stroke="rgba(61,50,41,.22)" stroke-width="1" /></svg>`
}

// The logo: one egg per flock color (brown, blue, olive).
export function eggLogo() {
  return COLORS.map((c) => eggSvg(c.swatch, 'egg-logo')).join('')
}
