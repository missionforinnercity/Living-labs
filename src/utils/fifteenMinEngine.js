/**
 * 15-Minute City Equity Gap Engine — v3 "Story Scenarios"
 *
 * New in v3:
 *  - SCENARIOS: pre-defined story questions that replace raw category pills
 *  - Tree Canopy index: segments under canopy get heat-friction relief
 *  - Night filter: POI types filtered to those plausibly open at a given hour
 *  - Amplified Tobler: vulnerable-walker mode doubles the slope penalty
 *  - Baseline vs True-Effort: each scenario runs both modes for "shrinkage" story
 */

// ─────────────────────────────────────────────────────────────────────────────
// Walk-time tiers
// ─────────────────────────────────────────────────────────────────────────────

export const WALK_TIERS = [
  { minutes:  5, maxM:  400, opacity: 1.00, label: '≤5 min'  },
  { minutes:  8, maxM:  640, opacity: 0.80, label: '≤8 min'  },
  { minutes: 10, maxM:  800, opacity: 0.60, label: '≤10 min' },
  { minutes: 12, maxM:  960, opacity: 0.40, label: '≤12 min' },
  { minutes: 15, maxM: 1200, opacity: 0.22, label: '≤15 min' },
]

const WALK_SPEED_M_PER_MIN = 80
const WALK_MINUTES         = 15
export const WALK_RADIUS_M = WALK_SPEED_M_PER_MIN * WALK_MINUTES  // 1 200 m

// ─────────────────────────────────────────────────────────────────────────────
// POI category definitions (internal — used by scenarios)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAP = {
  grocery:    { poi_types: ['grocery_store','supermarket','food_store','market','butcher_shop','food'],            source: 'poi' },
  pharmacy:   { poi_types: ['pharmacy','drugstore'],                                                              source: 'poi' },
  health:     { poi_types: ['hospital','doctor','health','dental_clinic','dentist','medical_lab','physiotherapist'], source: 'poi' },
  education:  { poi_types: ['school','secondary_school','university','library','preschool'],                      source: 'poi' },
  park:       { poi_types: ['park','garden','athletic_field','skateboard_park','sports_complex'],                 source: 'both' },
  nightlife:  { poi_types: ['restaurant','bar','cafe','coffee_shop','hotel','fast_food_restaurant','food'],       source: 'poi' },
}

// POI types that plausibly stay open at night / 24h
const NIGHT_OPEN_TYPES = new Set([
  'restaurant','bar','cafe','coffee_shop','hotel','lodging',
  'night_club','nightclub','fast_food_restaurant','convenience_store',
  'liquor_store','food_store','food',
])
const ALWAYS_OPEN_TYPES = new Set([
  'pharmacy','hospital','emergency_room','drugstore',
])

// ─────────────────────────────────────────────────────────────────────────────
// Story Scenario definitions
// ─────────────────────────────────────────────────────────────────────────────

