/**
 * compute-walkability.cjs
 *
 * Pre-process all data sources into a single walkability_ranked.geojson.
 *
 * Run order:
 *   1. python3 scripts/extract-slope-canopy.py   ← real DEM slope + tree canopy
 *   2. node scripts/compute-walkability.cjs       ← this file
 *
 * Data sources consumed:
 *   - Road segments + lighting : data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson
 *   - Surface temperature      : data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson
 *   - Night-active POI          : data/processed/business/POI_simplified.geojson
 *   - Slope (from DEM)          : data/processed/walkability/segment_slopes.json   [pre-computed]
 *   - Canopy (from tree polys)  : data/processed/walkability/segment_canopy.json   [pre-computed]
 *   - Sky View Factor            : data/greenery/greenryandSkyview.geojson           [per-segment SVF]
 *
 * Output properties per feature:
 *   kpi_day       0-1  Daytime Walkability Index
 *   kpi_night     0-1  Nighttime Walkability Index
 *   slope_penalty 0-1  Tobler slope from real DEM
 *   canopy_cover  0-1  Tree canopy fraction within 20m buffer
 *   surface_temp  °C   Peak summer temperature
 *   min_lux       lux  Lowest measured lux on segment
 *   night_poi     int  Night-open POIs within 150m
 *   _s_slope … _s_night   normalised component scores
 *   day_rank / night_rank  1 = best
 */

const fs   = require('fs')
const path = require('path')

// ─── helpers ──────────────────────────────────────────────────────────────────

const R = 6371000

function toRad (d) { return d * Math.PI / 180 }

function haversine (lng1, lat1, lng2, lat2) {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function segmentCentroid (geom) {
  const coords = geom.type === 'MultiLineString'
    ? geom.coordinates.flat()
    : geom.coordinates
  const n = coords.length
  const lng = coords.reduce((s, c) => s + c[0], 0) / n
  const lat = coords.reduce((s, c) => s + c[1], 0) / n
  return [lng, lat]
}

function buildGridIndex (features, centroidFn, cellSize = 0.005) {
  const grid = {}
  features.forEach((f, i) => {
    const [lng, lat] = centroidFn(f)
    const key = `${Math.floor(lng / cellSize)}:${Math.floor(lat / cellSize)}`
    if (!grid[key]) grid[key] = []
    grid[key].push({ i, lng, lat })
  })
  return { grid, cellSize }
}

function nearestInGrid (index, lng, lat, maxDist = 600) {
  const { grid, cellSize } = index
  const cx = Math.floor(lng / cellSize)
  const cy = Math.floor(lat / cellSize)
  let best = null, bestDist = maxDist
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      ;(grid[`${cx + dx}:${cy + dy}`] || []).forEach(item => {
        const d = haversine(lng, lat, item.lng, item.lat)
        if (d < bestDist) { bestDist = d; best = item }
      })
    }
  }
  return best ? { ...best, dist: bestDist } : null
}

function countInRadius (index, lng, lat, radius = 150) {
  const { grid, cellSize } = index
  const cx = Math.floor(lng / cellSize)
  const cy = Math.floor(lat / cellSize)
  let count = 0
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      ;(grid[`${cx + dx}:${cy + dy}`] || []).forEach(item => {
        if (haversine(lng, lat, item.lng, item.lat) <= radius) count++
      })
    }
  }
  return count
}

function clamp01 (v) { return Math.max(0, Math.min(1, v)) }
function round2 (v) { return Math.round(v * 100) / 100 }

// ─── load data ────────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..')

const segFC     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson')))
const tempFC    = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson')))
const poiFC     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/business/POI_simplified.geojson')))

// Pre-computed from extract-slope-canopy.py
const slopeMap  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/walkability/segment_slopes.json')))
const canopyMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/walkability/segment_canopy.json')))

// Sky View Factor from per-segment measurements (lower SVF = more sky blocked = more shade)
const svfFC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/greenery/greenryandSkyview.geojson')))

console.log(`Segments: ${segFC.features.length}`)
console.log(`Slope entries: ${Object.keys(slopeMap).length}`)
console.log(`Canopy entries: ${Object.keys(canopyMap).length}`)
console.log(`SVF features: ${svfFC.features.length}`)

// ─── build indices ────────────────────────────────────────────────────────────

const tempIdx = buildGridIndex(tempFC.features, f => segmentCentroid(f.geometry))
const svfIdx  = buildGridIndex(svfFC.features,  f => segmentCentroid(f.geometry), 0.002)

// Night-active POI types
const NIGHT_TYPES = new Set([
  'bar', 'restaurant', 'coffee_shop', 'night_club', 'fast_food_restaurant',
  'convenience_store', 'liquor_store', 'food_store', 'food', 'cafe', 'hotel',
  'lodging'
])

const nightPOI = poiFC.features.filter(f => NIGHT_TYPES.has(f.properties.primaryType))

function poiCentroid (f) {
  const g = f.geometry
  return g.type === 'Point' ? g.coordinates
       : g.type === 'MultiPoint' ? g.coordinates[0]
       : segmentCentroid(g)
}

