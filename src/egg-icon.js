// An egg = the same CSS shape as the color-selector swatch (`.swatch` in
// style.css), recolored. Reusing that class keeps ONE egg shape across the whole
// page — change the shape there and everything follows.
import { COLORS } from './config.js'

export function eggSpan(fill, cls = 'egg-ic') {
  return `<span class="swatch ${cls}" style="--swatch:${fill}"></span>`
}

// The logo: one egg per flock color (brown, blue, olive).
export function eggLogo() {
  return COLORS.map((c) => eggSpan(c.swatch, 'egg-logo')).join('')
}

// A "many eggs" glyph — three overlapped eggs packed into a single egg's
// footprint, so it can replace the first egg in the today row without changing
// the line's width. Uses the same `.swatch` egg shape.
export function eggCluster() {
  return (
    '<span class="egg-cluster" role="img" aria-label="many eggs">' +
    COLORS.map((c, i) => `<span class="swatch c${i}" style="--swatch:${c.swatch}"></span>`).join('') +
    '</span>'
  )
}