export const SCENARIOS = [
  {
    id:          'dignity',
    title:       'The Dignity Walk',
    question:    'Which essential services sit within 15 minutes of a walk that is actually dignified — shaded, well-networked, and not a furnace?',
    reveal:      'Surface heat, poor network integration, and treeless streets shrink the effective 15-minute city by 40–70%. Distance alone is a lie.',
    icon:        '🚶',
    color:       '#22c55e',
    categoryIds: ['grocery','pharmacy','health'],
    timeOfDay:   9,
    frictionOverrides: { toblerEnabled: true, heatEnabled: true, lightEnabled: false, networkEnabled: true },
    canopy:      true,
  },
  {
    id:          'sunset',
    title:       'The Sunset Disappearance',
    question:    `How much of the 15-minute city survives after 10 PM — when most of Cape Town's inner city "dies"?`,
    reveal:      'After dark, unlit streets and closed daytime services leave CBD residents in a "night-time food desert." This is the residential resilience gap.',
    icon:        '🌙',
    color:       '#818cf8',
    categoryIds: ['grocery','pharmacy','health'],
    timeOfDay:   22,
    nightFilter: true,
    frictionOverrides: { toblerEnabled: true, heatEnabled: false, lightEnabled: true, networkEnabled: true },
    canopy:      false,
  },
  {
    id:          'heat',
    title:       'The Summer Heat Tax',
    question:    'On a 40 °C Cape Town afternoon with no shade, which services survive the heat tax on walking?',
    reveal:      'Without tree canopy or shade structures, heat turns short distances into health risks. Tree canopy is infrastructure. Its absence is an equity issue.',
    icon:        '🌡',
    color:       '#f97316',
    categoryIds: ['grocery','pharmacy','park'],
    timeOfDay:   14,
    frictionOverrides: { toblerEnabled: true, heatEnabled: true, lightEnabled: false, networkEnabled: false },
    canopy:      true,
  },
  {
    id:          'canopy',
    title:       'The Canopy Lifeline',
    question:    'Which routes to essential services run under tree canopy — the invisible infrastructure that makes summer walking viable?',
    reveal:      'Streets shaded by tree canopy reduce perceived heat time by up to 30%. Canopy coverage is as critical as road width for walkable city planning.',
    icon:        '🌳',
    color:       '#4ade80',
    categoryIds: ['grocery','pharmacy','health'],
    timeOfDay:   14,
    frictionOverrides: { toblerEnabled: true, heatEnabled: true, lightEnabled: false, networkEnabled: true },
    canopy:      true,
    highlightCanopy: true,
  },
  {
    id:          'vulnerable',
    title:       'The Vulnerable Walker',
    question:    'For an elderly resident or someone carrying groceries, does the uphills of Bo-Kaap or Vredehoek still qualify as "15-minute city"?',
    reveal:      'Doubling the Tobler slope penalty (a proxy for reduced mobility) removes hillside neighbourhoods from the 15-minute city entirely. The map flattens privilege.',
    icon:        '🧓',
    color:       '#f472b6',
    categoryIds: ['grocery','pharmacy','health'],
    timeOfDay:   9,
    amplifiedTobler: true,
    frictionOverrides: { toblerEnabled: true, heatEnabled: true, lightEnabled: false, networkEnabled: true },
    canopy:      true,
  },
  {
    id:          'emergency',
    title:       'The 2 AM Emergency',
    question:    'At 2 AM, can a CBD resident reach a pharmacy or emergency room on a dark, unfamiliar route?',
    reveal:      'After midnight the 15-minute city becomes a 30-minute gamble. Poor lighting on critical routes is not just inconvenient — it is a health infrastructure failure.',
    icon:        '🚨',
    color:       '#ef4444',
    categoryIds: ['pharmacy','health'],
    timeOfDay:   2,
    nightFilter: true,
    frictionOverrides: { toblerEnabled: true, heatEnabled: false, lightEnabled: true, networkEnabled: true },
    canopy:      false,
  },
]

// Also export category map for backwards compat
export const FMC_CATEGORIES = Object.entries(CATEGORY_MAP).map(([id, v]) => ({
  id, ...v,
  label: id.charAt(0).toUpperCase() + id.slice(1),
  color: '#64748b',
  icon:  '●',
  desc:  '',
}))

// ─────────────────────────────────────────────────────────────────────────────
// Spatial helpers
// ─────────────────────────────────────────────────────────────────────────────

function toMercator (lng, lat) {
  const R  = 6378137
  const mx = (lng * Math.PI / 180) * R
  const my = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * R
  return [mx, my]
}

function dist2sq (ax, ay, bx, by) {
  const dx = ax - bx; const dy = ay - by
  return dx * dx + dy * dy
}

function getVertices (feature) {
  const g = feature.geometry
  if (!g) return []
  if (g.type === 'LineString')      return g.coordinates
  if (g.type === 'MultiLineString') return g.coordinates.flat()
  return []
}

// ─────────────────────────────────────────────────────────────────────────────
// Tobler's Hiking Function + Synthetic Cape Town DEM
// ─────────────────────────────────────────────────────────────────────────────

export function toblerSpeed (slope, amplification = 1.0) {
  // amplification > 1 = slower walker (elderly, mobility impaired)
  const effectiveSlope = slope * amplification
  const base = 6 * Math.exp(-3.5 * Math.abs(effectiveSlope + 0.05 * amplification))
  return Math.max(0.3, base)  // floor at 0.3 km/h to prevent infinite time
}

