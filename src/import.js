// Parser for the Debug tab's bulk-import textarea. Format:
//
//   June 12
//   Egg (brown) - 46g - Goldilocks
//   Egg (olive) - 30g
//   Egg(blue) - 30g
//
// Date lines start a day; egg lines below it belong to that day. Weight and
// chicken are optional. All-or-nothing: any error and nothing is imported.
import { COLORS, CHICKENS } from './config.js'
import { uid } from './storage.js'

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const DATE_RE = /^([a-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i
const EGG_RE = /^egg\s*\(\s*([a-z]+)\s*\)\s*(?:-\s*(\d+(?:\.\d+)?)\s*g?)?\s*(?:-\s*(.+))?$/i

// Returns { entries, errors }. Entries are ready for the store: unsynced,
// timestamped at noon plus a minute per egg to preserve listed order.
export function parseImport(text) {
  const entries = []
  const errors = []
  let day = null
  let seq = 0

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const lineNo = i + 1

    const dateMatch = line.match(DATE_RE)
    const month = dateMatch
      ? MONTHS.findIndex((m) => m.startsWith(dateMatch[1].toLowerCase()))
      : -1
    if (dateMatch && month !== -1) {
      const now = new Date()
      let year = dateMatch[3] ? Number(dateMatch[3]) : now.getFullYear()
      day = new Date(year, month, Number(dateMatch[2]), 12, 0, 0)
      // No year given and the date hasn't happened yet → it was last year
      if (!dateMatch[3] && day > now) day.setFullYear(year - 1)
      if (day.getMonth() !== month) {
        errors.push(`Line ${lineNo}: "${line}" isn't a real date`)
        day = null
      }
      seq = 0
      return
    }

    const eggMatch = line.match(EGG_RE)
    if (!eggMatch) {
      errors.push(`Line ${lineNo}: couldn't parse "${line}"`)
      return
    }
    if (!day) {
      errors.push(`Line ${lineNo}: egg listed before any date line`)
      return
    }
    const color = eggMatch[1].toLowerCase()
    if (!COLORS.some((c) => c.id === color)) {
      errors.push(`Line ${lineNo}: unknown color "${eggMatch[1]}"`)
      return
    }
    let chicken = eggMatch[3]?.trim() || null
    if (chicken) {
      const known = CHICKENS.find((c) => c.name.toLowerCase() === chicken.toLowerCase())
      if (!known) {
        errors.push(`Line ${lineNo}: unknown chicken "${chicken}"`)
        return
      }
      chicken = known.name
    }
    const ts = new Date(day)
    ts.setMinutes(ts.getMinutes() + seq++)
    entries.push({
      id: uid(),
      timestamp: ts.toISOString(),
      weight: eggMatch[2] ? Number(eggMatch[2]) : null,
      color,
      chicken,
      synced: false,
    })
  })

  return { entries, errors }
}
