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
 *   - Heat streets             : GET /api/climate/heat-streets (climate.heat_streets)
 *   - Night-active POI          : data/processed/business/POI_simplified.geojson
 *   - Retail-curated POI        : data/processed/business/POI_simplified.geojson  (filtered subset)
 *   - Slope (from DEM)          : data/processed/walkability/segment_slopes.json   [pre-computed]
 *   - Canopy (from tree polys)  : data/processed/walkability/segment_canopy.json   [pre-computed]
 *   - Sky View Factor            : data/greenery/greenryandSkyview.geojson           [per-segment SVF]
 *   - Traffic congestion         : data/Traffic/traffic_analysis.geojson              [vehicle volume proxy]
 *
 * v2 Logic changes (Feb 2026):
 *   1. Shade  — Max(canopy, 1−SVF) so urban enclosure (tall buildings) counts as shade
 *   2. Slope  — Retail buffer: halve slope penalty when retail-curated POI density > 5
 *   3. Temp   — Weight reduced 30→15%; new "Retail Curation" axis added at 15%
 *   4. Traffic — Segments on Low-congestion / pedestrian-zone streets get 1.3× multiplier
 *
 * Output properties per feature:
 *   kpi_day        0-1  Daytime Walkability Index
 *   kpi_night      0-1  Nighttime Walkability Index
 *   slope_penalty  0-1  Tobler slope from real DEM
 *   canopy_cover   0-1  Tree canopy fraction within 20m buffer
 *   surface_temp   °C   Heat-street modelled LST
 *   min_lux        lux  Lowest measured lux on segment
 *   night_poi      int  Night-open POIs within 150m
 *   retail_poi     int  Retail-curated POIs within 150m
 *   traffic_calm   bool Whether segment is traffic-calmed / low vehicle volume
 *   _s_slope … _s_retail  normalised component scores
 *   day_rank / night_rank  1 = best
 */

