import jsPDF from 'jspdf'
import * as turf from '@turf/turf'
import proj4 from 'proj4'
import { loadWalkabilityData } from './dataLoader'

// Register projections for tree canopy (stored as EPSG:3857)
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

function reprojectGeoJSON3857to4326(geojson) {
  if (!geojson?.features) return geojson
  const fwd = proj4('EPSG:3857', 'EPSG:4326')
  const txCoords = (coords, depth) => {
    if (depth === 0) return fwd.forward(coords)
    return coords.map(c => txCoords(c, depth - 1))
  }
  const depthFor = { Point: 0, LineString: 1, MultiPoint: 1, Polygon: 2, MultiLineString: 2, MultiPolygon: 3 }
  return {
    ...geojson,
    features: geojson.features.map(f => {
      if (!f?.geometry?.coordinates) return f
      const d = depthFor[f.geometry.type]
      if (d == null) return f
      return { ...f, geometry: { ...f.geometry, coordinates: txCoords(f.geometry.coordinates, d) } }
    }),
  }
}

// ═══════════════════════════════════════════════════════════════
// Brand palettes — dark (default) and light (ink-saving)
// ═══════════════════════════════════════════════════════════════
const DARK_PALETTE = {
  bg: [15, 22, 18],
  card: [20, 28, 24],
  cardAlt: [26, 36, 32],
  border: [42, 63, 45],
  accent: [0, 180, 124],
  white: [255, 255, 255],
  muted: [100, 116, 139],
  text: [232, 245, 233],
  danger: [239, 68, 68],
  warm: [245, 158, 11],
  cool: [59, 130, 246],
  green: [16, 185, 129],
  purple: [139, 92, 252],
}

const LIGHT_PALETTE = {
  bg: [255, 255, 255],
  card: [245, 247, 246],
  cardAlt: [235, 240, 238],
  border: [200, 214, 204],
  accent: [0, 140, 96],
  white: [255, 255, 255],
  muted: [100, 116, 139],
  text: [20, 40, 30],
  danger: [200, 30, 30],
  warm: [180, 100, 0],
  cool: [30, 90, 200],
  green: [10, 140, 80],
  purple: [100, 60, 200],
}

// C is module-level and gets swapped per report call
let C = { ...DARK_PALETTE }

const SECTION_COLORS = {
  business: C.warm,
  walkability: C.cool,
  lighting: C.warm,
  temperature: C.danger,
  greenery: C.green,
  traffic: C.purple,
}

// Broad business categories — 8 groups, colors safe on both light and dark backgrounds
const BROAD_CATEGORIES = {
  'Food & Drink':      { color: [205, 50,  50],  keywords: ['restaurant','cafe','bakery','bar','fast_food','meal_','food','pizza','sandwich','ice_cream','dessert','coffee','juice','wine_bar','cocktail','pub','brewery','ramen','sushi','seafood','steak','vegetarian','chicken','noodle','buffet','catering'] },
  'Retail':            { color: [210, 110, 20],  keywords: ['clothing','shoe_store','shopping','store','supermarket','grocery','convenience','hardware','electronics','book_store','gift_shop','jewelry','pet_store','toy_store','furniture','home_good','sporting','bicycle','florist','market','department','discount','thrift','outlet'] },
  'Health & Wellness': { color: [15,  145, 100], keywords: ['hospital','doctor','pharmacy','dentist','gym','spa','beauty_salon','hair_care','physiother','chiropract','optici','health','medical','dental','nail_salon','barber','fitness','yoga','wellness'] },
  'Entertainment':     { color: [120, 70,  230], keywords: ['movie','night_club','bowling','amusement','casino','art_gallery','museum','zoo','aquarium','stadium','concert','karaoke','escape_room','comedy','theater','theme_park','arcade'] },
  'Services':          { color: [40,  110, 215], keywords: ['bank','atm','post_office','laundry','car_wash','gas_station','parking','insurance','real_estate','travel_agency','lawyer','accountant','locksmith','electrician','plumber','moving','storage','printing','courier','notary','financial','government'] },
  'Accommodation':     { color: [6,   160, 200], keywords: ['hotel','lodging','motel','hostel','bed_and_breakfast','guest_house','resort','apartment'] },
  'Education':         { color: [15,  155, 145], keywords: ['school','university','library','preschool','college','tutoring','language','driving_school'] },
  'Other':             { color: [120, 100, 90],  keywords: [] },
}

function getBroadCategory(primaryType) {
  if (!primaryType) return 'Other'
  const t = (primaryType || '').toLowerCase()
  for (const [cat, cfg] of Object.entries(BROAD_CATEGORIES)) {
    if (cfg.keywords.some(k => t.includes(k) || k.includes(t))) return cat
  }
  return 'Other'
}

function buildTypeColorMap(features) {
  // Maps each primaryType to its broad category color
  const map = {}
  for (const f of features) {
    const t = f.properties?.primaryType || 'unknown'
    if (!(t in map)) {
      const cat = getBroadCategory(t)
      map[t] = BROAD_CATEGORIES[cat]?.color || BROAD_CATEGORIES['Other'].color
    }
  }
  return map
}

function buildBroadLegend(features) {
  // Returns only broad categories actually present in the viewport
  const seen = new Set()
  const entries = []
  for (const f of features) {
    const cat = getBroadCategory(f.properties?.primaryType)
    if (!seen.has(cat)) {
      seen.add(cat)
      entries.push([cat, BROAD_CATEGORIES[cat]?.color || BROAD_CATEGORIES['Other'].color])
    }
  }
  return entries
}

// ═══════════════════════════════════════════════════════════════
// Viewport filtering helpers using turf
// ═══════════════════════════════════════════════════════════════

function getMapBounds(mapInstance) {
  const rawMap = mapInstance.getMap ? mapInstance.getMap() : mapInstance
  const bounds = rawMap.getBounds()
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
}

function filterFeaturesByBbox(geojsonOrFeatures, bbox) {
  const features = Array.isArray(geojsonOrFeatures)
    ? geojsonOrFeatures
    : geojsonOrFeatures?.features || []
  if (features.length === 0) return []
  const [bWest, bSouth, bEast, bNorth] = bbox
  return features.filter(f => {
    if (!f?.geometry) return false
    try {
      const type = f.geometry.type
      if (type === 'Point') {
        const [lng, lat] = f.geometry.coordinates
        return lng >= bWest && lng <= bEast && lat >= bSouth && lat <= bNorth
      }
      if (type === 'MultiPoint') {
        return f.geometry.coordinates.some(([lng, lat]) =>
          lng >= bWest && lng <= bEast && lat >= bSouth && lat <= bNorth)
      }
      // For lines and polygons: use feature-bbox overlap (robust against complex MultiPolygon)
      const fb = turf.bbox(f)
      return !(fb[2] < bWest || fb[0] > bEast || fb[3] < bSouth || fb[1] > bNorth)
    } catch {
      return false
    }
  })
}

// ── Spatial join helpers for street name resolution ──────────────
function geomMidpoint(geom) {
  let coords = []
  if (geom.type === 'LineString') coords = geom.coordinates
  else if (geom.type === 'MultiLineString') coords = geom.coordinates.flat()
  else if (geom.type === 'Point') return geom.coordinates
  else if (geom.type === 'Polygon') coords = geom.coordinates[0] || []
  else if (geom.type === 'MultiPolygon') coords = (geom.coordinates[0] || [[]])[0] || []
  if (coords.length === 0) return null
  return coords[Math.floor(coords.length / 2)]
}

function buildRoadMidpoints(roadsData) {
  if (!roadsData?.features?.length) return []
  const pts = []
  for (const f of roadsData.features) {
    const pt = geomMidpoint(f.geometry)
    if (pt && f.properties.STR_NAME) pts.push({ lng: pt[0], lat: pt[1], name: f.properties.STR_NAME })
  }
  return pts
}

function resolveStreetName(feature, roadMidpoints) {
  if (!roadMidpoints.length) return null
  const pt = geomMidpoint(feature.geometry)
  if (!pt) return null
  const [lng, lat] = pt
  let bestDist = Infinity, bestName = null
  for (const r of roadMidpoints) {
    const dx = lng - r.lng, dy = lat - r.lat
    const d = dx * dx + dy * dy
    if (d < bestDist) { bestDist = d; bestName = r.name }
  }
  // ~0.003 degrees ≈ ~300m — sufficient for CBD
  return bestDist < 0.000009 ? bestName : null
}

// ═══════════════════════════════════════════════════════════════
// PDF helpers
// ═══════════════════════════════════════════════════════════════

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : { r: 148, g: 163, b: 184 }
}

function rgb(arr) { return { r: arr[0], g: arr[1], b: arr[2] } }

function drawBg(doc, w, h) {
  doc.setFillColor(...C.bg)
  doc.rect(0, 0, w, h, 'F')
}

