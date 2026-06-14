// Shared egg shape — one <path> reused for the 3-egg logo and the colored
// today-count row, so they stay visually consistent.
import { COLORS } from './config.js'

// Plump, rounded egg (emoji-like): tapered top, wide round bottom.
const EGG_PATH =
  'M12 2.5 C 8 2.5, 5 7, 4 13 C 3 19, 5 28, 12 28 C 19 28, 21 19, 20 13 C 19 7, 16 2.5, 12 2.5 Z'

// A single egg as an inline-SVG string, filled with `fill`.
export function eggSvg(fill, cls = 'egg-ic') {
  return `<svg class="${cls}" viewBox="0 0 24 30" aria-hidden="true"><path d="${EGG_PATH}" fill="${fill}" stroke="rgba(61,50,41,.22)" stroke-width="1" /></svg>`
}

// The logo: one egg per flock color (brown, blue, olive).
export function eggLogo() {
  return COLORS.map((c) => eggSvg(c.swatch, 'egg-logo')).join('')
}