const fs   = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

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
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${process.env.API_PORT || 3001}`

function fetchJsonSync (url) {
  const body = execFileSync('curl', ['-fsS', url], { encoding: 'utf8' })
  return JSON.parse(body)
}

const segFC     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson')))
const tempFC    = fetchJsonSync(`${API_BASE_URL}/api/climate/heat-streets`)
const poiFC     = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/business/POI_simplified.geojson')))

// Pre-computed from extract-slope-canopy.py
const slopeMap  = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/walkability/segment_slopes.json')))
const canopyMap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/walkability/segment_canopy.json')))

// Sky View Factor from per-segment measurements (lower SVF = more sky blocked = more shade)
const svfFC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/greenery/greenryandSkyview.geojson')))

// Traffic congestion data — vehicle volume proxy for pedestrian safety
const trafficFC = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/Traffic/traffic_analysis.geojson')))

console.log(`Segments: ${segFC.features.length}`)
console.log(`Slope entries: ${Object.keys(slopeMap).length}`)
console.log(`Canopy entries: ${Object.keys(canopyMap).length}`)
console.log(`SVF features: ${svfFC.features.length}`)
console.log(`Traffic features: ${trafficFC.features.length}`)

// ─── build indices ────────────────────────────────────────────────────────────

const tempIdx = buildGridIndex(tempFC.features, f => segmentCentroid(f.geometry))
const svfIdx  = buildGridIndex(svfFC.features,  f => segmentCentroid(f.geometry), 0.002)
const trafficIdx = buildGridIndex(trafficFC.features, f => segmentCentroid(f.geometry), 0.003)

// Night-active POI types — bars, venues, convenience for after-dark foot traffic
const NIGHT_TYPES = new Set([
  'bar', 'restaurant', 'coffee_shop', 'night_club', 'fast_food_restaurant',
  'convenience_store', 'liquor_store', 'food_store', 'food', 'cafe', 'hotel',
  'lodging'
])

// Retail-curated POI types — destinations that make people *want* to walk.
// These are quality retail/dining/culture destinations, NOT offices, doctors, banks, etc.
const RETAIL_TYPES = new Set([
  'restaurant', 'coffee_shop', 'cafe', 'bakery', 'bar',
  'art_gallery', 'clothing_store', 'jewelry_store', 'book_store',
  'grocery_store', 'food_store', 'beauty_salon', 'spa',
  'bicycle_store', 'pet_store', 'flower_shop', 'gift_shop',
  'dessert_shop', 'chocolate_shop', 'bagel_shop', 'sandwich_shop',
  'ice_cream_shop', 'juice_shop', 'confectionery', 'butcher_shop',
  'seafood_restaurant', 'thai_restaurant', 'breakfast_restaurant',
  'vegan_restaurant', 'american_restaurant', 'ramen_restaurant',
  'steak_house', 'korean_restaurant', 'mexican_restaurant',
  'chinese_restaurant', 'mediterranean_restaurant',
  'fast_food_restaurant', 'cafeteria', 'food_court',
  'movie_theater', 'opera_house', 'cultural_center', 'cultural_landmark',
  'historical_place', 'monument', 'visitor_center',
])

const nightPOI  = poiFC.features.filter(f => NIGHT_TYPES.has(f.properties.primaryType))
const retailPOI = poiFC.features.filter(f => RETAIL_TYPES.has(f.properties.primaryType))

console.log(`Night POIs: ${nightPOI.length}  |  Retail-curated POIs: ${retailPOI.length}`)

function poiCentroid (f) {
  const g = f.geometry
  return g.type === 'Point' ? g.coordinates
       : g.type === 'MultiPoint' ? g.coordinates[0]
       : segmentCentroid(g)
}

const nightPOIIdx  = buildGridIndex(nightPOI,  poiCentroid, 0.003)
const retailPOIIdx = buildGridIndex(retailPOI, poiCentroid, 0.003)

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

  // Heat streets + authoritative street name from nearest climate segment
  // (climate.heat_streets has user-verified street names; STR_NAME in lighting is unreliable)
  const tMatch = nearestInGrid(tempIdx, lng, lat, 500)
  let surface_temp = 32
  let streetName = props.STR_NAME || `Segment-${idx}`  // fallback only
  if (tMatch) {
    const tProps = tempFC.features[tMatch.i].properties
    if (tProps.street_name) streetName = tProps.street_name  // authoritative name
    const directTemp = Number(tProps.mean_heat_model_lst_c ?? tProps.surface_temp ?? tProps.overall_max_temp)
    if (Number.isFinite(directTemp)) surface_temp = directTemp
    const arr = tProps.summer_temperatures
    if (Array.isArray(arr) && arr.length > 0) {
      const peak = arr.reduce((a, b) =>
        (b.temperature_mean > a.temperature_mean ? b : a), arr[0])
      surface_temp = peak.temperature_mean
    }
  }

  // Night POI count within 150m
  const night_poi = countInRadius(nightPOIIdx, lng, lat, 150)

  // Retail-curated POI count within 150m (restaurants, bakeries, galleries, etc.)
  const retail_poi = countInRadius(retailPOIIdx, lng, lat, 150)

  // Traffic calm — match nearest traffic segment within 100m.
  // Convert congestion level to a continuous score:
  //   Unknown (likely ped zones / malls)  → 1.15  (modest boost)
  //   Low                                 → 1.00  (baseline)
  //   Med                                 → 0.92  (light penalty)
  //   High                                → 0.80  (significant penalty)
  const trafficMatch = nearestInGrid(trafficIdx, lng, lat, 100)
  let traffic_calm  = false
  let congestion_level = 'Low'   // default if no match
  let trafficScore = 1.0
  if (trafficMatch) {
    congestion_level = trafficFC.features[trafficMatch.i].properties.congestion_level || 'Unknown'
    if      (congestion_level === 'Unknown') { trafficScore = 1.15; traffic_calm = true }
    else if (congestion_level === 'Low')     { trafficScore = 1.00 }
    else if (congestion_level === 'Med')     { trafficScore = 0.92 }
    else if (congestion_level === 'High')    { trafficScore = 0.80 }
  }

  // Sky View Factor — lower = more shaded. Match nearest SVF segment within 80m.
  const svfMatch = nearestInGrid(svfIdx, lng, lat, 80)
  const sky_view_factor = svfMatch ? (svfFC.features[svfMatch.i].properties.sky_view_factor ?? null) : null
  // svf_shade: 1 - SVF (0 = fully open sky, 1 = fully blocked)
  const svf_shade = sky_view_factor !== null ? clamp01(1 - sky_view_factor) : null

  return {
    ...f,
    _c: [lng, lat],
    _raw: { slope_penalty, canopy_cover, surface_temp, raw_min_lux, raw_mean_lux,
            night_poi, retail_poi, streetName, svf_shade, sky_view_factor,
            traffic_calm, congestion_level, trafficScore }
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

const allRetail = features.map(f => f._raw.retail_poi)
const retailMax = Math.max(...allRetail) || 1

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
histogram(allRetail.map(v => v),                       'retail_poi    (count)')
const calmCount = features.filter(f => f._raw.traffic_calm).length
console.log(`  traffic_calm: ${calmCount} / ${features.length} segments`)

// ── score each segment ─────────────────────────────────────────────────────────

const scored = features.map(f => {
  const r = f._raw

  // ── Component scores — all 0–1, higher = better ───────────────────────

  // 1. SLOPE — Tobler penalty, WITH retail buffer.
  //    In a rich retail corridor (≥5 curated POIs within 150 m) the slope
  //    penalty is halved: people will walk uphill for a good destination.
  const rawSlope = clamp01(r.slope_penalty)
  const slopeBuffer = r.retail_poi >= 5 ? 0.5 : 1.0
  const S_slope = clamp01(rawSlope * slopeBuffer + (1 - slopeBuffer))
  //    ↑ lerps from (penalty) toward 1.0 as buffer kicks in

  // 2. SHADE — Max(canopy, 1−SVF) to recognise urban enclosure.
  //    In a CBD, tall buildings block sky (low SVF) just as effectively as
  //    trees. Using Max() means either source of shade counts.
  //    Apply sqrt so partial coverage still scores well.
  const urbanShade = r.svf_shade !== null ? r.svf_shade : 0
  const _shadeBest = Math.max(r.canopy_cover, urbanShade)
  const S_shade    = Math.sqrt(clamp01(_shadeBest))

  // 3. SURFACE TEMPERATURE — inverted, min-max normalised.
  //    Weight reduced from 30% → 15% because in Cape Town people walk on
  //    the shady side (captured by shade score) rather than not walking.
  const S_temp = clamp01(1 - (r.surface_temp - tempMin) / tempRange)

  // 4. RETAIL CURATION — new axis.
  //    Quality of the walk: restaurants, bakeries, galleries, etc. within
  //    150 m. Normalised 0–1, sqrt transform so even a few good shops help.
  const S_retail = Math.sqrt(clamp01(r.retail_poi / retailMax))

  // 5. TRAFFIC – continuous multiplier from congestion level
  //    Unknown→1.15  Low→1.0  Med→0.92  High→0.80
  const trafficMultiplier = r.trafficScore

  // 6. LIGHTING (unchanged)
  const S_lux   = clamp01((r.raw_min_lux - luxMin) / luxRange)

  // 7. NIGHT ACTIVITY (unchanged)
  const S_night = clamp01(r.night_poi / nightMax)

  // ── Composite KPIs ────────────────────────────────────────────────────
  // Wₐ (daytime):  35% Slope · 25% Shade · 15% Temp⁻¹ · 25% Retail
  //    Then × traffic multiplier (Unknown 1.15, Low 1.0, Med 0.92, High 0.80), capped at 1.0
  const kpi_day_raw = 0.35 * S_slope + 0.25 * S_shade + 0.15 * S_temp + 0.25 * S_retail
  const kpi_day     = round2(Math.min(1, kpi_day_raw * trafficMultiplier))

  // Wₙ (nighttime): 45% Min-Lux · 30% Night-Activity · 25% Slope
  //    Slope kept higher at night (safety on inclines in the dark).
  const kpi_night = round2(0.45 * S_lux + 0.30 * S_night + 0.25 * S_slope)

  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      street_name:     r.streetName,
      kpi_day,
      kpi_night,
      slope_penalty:   round2(rawSlope),
      canopy_cover:    round2(r.canopy_cover),
      sky_view_factor: r.sky_view_factor !== null ? round2(r.sky_view_factor) : null,
      surface_temp:    round2(r.surface_temp),
      min_lux:         round2(r.raw_min_lux),
      night_poi:       r.night_poi,
      retail_poi:      r.retail_poi,
      traffic_calm:    r.traffic_calm,
      congestion_level: r.congestion_level,
      _s_slope:        round2(S_slope),
      _s_shade:        round2(S_shade),
      _s_temp:         round2(S_temp),
      _s_retail:       round2(S_retail),
      _s_lux:          round2(S_lux),
      _s_night:        round2(S_night),
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
  console.log(`  ${String(i+1).padStart(2)}. ${p.street_name.padEnd(22)} kpi=${p.kpi_day}  slope=${p.slope_penalty}  shade=${p._s_shade}  temp=${p.surface_temp}°C  retail=${p.retail_poi}  calm=${p.traffic_calm}`)
})

console.log('\n══════ BOTTOM 10 DAYTIME (W_day) ══════')
dayRanked.slice(-10).forEach((f) => {
  const p = f.properties
  console.log(`   ↓  ${p.street_name.padEnd(22)} kpi=${p.kpi_day}  slope=${p.slope_penalty}  shade=${p._s_shade}  temp=${p.surface_temp}°C  retail=${p.retail_poi}  calm=${p.traffic_calm}`)
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
      surface_temp:    `${API_BASE_URL}/api/climate/heat-streets`,
      night_poi:       'data/processed/business/POI_simplified.geojson',
      retail_poi:      'data/processed/business/POI_simplified.geojson (curated subset)',
      traffic:         'data/Traffic/traffic_analysis.geojson',
      slope_dem:       'data/DEM/dtm5m_clipped.tif → data/processed/walkability/segment_slopes.json',
      tree_canopy:     'data/greenery/tree_canopy.geojson → data/processed/walkability/segment_canopy.json',
      sky_view_factor: 'data/greenery/greenryandSkyview.geojson',
    }
  }
}

const outPath = path.join(outDir, 'walkability_ranked.geojson')
fs.writeFileSync(outPath, JSON.stringify(output))
console.log(`\n✅ Written ${scored.length} features → ${outPath}`)
