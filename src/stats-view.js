import Chart from 'chart.js/auto'
import { COLORS, CHICKENS } from './config.js'
import { getEntries } from './storage.js'

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif"
Chart.defaults.color = '#8a7d6e'

const ACCENT = '#d98e32'

let charts = []

export function renderStats(view) {
  charts.forEach((c) => c.destroy())
  charts = []

  const entries = getEntries()
  if (entries.length === 0) {
    view.innerHTML = `<p class="empty">No eggs logged yet — stats will hatch here. 🐣</p>`
    return
  }

  const total = entries.length
  const weekAgo = Date.now() - 7 * 86400_000
  const week = entries.filter((e) => new Date(e.timestamp) >= weekAgo).length
  const avg = Math.round((entries.reduce((s, e) => s + e.weight, 0) / total) * 10) / 10

  view.innerHTML = `
    <div class="stat-tiles">
      <div class="tile"><strong>${total}</strong><span>total eggs</span></div>
      <div class="tile"><strong>${week}</strong><span>last 7 days</span></div>
      <div class="tile"><strong>${avg}g</strong><span>avg weight</span></div>
    </div>
    <div class="chart-card"><h3>Eggs per day</h3><canvas id="c-daily"></canvas></div>
    <div class="chart-card"><h3>Average weight</h3><canvas id="c-weight"></canvas></div>
    <div class="chart-card"><h3>Colors</h3><canvas id="c-colors"></canvas></div>
    <div class="chart-card"><h3>By chicken</h3><canvas id="c-chickens"></canvas></div>
  `

  const byDay = new Map()
  for (const e of entries) {
    const key = localDayKey(new Date(e.timestamp))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(e)
  }

  buildDailyChart(view, byDay)
  buildWeightChart(view, byDay)
  buildColorChart(view, entries)
  buildChickenChart(view, entries)
}

function buildDailyChart(view, byDay) {
  const labels = []
  const counts = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }))
    counts.push(byDay.get(localDayKey(d))?.length ?? 0)
  }
  charts.push(
    new Chart(view.querySelector('#c-daily'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: counts, backgroundColor: ACCENT, borderRadius: 6 }],
      },
      options: {
        aspectRatio: 1.8,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    }),
  )
}

function buildWeightChart(view, byDay) {
  const keys = [...byDay.keys()].sort()
  const labels = keys.map((k) =>
    new Date(`${k}T12:00:00`).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
  )
  const averages = keys.map((k) => {
    const day = byDay.get(k)
    return Math.round((day.reduce((s, e) => s + e.weight, 0) / day.length) * 10) / 10
  })
  charts.push(
    new Chart(view.querySelector('#c-weight'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: averages,
            borderColor: ACCENT,
            backgroundColor: ACCENT,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        aspectRatio: 1.8,
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: 'grams' } } },
      },
    }),
  )
}

function buildColorChart(view, entries) {
  const counts = COLORS.map((c) => entries.filter((e) => e.color === c.id).length)
  charts.push(
    new Chart(view.querySelector('#c-colors'), {
      type: 'doughnut',
      data: {
        labels: COLORS.map((c) => c.label),
        datasets: [
          {
            data: counts,
            backgroundColor: COLORS.map((c) => c.swatch),
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        aspectRatio: 1.8,
        plugins: { legend: { position: 'right' } },
      },
    }),
  )
}

function buildChickenChart(view, entries) {
  const names = [...CHICKENS.map((c) => c.name), 'Not sure']
  const counts = names.map(
    (name) =>
      entries.filter((e) => (e.chicken ?? 'Not sure') === name).length,
  )
  const rows = names
    .map((name, i) => ({ name, count: counts[i] }))
    .sort((a, b) => b.count - a.count)
  charts.push(
    new Chart(view.querySelector('#c-chickens'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            data: rows.map((r) => r.count),
            backgroundColor: rows.map((r) =>
              r.name === 'Not sure' ? '#cfc6b8' : ACCENT,
            ),
            borderRadius: 6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        aspectRatio: 0.9,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    }),
  )
}

function localDayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
