/**
 * walkabilityEngine.js
 * Pure utilities for the Dual-State Walkability Index.
 */

// ─── Story Tours ──────────────────────────────────────────────────────────────

export const STORY_TOURS = [
  {
    id:      'sweat',
    mode:    'day',
    label:   'DAY',
    title:   'The Sweat Tour',
    tagline: 'Where is the city cooking its residents?',
    description:
      'High surface temps with no tree cover compound into a heat tax on every journey. ' +
      'Segments with trees to walk under are intentionally excluded shade doesn\'t need ' +
      'to cover the whole street to help. Streets shown here have neither canopy nor SVF relief. ' +
      'They are a direct call to plant trees: the infrastructure gap is not terrain, it is amenity.',
    filterLabel: 'Hot + unshaded segments',
    // Only flag segments where shade is genuinely unavailable (shade score < 0.40).
    // A street with trees to walk under is not a heat-stress problem even if surface
    // temp is high — pedestrians can choose the shaded path.
    filterFn: features => {
      const SHADE_THRESH = 0.40
      return features
        .filter(f => (f.properties._s_shade ?? 1) < SHADE_THRESH)
        .sort((a, b) => a.properties.kpi_day - b.properties.kpi_day)
        .slice(0, Math.ceil(features.length * 0.25))
    },
    highlightColor: '#ff4d4d',
    glowColor:      '#ff8080',
  },
  {
    id:      'shadow',
    mode:    'night',
    label:   'NIGHT',
    title:   'The Shadow Tour',
    tagline: 'The single broken light that breaks the whole street.',
    description:
      'Scored using minimum lumens the darkest link logic. A single unlit span condemns the ' +
      'entire segment. This is resilience mapping: infrastructure is only as strong as its weakest point.',
    filterLabel: 'Darkest segments',
    filterFn: features =>
      features
        .slice()
        .sort((a, b) => a.properties.kpi_night - b.properties.kpi_night)
        .slice(0, Math.ceil(features.length * 0.25)),
    highlightColor: '#a259ff',
    glowColor:      '#c084fc',
  },
  {
    id:      'anchor',
    mode:    'night',
    label:   'NIGHT',
    title:   'The Nightlife Anchor',
    tagline: 'Private economy compensating for public infrastructure failure.',
    description:
      'High night-time activity despite low lumens. Bars, restaurants, and convenience stores ' +
      'concentrate foot traffic in poorly lit streets showing exactly where public lighting investment is overdue.',
    filterLabel: 'Dark but active streets',
    filterFn: (features) => {
      const luxVals   = features.map(f => f.properties.min_lux).sort((a, b) => a - b)
      const poiVals   = features.map(f => f.properties.night_poi).sort((a, b) => a - b)
      const luxThresh = luxVals[Math.floor(luxVals.length * 0.30)]
      const poiThresh = poiVals[Math.floor(poiVals.length * 0.70)]
      return features.filter(f =>
        f.properties.min_lux   <= luxThresh &&
        f.properties.night_poi >= poiThresh
      )
    },
    highlightColor: '#f5a623',
    glowColor:      '#fcd06b',
  },
]

// ─── Colour scales ────────────────────────────────────────────────────────────

// 5-step colours for quintile bands
const DAY_COLORS   = ['#9c2a2a', '#c06828', '#b89428', '#3a8a68', '#1a5878']
const NIGHT_COLORS = ['#0a1520', '#152850', '#245888', '#3290b8', '#52c0d4']

/**
 * Returns a Mapbox GL `step` expression that maps each quintile band
 * to a distinct colour. Falls back to continuous interpolation if no
 * thresholds are supplied.
 */
export function thermalColorExpression (property = 'kpi_day', thresholds = null) {
  if (thresholds) {
    const [q20, q40, q60, q80] = thresholds
    return [
      'step', ['get', property],
      DAY_COLORS[0],
      q20, DAY_COLORS[1],
      q40, DAY_COLORS[2],
      q60, DAY_COLORS[3],
      q80, DAY_COLORS[4],
    ]
  }
  // Fallback: continuous gradient
  return [
    'interpolate', ['linear'], ['get', property],
    0.0,  DAY_COLORS[0],
    0.35, DAY_COLORS[1],
    0.55, DAY_COLORS[2],
    0.70, DAY_COLORS[3],
    1.0,  DAY_COLORS[4],
  ]
}

/**
 * Returns a Mapbox GL `step` expression for nighttime safety score.
 */
export function safetyColorExpression (property = 'kpi_night', thresholds = null) {
  if (thresholds) {
    const [q20, q40, q60, q80] = thresholds
    return [
      'step', ['get', property],
      NIGHT_COLORS[0],
      q20, NIGHT_COLORS[1],
      q40, NIGHT_COLORS[2],
      q60, NIGHT_COLORS[3],
      q80, NIGHT_COLORS[4],
    ]
  }
  return [
    'interpolate', ['linear'], ['get', property],
    0.0,  NIGHT_COLORS[0],
    0.20, NIGHT_COLORS[1],
    0.40, NIGHT_COLORS[2],
    0.60, NIGHT_COLORS[3],
    1.0,  NIGHT_COLORS[4],
  ]
}