export const TOBLER_FLAT_MPM = toblerSpeed(0) * 1000 / 60

export function syntheticElevation (lat, lng) {
  const latDelta   = Math.max(0, -lat - 33.907)
  const southElev  = latDelta * 3400
  const lngDelta   = Math.max(0, 18.418 - lng)
  const hillWeight = Math.max(0, Math.min(1, (-lat - 33.910) / 0.020))
  const westElev   = lngDelta * 3000 * hillWeight
  return southElev + westElev
}

function computeSegmentSlope (vertices) {
  if (vertices.length < 2) return 0
  let totalHoriz = 0, totalVertical = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const [lng1, lat1] = vertices[i]
    const [lng2, lat2] = vertices[i + 1]
    const [mx1, my1]   = toMercator(lng1, lat1)
    const [mx2, my2]   = toMercator(lng2, lat2)
    const horiz        = Math.sqrt((mx2 - mx1) ** 2 + (my2 - my1) ** 2)
    const deltaElev    = syntheticElevation(lat2, lng2) - syntheticElevation(lat1, lng1)
    totalHoriz   += horiz
    totalVertical += deltaElev
  }
  return totalHoriz > 0 ? totalVertical / totalHoriz : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Night-time POI filter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * At night (18:00–06:00), only keep POIs that plausibly stay open.
 * Uses type heuristics since we have no actual opening-hours data.
 */