function drawHeader(doc, pw) {
  doc.setFillColor(...C.bg)
  doc.rect(0, 0, pw, 42, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(0, 42, pw, 1.5, 'F')

  doc.setDrawColor(...C.accent)
  doc.setLineWidth(0.8)
  doc.circle(20, 21, 6.5)
  doc.setFillColor(...C.accent)
  doc.circle(20, 21, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...C.white)
  doc.text('Mission for Inner City', 32, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  doc.text('Viewport Intelligence Report · Cape Town CBD', 32, 26)

  const now = new Date()
  doc.setFontSize(7)
  doc.text(
    `Generated: ${now.toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`,
    pw - 15, 18, { align: 'right' }
  )
  doc.text('CONFIDENTIAL', pw - 15, 26, { align: 'right' })
}

function drawFooter(doc, pw, ph, page, total) {
  const y = ph - 12
  doc.setFillColor(...C.bg)
  doc.rect(0, y - 4, pw, 16, 'F')
  doc.setFillColor(...C.accent)
  doc.rect(0, y - 4, pw, 0.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.muted)
  doc.text('Mission for Inner City · Urban Intelligence Platform', 15, y + 2)
  doc.text(`Page ${page} of ${total}`, pw - 15, y + 2, { align: 'right' })
}

function sectionTitle(doc, y, title, pw, colorArr) {
  doc.setFillColor(...(colorArr || C.cardAlt))
  doc.roundedRect(15, y, pw - 30, 10, 2, 2, 'F')
  // Small accent bar on left
  if (colorArr) {
    doc.setFillColor(...colorArr)
    doc.rect(15, y, 3, 10, 'F')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.accent)
  doc.text(title, 22, y + 7)
  return y + 14
}

function metricCard(doc, x, y, w, label, value) {
  doc.setFillColor(...C.card)
  doc.roundedRect(x, y, w, 12, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...C.accent)
  doc.text(String(value), x + 4, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.muted)
  doc.text(label, x + 4, y + 10)
}

function metricRow(doc, y, metrics, margin, cw) {
  const colW = (cw - 6) / 2
  let col = 0, rowY = y
  for (const m of metrics) {
    metricCard(doc, margin + col * (colW + 3), rowY, colW, m.label, m.value)
    col++
    if (col >= 2) { col = 0; rowY += 14 }
  }
  if (col !== 0) rowY += 14
  return rowY + 2
}

// Ensure we have enough space, or add new page
function ensureSpace(doc, y, needed, pw, ph, state) {
  if (y + needed > ph - 20) {
    doc.addPage()
    state.totalPages++
    drawBg(doc, pw, ph)
    drawHeader(doc, pw)
    return 52
  }
  return y
}

// ═══════════════════════════════════════════════════════════════
// Data fetching helpers — load any data not already in memory
// ═══════════════════════════════════════════════════════════════

async function fetchGeoJSON(path) {
  try {
    const resp = await fetch(path)
    if (!resp.ok) return null
    return await resp.json()
  } catch { return null }
}

async function ensureAllData(data) {
  const loads = []
  if (!data.businessesData?.features?.length) loads.push(fetchGeoJSON('/data/business/POI_enriched_20260120_185944.geojson').then(d => { if (d) data.businessesData = d }))
  if (!data.eventsData?.features?.length) loads.push(fetchGeoJSON('/data/business/events.geojson').then(d => { if (d) data.eventsData = d }))
  if (!data.streetStallsData?.features?.length) loads.push(fetchGeoJSON('/data/business/streetStalls.geojson').then(d => { if (d) data.streetStallsData = d }))
  if (!data.lightingSegments?.features?.length) loads.push(fetchGeoJSON('/data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson').then(d => { if (d) data.lightingSegments = d }))
  if (!data.streetLights?.features?.length) loads.push(fetchGeoJSON('/data/lighting/new_Lights/Street_lights.geojson').then(d => { if (d) data.streetLights = d }))
  if (!data.temperatureData?.features?.length) loads.push(fetchGeoJSON('/api/climate/heat-streets').then(d => { if (d) data.temperatureData = d }))
  if (!data.greeneryAndSkyview?.features?.length) loads.push(fetchGeoJSON('/data/greenery/greenryandSkyview.geojson').then(d => { if (d) data.greeneryAndSkyview = d }))
  if (!data.treeCanopyData?.features?.length) loads.push(fetchGeoJSON('/data/greenery/tree_canopy.geojson').then(d => { if (d) data.treeCanopyData = reprojectGeoJSON3857to4326(d) }))
  if (!data.parksData?.features?.length) loads.push(fetchGeoJSON('/data/greenery/parks_nearby.geojson').then(d => { if (d) data.parksData = d }))
  if (!data.trafficData?.features?.length) loads.push(fetchGeoJSON('/data/Traffic/traffic_analysis.geojson').then(d => { if (d) data.trafficData = d }))
  if (!data.pedestrianData?.features?.length || !data.cyclingData?.features?.length || !data.networkData?.features?.length) {
    loads.push(loadWalkabilityData().then(d => {
      if (!d) return
      if (!data.pedestrianData?.features?.length) data.pedestrianData = d.pedestrian
      if (!data.cyclingData?.features?.length) data.cyclingData = d.cycling
      if (!data.networkData?.features?.length) data.networkData = d.network
    }))
  }
  if (!data.roadsData?.features?.length) loads.push(fetchGeoJSON('/data/roads/segments.geojson').then(d => { if (d) data.roadsData = d }))
  if (!data.busStops?.features?.length) loads.push(fetchGeoJSON('/data/walkabilty/bus stops.geojson').then(d => { if (d) data.busStops = d }))
  if (!data.trainStations?.features?.length) loads.push(fetchGeoJSON('/data/walkabilty/trainStation.geojson').then(d => { if (d) data.trainStations = d }))
  await Promise.all(loads)

  // Compute a heat percentile if not already present. The DB route normally
  // supplies hot_street_score/temp_percentile, but this keeps reports tolerant.
  if (data.temperatureData?.features?.length && data.temperatureData.features[0]?.properties?.temp_percentile == null) {
    const allMaxTemps = []
    data.temperatureData.features.forEach(f => {
      const seasons = ['summer', 'autumn', 'winter', 'spring']
      const readings = []
      seasons.forEach(s => {
        const arr = f.properties[`${s}_temperatures`]
        if (Array.isArray(arr)) arr.forEach(r => { if (r?.temperature_mean != null) readings.push(r.temperature_mean) })
      })
      if (readings.length > 0) {
        f.properties.overall_max_temp = Math.max(...readings)
        f.properties.overall_avg_temp = readings.reduce((a, b) => a + b, 0) / readings.length
        allMaxTemps.push(f.properties.overall_max_temp)
      } else {
        const directTemp = Number(f.properties.mean_heat_model_lst_c ?? f.properties.overall_max_temp ?? f.properties.surface_temp)
        if (Number.isFinite(directTemp)) {
          f.properties.overall_max_temp = directTemp
          f.properties.overall_avg_temp = directTemp
          allMaxTemps.push(directTemp)
        }
      }
    })
    if (allMaxTemps.length > 0) {
      const sorted = [...allMaxTemps].sort((a, b) => a - b)
      const minT = sorted[0], maxT = sorted[sorted.length - 1]
      const range = maxT - minT || 1
      data.temperatureData.features.forEach(f => {
        if (f.properties.overall_max_temp != null) {
          f.properties.temp_percentile = ((f.properties.overall_max_temp - minT) / range) * 100
        }
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Per-section map capture system
// ═══════════════════════════════════════════════════════════════

const KNOWN_DATA_LAYERS = [
  'businesses-heatmap-layer', 'businesses-points-layer',
  'survey-opinions-layer', 'stalls-opinions-layer',
  'businesses-ratings-layer', 'businesses-amenities-layer',
  'businesses-categories-layer', 'properties-sales-layer',
  'pedestrian-routes-layer', 'cycling-routes-layer',
  'network-glow-outer', 'network-glow-mid', 'network-betweenness-layer',
  'transit-accessibility-layer', 'bus-stops-layer',
  'train-station-outline', 'train-station-fill',
  'lighting-segments-layer',
  'mission-interventions-outer-glow', 'mission-interventions-glow', 'mission-interventions-layer',
  'municipal-lights-layer',
  'heat-streets-layer',
  'greenery-skyview-layer', 'tree-canopy-layer',
  'parks-nearby-layer', 'parks-nearby-outline',
  'events-heatmap-layer', 'events-points-layer',
  'traffic-layer-outer-glow', 'traffic-layer-glow', 'traffic-layer', 'traffic-flow-animated',
  '3d-buildings',
]

function waitForIdle(rawMap, timeoutMs = 4000) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs)
    rawMap.once('idle', () => { clearTimeout(timer); resolve() })
    rawMap.triggerRepaint()
  })
}

// Capture map canvas and return image with its natural aspect ratio (no cropping math)
function captureCanvas(rawMap) {
  const canvas = rawMap.getCanvas()
  const aspect = (canvas.clientWidth || canvas.width) / (canvas.clientHeight || canvas.height)
  return { dataUrl: canvas.toDataURL('image/png'), aspect }
}

// Legend definitions per section — used for both map rendering and PDF legend drawing
const SECTION_LEGENDS = {
  business: {
    title: 'Business & Economy',
    items: [
      { type: 'circle', label: 'Business (numbered)', color: '#f59e0b', stroke: '#ffffff' },
      { type: 'circle', label: 'Street Stalls', color: '#fbbf24', stroke: '#92400e' },
      { type: 'circle', label: 'Events', color: '#22c55e', stroke: '#ffffff' },
    ],
  },
  walkability_ped: {
    title: 'Pedestrian Volume',
    items: [
      { type: 'gradient', label: 'Trip Count', colors: ['#08519c','#6baed6','#fee391','#fe9929','#d62828','#6a040f'], labels: ['0','','50','','200','500+'] },
    ],
  },
  walkability_cycling: {
    title: 'Cycling Volume',
    items: [
      { type: 'gradient', label: 'Trip Count', colors: ['#08519c','#6baed6','#fee391','#fe9929','#d62828','#6a040f'], labels: ['0','','50','','200','500+'] },
    ],
  },
  lighting: {
    title: 'Street Lighting',
    items: [
      { type: 'gradient', label: 'Mean Lux Level', colors: ['#dc2626','#f59e0b','#10b981'], labels: ['Low','Mid','High'] },
      { type: 'circle', label: 'Operational Poles', color: '#10b981', stroke: '#ffffff' },
      { type: 'circle', label: 'Non-operational Poles', color: '#dc2626', stroke: '#ffffff' },
    ],
  },
  temperature: {
    title: 'Heat Streets',
    items: [
      { type: 'gradient', label: 'Hot Street Score', colors: ['#3b82f6','#10b981','#fbbf24','#f59e0b','#ef4444'], labels: ['Low','20','40','60','80+'] },
    ],
  },
  greenery: {
    title: 'Greenery & Open Space',
    items: [
      { type: 'gradient', label: 'Vegetation Index (NDVI)', colors: ['#8b4513','#d4b896','#bde69c','#6ab04c','#2d7a2e'], labels: ['<0.1','0.1','0.3','0.5','0.7+'] },
      { type: 'fill', label: 'Tree Canopy', color: '#2d7a2e' },
      { type: 'fill', label: 'Parks', color: '#10b981', stroke: '#059669' },
    ],
  },
  traffic: {
    title: 'Traffic — Baseline',
    items: [
      { type: 'gradient', label: 'Baseline KPI', colors: ['#00bfae','#34d399','#fbbf24','#f59e0b','#ef4444','#ff0044'], labels: ['Free flow (0)','Light','Mod','Heavy','Severe (2.0)',''] },
    ],
  },
}

function buildSectionTempLayers(sectionId, filtered) {
  const sources = []
  const layers = []
  const fc = (features) => ({ type: 'FeatureCollection', features })

  switch (sectionId) {
    case 'business': {
      // Business markers — show ALL on map, number ALL for directory
      const biz = (filtered.businesses || []).filter(f => f.properties.businessStatus !== 'CLOSED_PERMANENTLY')
      if (biz.length) {
        // All businesses get circles on the map
        sources.push({ id: '_rpt_biz', data: fc(biz) })
        layers.push({ id: '_rpt_biz_c', type: 'circle', source: '_rpt_biz', paint: {
          'circle-radius': 7, 'circle-color': '#f59e0b', 'circle-opacity': 0.92,
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        }})
        // Numbered labels for ALL businesses
        const numbered = biz.map((f, i) => ({
          ...f, properties: { ...f.properties, _rptIdx: String(i + 1) }
        }))
        sources.push({ id: '_rpt_biz_num', data: fc(numbered) })
        layers.push({ id: '_rpt_biz_num_c', type: 'circle', source: '_rpt_biz_num', paint: {
          'circle-radius': 15, 'circle-color': '#f59e0b', 'circle-opacity': 0.95,
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff',
        }})
        layers.push({ id: '_rpt_biz_label', type: 'symbol', source: '_rpt_biz_num',
          layout: {
            'text-field': ['get', '_rptIdx'], 'text-size': 14,
            'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
            'text-allow-overlap': false, 'text-ignore-placement': false,
            'symbol-sort-key': ['to-number', ['get', '_rptIdx']],
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.0 },
        })
      }
      if (filtered.stalls.length) {
        sources.push({ id: '_rpt_st', data: fc(filtered.stalls) })
        layers.push({ id: '_rpt_st_c', type: 'circle', source: '_rpt_st', paint: {
          'circle-radius': 5, 'circle-color': '#fbbf24', 'circle-opacity': 0.9,
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#92400e',
        }})
      }
      if (filtered.events.length) {
        sources.push({ id: '_rpt_ev', data: fc(filtered.events) })
        layers.push({ id: '_rpt_ev_c', type: 'circle', source: '_rpt_ev', paint: {
          'circle-radius': 7, 'circle-color': '#22c55e', 'circle-opacity': 0.85,
          'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff',
        }})
      }
      break
    }

    case 'walkability_ped':
      if (filtered.pedestrian.length) {
        sources.push({ id: '_rpt_ped', data: fc(filtered.pedestrian) })
        layers.push({ id: '_rpt_ped_l', type: 'line', source: '_rpt_ped', paint: {
          'line-color': ['interpolate', ['linear'],
            ['coalesce', ['get', 'total_trip_count'], 0],
            0, '#08519c', 5, '#3182bd', 10, '#6baed6', 20, '#9ecae1',
            30, '#fee391', 50, '#fec44f', 75, '#fe9929', 100, '#ec7014',
            150, '#cc4c02', 200, '#d62828', 350, '#9d0208', 500, '#6a040f'],
          'line-width': ['interpolate', ['linear'],
            ['coalesce', ['get', 'total_trip_count'], 0],
            0, 2, 50, 4, 100, 5, 200, 6, 400, 8],
          'line-opacity': 0.85,
        }})
      }
      break

    case 'walkability_cycling':
      if (filtered.cycling.length) {
        sources.push({ id: '_rpt_cyc', data: fc(filtered.cycling) })
        layers.push({ id: '_rpt_cyc_l', type: 'line', source: '_rpt_cyc', paint: {
          'line-color': ['interpolate', ['linear'],
            ['coalesce', ['get', 'total_trip_count'], 0],
            0, '#08519c', 5, '#3182bd', 10, '#6baed6', 20, '#9ecae1',
            30, '#fee391', 50, '#fec44f', 75, '#fe9929', 100, '#ec7014',
            150, '#cc4c02', 200, '#d62828', 350, '#9d0208', 500, '#6a040f'],
          'line-width': ['interpolate', ['linear'],
            ['coalesce', ['get', 'total_trip_count'], 0],
            0, 2, 100, 4, 200, 5, 400, 6, 800, 8],
          'line-opacity': 0.85,
        }})
      }
      break

    case 'lighting': {
      if (filtered.lightingSegments.length) {
        const luxVals = filtered.lightingSegments
          .map(f => f.properties.mean_lux).filter(v => v != null && v > 0).sort((a, b) => a - b)
        let bottom20 = 20, top20 = 80
        if (luxVals.length >= 5) {
          bottom20 = luxVals[Math.floor(luxVals.length * 0.2)]
          top20 = luxVals[Math.floor(luxVals.length * 0.8)]
        }
        sources.push({ id: '_rpt_lseg', data: fc(filtered.lightingSegments) })
        layers.push({ id: '_rpt_lseg_l', type: 'line', source: '_rpt_lseg', paint: {
          'line-color': ['case',
            ['==', ['get', 'mean_lux'], null], '#4b5563',
            ['step', ['get', 'mean_lux'],
              '#dc2626', bottom20, '#f59e0b', top20, '#10b981']],
          'line-width': 5, 'line-opacity': 0.9,
        }})
      }
      if (filtered.streetLights.length) {
        sources.push({ id: '_rpt_lpole', data: fc(filtered.streetLights) })
        layers.push({ id: '_rpt_lpole_c', type: 'circle', source: '_rpt_lpole', paint: {
          'circle-radius': 5,
          'circle-color': ['case',
            ['==', ['get', 'operational'], false], '#dc2626', '#10b981'],
          'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff',
        }})
      }
      break
    }

    case 'temperature':
      if (filtered.temperature.length) {
        sources.push({ id: '_rpt_temp', data: fc(filtered.temperature) })
        layers.push({ id: '_rpt_temp_l', type: 'line', source: '_rpt_temp', paint: {
          'line-color': ['case',
            ['any', ['has', 'hot_street_score'], ['has', 'temp_percentile']],
            ['step', ['coalesce', ['get', 'hot_street_score'], ['get', 'temp_percentile'], 0],
              '#3b82f6', 20, '#10b981', 40, '#fbbf24', 60, '#f59e0b', 80, '#ef4444'],
            '#4b5563'],
          'line-width': 5, 'line-opacity': 0.9,
        }})
      }
      break

    case 'greenery':
      if (filtered.treeCanopy.length) {
        sources.push({ id: '_rpt_canopy', data: fc(filtered.treeCanopy) })
        layers.push({ id: '_rpt_canopy_f', type: 'fill', source: '_rpt_canopy', paint: {
          'fill-color': '#2d7a2e', 'fill-opacity': 0.6,
        }})
      }
      if (filtered.parks.length) {
        sources.push({ id: '_rpt_parks', data: fc(filtered.parks) })
        layers.push({ id: '_rpt_parks_f', type: 'fill', source: '_rpt_parks', paint: {
          'fill-color': '#10b981', 'fill-opacity': 0.4,
        }})
        layers.push({ id: '_rpt_parks_o', type: 'line', source: '_rpt_parks', paint: {
          'line-color': '#059669', 'line-width': 2,
        }})
      }
      if (filtered.greenery.length) {
        sources.push({ id: '_rpt_green', data: fc(filtered.greenery) })
        layers.push({ id: '_rpt_green_l', type: 'line', source: '_rpt_green', paint: {
          'line-color': ['case',
            ['==', ['get', 'vegetation_index'], null], '#4b5563',
            ['step', ['get', 'vegetation_index'],
              '#8b4513', 0.1, '#d4b896', 0.3, '#bde69c', 0.5, '#6ab04c', 0.7, '#2d7a2e']],
          'line-width': 5, 'line-opacity': 0.9,
        }})
      }
      break

    case 'traffic':
      if (filtered.traffic.length) {
        sources.push({ id: '_rpt_traffic', data: fc(filtered.traffic) })
        const field = 'kpi_baseline'
        layers.push({ id: '_rpt_traffic_glow', type: 'line', source: '_rpt_traffic', paint: {
          'line-color': ['interpolate', ['linear'],
            ['coalesce', ['get', field], 0],
            0, '#00bfae', 0.6, '#10b981', 1.0, '#fbbf24', 1.6, '#ef4444', 2.0, '#ff0044'],
          'line-width': 8, 'line-opacity': 0.3, 'line-blur': 4,
        }})
        layers.push({ id: '_rpt_traffic_l', type: 'line', source: '_rpt_traffic', paint: {
          'line-color': ['interpolate', ['linear'],
            ['coalesce', ['get', field], 0],
            0, '#00bfae', 0.3, '#34d399', 0.6, '#10b981',
            1.0, '#fbbf24', 1.3, '#f59e0b', 1.6, '#ef4444', 2.0, '#ff0044'],
          'line-width': ['interpolate', ['linear'],
            ['coalesce', ['get', field], 0],
            0, 2, 0.6, 3, 1.0, 4, 1.6, 6, 2.0, 8],
          'line-opacity': 0.95,
        }})
      }
      break
  }
  return { sources, layers }
}

async function captureAllSectionMaps(rawMap, bbox, filtered) {
  const images = {}

  // Save and hide all known data layers
  const savedVis = {}
  for (const id of KNOWN_DATA_LAYERS) {
    try {
      if (rawMap.getLayer(id)) {
        savedVis[id] = rawMap.getLayoutProperty(id, 'visibility') || 'visible'
        rawMap.setLayoutProperty(id, 'visibility', 'none')
      }
    } catch {}
  }

  // Fit to bbox, top-down
  rawMap.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
    padding: 15, animate: false, pitch: 0, bearing: 0, duration: 0
  })
  await waitForIdle(rawMap)

  // Capture each section — walkability split into ped/cycling
  const sectionIds = ['business', 'walkability_ped', 'walkability_cycling', 'lighting', 'temperature', 'greenery', 'traffic']
  for (const sectionId of sectionIds) {
    const cfg = buildSectionTempLayers(sectionId, filtered)
    try {
      for (const src of cfg.sources) rawMap.addSource(src.id, { type: 'geojson', data: src.data })
      for (const lyr of cfg.layers) rawMap.addLayer(lyr)
      await waitForIdle(rawMap)
      images[sectionId] = captureCanvas(rawMap)
    } catch (err) {
      console.warn(`Failed to capture ${sectionId} map:`, err)
      images[sectionId] = null
    }
    // Clean up temp layers and sources
    for (let i = cfg.layers.length - 1; i >= 0; i--) {
      try { rawMap.removeLayer(cfg.layers[i].id) } catch {}
    }
    for (let i = cfg.sources.length - 1; i >= 0; i--) {
      try { rawMap.removeSource(cfg.sources[i].id) } catch {}
    }
  }

  // Restore layer visibilities
  for (const [id, vis] of Object.entries(savedVis)) {
    try { if (rawMap.getLayer(id)) rawMap.setLayoutProperty(id, 'visibility', vis) } catch {}
  }

  return images
}

function drawLegend(doc, y, sectionId, margin, cw, pw, ph, state) {
  const legend = SECTION_LEGENDS[sectionId]
  if (!legend) return y

  const items = legend.items
  const legendH = 6 + items.length * 7
  y = ensureSpace(doc, y, legendH + 2, pw, ph, state)

  // Legend background
  doc.setFillColor(...C.card)
  doc.roundedRect(margin, y, cw, legendH, 1.5, 1.5, 'F')
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.2)
  doc.roundedRect(margin, y, cw, legendH, 1.5, 1.5, 'S')

  let ly = y + 5
  for (const item of items) {
    const lx = margin + 4
    if (item.type === 'gradient') {
      // Draw gradient bar
      const barW = 40, barH = 4
      const colors = item.colors
      const segW = barW / colors.length
      for (let i = 0; i < colors.length; i++) {
        const c = hexToRgb(colors[i])
        doc.setFillColor(c.r, c.g, c.b)
        doc.rect(lx + i * segW, ly - 3, segW + 0.3, barH, 'F')
      }
      // Labels below gradient
      doc.setFont('helvetica', 'normal'); doc.setFontSize(4); doc.setTextColor(...C.muted)
      if (item.labels.length >= 2) {
        doc.text(item.labels[0], lx, ly + 3.5)
        doc.text(item.labels[item.labels.length - 1], lx + barW - doc.getTextWidth(item.labels[item.labels.length - 1]), ly + 3.5)
      }
      // Legend label
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.text)
      doc.text(item.label, lx + barW + 3, ly)
    } else if (item.type === 'circle') {
      const c = hexToRgb(item.color)
      doc.setFillColor(c.r, c.g, c.b)
      doc.circle(lx + 2, ly - 1, 2, 'F')
      if (item.stroke) {
        const sc = hexToRgb(item.stroke)
        doc.setDrawColor(sc.r, sc.g, sc.b)
        doc.setLineWidth(0.5)
        doc.circle(lx + 2, ly - 1, 2, 'S')
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.text)
      doc.text(item.label, lx + 7, ly)
    } else if (item.type === 'line') {
      const c = hexToRgb(item.color)
      doc.setDrawColor(c.r, c.g, c.b)
      doc.setLineWidth(1.5)
      doc.line(lx, ly - 1, lx + 8, ly - 1)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.text)
      doc.text(item.label, lx + 11, ly)
    } else if (item.type === 'fill') {
      const c = hexToRgb(item.color)
      doc.setFillColor(c.r, c.g, c.b)
      doc.rect(lx, ly - 3, 6, 4, 'F')
      if (item.stroke) {
        const sc = hexToRgb(item.stroke)
        doc.setDrawColor(sc.r, sc.g, sc.b)
        doc.setLineWidth(0.4)
        doc.rect(lx, ly - 3, 6, 4, 'S')
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.text)
      doc.text(item.label, lx + 9, ly)
    }
    ly += 7
  }
  return y + legendH + 2
}