const nightPOIIdx = buildGridIndex(nightPOI, poiCentroid, 0.003)

// ─── compute per-segment scores ───────────────────────────────────────────────

const features = segFC.features.map((f, idx) => {
  const geom  = f.geometry
  const props = f.properties
  const [lng, lat] = segmentCentroid(geom)

  // Slope from real DEM (pre-computed Tobler penalty)
  const slope_penalty = slopeMap[String(idx)] ?? 1.0

  // Canopy from real tree polygon intersection (pre-computed)
  const canopy_cover = canopyMap[String(idx)] ?? 0.0

  // Lux from lighting data
  const raw_min_lux  = props.min_lux != null ? props.min_lux : 0
  const raw_mean_lux = props.mean_lux != null ? props.mean_lux : 0

  // Surface temperature + authoritative street name from nearest surface-temp segment
  // (surface temp dataset has user-verified correct street names; STR_NAME in lighting is unreliable)
  const tMatch = nearestInGrid(tempIdx, lng, lat, 500)
  let surface_temp = 32
  let streetName = props.STR_NAME || `Segment-${idx}`  // fallback only
  if (tMatch) {
    const tProps = tempFC.features[tMatch.i].properties
    if (tProps.street_name) streetName = tProps.street_name  // authoritative name
    const arr = tProps.summer_temperatures
    if (Array.isArray(arr) && arr.length > 0) {
      const peak = arr.reduce((a, b) =>
        (b.temperature_mean > a.temperature_mean ? b : a), arr[0])
      surface_temp = peak.temperature_mean
    }
  }

  // Night POI count within 150m
  const night_poi = countInRadius(nightPOIIdx, lng, lat, 150)

  // Sky View Factor — lower = more shaded. Match nearest SVF segment within 80m.
  const svfMatch = nearestInGrid(svfIdx, lng, lat, 80)
  const sky_view_factor = svfMatch ? (svfFC.features[svfMatch.i].properties.sky_view_factor ?? null) : null
  // svf_shade: 1 - SVF (0 = fully open sky, 1 = fully blocked)
  const svf_shade = sky_view_factor !== null ? clamp01(1 - sky_view_factor) : null

  return {
    ...f,
    _c: [lng, lat],
    _raw: { slope_penalty, canopy_cover, surface_temp, raw_min_lux, raw_mean_lux, night_poi, streetName, svf_shade, sky_view_factor }
  }
})

// ── normalise temperature (invert: higher temp = lower) ───────────────────────

const allTemps  = features.map(f => f._raw.surface_temp)
const tempMin   = Math.min(...allTemps)
const tempMax   = Math.max(...allTemps)
const tempRange = tempMax - tempMin || 1

const allLux    = features.map(f => f._raw.raw_min_lux)
const luxMin    = Math.min(...allLux)
const luxMax    = Math.max(...allLux)
const luxRange  = luxMax - luxMin || 1

const allNight  = features.map(f => f._raw.night_poi)
const nightMax  = Math.max(...allNight) || 1

// ── print source distribution diagnostics ────────────────────────────────────

function histogram (vals, label) {
  const min = Math.min(...vals), max = Math.max(...vals)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  const sorted = [...vals].sort((a, b) => a - b)
  const p20 = sorted[Math.floor(vals.length * 0.2)]
  const p50 = sorted[Math.floor(vals.length * 0.5)]
  const p80 = sorted[Math.floor(vals.length * 0.8)]
  console.log(`  ${label}: min=${min.toFixed(3)} p20=${p20.toFixed(3)} p50=${p50.toFixed(3)} p80=${p80.toFixed(3)} max=${max.toFixed(3)} mean=${mean.toFixed(3)}`)
}

console.log('\n── Raw Input Distributions ──')
histogram(features.map(f => f._raw.slope_penalty),  'slope_penalty (Tobler)')
histogram(features.map(f => f._raw.canopy_cover),   'canopy_cover  (tree)')
const svfVals = features.map(f => f._raw.svf_shade).filter(v => v !== null)
console.log(`  svf_shade matched: ${svfVals.length}/${features.length}`)
if (svfVals.length) histogram(svfVals, 'svf_shade     (1-SVF)')
histogram(allTemps,                                   'surface_temp  (°C)')
histogram(allLux,                                     'min_lux       (lux)')
histogram(allNight.map(v => v),                       'night_poi     (count)')

// ── score each segment ─────────────────────────────────────────────────────────

