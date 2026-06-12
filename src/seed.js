// Dev-only console tools (loaded only in `npm run dev`, never in the build).
// Usage from the browser console:
//   eggo.seed(21)    — add ~3 weeks of fake eggs (marks them seeded+synced)
//   eggo.clearSeed() — remove only seeded entries
//   eggo.clearAll()  — wipe ALL local entries
//   eggo.list()      — console.table of everything
import { CHICKENS } from './config.js'
import { getEntries, setEntries } from './storage.js'

function seed(days = 21) {
  const fresh = []
  const now = new Date()
  for (let d = days; d >= 1; d--) {
    // Young flock ramping up: more eggs (and heavier ones) as days pass.
    const ramp = 1 - d / days
    const count = randInt(2 + Math.round(ramp * 3), 5 + Math.round(ramp * 4))
    for (let i = 0; i < count; i++) {
      const chicken = CHICKENS[randInt(0, CHICKENS.length - 1)]
      const date = new Date(now)
      date.setDate(now.getDate() - d)
      date.setHours(randInt(7, 14), randInt(0, 59), randInt(0, 59), 0)
      const weight = clamp(44 + ramp * 10 + gauss() * 4, 35, 70)
      fresh.push({
        id: crypto.randomUUID(),
        timestamp: date.toISOString(),
        weight: Math.round(weight * 10) / 10,
        color: chicken.color,
        chicken: Math.random() < 0.7 ? chicken.name : null,
        synced: true, // never try to upload fake data
        seeded: true,
      })
    }
  }
  const all = [...getEntries(), ...fresh].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  )
  setEntries(all)
  console.info(`[eggo] seeded ${fresh.length} eggs over ${days} days — reload or switch tabs to see them`)
}

function clearSeed() {
  const kept = getEntries().filter((e) => !e.seeded)
  setEntries(kept)
  console.info(`[eggo] seeded entries removed, ${kept.length} real entries kept`)
}

function clearAll() {
  setEntries([])
  console.info('[eggo] all local entries wiped')
}

function list() {
  console.table(getEntries())
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function gauss() {
  // Box–Muller: standard normal
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random())
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

window.eggo = { seed, clearSeed, clearAll, list }
console.info('[eggo] dev tools ready: eggo.seed(days), eggo.clearSeed(), eggo.clearAll(), eggo.list()')