function embedSectionMap(doc, y, sectionImg, pw, ph, margin, cw, state, sectionId) {
  if (!sectionImg) return y
  const img = typeof sectionImg === 'string' ? { dataUrl: sectionImg, aspect: cw / 80 } : sectionImg
  const mapH = Math.min(100, Math.max(50, cw / img.aspect))
  y = ensureSpace(doc, y, mapH + 6, pw, ph, state)
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, cw, mapH, 2, 2, 'S')
  doc.addImage(img.dataUrl, 'PNG', margin + 0.5, y + 0.5, cw - 1, mapH - 1)
  y += mapH + 3
  if (sectionId) {
    y = drawLegend(doc, y, sectionId, margin, cw, pw, ph, state)
  }
  return y
}

// ═══════════════════════════════════════════════════════════════
// Section renderers — each domain writes its detailed section
// ═══════════════════════════════════════════════════════════════

function renderBusinessSection(doc, y, filtered, stalls, events, pw, ph, margin, cw, state, sectionImage) {
  const businesses = filtered.businesses || []
  const stallsArr = filtered.stalls || []
  const eventsArr = filtered.events || []
  const active = businesses.filter(f => f.properties.businessStatus !== 'CLOSED_PERMANENTLY')

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Business & Economy (${active.length} businesses in view)`, pw, SECTION_COLORS.business)

  // Full page map with numbered markers
  if (sectionImage) {
    const img = typeof sectionImage === 'string' ? { dataUrl: sectionImage, aspect: cw / 80 } : sectionImage
    y = ensureSpace(doc, y, ph - 52 - 20, pw, ph, state) // force a near-full page
    const maxMapH = ph - y - 24
    const idealH = cw / img.aspect
    const mapH = Math.min(maxMapH, Math.max(60, idealH))
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, cw, mapH, 2, 2, 'S')
    doc.addImage(img.dataUrl, 'PNG', margin + 0.5, y + 0.5, cw - 1, mapH - 1)
    y += mapH + 3
    y = drawLegend(doc, y, 'business', margin, cw, pw, ph, state)
  }

  if (active.length === 0 && stallsArr.length === 0 && eventsArr.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No businesses, stalls, or events found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  // Summary metrics
  const withRating = active.filter(f => f.properties.rating > 0)
  const avgRating = withRating.length > 0 ? (withRating.reduce((s, f) => s + f.properties.rating, 0) / withRating.length).toFixed(1) : '—'
  const typeCounts = {}
  active.forEach(f => { const t = f.properties.primaryType; if (t) typeCounts[t] = (typeCounts[t] || 0) + 1 })
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const dominantType = topTypes[0] ? topTypes[0][0].replace(/_/g, ' ') : '—'

  const metrics = [
    { label: 'Active Businesses', value: active.length },
    { label: 'Average Rating', value: avgRating },
    { label: 'Dominant Category', value: dominantType },
    { label: 'Street Stalls', value: stallsArr.length },
    { label: 'Upcoming Events', value: eventsArr.length },
    { label: 'Rated Businesses', value: withRating.length },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // ── Opening / Closing Hours Distribution Chart ──
  const hourBuckets = {}  // { '17:00': count, '18:00': count, ... }
  for (const f of active) {
    const descs = f.properties.regularOpeningHours?.weekdayDescriptions
    if (!descs || !descs.length) continue
    for (const desc of descs) {
      // Parse closing times like "Monday: 7:30 AM – 5:00 PM" or "24 hours"
      const timeMatch = desc.match(/–\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i)
      if (timeMatch) {
        let hr = parseInt(timeMatch[1])
        const ampm = timeMatch[3].toUpperCase()
        if (ampm === 'PM' && hr < 12) hr += 12
        if (ampm === 'AM' && hr === 12) hr = 0
        const key = `${String(hr).padStart(2, '0')}:00`
        hourBuckets[key] = (hourBuckets[key] || 0) + 1
      }
    }
  }
  const sortedHours = Object.entries(hourBuckets).sort((a, b) => a[0].localeCompare(b[0]))

  if (sortedHours.length > 0) {
    y = ensureSpace(doc, y, 55, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Business Closing Times Distribution', margin + 2, y + 4)
    y += 8

    const chartH = 35, chartW = cw - 10, chartX = margin + 5
    doc.setFillColor(...C.card)
    doc.roundedRect(chartX - 2, y - 2, chartW + 4, chartH + 14, 2, 2, 'F')

    const maxCount = Math.max(...sortedHours.map(([, c]) => c))
    const barWidth = Math.min((chartW / sortedHours.length) - 2, 14)
    const totalBarsW = sortedHours.length * (barWidth + 2)
    const startX = chartX + (chartW - totalBarsW) / 2

    for (let i = 0; i < sortedHours.length; i++) {
      const [hour, count] = sortedHours[i]
      const barH = (count / maxCount) * chartH
      const bx = startX + i * (barWidth + 2)

      doc.setFillColor(...C.warm)
      doc.roundedRect(bx, y + chartH - barH, barWidth, barH, 1, 1, 'F')

      // Hour label
      doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...C.muted)
      const h = parseInt(hour.split(':')[0])
      const label = h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
      doc.text(label, bx + barWidth / 2, y + chartH + 5, { align: 'center' })

      // Count on bar
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5); doc.setTextColor(...C.white)
      doc.text(String(count), bx + barWidth / 2, y + chartH - barH - 2, { align: 'center' })
    }
    y += chartH + 14
  }

  // Category breakdown
  if (topTypes.length > 0) {
    y = ensureSpace(doc, y, 8 + topTypes.length * 5, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Top Business Categories', margin + 2, y + 4)
    y += 7
    for (const [type, count] of topTypes) {
      const pct = ((count / active.length) * 100).toFixed(0)
      const barW = Math.min((count / active.length) * (cw - 60), cw - 60)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFillColor(...C.accent); doc.roundedRect(margin, y, barW, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.white)
      doc.text(`${type.replace(/_/g, ' ')} (${count} · ${pct}%)`, margin + 3, y + 4.5)
      y += 7
    }
    y += 2
  }

  // Numbered business directory (matches map numbers)
  if (active.length > 0) {
    // Build type → colour map from all businesses in view
    const typeColorMap = buildTypeColorMap(active)

    y = ensureSpace(doc, y, 14, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text(`Business Directory (${active.length})`, margin + 2, y + 4)
    y += 8

    // ── Colour legend (broad categories only) ──────────────────
    const legendEntries = buildBroadLegend(active)
    const legendColCount = Math.min(legendEntries.length, 4)
    const legendColW = Math.floor(cw / legendColCount)
    const legendRows = Math.ceil(legendEntries.length / legendColCount)
    const legendH = legendRows * 9 + 4
    y = ensureSpace(doc, y, legendH + 4, pw, ph, state)
    for (let ei = 0; ei < legendEntries.length; ei++) {
      const lrow = Math.floor(ei / legendColCount)
      const lcol = ei % legendColCount
      const lx = margin + lcol * legendColW + 2
      const ly = y + 2 + lrow * 9
      const [catName, clr] = legendEntries[ei]
      doc.setFillColor(...clr)
      doc.roundedRect(lx, ly, legendColW - 4, 7, 1, 1, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(255, 255, 255)
      doc.text(catName, lx + (legendColW - 4) / 2, ly + 5, { align: 'center' })
    }
    y += legendH + 4

    // ── Directory rows ─────────────────────────────────────────
    const colCount = Math.max(2, Math.floor(cw / 120))
    const colW = Math.floor((cw - 4) / colCount)
    const rowH = 15  // taller rows to avoid overlap
    const rows = Math.ceil(active.length / colCount)
    for (let row = 0; row < rows; row++) {
      y = ensureSpace(doc, y, rowH, pw, ph, state)
      for (let col = 0; col < colCount; col++) {
        const idx = row + col * rows
        if (idx >= active.length) continue
        const p = active[idx].properties
        const name = p.displayName?.text || p.name || 'Unknown'
        const rating = p.rating || '—'
        const reviews = p.userRatingCount || 0
        const status = p.businessStatus === 'OPERATIONAL' ? 'Open' : p.businessStatus || '—'
        const broadCat = getBroadCategory(p.primaryType)
        const badgeColor = typeColorMap[p.primaryType || 'unknown'] || C.warm

        const x = margin + col * colW
        // Row background
        doc.setFillColor(row % 2 === 0 ? C.card[0] : C.cardAlt[0], row % 2 === 0 ? C.card[1] : C.cardAlt[1], row % 2 === 0 ? C.card[2] : C.cardAlt[2])
        doc.roundedRect(x, y, colW - 1, rowH - 1, 1, 1, 'F')
        // Left colour stripe
        doc.setFillColor(...badgeColor)
        doc.rect(x, y, 2.5, rowH - 1, 'F')

        // Number badge (always coloured — white text safe on coloured circle)
        doc.setFillColor(...badgeColor)
        doc.circle(x + 8.5, y + 5, 5, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255)
        const numStr = String(idx + 1)
        doc.text(numStr, x + 8.5 - doc.getTextWidth(numStr) / 2, y + 6.5)

        // Line 1: name (uses C.text — dark in light mode, light in dark mode)
        const maxNameChars = Math.floor((colW - 50) / 2.2)  // approx chars that fit
        const nameStr = name.length > maxNameChars ? name.slice(0, maxNameChars - 1) + '…' : name
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...C.text)
        doc.text(nameStr, x + 15, y + 6)

        // Status badge at far right (line 1)
        const statusColor = status === 'Open' ? C.accent : C.danger
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...statusColor)
        doc.text(status, x + colW - 5 - doc.getTextWidth(status), y + 6)

        // Line 2: broad category (coloured) + rating
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...badgeColor)
        doc.text(broadCat, x + 15, y + 12)
        const starStr = rating !== '—' ? `  ★ ${rating} (${reviews})` : ''
        doc.setTextColor(...C.muted)
        doc.text(starStr, x + 15 + doc.getTextWidth(broadCat), y + 12)
      }
      y += rowH - 1
    }
  }

  // Events listing
  if (eventsArr.length > 0) {
    y += 3
    y = ensureSpace(doc, y, 10 + eventsArr.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text(`Events in View (${eventsArr.length})`, margin + 2, y + 4)
    y += 8
    for (const ev of eventsArr.slice(0, 20)) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.text)
      const evName = (ev.properties.name || 'Event').slice(0, 50)
      const evDate = ev.properties.date || ''
      const evVenue = (ev.properties.venue || '').slice(0, 30)
      doc.text(`${evName}`, margin + 3, y + 4.5)
      doc.setTextColor(...C.muted)
      doc.text(`${evDate}  ·  ${evVenue}`, margin + 3 + doc.getTextWidth(evName) + 3, y + 4.5)
      y += 7
    }
  }

  return y + 4
}

function renderWalkabilitySection(doc, y, filtered, pw, ph, margin, cw, state, pedImage, cycImage) {
  const ped = filtered.pedestrian || []
  const cyc = filtered.cycling || []

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Walkability & Mobility — Pedestrian & Cycling Volume`, pw, SECTION_COLORS.walkability)

  // Data period note
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(...C.muted)
  doc.text('Pedestrian and cycling data measured for December month.', margin + 4, y + 3)
  y += 6

  if (ped.length === 0 && cyc.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No pedestrian or cycling data found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  // Stacked maps — each at full width to preserve aspect ratio
  const pedImg = pedImage && typeof pedImage === 'object' ? pedImage : (pedImage ? { dataUrl: pedImage, aspect: 1 } : null)
  const cycImg = cycImage && typeof cycImage === 'object' ? cycImage : (cycImage ? { dataUrl: cycImage, aspect: 1 } : null)

  // Pedestrian map (full width)
  const pedMapH = pedImg ? Math.min(120, Math.max(60, cw / pedImg.aspect)) : 70
  y = ensureSpace(doc, y, pedMapH + 10, pw, ph, state)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.text)
  doc.text('Pedestrian Volume', margin + cw / 2, y + 4, { align: 'center' })
  y += 6
  if (pedImg) {
    doc.setDrawColor(...C.border); doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, cw, pedMapH, 2, 2, 'S')
    doc.addImage(pedImg.dataUrl, 'PNG', margin + 0.5, y + 0.5, cw - 1, pedMapH - 1)
  } else {
    doc.setFillColor(...C.cardAlt); doc.roundedRect(margin, y, cw, pedMapH, 2, 2, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted)
    doc.text('No data', margin + cw / 2, y + pedMapH / 2, { align: 'center' })
  }
  y += pedMapH + 3
  y = drawLegend(doc, y, 'walkability_ped', margin, cw, pw, ph, state)

  // Cycling map (full width)
  const cycMapH = cycImg ? Math.min(120, Math.max(60, cw / cycImg.aspect)) : 70
  y = ensureSpace(doc, y, cycMapH + 10, pw, ph, state)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.text)
  doc.text('Cycling Volume', margin + cw / 2, y + 4, { align: 'center' })
  y += 6
  if (cycImg) {
    doc.setDrawColor(...C.border); doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, cw, cycMapH, 2, 2, 'S')
    doc.addImage(cycImg.dataUrl, 'PNG', margin + 0.5, y + 0.5, cw - 1, cycMapH - 1)
  } else {
    doc.setFillColor(...C.cardAlt); doc.roundedRect(margin, y, cw, cycMapH, 2, 2, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...C.muted)
    doc.text('No data', margin + cw / 2, y + cycMapH / 2, { align: 'center' })
  }
  y += cycMapH + 3
  y = drawLegend(doc, y, 'walkability_cycling', margin, cw, pw, ph, state)

  // Pedestrian stats
  const pedTrips = ped.map(f => f.properties.total_trip_count || 0)
  const avgPed = pedTrips.length > 0 ? (pedTrips.reduce((a, b) => a + b, 0) / pedTrips.length).toFixed(0) : '—'
  const maxPed = pedTrips.length > 0 ? Math.max(...pedTrips) : '—'
  const totalPed = pedTrips.reduce((a, b) => a + b, 0)

  // Cycling stats
  const cycTrips = cyc.map(f => f.properties.total_trip_count || 0)
  const avgCyc = cycTrips.length > 0 ? (cycTrips.reduce((a, b) => a + b, 0) / cycTrips.length).toFixed(0) : '—'
  const maxCyc = cycTrips.length > 0 ? Math.max(...cycTrips) : '—'
  const totalCyc = cycTrips.reduce((a, b) => a + b, 0)

  const metrics = [
    { label: 'Pedestrian Segments', value: ped.length },
    { label: 'Avg Ped Trips/Segment', value: avgPed },
    { label: 'Max Ped Trips', value: maxPed },
    { label: 'Total Ped Trips', value: totalPed.toLocaleString() },
    { label: 'Cycling Segments', value: cyc.length },
    { label: 'Avg Cycle Trips/Segment', value: avgCyc },
    { label: 'Max Cycle Trips', value: maxCyc },
    { label: 'Total Cycle Trips', value: totalCyc.toLocaleString() },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // Busiest pedestrian streets
  const busyPed = [...ped].sort((a, b) => (b.properties.total_trip_count || 0) - (a.properties.total_trip_count || 0)).slice(0, 8)
  if (busyPed.length > 0) {
    y = ensureSpace(doc, y, 10 + busyPed.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Busiest Pedestrian Streets', margin + 2, y + 4)
    y += 7
    for (const seg of busyPed) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.cool)
      const st = seg.properties.street_name || seg.properties.STR_NAME || 'Unknown'
      doc.text(`${st}: ${seg.properties.total_trip_count || 0} trips`, margin + 3, y + 4.5)
      y += 7
    }
  }

  // Busiest cycling streets
  const busyCyc = [...cyc].sort((a, b) => (b.properties.total_trip_count || 0) - (a.properties.total_trip_count || 0)).slice(0, 8)
  if (busyCyc.length > 0) {
    y = ensureSpace(doc, y, 10 + busyCyc.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Busiest Cycling Streets', margin + 2, y + 4)
    y += 7
    for (const seg of busyCyc) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.green)
      const st = seg.properties.street_name || seg.properties.STR_NAME || 'Unknown'
      doc.text(`${st}: ${seg.properties.total_trip_count || 0} trips`, margin + 3, y + 4.5)
      y += 7
    }
  }

  return y + 4
}

function renderLightingSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImage) {
  const segs = filtered.lightingSegments || []
  const lights = filtered.streetLights || []

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Street Lighting (${segs.length} segments, ${lights.length} poles in view)`, pw, SECTION_COLORS.lighting)
  y = embedSectionMap(doc, y, sectionImage, pw, ph, margin, cw, state, 'lighting')

  if (segs.length === 0 && lights.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No lighting data found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  const valid = segs.filter(f => f.properties.mean_lux != null && f.properties.mean_lux > 0)
  const luxVals = valid.map(f => f.properties.mean_lux)
  const avgLux = luxVals.length > 0 ? (luxVals.reduce((a, b) => a + b, 0) / luxVals.length).toFixed(1) : '—'
  const maxLux = luxVals.length > 0 ? Math.max(...luxVals).toFixed(1) : '—'
  const minLux = luxVals.length > 0 ? Math.min(...luxVals).toFixed(1) : '—'
  const abv5 = valid.filter(f => f.properties.pct_above_5lux >= 100).length
  const wellLitPct = valid.length > 0 ? ((abv5 / valid.length) * 100).toFixed(0) : '—'

  // Light pole stats
  const operational = lights.filter(f => (String(f.properties.operational || '')).toLowerCase() === 'true')
  const wattages = lights.map(f => f.properties.wattage || 0).filter(w => w > 0)
  const avgWatt = wattages.length > 0 ? Math.round(wattages.reduce((a, b) => a + b, 0) / wattages.length) : '—'
  const lampTypes = {}
  lights.forEach(f => { const t = f.properties.lamptype; if (t) lampTypes[t] = (lampTypes[t] || 0) + 1 })
  const topLamp = Object.entries(lampTypes).sort((a, b) => b[1] - a[1])[0]

  const metrics = [
    { label: 'Road Segments', value: segs.length },
    { label: 'Mean Lux', value: avgLux },
    { label: 'Max Lux', value: maxLux },
    { label: 'Min Lux', value: minLux },
    { label: '100% Above 5 Lux', value: `${wellLitPct}%` },
    { label: 'Light Poles', value: lights.length },
    { label: 'Operational Poles', value: operational.length },
    { label: 'Avg Wattage', value: `${avgWatt}W` },
    { label: 'Dominant Lamp Type', value: topLamp ? topLamp[0] : '—' },
    { label: 'Pole Uptime', value: lights.length > 0 ? `${((operational.length / lights.length) * 100).toFixed(0)}%` : '—' },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // Darkest streets table
  const darkest = [...valid].sort((a, b) => a.properties.mean_lux - b.properties.mean_lux).slice(0, 10)
  if (darkest.length > 0) {
    y = ensureSpace(doc, y, 10 + darkest.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Darkest Streets in View', margin + 2, y + 4)
    y += 7
    for (const seg of darkest) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.danger)
      const st = seg.properties.street_name || seg.properties.STR_NAME || 'Unknown'
      doc.text(`${st}: ${seg.properties.mean_lux.toFixed(1)} lux (min ${(seg.properties.min_lux || 0).toFixed(1)})`, margin + 3, y + 4.5)
      y += 7
    }
  }

  return y + 4
}

function renderTemperatureSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImage) {
  const temps = filtered.temperature || []

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Heat Streets (${temps.length} streets in view)`, pw, SECTION_COLORS.temperature)
  y = embedSectionMap(doc, y, sectionImage, pw, ph, margin, cw, state, 'temperature')

  if (temps.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No heat street data found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  const heatScores = temps.map(f => Number(f.properties.hot_street_score ?? f.properties.temp_percentile)).filter(Number.isFinite)
  const lstValues = temps.map(f => Number(f.properties.mean_heat_model_lst_c ?? f.properties.overall_avg_temp)).filter(Number.isFinite)
  const pedestrianScores = temps.map(f => Number(f.properties.mean_pedestrian_heat_score)).filter(Number.isFinite)
  const canopyValues = temps.map(f => Number(f.properties.mean_effective_canopy_pct)).filter(Number.isFinite)
  const avg = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

  const metrics = [
    { label: 'Streets Analyzed', value: temps.length },
    { label: 'Avg Hot Score', value: avg(heatScores)?.toFixed(1) || '-' },
    { label: 'Peak Hot Score', value: heatScores.length ? Math.max(...heatScores).toFixed(1) : '-' },
    { label: 'Critical Hot Streets', value: heatScores.filter(v => v >= 80).length },
    { label: 'Avg Heat LST (°C)', value: avg(lstValues)?.toFixed(1) || '-' },
    { label: 'Peak Heat LST (°C)', value: lstValues.length ? Math.max(...lstValues).toFixed(1) : '-' },
    { label: 'Avg Pedestrian Heat', value: avg(pedestrianScores)?.toFixed(1) || '-' },
    { label: 'Avg Canopy (%)', value: avg(canopyValues)?.toFixed(1) || '-' },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // Hottest streets
  const hotStreets = [...temps]
    .map(f => {
      const score = Number(f.properties.hot_street_score ?? f.properties.temp_percentile)
      const lst = Number(f.properties.mean_heat_model_lst_c ?? f.properties.overall_avg_temp)
      return {
        name: f.properties.street_name || 'Unknown',
        score: Number.isFinite(score) ? score : 0,
        lst: Number.isFinite(lst) ? lst : null
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  if (hotStreets.length > 0) {
    y = ensureSpace(doc, y, 10 + hotStreets.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Top Heat Streets', margin + 2, y + 4)
    y += 7
    for (const st of hotStreets) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.danger)
      const lstText = st.lst == null ? '' : ` · ${st.lst.toFixed(1)}°C LST`
      doc.text(`${st.name}: ${st.score.toFixed(1)} hot score${lstText}`, margin + 3, y + 4.5)
      y += 7
    }
  }

  return y + 4
}

function renderGreenerySection(doc, y, filtered, pw, ph, margin, cw, state, sectionImage) {
  const greenery = filtered.greenery || []
  const canopy = filtered.treeCanopy || []
  const parks = filtered.parks || []

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Greenery & Open Space (${greenery.length + canopy.length + parks.length} features in view)`, pw, SECTION_COLORS.greenery)
  y = embedSectionMap(doc, y, sectionImage, pw, ph, margin, cw, state, 'greenery')

  if (greenery.length === 0 && canopy.length === 0 && parks.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No greenery data found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  const validG = greenery.filter(f => f.properties.vegetation_index != null)
  const ndvi = validG.map(f => f.properties.vegetation_index)
  const avgNdvi = ndvi.length > 0 ? (ndvi.reduce((a, b) => a + b, 0) / ndvi.length).toFixed(3) : '—'
  const maxNdvi = ndvi.length > 0 ? Math.max(...ndvi).toFixed(3) : '—'
  const svf = validG.map(f => f.properties.sky_view_factor || 0).filter(v => v > 0)
  const avgSvf = svf.length > 0 ? (svf.reduce((a, b) => a + b, 0) / svf.length).toFixed(2) : '—'

  const totalCanopyArea = canopy.reduce((s, f) => s + (f.properties.Shape__Area || 0), 0)

  const metrics = [
    { label: 'Green Segments', value: greenery.length },
    { label: 'Avg Vegetation Index', value: avgNdvi },
    { label: 'Max Vegetation Index', value: maxNdvi },
    { label: 'Avg Sky View Factor', value: avgSvf },
    { label: 'Tree Canopy Zones', value: canopy.length },
    { label: 'Total Canopy Area (m²)', value: totalCanopyArea > 0 ? totalCanopyArea.toFixed(0) : '—' },
    { label: 'Parks in View', value: parks.length },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // Parks listing
  if (parks.length > 0) {
    y = ensureSpace(doc, y, 10 + parks.length * 6, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Nearby Parks', margin + 2, y + 4)
    y += 7
    for (const p of parks) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...C.green)
      const name = p.properties.PARK_NAME || 'Unnamed Park'
      const eq = p.properties.PLAY_EQPM === 'YES' ? ' · Playground' : ''
      doc.text(`• ${name}${eq}`, margin + 3, y + 4.5)
      y += 7
    }
  }

  return y + 4
}

function renderTrafficSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImage) {
  const traffic = filtered.traffic || []

  y = ensureSpace(doc, y, 20, pw, ph, state)
  y = sectionTitle(doc, y, `Traffic — Baseline Analysis (${traffic.length} segments)`, pw, SECTION_COLORS.traffic)
  y = embedSectionMap(doc, y, sectionImage, pw, ph, margin, cw, state, 'traffic')

  if (traffic.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C.muted)
    doc.text('No traffic data found in the current viewport.', margin + 4, y + 4)
    return y + 10
  }

  // Congestion rating thresholds (baseline KPI)
  function congestionRating(kpi) {
    if (kpi <= 0.3) return 'Free Flow'
    if (kpi <= 0.6) return 'Light'
    if (kpi <= 1.0) return 'Moderate'
    if (kpi <= 1.6) return 'Heavy'
    return 'Severe'
  }
  function ratingColor(rating) {
    const map = { 'Free Flow': [0, 229, 160], 'Light': [163, 230, 53], 'Moderate': [250, 204, 21], 'Heavy': [249, 115, 22], 'Severe': [239, 68, 68] }
    return map[rating] || C.muted
  }

  // Classify each segment
  const rated = traffic.map(f => {
    const kpi = f.properties.kpi_baseline || 0
    return { ...f, _kpi: kpi, _rating: congestionRating(kpi) }
  })

  // Summary counts by rating
  const ratingCounts = { 'Free Flow': 0, 'Light': 0, 'Moderate': 0, 'Heavy': 0, 'Severe': 0 }
  rated.forEach(r => { ratingCounts[r._rating]++ })

  const baselineVals = rated.map(r => r._kpi).filter(v => v > 0)
  const avgBaseline = baselineVals.length > 0 ? (baselineVals.reduce((a, b) => a + b, 0) / baselineVals.length).toFixed(2) : '—'
  const maxBaseline = baselineVals.length > 0 ? Math.max(...baselineVals).toFixed(2) : '—'

  const metrics = [
    { label: 'Segments in View', value: traffic.length },
    { label: 'Avg Baseline KPI', value: avgBaseline },
    { label: 'Max Baseline KPI', value: maxBaseline },
    { label: 'Free Flow (≤0.3)', value: ratingCounts['Free Flow'] },
    { label: 'Light (0.3–0.6)', value: ratingCounts['Light'] },
    { label: 'Moderate (0.6–1.0)', value: ratingCounts['Moderate'] },
    { label: 'Heavy (1.0–1.6)', value: ratingCounts['Heavy'] },
    { label: 'Severe (>1.6)', value: ratingCounts['Severe'] },
  ]
  y = metricRow(doc, y, metrics, margin, cw)

  // Per-street congestion table sorted by worst first
  const sorted = [...rated].sort((a, b) => b._kpi - a._kpi).slice(0, 20)
  if (sorted.length > 0) {
    y = ensureSpace(doc, y, 14 + sorted.length * 6.5, pw, ph, state)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C.text)
    doc.text('Per-Street Congestion Rating (Baseline)', margin + 2, y + 4)
    y += 7

    // Column headers
    y = ensureSpace(doc, y, 7, pw, ph, state)
    doc.setFillColor(30, 35, 30); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...C.muted)
    doc.text('Street', margin + 3, y + 4.2)
    doc.text('KPI', margin + cw * 0.6, y + 4.2)
    doc.text('Rating', margin + cw * 0.75, y + 4.2)
    y += 7

    for (const seg of sorted) {
      y = ensureSpace(doc, y, 7, pw, ph, state)
      doc.setFillColor(...C.card); doc.roundedRect(margin, y, cw, 6, 1, 1, 'F')

      // Rating color indicator
      const rc = ratingColor(seg._rating)
      doc.setFillColor(...rc)
      doc.circle(margin + 1.5, y + 3, 1.5, 'F')

      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(...C.text)
      const st = (seg.properties.STR_NAME || seg.properties.street_name || 'Unknown').substring(0, 40)
      doc.text(st, margin + 5, y + 4.2)
      doc.setTextColor(...rc)
      doc.text(seg._kpi.toFixed(2), margin + cw * 0.6, y + 4.2)
      doc.setFont('helvetica', 'bold')
      doc.text(seg._rating, margin + cw * 0.75, y + 4.2)
      y += 6.5
    }
  }

  return y + 4
}

// ═══════════════════════════════════════════════════════════════
// Main export function
// ═══════════════════════════════════════════════════════════════

export async function generateReport(mapInstance, layerStack, data, dashboardMode, drawnBbox, options = {}) {
  // Apply palette before anything else so all helpers use the right colours
  Object.assign(C, options.lightMode ? LIGHT_PALETTE : DARK_PALETTE)
  if (!mapInstance) {
    console.error('No map instance available for report generation')
    return
  }

  // 1. Ensure ALL data is loaded
  await ensureAllData(data)

  // 2. Use drawn bounding box (required)
  const bbox = drawnBbox
  if (!bbox || bbox.length !== 4) {
    console.error('No bounding box provided for report generation')
    return
  }

  const rawMap = mapInstance.getMap ? mapInstance.getMap() : mapInstance

  // 3. Build road name lookup then filter all datasets to the drawn bbox
  const roadMidpoints = buildRoadMidpoints(data.roadsData)
  const enrichedPed = filterFeaturesByBbox(data.pedestrianData, bbox).map(f => {
    const name = resolveStreetName(f, roadMidpoints)
    return name ? { ...f, properties: { ...f.properties, STR_NAME: name } } : f
  })
  const enrichedCyc = filterFeaturesByBbox(data.cyclingData, bbox).map(f => {
    const name = resolveStreetName(f, roadMidpoints)
    return name ? { ...f, properties: { ...f.properties, STR_NAME: name } } : f
  })
  const filtered = {
    businesses: filterFeaturesByBbox(data.businessesData, bbox),
    stalls: filterFeaturesByBbox(data.streetStallsData, bbox),
    events: filterFeaturesByBbox(data.eventsData, bbox),
    pedestrian: enrichedPed,
    cycling: enrichedCyc,
    network: filterFeaturesByBbox(data.networkData, bbox),
    busStops: filterFeaturesByBbox(data.busStops, bbox),
    trainStations: filterFeaturesByBbox(data.trainStations, bbox),
    lightingSegments: filterFeaturesByBbox(data.lightingSegments, bbox),
    streetLights: filterFeaturesByBbox(data.streetLights, bbox),
    temperature: filterFeaturesByBbox(data.temperatureData, bbox),
    greenery: filterFeaturesByBbox(data.greeneryAndSkyview, bbox),
    treeCanopy: filterFeaturesByBbox(data.treeCanopyData, bbox),
    parks: filterFeaturesByBbox(data.parksData, bbox),
    traffic: filterFeaturesByBbox(data.trafficData, bbox),
  }

  // 4. Save the original map view so we can restore after all captures
  const savedView = {
    center: rawMap.getCenter(),
    zoom: rawMap.getZoom(),
    pitch: rawMap.getPitch(),
    bearing: rawMap.getBearing(),
  }

  // 5. Capture overview screenshot (top-down, cropped to bbox)
  rawMap.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
    padding: 15, animate: false, pitch: 0, bearing: 0, duration: 0,
  })
  await waitForIdle(rawMap)
  let overviewImage = null
  let overviewAspect = 1.8
  let overviewCenter = null
  let overviewZoom = null
  try {
    const captured = captureCanvas(rawMap)
    overviewImage = captured.dataUrl
    overviewAspect = captured.aspect
    overviewCenter = rawMap.getCenter()
    overviewZoom = rawMap.getZoom()
  } catch {}

  // 6. Capture per-section maps (hides data layers, adds section-specific ones)
  const sectionImages = await captureAllSectionMaps(rawMap, bbox, filtered)

  // 7. Restore the original view
  rawMap.jumpTo(savedView)

  // 8. Build PDF ──────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pw = doc.internal.pageSize.getWidth()   // 210
  const ph = doc.internal.pageSize.getHeight()  // 297
  const margin = 15
  const cw = pw - margin * 2
  const state = { totalPages: 1 }

  // ── Page 1: Cover ──────────────────────────────────────────
  drawBg(doc, pw, ph)
  drawHeader(doc, pw)
  let y = 52

  // Overview map (top-down, cropped to bbox, aspect-correct)
  if (overviewImage) {
    const mapH = Math.min(120, Math.max(60, cw / overviewAspect))
    doc.setDrawColor(...C.border)
    doc.setLineWidth(0.5)
    doc.roundedRect(margin, y, cw, mapH, 2, 2, 'S')
    doc.addImage(overviewImage, 'PNG', margin + 0.5, y + 0.5, cw - 1, mapH - 1)
    y += mapH + 3

    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...C.muted)
    const lat = overviewCenter ? overviewCenter.lat.toFixed(4) : '?'
    const lng = overviewCenter ? overviewCenter.lng.toFixed(4) : '?'
    const zm = overviewZoom ? overviewZoom.toFixed(1) : '?'
    doc.text(`Selected area: ${lat}°S, ${lng}°E · Zoom ${zm} · Bbox [${bbox.map(v => v.toFixed(4)).join(', ')}]`, margin, y)
    y += 6
  } else {
    const mapH = 100
    doc.setFillColor(...C.cardAlt)
    doc.roundedRect(margin, y, cw, mapH, 2, 2, 'F')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C.muted)
    doc.text('Map snapshot unavailable', pw / 2, y + mapH / 2, { align: 'center' })
    y += mapH + 8
  }

  // Viewport summary
  y = sectionTitle(doc, y, 'Viewport Summary', pw)
  const totalFeatures = Object.values(filtered).reduce((s, arr) => s + arr.length, 0)
  const summaryMetrics = [
    { label: 'Total Features in View', value: totalFeatures.toLocaleString() },
    { label: 'Businesses', value: filtered.businesses.length },
    { label: 'Events', value: filtered.events.length },
    { label: 'Street Stalls', value: filtered.stalls.length },
    { label: 'Walkability Features', value: filtered.pedestrian.length + filtered.cycling.length + filtered.network.length },
    { label: 'Transit Stops', value: filtered.busStops.length + filtered.trainStations.length },
    { label: 'Lighting Segments', value: filtered.lightingSegments.length },
    { label: 'Light Poles', value: filtered.streetLights.length },
    { label: 'Heat Streets', value: filtered.temperature.length },
    { label: 'Greenery Segments', value: filtered.greenery.length },
    { label: 'Parks', value: filtered.parks.length },
    { label: 'Traffic Segments', value: filtered.traffic.length },
  ]
  y = metricRow(doc, y, summaryMetrics, margin, cw)

  // ── Detailed sections (each with its own section map + stats) ──
  y = renderBusinessSection(doc, y, filtered, data.streetStallsData, data.eventsData, pw, ph, margin, cw, state, sectionImages.business)
  y = renderWalkabilitySection(doc, y, filtered, pw, ph, margin, cw, state, sectionImages.walkability_ped, sectionImages.walkability_cycling)
  y = renderLightingSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImages.lighting)
  y = renderTemperatureSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImages.temperature)
  y = renderGreenerySection(doc, y, filtered, pw, ph, margin, cw, state, sectionImages.greenery)
  y = renderTrafficSection(doc, y, filtered, pw, ph, margin, cw, state, sectionImages.traffic)

  // ── Methodology note ───────────────────────────────────────
  y = ensureSpace(doc, y, 30, pw, ph, state)
  y += 4
  doc.setFillColor(...C.card)
  doc.roundedRect(margin, y, cw, 22, 2, 2, 'F')
  doc.setDrawColor(...C.border)
  doc.roundedRect(margin, y, cw, 22, 2, 2, 'S')

  doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C.accent)
  doc.text('Methodology & Data Sources', margin + 4, y + 5)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...C.muted)
  const methodLines = [
    'Data sourced from municipal datasets, Google Places API and satellite imagery.',
    'Lighting KPIs derived from calibrated night-time imagery. Heat street data comes from climate.heat_streets.',
    'Each section map shows only the relevant layers for that domain. All features filtered to user-drawn bbox.'
  ]
  methodLines.forEach((line, i) => { doc.text(line, margin + 4, y + 10 + i * 4) })

  // ── Footers ────────────────────────────────────────────────
  for (let p = 1; p <= state.totalPages; p++) {
    doc.setPage(p)
    drawFooter(doc, pw, ph, p, state.totalPages)
  }

  // ── Save ───────────────────────────────────────────────────
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')
  doc.save(`Mission_Viewport_Report_${timestamp}.pdf`)
}