const scored = features.map(f => {
  const r = f._raw

  // Component scores — all 0-1, higher = better
  const S_slope  = clamp01(r.slope_penalty)
  // Shade: blend tree canopy (70%) + sky view factor shade (30%).
  // SVF shade covers gaps where canopy dataset is sparse; canopy is primary signal.
  // If no SVF match falls back to canopy alone.
  // Apply sqrt so partial shade gets rewarded strongly — pedestrians can walk UNDER
  // available shade, they don't need the whole street covered.
  // e.g. 25% blend → sqrt(0.25) = 0.50 score; 49% blend → sqrt(0.49) = 0.70 score.
  const _shadeBlend = r.svf_shade !== null
    ? clamp01(0.70 * r.canopy_cover + 0.30 * r.svf_shade)
    : clamp01(r.canopy_cover)
  const S_shade  = Math.sqrt(_shadeBlend)
  const S_temp   = clamp01(1 - (r.surface_temp - tempMin) / tempRange)
  const S_lux    = clamp01((r.raw_min_lux - luxMin) / luxRange)
  const S_night  = clamp01(r.night_poi / nightMax)

  // W_day: 40% slope + 30% shade + 30% temperature
  const kpi_day   = round2(0.40 * S_slope + 0.30 * S_shade + 0.30 * S_temp)

  // W_night: 50% min_lux + 30% night activity + 20% slope
  const kpi_night = round2(0.50 * S_lux + 0.30 * S_night + 0.20 * S_slope)

  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      street_name:   r.streetName,
      kpi_day,
      kpi_night,
      slope_penalty: round2(S_slope),
      canopy_cover:  round2(r.canopy_cover),
      sky_view_factor: r.sky_view_factor !== null ? round2(r.sky_view_factor) : null,
      surface_temp:  round2(r.surface_temp),
      min_lux:       round2(r.raw_min_lux),
      night_poi:     r.night_poi,
      _s_slope:      round2(S_slope),
      _s_shade:      round2(S_shade),
      _s_temp:       round2(S_temp),
      _s_lux:        round2(S_lux),
      _s_night:      round2(S_night),
    }
  }
})

// ── assign ranks ─────────────────────────────────────────────────────────────

const dayRanked   = [...scored].sort((a, b) => b.properties.kpi_day   - a.properties.kpi_day)
const nightRanked = [...scored].sort((a, b) => b.properties.kpi_night - a.properties.kpi_night)

dayRanked.forEach((f, i)   => { f.properties.day_rank   = i + 1 })
nightRanked.forEach((f, i) => { f.properties.night_rank = i + 1 })

// ── leaderboard ──────────────────────────────────────────────────────────────

console.log('\n══════ TOP 10 DAYTIME (W_day) ══════')
dayRanked.slice(0, 10).forEach((f, i) => {
  const p = f.properties
  console.log(`  ${String(i+1).padStart(2)}. ${p.street_name.padEnd(22)} kpi=${p.kpi_day}  slope=${p.slope_penalty}  shade=${p.canopy_cover}  temp=${p.surface_temp}°C`)
})

console.log('\n══════ BOTTOM 10 DAYTIME (W_day) ══════')
dayRanked.slice(-10).forEach((f) => {
  const p = f.properties
  console.log(`   ↓  ${p.street_name.padEnd(22)} kpi=${p.kpi_day}  slope=${p.slope_penalty}  shade=${p.canopy_cover}  temp=${p.surface_temp}°C`)
})

console.log('\n══════ TOP 10 NIGHTTIME (W_night) ══════')
nightRanked.slice(0, 10).forEach((f, i) => {
  const p = f.properties
  console.log(`  ${String(i+1).padStart(2)}. ${p.street_name.padEnd(22)} kpi=${p.kpi_night}  lux=${p.min_lux}  venues=${p.night_poi}`)
})

console.log('\n══════ BOTTOM 10 NIGHTTIME (W_night) ══════')
nightRanked.slice(-10).forEach((f) => {
  const p = f.properties
  console.log(`   ↓  ${p.street_name.padEnd(22)} kpi=${p.kpi_night}  lux=${p.min_lux}  venues=${p.night_poi}`)
})

// KPI distribution
console.log('\n── KPI Distributions ──')
histogram(scored.map(f => f.properties.kpi_day),   'kpi_day')
histogram(scored.map(f => f.properties.kpi_night), 'kpi_night')

// ── write output ──────────────────────────────────────────────────────────────

const outDir = path.join(ROOT, 'data/processed/walkability')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const output = {
  type: 'FeatureCollection',
  features: scored,
  metadata: {
    generated:       new Date().toISOString(),
    count:           scored.length,
    kpi_day_range:   [Math.min(...scored.map(f=>f.properties.kpi_day)),   Math.max(...scored.map(f=>f.properties.kpi_day))],
    kpi_night_range: [Math.min(...scored.map(f=>f.properties.kpi_night)), Math.max(...scored.map(f=>f.properties.kpi_night))],
    sources: {
      road_segments:   'data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson',
      surface_temp:    'data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson',
      night_poi:       'data/processed/business/POI_simplified.geojson',
      slope_dem:       'data/DEM/dtm5m_clipped.tif → data/processed/walkability/segment_slopes.json',
      tree_canopy:     'data/greenery/tree_canopy.geojson → data/processed/walkability/segment_canopy.json',
    }
  }
}

const outPath = path.join(outDir, 'walkability_ranked.geojson')
fs.writeFileSync(outPath, JSON.stringify(output))
console.log(`\n✅ Written ${scored.length} features → ${outPath}`)