/** Named band colours for use in legend and panel */
export const BAND_COLORS = {
  day:   DAY_COLORS,
  night: NIGHT_COLORS,
}

// ─── Leaderboard ── per-segment ranking ──────────────────────────────────────

/**
 * Returns the top N and bottom N individual road segments by KPI score.
 * Each entry is the raw GeoJSON feature (geometry + properties preserved)
 * so the caller can highlight it on the map via onSegmentClick.
 */
export function getLeaderboard (features, mode = 'day', n = 5) {
  const prop   = mode === 'day' ? 'kpi_day' : 'kpi_night'
  // Exclude known non-pedestrian infrastructure (highways, freeways)
  const EXCLUDE = new Set(['EASTERN'])
  const filtered = features.filter(f => !EXCLUDE.has(f.properties.street_name))
  const sorted = filtered.slice().sort((a, b) => b.properties[prop] - a.properties[prop])
  return {
    top:    sorted.slice(0, n),
    bottom: sorted.slice(-n).reverse(),
  }
}

/**
 * Returns quintile thresholds and band counts.
 * Bands: bottom20 | belowAvg | avg | aboveAvg | top20
 */
export function getStats (features, mode = 'day') {
  const prop = mode === 'day' ? 'kpi_day' : 'kpi_night'
  const vals  = features.map(f => f.properties[prop]).sort((a, b) => a - b)
  const n     = vals.length

  const percentile = (p) => vals[Math.floor(p * n)] ?? vals[n - 1]

  const q20 = percentile(0.20)
  const q40 = percentile(0.40)
  const q60 = percentile(0.60)
  const q80 = percentile(0.80)

  const mean = vals.reduce((a, b) => a + b, 0) / n

  const bottom20  = vals.filter(v => v <  q20).length
  const belowAvg  = vals.filter(v => v >= q20 && v < q40).length
  const avg       = vals.filter(v => v >= q40 && v < q60).length
  const aboveAvg  = vals.filter(v => v >= q60 && v < q80).length
  const top20     = vals.filter(v => v >= q80).length

  return {
    mean:     Math.round(mean * 100),
    total:    n,
    q20, q40, q60, q80,
    bands: { bottom20, belowAvg, avg, aboveAvg, top20 },
    pctBottom20:  Math.round((bottom20 / n) * 100),
    pctBelowAvg:  Math.round((belowAvg  / n) * 100),
    pctAvg:       Math.round((avg       / n) * 100),
    pctAboveAvg:  Math.round((aboveAvg  / n) * 100),
    pctTop20:     Math.round((top20     / n) * 100),
  }
}

/** Classify a single value into its quintile band label. */
export function quintileLabel (val, stats) {
  if (val >= stats.q80) return 'Top 20%'
  if (val >= stats.q60) return 'Above Avg'
  if (val >= stats.q40) return 'Average'
  if (val >= stats.q20) return 'Below Avg'
  return 'Bottom 20%'
}

export function segmentNarrative (feature, mode) {
  const p = feature.properties
  if (mode === 'day') {
    const parts = []
    if (p.slope_penalty < 0.6)  parts.push('steep')
    if (p.canopy_cover  < 0.2)  parts.push('no shade')
    if (p.surface_temp  > 38)   parts.push(`${p.surface_temp}\u00b0C`)
    if (p.canopy_cover  > 0.7)  parts.push('shaded')
    if (p.slope_penalty > 0.9)  parts.push('flat')
    if (p.surface_temp  < 33)   parts.push('cooler')
    return parts.length > 0 ? parts.join(' \xb7 ') : 'mixed'
  } else {
    const parts = []
    if (p.min_lux   < 5)        parts.push('near-dark')
    if (p.min_lux   > 50)       parts.push(`${p.min_lux} lux`)
    if (p.night_poi === 0)      parts.push('no venues')
    if (p.night_poi > 10)       parts.push(`${p.night_poi} venues`)
    return parts.length > 0 ? parts.join(' \xb7 ') : 'low activity'
  }
}

/** Axes for the radar / spider chart — 5 dimensions. */
export const RADAR_AXES = [
  { key: '_s_slope',  label: 'Slope',    description: 'Terrain penalty — Tobler from 5m DEM' },
  { key: '_s_shade',  label: 'Shade',    description: 'Tree canopy + SVF blend, sqrt-normalised (20m buffer)' },
  { key: '_s_temp',   label: 'Comfort',  description: 'Inverted surface temperature' },
  { key: '_s_lux',    label: 'Lighting', description: 'Min-lux safety score' },
  { key: '_s_night',  label: 'Activity', description: 'Night-time venue density' },
]
