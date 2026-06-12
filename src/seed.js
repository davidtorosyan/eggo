// Fake-data generators for the dev-only Debug tab. Never loaded in prod
// builds (only imported from debug-view.js behind import.meta.env.DEV).
import { CHICKENS } from './config.js'
import { getEntries, setEntries, uid } from './storage.js'

// Adds ~`days` days of fake eggs; returns how many were created.
export function seed(days = 21) {
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
        id: uid(),
        timestamp: date.toISOString(),
        // ~10% unweighed: exercises the weightless-egg paths in the UI
        weight: Math.random() < 0.1 ? null : Math.round(weight * 10) / 10,
        color: chicken.color,
        chicken: Math.random() < 0.7 ? chicken.name : null,
        synced: true, // never try to upload fake data
        seeded: true,
      })
    }
  }
  setEntries(
    [...getEntries(), ...fresh].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    ),
  )
  return fresh.length
}

// Removes only seeded entries; returns how many real entries remain.
export function clearSeed() {
  const kept = getEntries().filter((e) => !e.seeded)
  setEntries(kept)
  return kept.length
}

export function clearAll() {
  setEntries([])
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