export function filterPoiForTime (poiFC, timeOfDay, nightFilter = false) {
  if (!nightFilter) return poiFC
  const isNight = timeOfDay >= 18 || timeOfDay < 6

  return {
    ...poiFC,
    features: poiFC.features.filter(f => {
      const t = f.properties.primaryType
      if (ALWAYS_OPEN_TYPES.has(t)) return true
      if (isNight) return NIGHT_OPEN_TYPES.has(t)
      return true
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Facility centroid extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractPoiCentroids (poiFC, typeSet) {
  const pts = []
  for (const f of poiFC.features) {
    if (!f.geometry) continue
    if (!typeSet.has(f.properties.primaryType)) continue
    const g = f.geometry
    let lng, lat
    if (g.type === 'Point') {
      ;[lng, lat] = g.coordinates
    } else if (g.type === 'MultiPoint' && g.coordinates.length > 0) {
      let sumLng = 0, sumLat = 0
      for (const [lo, la] of g.coordinates) { sumLng += lo; sumLat += la }
      lng = sumLng / g.coordinates.length
      lat = sumLat / g.coordinates.length
    } else {
      continue
    }
    pts.push(toMercator(lng, lat))
  }
  return pts
}

function extractParkCentroids (parksFC) {
  const pts = []
  if (!parksFC?.features) return pts
  for (const f of parksFC.features) {
    const g = f.geometry
    if (!g) continue
    const rings = g.type === 'Polygon'
      ? [g.coordinates[0]]
      : g.type === 'MultiPolygon'
        ? g.coordinates.map(poly => poly[0])
        : []
    let sumX = 0, sumY = 0, n = 0
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        const [mx, my] = toMercator(lng, lat)
        sumX += mx; sumY += my; n++
      }
    }
    if (n > 0) pts.push([sumX / n, sumY / n])
  }
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid spatial index — facilities
// ─────────────────────────────────────────────────────────────────────────────

function buildGridIndex (points, cellSize) {
  const idx = { cells: new Map(), cellSize, points }
  for (let i = 0; i < points.length; i++) {
    const [mx, my] = points[i]
    const cx = Math.floor(mx / cellSize)
    const cy = Math.floor(my / cellSize)
    const key = `${cx},${cy}`
    if (!idx.cells.has(key)) idx.cells.set(key, [])
    idx.cells.get(key).push(i)
  }
  return idx
}

function minDistToFacility (index, qx, qy, searchM) {
  const { cells, cellSize, points } = index
  const cx   = Math.floor(qx / cellSize)
  const cy   = Math.floor(qy / cellSize)
  const span = Math.ceil(searchM / cellSize) + 1
  let best   = Infinity
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const bucket = cells.get(`${cx + dx},${cy + dy}`)
      if (!bucket) continue
      for (const i of bucket) {
        const d = dist2sq(qx, qy, points[i][0], points[i][1])
        if (d < best) best = d
      }
    }
  }
  return best === Infinity ? Infinity : Math.sqrt(best)
}

// ─────────────────────────────────────────────────────────────────────────────
// Friction spatial index (general: centroid-based MultiLineString FCs)
// ─────────────────────────────────────────────────────────────────────────────

function buildFrictionIndex (fc, valueExtractor, cellSize = 500) {
  const cells = new Map(), entries = []
  if (!fc?.features) return { cells, cellSize, entries }
  for (const f of fc.features) {
    const verts = getVertices(f)
    if (!verts.length) continue
    let sx = 0, sy = 0
    for (const [lng, lat] of verts) { const [mx, my] = toMercator(lng, lat); sx += mx; sy += my }
    const cx = sx / verts.length, cy = sy / verts.length
    const gx = Math.floor(cx / cellSize), gy = Math.floor(cy / cellSize)
    const key = `${gx},${gy}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(entries.length)
    entries.push({ mx: cx, my: cy, attrs: valueExtractor(f) })
  }
  return { cells, cellSize, entries }
}

function lookupNearest (index, qx, qy, searchM = 800) {
  const { cells, cellSize, entries } = index
  if (!entries?.length) return null
  const cx = Math.floor(qx / cellSize), cy = Math.floor(qy / cellSize)
  const span = Math.ceil(searchM / cellSize) + 1
  let bestD = Infinity, best = null
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const bucket = cells.get(`${cx + dx},${cy + dy}`)
      if (!bucket) continue
      for (const i of bucket) {
        const e = entries[i]
        const d = dist2sq(qx, qy, e.mx, e.my)
        if (d < bestD) { bestD = d; best = e.attrs }
      }
    }
  }
  return best
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree Canopy index — polygons already in Web Mercator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a canopy proximity index from tree_canopy.geojson (Mercator polygons).
 * Stores centroid + approx radius = sqrt(area / π) for each polygon.
 */
export function buildCanopyIndex (canopyFC) {
  if (!canopyFC?.features) return null
  const cellSize = 50  // small cell for tight canopy polygons
  const cells = new Map(), entries = []

  for (const f of canopyFC.features) {
    const g = f.geometry
    if (!g) continue
    const area = f.properties.Shape__Area || 1
    const radius = Math.sqrt(area / Math.PI)

    // Collect all ring vertices to compute centroid (coords are already Mercator)
    const allRings = g.type === 'Polygon'
      ? [g.coordinates[0]]
      : g.type === 'MultiPolygon'
        ? g.coordinates.map(p => p[0])
        : []
    if (!allRings.length) continue

    let sx = 0, sy = 0, n = 0
    for (const ring of allRings) {
      for (const [mx, my] of ring) { sx += mx; sy += my; n++ }
    }
    if (n === 0) continue
    const cx = sx / n, cy = sy / n

    const gx = Math.floor(cx / cellSize), gy = Math.floor(cy / cellSize)
    const key = `${gx},${gy}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key).push(entries.length)
    entries.push({ mx: cx, my: cy, radius })
  }
  return { cells, cellSize, entries }
}

/**
 * Returns true if the point (qx, qy) [Mercator] is within any canopy polygon radius.
 */
