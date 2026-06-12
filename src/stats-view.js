import Chart from 'chart.js/auto'
import { COLORS, CHICKENS } from './config.js'
import { getEntries } from './storage.js'

Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', sans-serif"
Chart.defaults.color = '#8a7d6e'

// Dev-only hook so UI tests can locate chart elements for click simulation
if (import.meta.env.DEV) window.Chart = Chart

const ACCENT = '#d98e32'
const UNKNOWN = '#cfc6b8'
const NOT_SURE = 'Not sure'

let charts = []
// Click a color slice or a hen bar to filter the rest of the page.
// { type: 'color'|'chicken', value } — clicking the same thing clears it.
let filter = null

const dim = (hex) => hex + '40' // 25% alpha via 8-digit hex

function matchesFilter(e) {
  return filter.type === 'color'
    ? e.color === filter.value
    : (e.chicken ?? NOT_SURE) === filter.value
}

function henColor(name) {
  const colorId = CHICKENS.find((c) => c.name === name)?.color
  return COLORS.find((c) => c.id === colorId)?.swatch ?? UNKNOWN
}

export function renderStats(view) {
  charts.forEach((c) => c.destroy())
  charts = []

  const entries = getEntries()
  if (entries.length === 0) {
    view.innerHTML = `<p class="empty">No eggs logged yet — stats will hatch here. 🐣</p>`
    return
  }

  const visible = filter ? entries.filter(matchesFilter) : entries

  const total = visible.length
  const weekAgo = Date.now() - 7 * 86400_000
  const week = visible.filter((e) => new Date(e.timestamp) >= weekAgo).length
  const weighted = visible.filter((e) => e.weight != null)
  const avg = weighted.length
    ? Math.round((weighted.reduce((s, e) => s + e.weight, 0) / weighted.length) * 10) / 10 + 'g'
    : '—'

  const filterLabel =
    filter &&
    (filter.type === 'color'
      ? COLORS.find((c) => c.id === filter.value).label + ' eggs'
      : filter.value)

  view.innerHTML = `
    ${filter ? `<button type="button" class="filter-pill" id="filter-clear">Showing: ${filterLabel} <span class="pill-x">×</span></button>` : ''}
    <div class="stat-tiles">
      <div class="tile"><strong>${total}</strong><span>total eggs</span></div>
      <div class="tile"><strong>${week}</strong><span>last 7 days</span></div>
      <div class="tile"><strong>${avg}</strong><span>avg weight</span></div>
    </div>
    <div class="chart-card"><h3>Eggs per day <small>· last 14 days</small></h3><canvas id="c-daily"></canvas></div>
    <div class="chart-card"><h3>Total eggs <small>· all time</small></h3><canvas id="c-cumulative"></canvas></div>
    <div class="chart-card"><h3>Average weight <small>· all time</small></h3><canvas id="c-weight"></canvas></div>
    <div class="chart-card"><h3>Colors <small>· tap to filter</small></h3><canvas id="c-colors"></canvas></div>
    <div class="chart-card"><h3>By chicken <small>· tap to filter</small></h3><canvas id="c-chickens"></canvas></div>
  `

  view.querySelector('#filter-clear')?.addEventListener('click', () => {
    filter = null
    renderStats(view)
  })

  const byDay = new Map()
  for (const e of visible) {
    const key = localDayKey(new Date(e.timestamp))
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(e)
  }

  buildDailyChart(view, byDay)
  buildCumulativeChart(view, byDay)
  buildWeightChart(view, byDay)
  // The filter's own source chart keeps showing everything (with the pick
  // highlighted) so other options stay tappable; the rest get `visible`.
  buildColorChart(view, filter?.type === 'color' ? entries : visible)
  buildChickenChart(view, filter?.type === 'chicken' ? entries : visible)
}

const pointerOnHover = (e, els) => {
  e.native.target.style.cursor = els.length ? 'pointer' : 'default'
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

function buildCumulativeChart(view, byDay) {
  const keys = [...byDay.keys()].sort()
  const labels = []
  const totals = []
  let running = 0
  for (const k of keys) {
    running += byDay.get(k).length
    labels.push(
      new Date(`${k}T12:00:00`).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
    )
    totals.push(running)
  }
  charts.push(
    new Chart(view.querySelector('#c-cumulative'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: totals,
            borderColor: ACCENT,
            backgroundColor: 'rgb(217 142 50 / 0.15)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
          },
        ],
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
  // Only days with at least one weighed egg contribute a point.
  const keys = [...byDay.keys()]
    .filter((k) => byDay.get(k).some((e) => e.weight != null))
    .sort()
  const labels = keys.map((k) =>
    new Date(`${k}T12:00:00`).toLocaleDateString([], { month: 'numeric', day: 'numeric' }),
  )
  const averages = keys.map((k) => {
    const day = byDay.get(k).filter((e) => e.weight != null)
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
  const selected = filter?.type === 'color' ? filter.value : null
  charts.push(
    new Chart(view.querySelector('#c-colors'), {
      type: 'doughnut',
      data: {
        labels: COLORS.map((c) => c.label),
        datasets: [
          {
            data: counts,
            backgroundColor: COLORS.map((c) =>
              selected && c.id !== selected ? dim(c.swatch) : c.swatch,
            ),
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      },
      options: {
        aspectRatio: 2.4,
        plugins: { legend: { position: 'right' } },
        onHover: pointerOnHover,
        onClick: (evt, els) => {
          if (!els.length) return
          const id = COLORS[els[0].index].id
          filter =
            filter?.type === 'color' && filter.value === id
              ? null
              : { type: 'color', value: id }
          renderStats(view)
        },
      },
    }),
  )
}

// Draws each hen's egg color as a small egg-shaped dot left of her name.
const henDots = {
  id: 'henDots',
  afterDraw(chart) {
    const scale = chart.scales.y
    const ctx = chart.ctx
    ctx.save()
    ctx.font = `12px ${Chart.defaults.font.family}`
    chart.data.labels.forEach((label, i) => {
      const y = scale.getPixelForTick(i)
      const x = scale.right - 8 - ctx.measureText(label).width - 9
      ctx.fillStyle = henColor(label)
      ctx.beginPath()
      ctx.ellipse(x, y, 3.5, 4.5, 0, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.restore()
  },
}

function buildChickenChart(view, entries) {
  const names = [...CHICKENS.map((c) => c.name), NOT_SURE]
  const rows = names
    .map((name) => ({
      name,
      count: entries.filter((e) => (e.chicken ?? NOT_SURE) === name).length,
    }))
    .sort((a, b) => b.count - a.count)
  const selected = filter?.type === 'chicken' ? filter.value : null
  charts.push(
    new Chart(view.querySelector('#c-chickens'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.name),
        datasets: [
          {
            data: rows.map((r) => r.count),
            backgroundColor: rows.map((r) => {
              const base = r.name === NOT_SURE ? UNKNOWN : ACCENT
              return selected && r.name !== selected ? dim(base) : base
            }),
            borderRadius: 6,
          },
        ],
      },
      plugins: [henDots],
      options: {
        indexAxis: 'y',
        aspectRatio: 0.9,
        layout: { padding: { left: 14 } },
        plugins: { legend: { display: false } },
        onHover: pointerOnHover,
        onClick: (evt, els) => {
          if (!els.length) return
          const name = rows[els[0].index].name
          filter =
            filter?.type === 'chicken' && filter.value === name
              ? null
              : { type: 'chicken', value: name }
          renderStats(view)
        },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    }),
  )
}

function localDayKey(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
