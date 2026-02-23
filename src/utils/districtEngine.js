/**
 * District Narrative Engine
 *
 * Generates "character district" polygons from POI data using DBSCAN spatial
 * clustering.  Each tight geographic cluster of same-category businesses
 * becomes its own polygon — so a city may have several Coffee clusters, several
 * Dining clusters, etc., rather than one giant hull per category.
 *
 * Scoring uses only the POI dataset itself (count, rating, opening-hours
 * presence) because external data joins (network, pedestrian, lighting) all
 * produced zero values due to spatial mismatch in the source data.
 */

import * as turf from '@turf/turf'

// ─────────────────────────────────────────────────────────────────────────────
// District category definitions
// ─────────────────────────────────────────────────────────────────────────────

export const DISTRICT_DEFINITIONS = [
  {
    id: 'caffeine',
    name: 'Coffee & Day Economy',
    tagline: 'Where the daytime city comes alive',
    narrative:
      'Cafés, bakeries and breakfast spots cluster around pedestrian-friendly ' +
      'streets. These patches anchor the daytime economy, places to linger, meet ' +
      'and work. Their density and quality signal the health of the street culture.',
    color: '#f59e0b',
    glowColor: 'rgba(245, 158, 11, 0.4)',
    fillColor: 'rgba(245, 158, 11, 0.15)',
    primaryTypes: [
      'coffee_shop', 'cafe', 'cafeteria', 'bakery',
      'dessert_shop', 'ice_cream_shop', 'bagel_shop',
      'breakfast_restaurant', 'juice_shop', 'tea_house', 'chocolate_shop'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  },
  {
    id: 'dining',
    name: 'Dining & Food',
    tagline: "The city's culinary landscape",
    narrative:
      'Restaurants, takeaways and food markets form the backbone of street-level ' +
      'economic activity. Cluster density reflects foot-traffic attractors — and ' +
      'gaps between clusters reveal under-served neighbourhoods.',
    color: '#ef4444',
    glowColor: 'rgba(239, 68, 68, 0.4)',
    fillColor: 'rgba(239, 68, 68, 0.15)',
    primaryTypes: [
      'restaurant', 'food_court',
      'pizza_restaurant', 'burger_restaurant', 'sandwich_shop', 'sushi_restaurant',
      'seafood_restaurant', 'steak_house', 'thai_restaurant', 'chinese_restaurant',
      'indian_restaurant', 'italian_restaurant', 'mexican_restaurant',
      'food', 'deli', 'food_store', 'american_restaurant', 'greek_restaurant',
      'kebab_shop', 'ramen_restaurant', 'noodle_restaurant', 'vegetarian_restaurant',
      'vegan_restaurant', 'brunch_restaurant', 'buffet_restaurant'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  },
  {
    id: 'nightlife',
    name: 'Night Economy',
    tagline: 'High-vitality after dark',
    narrative:
      "Bars, clubs and live-music venues define Cape Town's nightlife geography. " +
      'Tight clusters indicate vibrant after-dark streets; isolated single venues ' +
      'signal under-realised potential.',
    color: '#8b5cf6',
    glowColor: 'rgba(139, 92, 246, 0.4)',
    fillColor: 'rgba(139, 92, 246, 0.15)',
    primaryTypes: [
      'night_club', 'bar', 'wine_bar', 'bar_and_grill',
      'karaoke', 'cocktail_bar', 'pub', 'lounge',
      'event_venue', 'performing_arts_theater', 'movie_theater', 'opera_house',
      'sports_bar', 'hookah_bar', 'comedy_club', 'jazz_club'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  },
  {
    id: 'retail',
    name: 'Retail & Convenience',
    tagline: 'The commercial spine',
    narrative:
      'Shops, supermarkets and essential services form conveniently clustered ' +
      'retail zones. Their spatial concentration determines walkable shopping ' +
      'catchments and reveals where car-dependency becomes necessary.',
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.4)',
    fillColor: 'rgba(6, 182, 212, 0.15)',
    primaryTypes: [
      'clothing_store', 'shoe_store', 'supermarket', 'grocery_store',
      'book_store', 'electronics_store', 'hardware_store',
      'home_goods_store', 'jewelry_store', 'sporting_goods_store',
      'pharmacy', 'drugstore', 'department_store', 'shopping_mall',
      'market', 'liquor_store', 'gift_shop', 'flower_shop',
      'bicycle_store', 'pet_store', 'toy_store', 'art_gallery',
      'optical_store', 'computer_store'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  },
  {
    id: 'survival',
    name: 'Survival Hub',
    tagline: 'The high-velocity engine of the inner city',
    narrative:
      'Clustered around transit interchanges and taxi ranks, these nodes form ' +
      'the essential economy high-volume, low-margin businesses serving people ' +
      'who live and move through the inner city daily. ATMs, corner stores, ' +
      'cell-phone shops, laundries and fast takeaways compress into tight blocks. ' +
      'Their density exposes where the city\'s working poor conduct daily life on foot.',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.4)',
    fillColor: 'rgba(249, 115, 22, 0.15)',
    primaryTypes: [
      'atm', 'convenience_store', 'discount_store',
      'meal_takeaway', 'fast_food_restaurant',
      'cell_phone_store', 'mobile_phone_store',
      'bus_station', 'transit_station', 'taxi_stand',
      'money_transfer', 'check_cashing_service', 'pawn_shop',
      'variety_store', 'general_store'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  },
  {
    id: 'wellness',
    name: 'Wellness & Personal Care',
    tagline: 'Health, beauty and fitness clusters',
    narrative:
      'Hair salons, spas and gyms cluster in specific walkable nodes. Their ' +
      'concentration reflects disposable-income geography and reveals ' +
      'where the personal-care economy is strongest.',
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.4)',
    fillColor: 'rgba(16, 185, 129, 0.15)',
    primaryTypes: [
      'hair_salon', 'beauty_salon', 'fitness_center', 'spa', 'gym',
      'nail_salon', 'barber_shop', 'massage', 'yoga_studio',
      'wellness_center', 'skin_care_clinic', 'physiotherapist', 'sauna',
      'tanning_studio', 'tattoo_parlor', 'dietitian', 'acupuncturist'
    ],
    metrics: [
      { key: 'densityScore',      label: 'Density'      },
      { key: 'diversityScore',    label: 'Diversity'    },
      { key: 'lightingScore',     label: 'Lighting'     },
      { key: 'connectivityScore', label: 'Connectivity' }
    ]
  }
]

// ─────────────────────────────────────────────────────────────────────────────
// DBSCAN parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Neighbourhood radius in decimal degrees.  0.001 deg ≈ 110 m at 34°S — tight enough to give distinct patches in the CBD. */
const DBSCAN_EPS = 0.001
/** Minimum POIs to form a cluster (noise if fewer). */
const DBSCAN_MIN_PTS = 3
/** Keep only the N largest clusters per district type. */
const MAX_CLUSTERS_PER_TYPE = 7
/** Convex hull buffer in km — slight visual padding. */
const HULL_BUFFER_KM = 0.04

// ─────────────────────────────────────────────────────────────────────────────
// Spatial helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCoords (feature) {
  const geom = feature.geometry
  if (!geom) {
    const p = feature.properties
    if (p?.location?.longitude != null) return [p.location.longitude, p.location.latitude]
    return null
  }
  if (geom.type === 'Point')      return geom.coordinates
  if (geom.type === 'MultiPoint') return geom.coordinates[0] ?? null
  if (geom.type === 'LineString') {
    const mid = Math.floor(geom.coordinates.length / 2)
    return geom.coordinates[mid]
  }
  if (geom.type === 'MultiLineString') {
    const line = geom.coordinates[0]
    return line ? line[Math.floor(line.length / 2)] : null
  }
  return null
}

function avg (arr) {
  if (!arr?.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

// ─── Spatial helpers ──────────────────────────────────────────────────────────

/** WGS84 → Web Mercator [x, y] in metres */
function toMercator (lng, lat) {
  const x = lng * 20037508.342789244 / 180
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.342789244 / Math.PI
  return [x, y]
}

/**
 * Build a flat spatial index {x, y, val} from a GeoJSON FeatureCollection.
 * All coordinates are stored in Web Mercator metres.
 * @param {'lnglat'|'mercator'} crs coordinate system of the geometry
 */
function buildSpatialIndex (fc, valKey, crs) {
  if (!fc?.features?.length) return []
  const idx = []
  for (const f of fc.features) {
    const val = parseFloat(f.properties?.[valKey])
    if (isNaN(val)) continue
    let pt = null
    const geom = f.geometry
    if (!geom) {
      const px = f.properties?.x; const py = f.properties?.y
      if (px != null) pt = [px, py]
    } else if (geom.type === 'MultiLineString') {
      const seg = geom.coordinates[0]
      pt = seg?.[Math.floor((seg.length - 1) / 2)] ?? null
    } else if (geom.type === 'LineString') {
      pt = geom.coordinates[Math.floor((geom.coordinates.length - 1) / 2)]
    } else if (geom.type === 'Point') {
      pt = geom.coordinates
    }
    if (!pt) continue
    const [mx, my] = crs === 'mercator' ? [pt[0], pt[1]] : toMercator(pt[0], pt[1])
    idx.push({ x: mx, y: my, val })
  }
  return idx
}

/** Average value of K nearest index entries to a Mercator query point */
function kNearestAvg (idx, qx, qy, k = 6) {
  if (!idx.length) return null
  const heap = [] // [dist2, val]
  for (const pt of idx) {
    const d = (qx - pt.x) ** 2 + (qy - pt.y) ** 2
    if (heap.length < k) {
      heap.push([d, pt.val])
    } else {
      let maxI = 0
      for (let i = 1; i < heap.length; i++) if (heap[i][0] > heap[maxI][0]) maxI = i
      if (d < heap[maxI][0]) heap[maxI] = [d, pt.val]
    }
  }
  return heap.length ? heap.reduce((s, [, v]) => s + v, 0) / heap.length : null
}

/**
 * Build lighting quality index from road segment lux data.
 *
 * Composite score per segment:
 *   brightness    = log10(mean_lux + 1) / log10(101) × 100  (log scale, 100 lux → 100)
 *   patchPenalty  = (1 − min_lux / mean_lux) × 25            (up to −25 for dark spots)
 *   lightQuality  = clamp(0–100, brightness − patchPenalty)
 *
 * Segments with mean_lux=0 score 0. Bright, uniform segments score near 100.
 */
function buildLightingIndex (fc) {
  if (!fc?.features?.length) return []
  const idx = []
  for (const f of fc.features) {
    const meanLux = parseFloat(f.properties?.mean_lux)
    const minLux  = parseFloat(f.properties?.min_lux)
    if (isNaN(meanLux)) continue

    const brightness    = Math.min(100, (Math.log10(meanLux + 1) / Math.log10(101)) * 100)
    const patchPenalty  = meanLux > 0 ? (1 - Math.min(1, (isNaN(minLux) ? 0 : minLux) / meanLux)) * 25 : 0
    const lightQuality  = Math.max(0, Math.round(brightness - patchPenalty))

    // geometry midpoint in lat/lng → Mercator
    let pt = null
    const geom = f.geometry
    if (geom?.type === 'MultiLineString') {
      const seg = geom.coordinates[0]
      pt = seg?.[Math.floor((seg.length - 1) / 2)] ?? null
    } else if (geom?.type === 'LineString') {
      pt = geom.coordinates[Math.floor((geom.coordinates.length - 1) / 2)]
    } else if (geom?.type === 'Point') {
      pt = geom.coordinates
    }
    if (!pt) continue
    const [mx, my] = toMercator(pt[0], pt[1])
    idx.push({ x: mx, y: my, val: lightQuality })
  }
  return idx
}

// ─────────────────────────────────────────────────────────────────────────────
// DBSCAN — O(n²) fine for <500 pts per type
// ─────────────────────────────────────────────────────────────────────────────

function dbscan (coords, eps, minPts) {
  const n     = coords.length
  const label = new Int32Array(n).fill(-2) // -2=unvisited -1=noise >0=cluster
  let nextId  = 0

  function regionQuery (i) {
    const [xi, yi] = coords[i]
    const eps2 = eps * eps
    const result = []
    for (let j = 0; j < n; j++) {
      const dx = coords[j][0] - xi
      const dy = coords[j][1] - yi
      if (dx * dx + dy * dy <= eps2) result.push(j)
    }
    return result
  }

  for (let i = 0; i < n; i++) {
    if (label[i] !== -2) continue

    const nbrs = regionQuery(i)
    if (nbrs.length < minPts) { label[i] = -1; continue }

    nextId++
    label[i] = nextId

    const seeds = new Set(nbrs)
    seeds.delete(i)

    for (const j of seeds) {
      if (label[j] === -1) label[j] = nextId
      if (label[j] !== -2) continue
      label[j] = nextId
      const jNbrs = regionQuery(j)
      if (jNbrs.length >= minPts) for (const nb of jNbrs) seeds.add(nb)
    }
  }

  const groups = {}
  for (let i = 0; i < n; i++) {
    const c = label[i]
    if (c > 0) { if (!groups[c]) groups[c] = []; groups[c].push(i) }
  }
  return Object.values(groups)
}

// ─────────────────────────────────────────────────────────────────────────────
// Polygon generation
// ─────────────────────────────────────────────────────────────────────────────

function buildClusterPolygon (clusterCoords) {
  if (clusterCoords.length < 2) return null

  let polygon = null

  if (clusterCoords.length >= 3) {
    try {
      polygon = turf.convex(turf.featureCollection(clusterCoords.map(c => turf.point(c))))
    } catch { polygon = null }
  }

  if (!polygon) {
    try {
      const cx = avg(clusterCoords.map(c => c[0]))
      const cy = avg(clusterCoords.map(c => c[1]))
      polygon  = turf.buffer(turf.point([cx, cy]), 0.1, { units: 'kilometers' })
    } catch { return null }
  }

  try { polygon = turf.buffer(polygon, HULL_BUFFER_KM, { units: 'kilometers' }) } catch {}
  return polygon
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster scoring — urban metrics from POI + spatial joins
// ─────────────────────────────────────────────────────────────────────────────

function scoreCluster (features, centroidLng, centroidLat, def, lightIdx, walkIdx) {
  const count = features.length

  // 1. DENSITY — POI count, power-law scaled (5→26, 10→40, 20→63, 35→81, 60→100)
  const densityScore = Math.min(100, Math.round(Math.pow(count, 0.6) * 10))

  // 2. DIVERSITY — unique type count vs district palette (Jane Jacobs mixed-use)
  //    A cluster with all expected business types scores 100; monoculture → low.
  const uniqueTypes    = new Set(features.map(f => f.properties?.primaryType).filter(Boolean)).size
  const diversityScore = Math.min(100, Math.round((uniqueTypes / Math.max(1, def.primaryTypes.length)) * 100))

  // 3. LIGHTING — composite quality: log-brightness minus patchiness penalty
  //    Source: road_segments_lighting_kpis_all.geojson · fields: mean_lux + min_lux
  //    Bright uniform = high score; dark or patchy = low score
  let lightingScore = 50 // fallback when data unavailable
  if (lightIdx?.length) {
    const [mx, my] = toMercator(centroidLng, centroidLat)
    const raw = kNearestAvg(lightIdx, mx, my, 6)
    if (raw != null) lightingScore = Math.round(raw)
  }

  // 4. CONNECTIVITY — space-syntax pedestrian betweenness within 400 m
  //    Source: network_connectivity.geojson · field: cc_betweenness_400
  //    Normalised with empirical cap 300 (≈ p90 for Cape Town CBD)
  //    High score = many pedestrian desire-lines converge here.
  let connectivityScore = 50 // fallback
  if (walkIdx?.length) {
    const [mx, my] = toMercator(centroidLng, centroidLat)
    const raw = kNearestAvg(walkIdx, mx, my, 6)
    if (raw != null) connectivityScore = Math.min(100, Math.round((raw / 300) * 100))
  }

  const overallScore = Math.round(
    densityScore      * 0.30 +
    diversityScore    * 0.20 +
    lightingScore     * 0.25 +
    connectivityScore * 0.25
  )

  return { densityScore, diversityScore, lightingScore, connectivityScore, overallScore }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export: generateDistricts
// ─────────────────────────────────────────────────────────────────────────────

export function generateDistricts (allData) {
  const results = []

  // Build spatial indices once (reused for every cluster)
  // Lighting: composite quality score from mean_lux + min_lux (log brightness − patch penalty)
  const lightIdx = buildLightingIndex(allData.lighting)
  // Walkability nodes store projected x/y in properties — build index directly
  const walkIdx = (allData.walkability?.features ?? []).reduce((arr, f) => {
    const x   = f.properties?.x
    const y   = f.properties?.y
    const val = parseFloat(f.properties?.cc_betweenness_400)
    if (x != null && !isNaN(val)) arr.push({ x, y, val })
    return arr
  }, [])

  DISTRICT_DEFINITIONS.forEach(def => {
    const typeSet = new Set(def.primaryTypes)
    const matching = (allData.poi?.features || []).filter(f =>
      f.properties?.primaryType && typeSet.has(f.properties.primaryType)
    )
    if (matching.length < DBSCAN_MIN_PTS) return

    // Build parallel arrays of valid POIs and their coordinates
    const validPOIs   = []
    const validCoords = []
    matching.forEach(f => {
      const c = getCoords(f)
      if (c && isFinite(c[0]) && isFinite(c[1])) {
        validPOIs.push(f)
        validCoords.push(c)
      }
    })
    if (validCoords.length < DBSCAN_MIN_PTS) return

    // DBSCAN cluster → sort largest→smallest → take top N
    const groups = dbscan(validCoords, DBSCAN_EPS, DBSCAN_MIN_PTS)
      .sort((a, b) => b.length - a.length)
      .slice(0, MAX_CLUSTERS_PER_TYPE)

    const clusterLabels = ['Primary', 'Secondary', 'Cluster 3', 'Cluster 4', 'Cluster 5', 'Cluster 6', 'Cluster 7']

    groups.forEach((group, ci) => {
      const clusterCoords   = group.map(i => validCoords[i])
      const clusterFeatures = group.map(i => validPOIs[i])
      const polygon = buildClusterPolygon(clusterCoords)
      if (!polygon) return

        const centroidLng = avg(clusterCoords.map(c => c[0]))
        const centroidLat = avg(clusterCoords.map(c => c[1]))
        const scores       = scoreCluster(clusterFeatures, centroidLng, centroidLat, def, lightIdx, walkIdx)
      const clusterLabel = clusterLabels[ci] ?? `Cluster ${ci + 1}`

      // Top business types
      const breakdown = {}
      clusterFeatures.forEach(f => {
        const t = f.properties?.primaryType || 'unknown'
        breakdown[t] = (breakdown[t] || 0) + 1
      })
      const topCategories = Object.entries(breakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([type, count]) => ({ type, count }))

      results.push({
        ...polygon,
        properties: {
          districtId:   def.id,
          clusterId:    `${def.id}-${ci + 1}`,
          clusterIndex: ci,
          clusterLabel,
          name:         def.name,
          tagline:      ci === 0 ? def.tagline : `${def.tagline} — ${clusterLabel}`,
          narrative:    def.narrative,
          color:        def.color,
          glowColor:    def.glowColor,
          fillColor:    def.fillColor,
          poiCount:     clusterFeatures.length,
          topCategories: JSON.stringify(topCategories),
          ...scores
        }
      })
    })
  })

  // Sort by definition order, then cluster index
  const defOrder = Object.fromEntries(DISTRICT_DEFINITIONS.map((d, i) => [d.id, i]))
  results.sort((a, b) => {
    const dA = defOrder[a.properties.districtId] ?? 99
    const dB = defOrder[b.properties.districtId] ?? 99
    if (dA !== dB) return dA - dB
    return (a.properties.clusterIndex ?? 0) - (b.properties.clusterIndex ?? 0)
  })

  return turf.featureCollection(results)
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getDistrictBounds (districtFeature) {
  try {
    const bbox   = turf.bbox(districtFeature)
    const lngPad = (bbox[2] - bbox[0]) * 0.15
    const latPad = (bbox[3] - bbox[1]) * 0.15
    return [bbox[0] - lngPad, bbox[1] - latPad, bbox[2] + lngPad, bbox[3] + latPad]
  } catch { return null }
}

export function buildNarrativeSummary (props) {
  const lines = [
    `<strong>${props.name}</strong>`,
    `<em>${props.clusterLabel} &mdash; ${props.poiCount} businesses</em>`,
    '',
    `Density:      ${props.densityScore      ?? '–'}/100`,
    `Diversity:    ${props.diversityScore    ?? '–'}/100`,
    `Lighting:     ${props.lightingScore     ?? '–'}/100`,
    `Connectivity: ${props.connectivityScore ?? '–'}/100`,
    '',
    `<strong>Overall: ${props.overallScore}/100</strong>`
  ]
  return lines.join('<br/>')
}