function isUnderCanopy (canopyIdx, qx, qy) {
  if (!canopyIdx?.entries?.length) return false
  const { cells, cellSize, entries } = canopyIdx
  const searchM = 100  // only look nearby
  const cx = Math.floor(qx / cellSize), cy = Math.floor(qy / cellSize)
  const span = Math.ceil(searchM / cellSize) + 1
  for (let dx = -span; dx <= span; dx++) {
    for (let dy = -span; dy <= span; dy++) {
      const bucket = cells.get(`${cx + dx},${cy + dy}`)
      if (!bucket) continue
      for (const i of bucket) {
        const e = entries[i]
        const d = Math.sqrt(dist2sq(qx, qy, e.mx, e.my))
        if (d <= e.radius) return true
      }
    }
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Friction builder helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSurfaceTempIndex (fc) {
  if (!fc?.features) return null
  const enriched = {
    ...fc,
    features: fc.features.map(f => {
      const arr = f.properties.summer_temperatures
      let maxTemp = 40
      if (Array.isArray(arr) && arr.length) {
        maxTemp = arr.reduce((m, t) => ((t?.temperature_mean ?? 0) > m ? t.temperature_mean : m), 0)
      }
      return { ...f, properties: { ...f.properties, max_summer_temp: maxTemp } }
    })
  }
  return buildFrictionIndex(enriched, f => ({ max_summer_temp: f.properties.max_summer_temp }))
}

function buildGreeneryIndex (fc) {
  return buildFrictionIndex(fc, f => ({
    vegetation_index: f.properties.vegetation_index ?? 0.15,
    sky_view_factor:  f.properties.sky_view_factor  ?? 0.65,
  }))
}

function buildLightingIndex (fc) {
  return buildFrictionIndex(fc, f => ({ mean_lux: f.properties.mean_lux ?? 30 }))
}

function buildNetworkIndex (fc) {
  return buildFrictionIndex(fc, f => ({
    cc_harmonic_400:    f.properties.cc_harmonic_400    ?? 0.20,
    cc_betweenness_400: f.properties.cc_betweenness_400 ?? 0,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Friction multiplier functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heat friction. Tree canopy reduces heat penalty by 70%.
 * Cape Town CBD summer temps: 35.9–45.4 °C (median 40.8 °C).
 */
function heatFriction (greeneryAttrs, surfaceAttrs, underCanopy) {
  const vegIdx  = greeneryAttrs?.vegetation_index ?? 0.20
  const maxTemp = surfaceAttrs?.max_summer_temp   ?? 40.0

  const tempFactor  = Math.max(0, Math.min(1, (maxTemp - 40.0) / 5.0))
  // canopy OR existing vegetation reduces shade factor
  const effectiveVeg = underCanopy ? Math.max(vegIdx, 0.50) : vegIdx
  const shadeFactor  = Math.max(0, Math.min(1, (0.25 - effectiveVeg) / 0.25))

  return 1 + 0.35 * tempFactor * shadeFactor
}

function lightingFriction (lightingAttrs, timeOfDay) {
  const isEvening = timeOfDay >= 18 || timeOfDay < 6
  if (!isEvening || !lightingAttrs) return 1.0
  const lux       = lightingAttrs.mean_lux ?? 30
  const luxFactor = Math.max(0, Math.min(1, (15 - lux) / 15))
  return 1 + 0.30 * luxFactor
}

function networkFriction (networkAttrs) {
  if (!networkAttrs) return 1.0
  const harmonic   = networkAttrs.cc_harmonic_400 ?? 0.20
  const normalized = Math.max(0, Math.min(1, (harmonic - 0.03) / 0.25))
  return 1 + 0.35 * (1 - normalized)
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment classification
// ─────────────────────────────────────────────────────────────────────────────

function classifySegmentClassic (feature, facilityIndex) {
  const verts = getVertices(feature)
  if (!verts.length) return { tier: null, maxDistM: Infinity }
  let maxDistM = 0
  const SEARCH_M = WALK_RADIUS_M * 1.1
  for (const [lng, lat] of verts) {
    const [mx, my] = toMercator(lng, lat)
    const d = minDistToFacility(facilityIndex, mx, my, SEARCH_M)
    if (d > WALK_RADIUS_M) return { tier: null, maxDistM: d }
    if (d > maxDistM) maxDistM = d
  }
  const tier = WALK_TIERS.find(t => maxDistM <= t.maxM) ?? WALK_TIERS[WALK_TIERS.length - 1]
  return { tier, maxDistM }
}

function classifySegmentTrueEffort (
  feature, facilityIndex,
  greeneryIdx, surfaceTempIdx, lightingIdx, networkIdx, canopyIdx,
  frictionConfig, toblerAmplification = 1.0
) {
  const verts = getVertices(feature)
  if (!verts.length) return { tier: null, maxDistM: Infinity, frictionMult: 1, slopeRatio: 0, actualMins: 99, underCanopy: false }

  const slope     = frictionConfig.toblerEnabled ? computeSegmentSlope(verts) : 0
  const toblerMpm = toblerSpeed(slope, toblerAmplification) * 1000 / 60

  const mid      = verts[Math.floor(verts.length / 2)]
  const [qx, qy] = toMercator(mid[0], mid[1])

  const underCanopy  = canopyIdx ? isUnderCanopy(canopyIdx, qx, qy) : false
  const greenAttrs   = (frictionConfig.heatEnabled    && greeneryIdx)    ? lookupNearest(greeneryIdx,    qx, qy) : null
  const tempAttrs    = (frictionConfig.heatEnabled    && surfaceTempIdx) ? lookupNearest(surfaceTempIdx, qx, qy) : null
  const lightAttrs   = (frictionConfig.lightEnabled   && lightingIdx)    ? lookupNearest(lightingIdx,    qx, qy) : null
  const netAttrs     = (frictionConfig.networkEnabled && networkIdx)     ? lookupNearest(networkIdx,     qx, qy) : null

  const fHeat       = heatFriction(greenAttrs, tempAttrs, underCanopy)
  const fLight      = lightingFriction(lightAttrs, frictionConfig.timeOfDay ?? 12)
  const fNetwork    = networkFriction(netAttrs)
  const frictionMult = fHeat * fLight * fNetwork

  const effectiveRadius = WALK_MINUTES * toblerMpm / frictionMult
  const SEARCH_M        = Math.max(effectiveRadius, WALK_RADIUS_M) * 1.1

  let maxDistM = 0
  for (const [lng, lat] of verts) {
    const [mx, my] = toMercator(lng, lat)
    const d = minDistToFacility(facilityIndex, mx, my, SEARCH_M)
    if (d > effectiveRadius) {
      return { tier: null, maxDistM: d, frictionMult, slopeRatio: slope,
               actualMins: Math.round(d * frictionMult / toblerMpm), underCanopy }
    }
    if (d > maxDistM) maxDistM = d
  }

  const actualMins = maxDistM * frictionMult / toblerMpm
  const tier = WALK_TIERS.find(t => actualMins <= t.minutes) ?? WALK_TIERS[WALK_TIERS.length - 1]
  return { tier, maxDistM, frictionMult, slopeRatio: slope, actualMins, underCanopy }
}

// ─────────────────────────────────────────────────────────────────────────────
// Collect all facility points for a set of category IDs
// ─────────────────────────────────────────────────────────────────────────────

function collectFacilityPoints (categoryIds, poiFC, parksFC) {
  const pts = []
  for (const catId of categoryIds) {
    const cat = CATEGORY_MAP[catId]
    if (!cat) continue
    const typeSet = new Set(cat.poi_types)
    pts.push(...extractPoiCentroids(poiFC, typeSet))
    if (cat.source === 'both' && parksFC) {
      pts.push(...extractParkCentroids(parksFC))
    }
  }
  return pts
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export — computeScenario
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute accessibility for a Story Scenario.
 * Always runs CLASSIC mode first (baseline), then TRUE EFFORT mode.
 * Returns { classic, trueEffort } so the UI can show the "shrinkage."
 *
 * @param {object}            scenario       — one of SCENARIOS
 * @param {FeatureCollection} roadsFC
 * @param {FeatureCollection} poiFC
 * @param {FeatureCollection} parksFC
 * @param {object}            frictionData   — { greeneryFC, lightingRoadsFC, networkFC, surfaceTempFC }
 * @param {FeatureCollection} canopyFC       — tree_canopy.geojson (Mercator polygons)
 */
export function computeScenario (scenario, roadsFC, poiFC, parksFC, frictionData, canopyFC) {
  // ── Apply night filter to POI ─────────────────────────────────────────────
  const filteredPOI = filterPoiForTime(poiFC, scenario.timeOfDay, scenario.nightFilter || false)

  // ── Collect facility points ───────────────────────────────────────────────
  const facilityPts = collectFacilityPoints(scenario.categoryIds, filteredPOI, parksFC)

  const EMPTY_FC = { type: 'FeatureCollection', features: [] }

  const noFacilitiesResult = (mode) => ({
    features: { ...EMPTY_FC },
    facilityMarkers: EMPTY_FC,
    stats: {
      total: roadsFC.features.length, accessibleCount: 0,
      gapCount: roadsFC.features.length, pctCovered: 0,
      facilityCount: 0, tierCounts: {}, mode,
      slopeGaps: 0, frictionGaps: 0, canopyBonus: 0,
    }
  })

  if (facilityPts.length === 0) {
    return { classic: noFacilitiesResult('classic'), trueEffort: noFacilitiesResult('true-effort') }
  }

  const facilityIndex = buildGridIndex(facilityPts, WALK_RADIUS_M / 2)

  // ── Build friction indices ─────────────────────────────────────────────────
  const fo = scenario.frictionOverrides || {}
  const greeneryIdx    = fo.heatEnabled    ? buildGreeneryIndex(frictionData.greeneryFC)        : null
  const surfaceTempIdx = fo.heatEnabled    ? buildSurfaceTempIndex(frictionData.surfaceTempFC)  : null
  const lightingIdx    = fo.lightEnabled   ? buildLightingIndex(frictionData.lightingRoadsFC)   : null
  const networkIdx     = fo.networkEnabled ? buildNetworkIndex(frictionData.networkFC)           : null
  const canopyIdx      = (scenario.canopy && canopyFC) ? buildCanopyIndex(canopyFC) : null

  const toblerAmplification = scenario.amplifiedTobler ? 2.0 : 1.0

  const frictionConfig = {
    ...fo,
    timeOfDay: scenario.timeOfDay,
  }

  // ── Classify all segments ──────────────────────────────────────────────────
  const classicFeatures   = []
  const trueEffortFeatures = []
  const classicTiers = {}, teaTierCounts = {}
  let classicAcc = 0, classicGap = 0
  let teaAcc = 0, teaGap = 0, slopeGaps = 0, frictionGaps = 0, canopyBonus = 0

  for (const f of roadsFC.features) {
    // Classic
    const { tier: cTier, maxDistM: cDist } = classifySegmentClassic(f, facilityIndex)
    if (!cTier) {
      classicGap++
      classicFeatures.push({ ...f, properties: { ...f.properties, _fmc_minutes: 0, _fmc_opacity: 0, _fmc_dist_m: Math.round(cDist) } })
    } else {
      classicAcc++
      classicTiers[cTier.minutes] = (classicTiers[cTier.minutes] || 0) + 1
      classicFeatures.push({ ...f, properties: { ...f.properties, _fmc_minutes: cTier.minutes, _fmc_opacity: cTier.opacity, _fmc_dist_m: Math.round(cDist) } })
    }

    // True Effort
    const { tier: tTier, maxDistM: tDist, frictionMult, slopeRatio, actualMins, underCanopy } =
      classifySegmentTrueEffort(f, facilityIndex, greeneryIdx, surfaceTempIdx, lightingIdx, networkIdx, canopyIdx, frictionConfig, toblerAmplification)

    if (underCanopy) canopyBonus++

    if (!tTier) {
      teaGap++
      // Gap breakdown
      if (fo.toblerEnabled) {
        const flatR = WALK_RADIUS_M
        const verts = getVertices(f)
        let flatOK = true
        for (const [lng, lat] of verts) {
          const [mx, my] = toMercator(lng, lat)
          if (minDistToFacility(facilityIndex, mx, my, flatR * 1.1) > flatR) { flatOK = false; break }
        }
        if (flatOK) slopeGaps++
      }
      if (frictionMult > 1.05) {
        const toblerMpm0   = toblerSpeed(slopeRatio, toblerAmplification) * 1000 / 60
        const noFricR      = WALK_MINUTES * toblerMpm0
        const verts = getVertices(f)
        let nfOK = true
        for (const [lng, lat] of verts) {
          const [mx, my] = toMercator(lng, lat)
          if (minDistToFacility(facilityIndex, mx, my, noFricR * 1.1) > noFricR) { nfOK = false; break }
        }
        if (nfOK) frictionGaps++
      }
      trueEffortFeatures.push({
        ...f,
        properties: {
          ...f.properties,
          _fmc_minutes: 0, _fmc_opacity: 0,
          _fmc_dist_m: Math.round(tDist),
          _fmc_friction: Math.round(frictionMult * 100) / 100,
          _fmc_slope: Math.round(slopeRatio * 1000) / 1000,
          _fmc_actual_mins: Math.round(actualMins),
          _fmc_canopy: underCanopy ? 1 : 0,
        }
      })
    } else {
      teaAcc++
      teaTierCounts[tTier.minutes] = (teaTierCounts[tTier.minutes] || 0) + 1
      trueEffortFeatures.push({
        ...f,
        properties: {
          ...f.properties,
          _fmc_minutes: tTier.minutes, _fmc_opacity: tTier.opacity,
          _fmc_dist_m: Math.round(tDist),
          _fmc_friction: Math.round(frictionMult * 100) / 100,
          _fmc_slope: Math.round(slopeRatio * 1000) / 1000,
          _fmc_actual_mins: Math.round(actualMins || tTier.minutes),
          _fmc_canopy: underCanopy ? 1 : 0,
        }
      })
    }
  }

  const total = roadsFC.features.length

  const facilityMarkers = {
    type: 'FeatureCollection',
    features: facilityPts.map(([mx, my]) => {
      const R   = 6378137
      const lng = (mx / R) * (180 / Math.PI)
      const lat = (Math.atan(Math.exp(my / R)) * 360 / Math.PI) - 90
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }
    })
  }

  return {
    classic: {
      features: { type: 'FeatureCollection', features: classicFeatures },
      facilityMarkers,
      stats: { total, accessibleCount: classicAcc, gapCount: classicGap, pctCovered: Math.round(classicAcc / total * 100), facilityCount: facilityPts.length, tierCounts: classicTiers, mode: 'classic' }
    },
    trueEffort: {
      features: { type: 'FeatureCollection', features: trueEffortFeatures },
      facilityMarkers,
      stats: { total, accessibleCount: teaAcc, gapCount: teaGap, pctCovered: Math.round(teaAcc / total * 100), facilityCount: facilityPts.length, tierCounts: teaTierCounts, mode: 'true-effort', slopeGaps, frictionGaps, canopyBonus }
    },
    scenario,
  }
}

// Legacy export for compatibility with any existing code
export function computeAccessibility (categoryId, roadsFC, poiFC, parksFC = null, frictionConfig = null) {
  const catDef = CATEGORY_MAP[categoryId]
  if (!catDef) throw new Error(`Unknown FMC category: ${categoryId}`)
  const typeSet     = new Set(catDef.poi_types)
  let facilityPts   = extractPoiCentroids(poiFC, typeSet)
  if (catDef.source === 'both' && parksFC) facilityPts = facilityPts.concat(extractParkCentroids(parksFC))
  const EMPTY_FC = { type: 'FeatureCollection', features: [] }
  if (!facilityPts.length) {
    return { features: EMPTY_FC, facilityMarkers: EMPTY_FC, stats: { total: roadsFC.features.length, accessibleCount: 0, gapCount: roadsFC.features.length, pctCovered: 0, facilityCount: 0, tierCounts: {}, mode: 'classic' }, category: catDef }
  }
  const facilityIndex = buildGridIndex(facilityPts, WALK_RADIUS_M / 2)
  const classified = []
  const tierCounts = {}
  let acc = 0, gap = 0
  for (const f of roadsFC.features) {
    const { tier, maxDistM } = classifySegmentClassic(f, facilityIndex)
    if (!tier) { gap++; classified.push({ ...f, properties: { ...f.properties, _fmc_minutes: 0, _fmc_opacity: 0, _fmc_dist_m: Math.round(maxDistM) } }) }
    else { acc++; tierCounts[tier.minutes] = (tierCounts[tier.minutes] || 0) + 1; classified.push({ ...f, properties: { ...f.properties, _fmc_minutes: tier.minutes, _fmc_opacity: tier.opacity, _fmc_dist_m: Math.round(maxDistM) } }) }
  }
  const total = roadsFC.features.length
  return {
    features: { type: 'FeatureCollection', features: classified },
    facilityMarkers: { type: 'FeatureCollection', features: facilityPts.map(([mx, my]) => {
      const R = 6378137; const lng = (mx/R)*(180/Math.PI); const lat = (Math.atan(Math.exp(my/R))*360/Math.PI)-90
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }
    })},
    stats: { total, accessibleCount: acc, gapCount: gap, pctCovered: Math.round(acc/total*100), facilityCount: facilityPts.length, tierCounts, mode: 'classic' },
    category: catDef
  }
}
