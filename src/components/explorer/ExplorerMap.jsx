import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Source, Layer, Popup } from 'react-map-gl'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as turf from '@turf/turf'
import { latLngToCell, cellToBoundary } from 'h3-js'
import 'mapbox-gl/dist/mapbox-gl.css'
import { isBusinessOpen } from '../../utils/timeUtils'
import { colorScales } from '../../utils/dataLoader'
import { MAPBOX_TOKEN } from '../../utils/mapboxToken'
import './ExplorerMap.css'

const ECOLOGY_HEAT_PEDESTAL_MIN_M = 1.4
const ECOLOGY_HEAT_PEDESTAL_MAX_M = 3.6
const ECOLOGY_BUILDING_LIFT_M = 2.2
const ECOLOGY_SELECTION_LARGE_AREA_M2 = 6000
const ECOLOGY_SELECTION_TARGET_AREA_M2 = 2500
const ECOLOGY_SELECTION_MAX_SEGMENTS = 25
const ECOLOGY_EXTREME_HEAT_SCORE = 75
const ECOLOGY_EXTREME_COOL_ISLAND_SCORE = 50
const EVENT_COORD_PRECISION = 6
const WIND_FILL_COLOR = [
  'case',
  ['>=', ['coalesce', ['get', 'class_value'], 1], 3], '#fb7185',
  ['>=', ['coalesce', ['get', 'class_value'], 1], 2], '#facc15',
  '#67e8f9'
]
const WIND_FILL_OPACITY = [
  'case',
  ['>=', ['coalesce', ['get', 'class_value'], 1], 3], 0.52,
  ['>=', ['coalesce', ['get', 'class_value'], 1], 2], 0.32,
  0.14
]
const WIND_TUNNEL_FILTER = ['>=', ['coalesce', ['get', 'class_value'], 1], 3]
const PARCEL_ZONING_COLOR_EXPRESSION = [
  'match',
  ['coalesce', ['get', 'zoning_group'], 'Unknown'],
  'Residential', '#60a5fa',
  'Business', '#f97316',
  'Mixed Use', '#a78bfa',
  'Community', '#22c55e',
  'Open Space', '#84cc16',
  'Transport', '#94a3b8',
  'Utility', '#facc15',
  'Limited Use', '#fb7185',
  'Other', '#38bdf8',
  'Unknown', '#64748b',
  '#38bdf8'
]
const PARCEL_VALUE_CHANGE_COLOR_EXPRESSION = [
  'match',
  ['coalesce', ['get', 'value_change_group'], 'No comparison'],
  'Rising fast', '#16a34a',
  'Rising', '#86efac',
  'Stable', '#facc15',
  'Dropping', '#fb923c',
  'Dropping fast', '#dc2626',
  'No comparison', '#64748b',
  '#64748b'
]
const SERVICE_REQUEST_GROUPS = [
  { id: 'Sewage', color: '#2563eb', soft: 'rgba(37,99,235,0.12)', mid: 'rgba(37,99,235,0.46)', strong: 'rgba(37,99,235,0.86)' },
  { id: 'Water', color: '#06b6d4', soft: 'rgba(6,182,212,0.12)', mid: 'rgba(6,182,212,0.46)', strong: 'rgba(6,182,212,0.86)' },
  { id: 'Electricity', color: '#f59e0b', soft: 'rgba(245,158,11,0.12)', mid: 'rgba(245,158,11,0.48)', strong: 'rgba(245,158,11,0.9)' },
  { id: 'Roads & Stormwater', color: '#a855f7', soft: 'rgba(168,85,247,0.12)', mid: 'rgba(168,85,247,0.48)', strong: 'rgba(168,85,247,0.9)' },
  { id: 'Waste & Cleansing', color: '#22c55e', soft: 'rgba(34,197,94,0.12)', mid: 'rgba(34,197,94,0.46)', strong: 'rgba(34,197,94,0.86)' },
  { id: 'Public Realm', color: '#84cc16', soft: 'rgba(132,204,22,0.12)', mid: 'rgba(132,204,22,0.46)', strong: 'rgba(132,204,22,0.86)' },
  { id: 'Other', color: '#94a3b8', soft: 'rgba(148,163,184,0.1)', mid: 'rgba(148,163,184,0.36)', strong: 'rgba(148,163,184,0.68)' }
]

const slugifyLayerId = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const formatRandCompact = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  const sign = numeric < 0 ? '-' : ''
  const absolute = Math.abs(numeric)
  if (absolute >= 1000000000) return `${sign}R${(absolute / 1000000000).toFixed(1)}B`
  if (absolute >= 1000000) return `${sign}R${(absolute / 1000000).toFixed(1)}M`
  if (absolute >= 1000) return `${sign}R${Math.round(absolute / 1000)}k`
  return `${sign}R${Math.round(absolute)}`
}

const toEcologyFeatureKey = (value) => {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

const parseEcologySelectionKey = (value) => {
  const key = toEcologyFeatureKey(value)
  if (!key) return null
  const match = key.match(/^(.*)__seg_(\d+)_of_(\d+)$/)
  if (!match) {
    return {
      selectionKey: key,
      parentKey: key,
      segmentIndex: null,
      segmentCount: null
    }
  }
  return {
    selectionKey: key,
    parentKey: match[1],
    segmentIndex: Number(match[2]),
    segmentCount: Number(match[3])
  }
}

const getEventCoordinateKey = (feature) => {
  const coordinates = feature?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const [lng, lat] = coordinates
  return `${Number(lng).toFixed(EVENT_COORD_PRECISION)},${Number(lat).toFixed(EVENT_COORD_PRECISION)}`
}

const getStreetViewCoordinates = (feature) => {
  const geometry = feature?.geometry
  if (!geometry) return null

  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates || []
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
  }

  if (geometry.type === 'MultiPoint') {
    const [lng, lat] = geometry.coordinates?.[0] || []
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
  }

  try {
    const centroid = turf.centroid(feature)
    const [lng, lat] = centroid?.geometry?.coordinates || []
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null
  } catch {
    return null
  }
}

const getStreetViewUrl = (feature) => {
  const coordinates = getStreetViewCoordinates(feature)
  if (!coordinates) return null
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinates.lat},${coordinates.lng}`
}

const getEcologySelectionGrid = (feature, explicitSegmentCount = null) => {
  const areaM2 = Number(feature?.properties?.area_m2)
  if (!Number.isFinite(areaM2) || areaM2 <= ECOLOGY_SELECTION_LARGE_AREA_M2) return null

  const targetCount = explicitSegmentCount || Math.max(
    2,
    Math.min(
      ECOLOGY_SELECTION_MAX_SEGMENTS,
      Math.ceil(areaM2 / ECOLOGY_SELECTION_TARGET_AREA_M2)
    )
  )

  const [minX, minY, maxX, maxY] = turf.bbox(feature)
  const width = Math.max(maxX - minX, 1e-9)
  const height = Math.max(maxY - minY, 1e-9)
  const aspect = width / height
  const cols = Math.max(1, Math.ceil(Math.sqrt(targetCount * aspect)))
  const rows = Math.max(1, Math.ceil(targetCount / cols))

  return {
    minX,
    minY,
    maxX,
    maxY,
    cols,
    rows,
    cellWidth: width / cols,
    cellHeight: height / rows,
    segmentCount: rows * cols
  }
}

const buildEcologySelectionCell = (grid, row, col) => {
  const x0 = grid.minX + col * grid.cellWidth
  const x1 = col === grid.cols - 1 ? grid.maxX : x0 + grid.cellWidth
  const y0 = grid.minY + row * grid.cellHeight
  const y1 = row === grid.rows - 1 ? grid.maxY : y0 + grid.cellHeight

  return turf.polygon([[
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0]
  ]])
}

const buildEcologySelectionKeyFromClick = (feature, lngLat) => {
  const featureKey = toEcologyFeatureKey(feature?.properties?.feature_id_key || feature?.properties?.feature_id)
  if (!featureKey) return null

  const grid = getEcologySelectionGrid(feature)
  if (!grid) return featureKey

  const clickPoint = turf.point([lngLat.lng, lngLat.lat])
  let bestMatch = null

  for (let row = 0; row < grid.rows; row += 1) {
    for (let col = 0; col < grid.cols; col += 1) {
      const segmentIndex = (row * grid.cols) + col + 1
      const cell = buildEcologySelectionCell(grid, row, col)

      try {
        const clipped = turf.intersect(feature, cell)
        if (!clipped || turf.area(clipped) <= 1) continue

        if (turf.booleanPointInPolygon(clickPoint, clipped)) {
          return `${featureKey}__seg_${segmentIndex}_of_${grid.segmentCount}`
        }

        const centroid = turf.centroid(clipped)
        const distance = turf.distance(clickPoint, centroid)
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { segmentIndex, distance }
        }
      } catch {
        // Ignore failed segment intersections during click resolution.
      }
    }
  }

  return bestMatch
    ? `${featureKey}__seg_${bestMatch.segmentIndex}_of_${grid.segmentCount}`
    : featureKey
}

const buildEcologySelectionFeature = (feature, selectionKey) => {
  const parsedSelection = parseEcologySelectionKey(selectionKey)
  if (!feature || !parsedSelection?.segmentIndex || !parsedSelection?.segmentCount) return feature

  const grid = getEcologySelectionGrid(feature, parsedSelection.segmentCount)
  if (!grid) return feature

  const zeroBasedIndex = parsedSelection.segmentIndex - 1
  const row = Math.floor(zeroBasedIndex / grid.cols)
  const col = zeroBasedIndex % grid.cols
  const cell = buildEcologySelectionCell(grid, row, col)

  try {
    const clipped = turf.intersect(feature, cell)
    if (clipped && turf.area(clipped) > 1) {
      return {
        ...clipped,
        properties: { ...feature.properties }
      }
    }
  } catch {
    // Fall back to the full feature if clipping fails.
  }

  return feature
}

const ECOLOGY_METRIC_CONFIG = {
  predicted_lst_c_fusion: {
    label: 'Modelled LST',
    description: 'Base thermal heat map',
    property: 'predicted_lst_c_fusion_relative_percentile',
    colorStops: [
      [0, '#dbeafe'],
      [20, '#22c55e'],
      [60, '#facc15'],
      [80, '#f97316'],
      [90, '#dc2626'],
      [100, '#7f1d1d']
    ]
  },
  urban_heat_score: {
    label: 'Heat Islands',
    description: 'Only the hottest island hotspots',
    property: 'urban_heat_score_relative_percentile',
    colorStops: [
      [0, '#dbeafe'],
      [20, '#22c55e'],
      [60, '#facc15'],
      [80, '#f97316'],
      [90, '#dc2626'],
      [100, '#7f1d1d']
    ]
  },
  pedestrian_heat_score: {
    label: 'Pedestrian Heat',
    description: 'Street exposure and thermal stress',
    property: 'pedestrian_heat_score_relative_percentile',
    colorStops: [
      [0, '#dbeafe'],
      [20, '#22c55e'],
      [60, '#facc15'],
      [80, '#f97316'],
      [90, '#dc2626'],
      [100, '#991b1b']
    ]
  },
  priority_score: {
    label: 'Priority Score',
    description: 'Intervention targeting priority',
    property: 'priority_score_relative_percentile',
    colorStops: [
      [0, '#ecfeff'],
      [20, '#22c55e'],
      [60, '#fef08a'],
      [80, '#f97316'],
      [90, '#dc2626'],
      [100, '#7f1d1d']
    ]
  },
  retained_heat_score: {
    label: 'Retained Heat',
    description: 'Nighttime heat persistence',
    property: 'retained_heat_score_relative_percentile',
    colorStops: [
      [0, '#dbeafe'],
      [20, '#22c55e'],
      [60, '#c084fc'],
      [80, '#ef4444'],
      [90, '#991b1b'],
      [100, '#450a0a']
    ]
  },
  effective_canopy_pct: {
    label: 'Effective Canopy',
    description: 'Shade coverage adjusted for canopy health',
    property: 'effective_canopy_pct_relative_percentile',
    colorStops: [
      [0, '#7f1d1d'],
      [20, '#f97316'],
      [60, '#facc15'],
      [80, '#86efac'],
      [90, '#22c55e'],
      [100, '#14532d']
    ]
  },
  thermal_percentile: {
    label: 'Thermal Percentile',
    description: 'Relative heat rank',
    property: 'thermal_percentile',
    colorStops: [
      [0, '#f8fafc'],
      [25, '#fde68a'],
      [50, '#fbbf24'],
      [75, '#f97316'],
      [100, '#991b1b']
    ]
  },
  cool_island_score: {
    label: 'Cool Islands',
    description: 'Only the strongest cooling refuges',
    property: 'cool_island_score',
    colorStops: [
      [50, '#7dd3fc'],
      [65, '#22d3ee'],
      [90, '#14b8a6'],
      [100, '#0f766e']
    ]
  },
  health_score: {
    label: 'Health Score',
    description: 'Vegetation condition',
    property: 'health_score',
    colorStops: [
      [0, '#4a2c1c'],
      [20, '#7c5a2a'],
      [40, '#a3a334'],
      [60, '#65a30d'],
      [80, '#22c55e'],
      [100, '#14532d']
    ]
  },
  surface_air_delta_c: {
    label: 'Surface-Air Delta',
    description: 'Local heat-island effect',
    property: 'surface_air_delta_c',
    colorStops: [
      [12, '#082f49'],
      [14.5, '#0369a1'],
      [16.5, '#38bdf8'],
      [18.5, '#fde68a'],
      [20.5, '#fb923c'],
      [22.5, '#ef4444'],
      [25.5, '#7f1d1d']
    ]
  }
}

const buildEcologyInterpolatedExpression = (property, stops) => {
  const fallback = stops[0]?.[0] ?? 0
  const expr = ['interpolate', ['linear'], ['coalesce', ['get', property], fallback]]
  stops.forEach(([stop, value]) => {
    expr.push(stop)
    expr.push(value)
  })
  return expr
}

const buildEcologyMetricFilter = (metricId) => {
  return [
    'all',
    ['!=', ['coalesce', ['get', ECOLOGY_METRIC_CONFIG[metricId]?.property || metricId], null], null],
    ['>=', ['coalesce', ['get', ECOLOGY_METRIC_CONFIG[metricId]?.property || metricId], -1], 0]
  ]
}

const ExplorerMap = ({
  dashboardMode,
  businessMode,
  walkabilityMode,
  routeLayerMode = 'combined',
  showPopularRoutesOnly = false,
  networkMetric,
  transitView = 'combined',
  dayOfWeek,
  hour,
  businessesData,
  streetStallsData,
  surveyData,
  propertiesData,
  landParcelsData,
  parcelColorMode = 'zoning',
  networkData,
  pedestrianData,
  cyclingData,
  transitData,
  busStopsData,
  trainStationData,
  roadSteepnessData,
  lightingSegments,
  streetLights,
  missionInterventions,
  lightingThresholds,
  temperatureData,
  heatGridData,
  shadeData,
  estimatedWindData,
  windSpeedKmh = 18,
  season,
  greeneryAndSkyview,
  treeCanopyData,
  parksData,
  showGreenDestinations = true,
  greeneryMapMode = 'percentile',
  showUnderservedGreenery = true,
  ecologyHeatData,
  ecologyMetric = 'predicted_lst_c_fusion',
  selectedEcologyFeatureKeys = [],
  selectedHeatGridFeatureKeys = [],
  envCurrentData,
  envHistoryData,
  envIndex = 'uaqi',
  onEnvGridDetail,
  onGreeneryStreetSelect,
  onEcologyFeatureSelect,
  onHeatGridFeatureSelect,
  visibleLayers,
  layerStack = [],
  activeCategory,
  onMapLoad,
  enableCanvasCapture = false,
  drawBboxMode,
  onBboxDrawn,
  opinionSource,
  amenitiesFilters,
  categoriesFilters,
  selectedSegment,
  onSegmentSelect,
  onRouteSegmentClick,
  trafficData,
  trafficScenario = 'WORK_MORNING',
  sentimentSegments,
  sentimentPerspective = 'public',
  serviceRequests,
  eventsData,
  eventsMonth,
  ratingFilter = null   // null = all, array of floor values e.g. [4,5]
}) => {
  const mapRef = useRef()
  const rawMapRef = useRef(null)
  const mapLib = useMemo(() => import('mapbox-gl'), [])
  const mapDebugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugMaps') === '1'
  const debugMap = useCallback((message, details = null) => {
    if (!mapDebugEnabled) return
    if (details === null) {
      console.log(`[ExplorerMap] ${message}`)
      return
    }
    console.log(`[ExplorerMap] ${message}`, details)
  }, [mapDebugEnabled])

  // ─── Hex layer opacity — fades to 0 and back when envCurrentData changes ──
  const [hexOpacity, setHexOpacity] = useState(0)
  const hexFadeTimer = useRef(null)
  useEffect(() => {
    // Fade out instantly, then fade back in after the GeoJSON has a render frame
    setHexOpacity(0)
    clearTimeout(hexFadeTimer.current)
    hexFadeTimer.current = setTimeout(() => setHexOpacity(1), 80)
    return () => clearTimeout(hexFadeTimer.current)
  }, [envCurrentData])

  // Helper function to check if a category should be rendered
  const shouldRenderCategory = (categoryId) => {
    const hasMobilityContext = (
      layerStack.some(layer => layer.id === 'activeMobility')
      || activeCategory === 'activeMobility'
    )

    if ((categoryId === 'pedestrianRoutes' || categoryId === 'cyclingRoutes') && hasMobilityContext) {
      if (walkabilityMode !== 'activity') return false
      if (routeLayerMode === 'walking') return categoryId === 'pedestrianRoutes'
      if (routeLayerMode === 'cycling') return categoryId === 'cyclingRoutes'
      return true
    }
    // Check if this category is in the layer stack (either as active or locked)
    return layerStack.some(layer => layer.id === categoryId) || activeCategory === categoryId
  }

  // ─── Per-metric air quality config ──────────────────────────────────────────
  const ENV_METRICS = {
    uaqi:             { field: 'uaqi',             label: 'UAQI',  unit: '' },
    poll_o3_value:    { field: 'poll_o3_value',    label: 'O₃',    unit: 'µg/m³' },
    poll_no2_value:   { field: 'poll_no2_value',   label: 'NO₂',   unit: 'µg/m³' },
    poll_pm10_value:  { field: 'poll_pm10_value',  label: 'PM10',  unit: 'µg/m³' },
    poll_co_value:    { field: 'poll_co_value',    label: 'CO',    unit: 'µg/m³' },
    poll_so2_value:   { field: 'poll_so2_value',   label: 'SO₂',   unit: 'µg/m³' },
  }

  // 7-stop gradient: cool blue → teal → green → lime → amber → orange → red
  const AQ_PALETTE = ['#2563eb', '#0891b2', '#059669', '#65a30d', '#ca8a04', '#ea580c', '#dc2626']

  // Build interpolation across actual per-metric data range for colour differentiation
  const buildEnvColorExpr = (idx, currentRows, histRows) => {
    // "avg" mode: use historic averages per location to show spatial hotspots
    if (idx === 'avg') {
      const byLoc = {}
      ;(histRows || []).forEach(r => {
        if (r.uaqi != null) {
          if (!byLoc[r.grid_id]) byLoc[r.grid_id] = []
          byLoc[r.grid_id].push(r.uaqi)
        }
      })
      const avgs = Object.values(byLoc).map(arr => arr.reduce((s, v) => s + v, 0) / arr.length)
      if (avgs.length === 0) return AQ_PALETTE[3]
      const min = Math.min(...avgs), max = Math.max(...avgs), range = max - min
      if (range < 0.001) return AQ_PALETTE[3]
      const lo = min - range * 0.05, hi = max + range * 0.05, span = hi - lo
      const expr = ['interpolate', ['linear'], ['coalesce', ['get', 'avg_uaqi'], lo]]
      AQ_PALETTE.forEach((c, i) => { expr.push(lo + (i / (AQ_PALETTE.length - 1)) * span); expr.push(c) })
      return expr
    }
    const metric = ENV_METRICS[idx] || ENV_METRICS.uaqi
    // Use the normalised 0-1 field stored per feature so every metric maps correctly
    const normField = `_norm_${metric.field}`
    // Fallback: if normField isn't available yet, use raw values with proper range
    const vals = (currentRows || []).map(r => r[metric.field]).filter(v => v != null && !isNaN(+v))
    if (vals.length === 0) {
      return ['interpolate', ['linear'], ['coalesce', ['get', normField], 0.5],
        0, AQ_PALETTE[0], 0.5, AQ_PALETTE[3], 1, AQ_PALETTE[6]]
    }
    // Always interpolate over the normalised 0-1 range; null → grey "no data"
    const interpolate = ['interpolate', ['linear'], ['get', normField]]
    AQ_PALETTE.forEach((c, i) => {
      interpolate.push(i / (AQ_PALETTE.length - 1))
      interpolate.push(c)
    })
    return ['case', ['==', ['get', normField], null], '#374151', interpolate]
  }

  const envColorExpr = useMemo(
    () => buildEnvColorExpr(envIndex || 'uaqi', envCurrentData?.rows, envHistoryData?.rows),
    [envIndex, envCurrentData, envHistoryData]
  )

  // Data range for legend / labels
  const envDataRange = useMemo(() => {
    const metric = ENV_METRICS[envIndex] || ENV_METRICS.uaqi
    const vals = (envCurrentData?.rows || []).map(r => r[metric.field]).filter(v => v != null && !isNaN(v))
    if (vals.length === 0) return null
    return { min: Math.min(...vals), max: Math.max(...vals), field: metric.field, label: metric.label, unit: metric.unit }
  }, [envIndex, envCurrentData])

  const ecologyHeatPolygonData = useMemo(() => {
    if (!ecologyHeatData?.features?.length) return null

    return {
      ...ecologyHeatData,
      features: ecologyHeatData.features.map((feature) => {
        const urbanHeatScore = Number(feature.properties?.urban_heat_score)
        const thermalPercentile = Number(feature.properties?.thermal_percentile)
        const coolIslandScore = Number(feature.properties?.cool_island_score)
        const healthScore = Number(feature.properties?.health_score)
        const surfaceAirDelta = Number(feature.properties?.surface_air_delta_c)
        const predictedLstFusion = Number(feature.properties?.predicted_lst_c_fusion ?? feature.properties?.heat_model_lst_c ?? feature.properties?.mean_lst_c)
        const pedestrianHeatScore = Number(feature.properties?.pedestrian_heat_score)
        const priorityScore = Number(feature.properties?.priority_score)
        const retainedHeatScore = Number(feature.properties?.night_heat_retention_c ?? feature.properties?.retained_heat_score)
        const effectiveCanopyPct = Number(feature.properties?.effective_canopy_pct)
        const thermalConfidenceScore = Number(feature.properties?.thermal_confidence_score)
        const featureKey = toEcologyFeatureKey(feature.properties?.feature_id)
        const heatBalanceScore = (
          (Number.isFinite(urbanHeatScore) ? urbanHeatScore : 0)
          + (Number.isFinite(thermalPercentile) ? thermalPercentile * 0.35 : 0)
          - (Number.isFinite(coolIslandScore) ? coolIslandScore * 0.68 : 0)
        )
        const enrichedFeature = {
          ...feature,
          properties: {
            ...feature.properties,
            feature_id_key: featureKey,
            parent_feature_id_key: featureKey,
            urban_heat_score: Number.isFinite(urbanHeatScore) ? urbanHeatScore : null,
            thermal_percentile: Number.isFinite(thermalPercentile) ? thermalPercentile : null,
            cool_island_score: Number.isFinite(coolIslandScore) ? coolIslandScore : null,
            health_score: Number.isFinite(healthScore) ? healthScore : null,
            predicted_lst_c_fusion: Number.isFinite(predictedLstFusion) ? predictedLstFusion : null,
            pedestrian_heat_score: Number.isFinite(pedestrianHeatScore) ? pedestrianHeatScore : null,
            priority_score: Number.isFinite(priorityScore) ? priorityScore : null,
            night_heat_retention_c: Number.isFinite(retainedHeatScore) ? retainedHeatScore : null,
            retained_heat_score: Number.isFinite(retainedHeatScore) ? retainedHeatScore : null,
            effective_canopy_pct: Number.isFinite(effectiveCanopyPct) ? effectiveCanopyPct : null,
            thermal_confidence_score: Number.isFinite(thermalConfidenceScore) ? thermalConfidenceScore : null,
            mean_lst_c: Number.isFinite(Number(feature.properties?.mean_lst_c)) ? Number(feature.properties.mean_lst_c) : null,
            surface_air_delta_c: Number.isFinite(surfaceAirDelta) ? surfaceAirDelta : null,
            heat_balance_score: heatBalanceScore
          }
        }
        return enrichedFeature
      })
    }
  }, [ecologyHeatData])

  const selectedEcologyPrimaryKey = selectedEcologyFeatureKeys[0] || null
  const selectedEcologyCompareKey = selectedEcologyFeatureKeys[1] || null
  const ecologyMetricConfig = ECOLOGY_METRIC_CONFIG[ecologyMetric] || ECOLOGY_METRIC_CONFIG.predicted_lst_c_fusion
  const ecologyMetricPaint = useMemo(() => {
    return buildEcologyInterpolatedExpression(ecologyMetricConfig.property, ecologyMetricConfig.colorStops)
  }, [ecologyMetricConfig])
  const ecologyMetricFilter = useMemo(() => buildEcologyMetricFilter(ecologyMetric), [ecologyMetric])
  const ecologyHeatVolumeHeight = useMemo(() => {
    const heightStops = ecologyMetricConfig.colorStops.map(([stop], index, stops) => {
      const progress = stops.length > 1 ? index / (stops.length - 1) : 1
      const easedProgress = Math.pow(progress, 0.8)
      const height = ECOLOGY_HEAT_PEDESTAL_MIN_M + (ECOLOGY_HEAT_PEDESTAL_MAX_M - ECOLOGY_HEAT_PEDESTAL_MIN_M) * easedProgress
      return [stop, Number(height.toFixed(2))]
    })
    return buildEcologyInterpolatedExpression(ecologyMetricConfig.property, heightStops)
  }, [ecologyMetricConfig])
  const ecologySelectionGeometryData = useMemo(() => {
    if (!ecologyHeatPolygonData?.features?.length) return null

    const featureLookup = {}
    ecologyHeatPolygonData.features.forEach((feature) => {
      const featureKey = feature.properties?.feature_id_key
      if (featureKey) featureLookup[featureKey] = feature
    })

    const selectedEntries = [
      { selectionKey: selectedEcologyPrimaryKey, role: 'primary' },
      { selectionKey: selectedEcologyCompareKey, role: 'compare' }
    ].filter((entry) => entry.selectionKey)

    if (!selectedEntries.length) return null

    return {
      type: 'FeatureCollection',
      features: selectedEntries.map((entry) => {
        const parsedSelection = parseEcologySelectionKey(entry.selectionKey)
        const baseFeature = featureLookup[parsedSelection?.parentKey]
        if (!baseFeature) return null
        return {
          ...buildEcologySelectionFeature(baseFeature, entry.selectionKey),
          properties: {
            ...baseFeature.properties,
            selection_role: entry.role
          }
        }
      }).filter(Boolean)
    }
  }, [ecologyHeatPolygonData, selectedEcologyCompareKey, selectedEcologyPrimaryKey])
  const ecologySelectionMarkerData = useMemo(() => {
    if (!ecologySelectionGeometryData?.features?.length) return null
    return {
      type: 'FeatureCollection',
      features: ecologySelectionGeometryData.features.map((feature) => {
        const isPrimary = feature.properties?.selection_role === 'primary'
        const centroid = turf.centroid(feature)
        return {
          ...centroid,
          properties: {
            marker_label: isPrimary ? 'A' : 'B',
            marker_color: isPrimary ? '#f97316' : '#67e8f9',
            marker_title: `Section #${feature.properties?.feature_id}${feature.properties?.segment_label ? ` · ${feature.properties.segment_label}` : ''}`
          }
        }
      })
    }
  }, [ecologySelectionGeometryData])

  // ─── Per-grid-cell historic averages (for "avg" mode) ────────────────────
  const histAvgByLocation = useMemo(() => {
    const rows = envHistoryData?.rows
    if (!rows) return {}
    const buckets = {}
    rows.forEach(r => {
      if (!buckets[r.grid_id]) buckets[r.grid_id] = { uaqi: [], o3: [], no2: [], pm10: [], co: [], so2: [] }
      const b = buckets[r.grid_id]
      if (r.uaqi != null) b.uaqi.push(r.uaqi)
      if (r.poll_o3 != null) b.o3.push(parseFloat(r.poll_o3))
      if (r.poll_no2 != null) b.no2.push(parseFloat(r.poll_no2))
      if (r.poll_pm10 != null) b.pm10.push(parseFloat(r.poll_pm10))
      if (r.poll_co != null) b.co.push(parseFloat(r.poll_co))
      if (r.poll_so2 != null) b.so2.push(parseFloat(r.poll_so2))
    })
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    const result = {}
    Object.entries(buckets).forEach(([loc, b]) => {
      result[loc] = {
        avg_uaqi: avg(b.uaqi), avg_o3: avg(b.o3), avg_no2: avg(b.no2),
        avg_pm10: avg(b.pm10), avg_co: avg(b.co), avg_so2: avg(b.so2)
      }
    })
    return result
  }, [envHistoryData])

  // ─── H3 hexagons — each sample point mapped to its H3 res-8 hex ───────────
  const H3_RES = 8
  const gridGeoJSON = useMemo(() => {
    const rows = envCurrentData?.rows
    if (!rows || rows.length === 0) return null

    const validRows = rows.filter(r => r.latitude != null && r.longitude != null)
    if (validRows.length === 0) return null

    // When multiple rows fall into the same hex, average their values
    const hexBuckets = {}
    validRows.forEach(r => {
      const h3Index = latLngToCell(r.latitude, r.longitude, H3_RES)
      if (!hexBuckets[h3Index]) hexBuckets[h3Index] = []
      hexBuckets[h3Index].push(r)
    })

    // Pre-compute per-metric min/max using rounded integers — same precision as the displayed label
    // This ensures tiles showing the same number always get the same colour
    const allMetricFields = Object.values(ENV_METRICS).map(m => m.field)
    const metricRange = {}
    allMetricFields.forEach(f => {
      const vals = validRows
        .map(r => r[f])
        .filter(v => v != null && v !== '' && !isNaN(+v))
        .map(v => Math.round(+v))   // round to integer, same as label display
      if (vals.length) {
        metricRange[f] = { min: Math.min(...vals), max: Math.max(...vals) }
      }
    })

    const cells = Object.entries(hexBuckets).map(([h3Index, bucket]) => {
      // Average each numeric field across rows that share this hex (null-safe)
      const merged = { ...bucket[0] }
      if (bucket.length > 1) {
        allMetricFields.forEach(f => {
          const nums = bucket
            .map(r => r[f])
            .filter(v => v != null && v !== '' && !isNaN(+v))
            .map(v => +v)
          if (nums.length) merged[f] = nums.reduce((s, v) => s + v, 0) / nums.length
        })
      }

      // Add normalised 0-1 value per metric for colour mapping
      // Normalise using the rounded integer (= what the user sees) so same label → same colour
      allMetricFields.forEach(f => {
        const rawVal = merged[f]
        const hasValue = rawVal != null && rawVal !== '' && !isNaN(+rawVal)
        const range = metricRange[f]
        const spread = range ? range.max - range.min : 0
        if (!hasValue) {
          merged[`_norm_${f}`] = null
        } else if (!range || spread === 0) {
          // All tiles have the same rounded value → all same colour
          merged[`_norm_${f}`] = 0.5
        } else {
          merged[`_norm_${f}`] = (Math.round(+rawVal) - range.min) / spread
        }
      })

      const props = {
        ...merged,
        ...(histAvgByLocation[merged.grid_id] || {}),
        name: (merged.grid_id || '').replace(/_/g, ' '),
        h3Index
      }

      // Build hex polygon from H3 boundary (returns [lat, lng] pairs → swap to [lng, lat])
      const boundary = cellToBoundary(h3Index)
      const ring = boundary.map(([lat, lng]) => [lng, lat])
      ring.push(ring[0]) // close the ring
      return turf.polygon([ring], props)
    })

    return turf.featureCollection(cells)
  }, [envCurrentData, histAvgByLocation])

  // Debug logging for mission interventions
  useEffect(() => {
    if (missionInterventions) {
      console.log('Mission interventions data available:', {
        features: missionInterventions.features?.length,
        shouldRender: shouldRenderCategory('missionInterventions'),
        activeCategory,
        layerStack
      })
    }
  }, [missionInterventions, activeCategory, layerStack])
  
  // Helper function to get business name from displayName (which might be JSON string)
  const getBusinessName = (properties) => {
    if (!properties) return 'Business'
    
    // Try displayName first
    let displayName = properties.displayName
    
    // If displayName is a string, try to parse it as JSON
    if (typeof displayName === 'string') {
      try {
        displayName = JSON.parse(displayName)
      } catch (e) {
        // If parsing fails, use it as is
      }
    }
    
    // Extract text from displayName object
    if (displayName && typeof displayName === 'object' && displayName.text) {
      return displayName.text
    }
    
    // Check for biz_name (vendor opinions/street stalls)
    if (properties.biz_name && properties.biz_name.trim() !== '') {
      return properties.biz_name
    }
    
    // Fallbacks
    return displayName || properties.name || 'Street Vendor'
  }

  // Helper function to check if amenity is true (handles both boolean and string)
  const isAmenityTrue = (value) => {
    return value === true || value === 'True' || value === 'true'
  }
  const [viewState, setViewState] = useState({
    longitude: 18.4241,
    latitude: -33.9249,
    zoom: 14,
    pitch: 45,
    bearing: 0
  })
  
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [popupInfo, setPopupInfo] = useState(null)

  // ── Bbox drawing state ──────────────────────────────────────
  const [boxPos, setBoxPos] = useState(null)    // { x, y } top-left of fixed box
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ dx: 0, dy: 0 })
  const BOX_W = 500, BOX_H = 400               // fixed box size in px

  const handleDrawMouseDown = useCallback((e) => {
    if (!drawBboxMode) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    // Only place a new box if clicking outside an existing box (dragging is handled on the box element)
    if (boxPos && mx >= boxPos.x && mx <= boxPos.x + BOX_W && my >= boxPos.y && my <= boxPos.y + BOX_H) return
    // Place box centered on click
    setBoxPos({ x: mx - BOX_W / 2, y: my - BOX_H / 2 })
  }, [drawBboxMode, boxPos])

  const handleDrawMouseMove = useCallback((e) => {
    if (!isDragging || !boxPos) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    setBoxPos({ x: mx - dragOffset.current.dx, y: my - dragOffset.current.dy })
  }, [isDragging, boxPos])

  const handleDrawMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      return
    }
  }, [isDragging])

  const handleConfirmBox = useCallback(() => {
    if (!boxPos) return
    const map = mapRef.current?.getMap?.()
    if (!map) return
    const sw = map.unproject([boxPos.x, boxPos.y + BOX_H])
    const ne = map.unproject([boxPos.x + BOX_W, boxPos.y])
    onBboxDrawn?.({ bbox: [sw.lng, sw.lat, ne.lng, ne.lat] })
    setBoxPos(null)
  }, [boxPos, onBboxDrawn])

  // Reset draw state when mode is toggled off
  useEffect(() => {
    if (!drawBboxMode) {
      setBoxPos(null)
      setIsDragging(false)
    }
  }, [drawBboxMode])

  // Animated traffic flow dash offset
  const dashOffsetRef = useRef(0)
  const rafRef = useRef(null)

  // Start/stop flow animation when traffic layer is active
  useEffect(() => {
    const animate = () => {
      dashOffsetRef.current = (dashOffsetRef.current - 0.5) % 16
      const map = mapRef.current?.getMap?.()
      if (map && map.getLayer('traffic-flow-animated')) {
        map.setPaintProperty('traffic-flow-animated', 'line-dasharray', [
          2, 2
        ])
        map.setPaintProperty('traffic-flow-animated', 'line-dash-offset', dashOffsetRef.current)
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // Fog / atmosphere effect
  useEffect(() => {
    const map = mapRef.current?.getMap?.()
    if (!map) return
    const applyFog = () => {
      const isThermalMode = activeCategory === 'urbanHeatConcrete'
      map.setFog(isThermalMode ? {
        color: 'rgba(22, 16, 14, 0.96)',
        'high-color': 'rgba(64, 30, 20, 0.78)',
        'horizon-blend': 0.08,
        'space-color': 'rgba(5, 8, 15, 0.98)',
        'star-intensity': 0.1
      } : {
        color: 'rgb(10, 12, 18)',
        'high-color': 'rgb(18, 22, 36)',
        'horizon-blend': 0.04,
        'space-color': 'rgb(4, 6, 12)',
        'star-intensity': 0.4
      })
    }
    if (map.isStyleLoaded()) {
      applyFog()
    } else {
      map.once('style.load', applyFog)
    }
  }, [activeCategory])
  
  // Debug logging
  useEffect(() => {
    console.log('ExplorerMap render:', {
      dashboardMode,
      businessMode,
      hasBusinessesData: !!businessesData,
      businessCount: businessesData?.features?.length,
      visibleLayers
    })
  }, [dashboardMode, businessMode, businessesData, visibleLayers])
  
  // Filter businesses by open status
  const filteredBusinesses = businessesData?.features
    ? {
        type: 'FeatureCollection',
        features: businessesData.features.filter(f => 
          isBusinessOpen(f, dayOfWeek, hour)
        )
      }
    : null

  const serviceRequestClustersByGroup = useMemo(() => {
    const features = serviceRequests?.features || []
    if (!features.length) return []

    return SERVICE_REQUEST_GROUPS
      .map((group) => ({
        ...group,
        slug: slugifyLayerId(group.id),
        data: {
          type: 'FeatureCollection',
          features: features.filter((feature) => feature?.properties?.complaint_group === group.id)
        }
      }))
      .filter((group) => group.data.features.length > 0)
  }, [serviceRequests])
  
  // Handle map click
  const handleMapClick = (event) => {
    const walkabilityFeature = dashboardMode === 'walkability'
      ? (
        event.features?.find(item => (
          item.source === 'pedestrian-routes'
          || item.source === 'cycling-routes'
          || item.source === 'transit-accessibility'
        ))
      )
      : null
    const feature = walkabilityFeature || event.features?.[0]
    console.log('Map clicked:', { feature, source: feature?.source, layerId: feature?.layer?.id })
    if (feature) {
      // For climate dashboard, set selected heat street for bottom panel
      if (dashboardMode === 'climate' && feature.source === 'heat-streets') {
        onSegmentSelect?.(feature.properties)
      }
      
      // For walkability dashboard, set selected route segment (no popup)
      if (dashboardMode === 'walkability' && (feature.source === 'pedestrian-routes' || feature.source === 'cycling-routes' || feature.source === 'transit-accessibility')) {
        onRouteSegmentClick?.(feature.properties, feature.source === 'transit-accessibility' ? 'transit' : 'activity')
        return // Don't show popup for route segments
      }

      if (feature.source === 'road-steepness') {
        setSelectedFeature(feature)
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          feature
        })
        return
      }
      
      // For bus stops and train station, show a basic popup
      if (feature.source === 'bus-stops' || feature.source === 'train-station') {
        setSelectedFeature(feature)
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          feature: feature
        })
        return
      }
      
      // For mission interventions and municipal lights, show appropriate popup
      if (feature.source === 'mission-interventions' || feature.source === 'municipal-lights') {
        console.log('Lighting feature clicked:', feature.source, feature.properties)
        setSelectedFeature(feature)
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          feature: feature
        })
        return
      }
      
      // For environment Voronoi layers or station dots, show env popup
      if (feature.source === 'env-grid') {
        const clickedId = feature.properties?.grid_id
        onEnvGridDetail?.(clickedId)
        return
      }

      if (feature.source === 'greenery-access') {
        const clickedStreet = feature.properties?.str_name || feature.properties?.str_name_mdf
        onGreeneryStreetSelect?.(clickedStreet)
        return
      }

      if (feature.source === 'green-destinations') {
        setSelectedFeature(feature)
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          feature
        })
        return
      }

      if (feature.source === 'ecology-heat') {
        onEcologyFeatureSelect?.(
          buildEcologySelectionKeyFromClick(feature, event.lngLat)
          || feature.properties?.feature_id_key
          || feature.properties?.feature_id
        )
        return
      }

      if (feature.source === 'climate-heat-grid') {
        onHeatGridFeatureSelect?.(
          feature.properties?.feature_id_key
          || feature.properties?.feature_id
          || feature.properties?.ogc_fid
        )
        return
      }

      if (feature.source === 'city-events') {
        const mapInstance = mapRef.current?.getMap?.() || mapRef.current
        const hitboxFeatures = mapInstance?.queryRenderedFeatures
          ? mapInstance.queryRenderedFeatures(
              [
                [event.point.x - 8, event.point.y - 8],
                [event.point.x + 8, event.point.y + 8]
              ],
              { layers: ['events-points-layer'] }
            )
          : []

        const candidateFeatures = [...(event.features || []), ...(hitboxFeatures || [])]
          .filter((item) => item?.source === 'city-events')

        const targetCoordinateKey = getEventCoordinateKey(feature)
        const deduped = []
        const seen = new Set()
        candidateFeatures.forEach((item) => {
          const coordKey = getEventCoordinateKey(item)
          if (!coordKey || coordKey !== targetCoordinateKey) return
          const eventKey = [
            coordKey,
            item.properties?.name || '',
            item.properties?.date || '',
            item.properties?.time || '',
            item.properties?.venue || ''
          ].join('|')
          if (seen.has(eventKey)) return
          seen.add(eventKey)
          deduped.push(item)
        })

        const eventGroup = deduped
          .sort((a, b) => {
            const dateCompare = (a.properties?.date || '').localeCompare(b.properties?.date || '')
            if (dateCompare !== 0) return dateCompare
            return (a.properties?.time || '').localeCompare(b.properties?.time || '')
          })

        setSelectedFeature(feature)
        setPopupInfo({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          feature: eventGroup[0] || feature,
          eventGroup: eventGroup.length > 1 ? eventGroup : null,
          activeEventIndex: 0
        })
        return
      }

      setSelectedFeature(feature)
      setPopupInfo({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        feature: feature
      })
    }
  }
  
  useEffect(() => {
    if (mapRef.current && onMapLoad) {
      rawMapRef.current = mapRef.current?.getMap?.() || mapRef.current
      onMapLoad(mapRef.current)
    }
  }, [mapRef.current, onMapLoad])

  useEffect(() => {
    const mapInstance = rawMapRef.current || mapRef.current?.getMap?.() || mapRef.current
    if (!mapInstance) return

    const canvas = mapInstance.getCanvas?.()
    const handleContextLost = (event) => {
      event.preventDefault?.()
      debugMap('webglcontextlost')
    }
    const handleContextRestored = () => {
      debugMap('webglcontextrestored')
    }
    const handleError = (event) => {
      debugMap('map error', {
        message: event?.error?.message,
        error: event?.error
      })
    }

    canvas?.addEventListener('webglcontextlost', handleContextLost)
    canvas?.addEventListener('webglcontextrestored', handleContextRestored)
    mapInstance.on?.('error', handleError)
    debugMap('map ready', {
      dashboardMode,
      enableCanvasCapture
    })

    return () => {
      canvas?.removeEventListener('webglcontextlost', handleContextLost)
      canvas?.removeEventListener('webglcontextrestored', handleContextRestored)
      mapInstance.off?.('error', handleError)
      debugMap('map listeners removed')
    }
  }, [dashboardMode, debugMap, enableCanvasCapture, mapRef.current])

  useEffect(() => {
    return () => {
      const mapInstance = rawMapRef.current || mapRef.current?.getMap?.() || mapRef.current
      debugMap('cleanup start', {
        dashboardMode,
        enableCanvasCapture,
        hadMap: Boolean(mapInstance)
      })
      rawMapRef.current = null
      mapRef.current = null
      onMapLoad?.(null)
    }
  }, [dashboardMode, debugMap, enableCanvasCapture, onMapLoad])
  
  return (
    <div className="explorer-map">
      {/* Bbox drawing overlay */}
      {drawBboxMode && (
        <div
          className="bbox-draw-overlay"
          onMouseDown={handleDrawMouseDown}
          onMouseMove={handleDrawMouseMove}
          onMouseUp={handleDrawMouseUp}
        >
          <div className="bbox-draw-instructions">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h4V1H1v6h2V3zm14 0h-4V1h6v6h-2V3zM3 17h4v2H1v-6h2v4zm14 0h-4v2h6v-6h-2v4z"/></svg>
            {boxPos ? 'Drag the box to reposition, then confirm' : 'Click on the map to place the analysis area'}
          </div>
          {boxPos && (
            <>
              <div
                className="bbox-draw-rect bbox-fixed-box"
                style={{
                  left: boxPos.x,
                  top: boxPos.y,
                  width: BOX_W,
                  height: BOX_H,
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
                onMouseDown={(e) => {
                  // Handle drag start directly on the box — never let it reach overlay
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragging(true)
                  const rect = e.currentTarget.parentElement.getBoundingClientRect()
                  dragOffset.current = {
                    dx: e.clientX - rect.left - boxPos.x,
                    dy: e.clientY - rect.top  - boxPos.y
                  }
                }}
              />
              <button
                className="bbox-confirm-btn"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={handleConfirmBox}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                Generate Report
              </button>
            </>
          )}
        </div>
      )}
      <Map
        key={enableCanvasCapture ? 'explorer-map-capture' : 'explorer-map-default'}
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapLib={mapLib}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        preserveDrawingBuffer={enableCanvasCapture}
        reuseMaps={false}
        interactiveLayerIds={[
          'businesses-points-layer',
          'businesses-ratings-layer',
          'businesses-amenities-layer',
          'businesses-categories-layer',
          'survey-opinions-layer',
          'stalls-opinions-layer',
          'properties-sales-layer',
          'land-parcels-fill',
          'network-layer',
          'pedestrian-layer',
          'cycling-layer',
          'pedestrian-routes-layer',
          'cycling-routes-layer',
          'road-steepness-layer',
          'transit-accessibility-layer',
          'bus-stops-layer',
          'train-station-fill',
          'lighting-segments-layer',
          'mission-interventions-layer',
          'municipal-lights-layer',
          'heat-streets-layer',
          'climate-heat-grid-fill',
          'climate-shade-fill',
          'climate-wind-fill',
          'greenery-access-layer',
          'greenery-destination-layer',
          'ecology-heat-volume',
          'ecology-heat-hit',
          'ecology-heat-primary-outline',
          'ecology-heat-compare-outline',
          'tree-canopy-layer',
          'env-grid-fill',
          'traffic-layer',
          'sentiment-streets-layer',
          'service-requests-points-layer',
          'events-points-layer'
        ]}
        onClick={handleMapClick}
      >
        {/* Business Dashboard Layers */}
        <>
          {/* Business Liveliness - Heatmap */}
          {shouldRenderCategory('businessLiveliness') && filteredBusinesses && (
              <Source
                id="businesses-heatmap"
                type="geojson"
                data={filteredBusinesses}
              >
                <Layer
                  id="businesses-heatmap-layer"
                  type="heatmap"
                  paint={{
                    'heatmap-weight': 1,
                    'heatmap-intensity': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      0, 1,
                      15, 3
                    ],
                    'heatmap-color': [
                      'interpolate',
                      ['linear'],
                      ['heatmap-density'],
                      0, 'rgba(33, 102, 172, 0)',
                      0.2, 'rgb(103, 169, 207)',
                      0.4, 'rgb(209, 229, 240)',
                      0.6, 'rgb(253, 219, 199)',
                      0.8, 'rgb(239, 138, 98)',
                      1, 'rgb(178, 24, 43)'
                    ],
                    'heatmap-radius': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      0, 2,
                      15, 20
                    ],
                    'heatmap-opacity': 0.8
                  }}
                />
                {/* Points layer for clicking */}
                <Layer
                  id="businesses-points-layer"
                  type="circle"
                  minzoom={14}
                  paint={{
                    'circle-radius': 3,
                    'circle-color': '#000000',
                    'circle-opacity': 0.5,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                  }}
                />
              </Source>
            )}
          </>
          
          {/* Vendor Opinions - Consented vendors only */}
          {shouldRenderCategory('vendorOpinions') && (
              <>
                {(opinionSource === 'formal' || opinionSource === 'both') && surveyData && (() => {
                  const consentedSurvey = {
                    type: 'FeatureCollection',
                    features: surveyData.features.filter(f => f.properties.stake_consent === 1 || f.properties.stake_consent === '1')
                  }
                  return consentedSurvey.features.length > 0 && (
                    <Source
                      id="survey-opinions"
                      type="geojson"
                      data={consentedSurvey}
                    >
                      <Layer
                        id="survey-opinions-layer"
                        type="circle"
                        paint={{
                          'circle-radius': 8,
                          'circle-color': [
                            'case',
                            ['==', ['get', 'stake_challenges/crime'], '1.0'], '#ef4444', // Crime - Red
                            ['==', ['get', 'stake_challenges/crime'], 1], '#ef4444',
                            ['==', ['get', 'stake_challenges/competition'], '1.0'], '#f97316', // Competition - Orange
                            ['==', ['get', 'stake_challenges/competition'], 1], '#f97316',
                            ['==', ['get', 'stake_challenges/rent'], '1.0'], '#8b5cf6', // Rent - Purple
                            ['==', ['get', 'stake_challenges/rent'], 1], '#8b5cf6',
                            ['==', ['get', 'stake_challenges/low_customers'], '1.0'], '#eab308', // Low Customers - Yellow
                            ['==', ['get', 'stake_challenges/low_customers'], 1], '#eab308',
                            ['==', ['get', 'stake_challenges/litter'], '1.0'], '#22c55e', // Litter - Green
                            ['==', ['get', 'stake_challenges/litter'], 1], '#22c55e',
                            ['==', ['get', 'stake_challenges/permits'], '1.0'], '#ec4899', // Permits - Pink
                            ['==', ['get', 'stake_challenges/permits'], 1], '#ec4899',
                            ['==', ['get', 'stake_challenges/other'], '1.0'], '#6b7280', // Other - Gray
                            ['==', ['get', 'stake_challenges/other'], 1], '#6b7280',
                            '#3b82f6' // Default - Blue (infrastructure/parking)
                          ],
                          'circle-opacity': 0.8,
                          'circle-stroke-width': 2,
                          'circle-stroke-color': '#ffffff'
                        }}
                      />
                    </Source>
                  )
                })()}
                
                {(opinionSource === 'informal' || opinionSource === 'both') && streetStallsData && (() => {
                  const consentedStalls = {
                    type: 'FeatureCollection',
                    features: streetStallsData.features.filter(f => f.properties.stake_consent === 'yes')
                  }
                  return consentedStalls.features.length > 0 && (
                    <Source
                      id="stalls-opinions"
                      type="geojson"
                      data={consentedStalls}
                    >
                      <Layer
                        id="stalls-opinions-layer"
                        type="circle"
                        paint={{
                          'circle-radius': 8,
                          'circle-color': [
                            'case',
                            ['==', ['get', 'stake_challenges/crime'], '1.0'], '#ef4444', // Crime - Red
                            ['==', ['get', 'stake_challenges/crime'], 1], '#ef4444',
                            ['==', ['get', 'stake_challenges/competition'], '1.0'], '#f97316', // Competition - Orange
                            ['==', ['get', 'stake_challenges/competition'], 1], '#f97316',
                            ['==', ['get', 'stake_challenges/rent'], '1.0'], '#8b5cf6', // Rent - Purple
                            ['==', ['get', 'stake_challenges/rent'], 1], '#8b5cf6',
                            ['==', ['get', 'stake_challenges/low_customers'], '1.0'], '#eab308', // Low Customers - Yellow
                            ['==', ['get', 'stake_challenges/low_customers'], 1], '#eab308',
                            ['==', ['get', 'stake_challenges/litter'], '1.0'], '#22c55e', // Litter - Green
                            ['==', ['get', 'stake_challenges/litter'], 1], '#22c55e',
                            ['==', ['get', 'stake_challenges/permits'], '1.0'], '#ec4899', // Permits - Pink
                            ['==', ['get', 'stake_challenges/permits'], 1], '#ec4899',
                            ['==', ['get', 'stake_challenges/other'], '1.0'], '#6b7280', // Other - Gray
                            ['==', ['get', 'stake_challenges/other'], 1], '#6b7280',
                            '#3b82f6' // Default - Blue (infrastructure/parking)
                          ],
                          'circle-opacity': 0.8,
                          'circle-stroke-width': 2,
                          'circle-stroke-color': '#ffffff'
                        }}
                      />
                    </Source>
                  )
                })()}
              </>
            )}
            
            {/* Review Ratings - Bubble chart */}
            {shouldRenderCategory('businessRatings') && businessesData && (() => {
              const ratingsData = dashboardMode !== 'sentiment' && ratingFilter && ratingFilter.length > 0
                ? {
                    type: 'FeatureCollection',
                    features: businessesData.features.filter(f => {
                      const r = parseFloat(f.properties.rating)
                      return !isNaN(r) && ratingFilter.includes(Math.floor(r))
                    })
                  }
                : businessesData
              return (
              <Source
                id="businesses-ratings"
                type="geojson"
                data={ratingsData}
              >
                <Layer
                  id="businesses-ratings-layer"
                  type="circle"
                  paint={{
                    'circle-radius': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'userRatingCount'], 0],
                      0, 4,
                      10, 8,
                      50, 12,
                      100, 16,
                      500, 24
                    ],
                    'circle-color': [
                      'case',
                      ['!=', ['get', 'rating'], null],
                      [
                        'interpolate',
                        ['linear'],
                        ['to-number', ['get', 'rating'], 0],
                        0, '#ef4444',
                        2.5, '#f59e0b',
                        3.5, '#84cc16',
                        4.5, '#22c55e',
                        5, '#16a34a'
                      ],
                      '#6b7280'
                    ],
                    'circle-opacity': 0.7,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                  }}
                />
              </Source>
              )
            })()}

            {/* Amenities Mode */}
            {shouldRenderCategory('amenities') && businessesData && (() => {
              // Filter businesses based on selected amenities
              const hasActiveFilters = Object.values(amenitiesFilters || {}).some(v => v)
              const filtered = hasActiveFilters ? {
                type: 'FeatureCollection',
                features: businessesData.features.filter(f => {
                  const props = f.properties
                  
                  // Dining Options
                  if (amenitiesFilters.dineIn && !isAmenityTrue(props.dineIn)) return false
                  if (amenitiesFilters.takeout && !isAmenityTrue(props.takeout)) return false
                  if (amenitiesFilters.delivery && !isAmenityTrue(props.delivery)) return false
                  if (amenitiesFilters.reservable && !isAmenityTrue(props.reservable)) return false
                  
                  // Meals
                  if (amenitiesFilters.servesBreakfast && !isAmenityTrue(props.servesBreakfast)) return false
                  if (amenitiesFilters.servesBrunch && !isAmenityTrue(props.servesBrunch)) return false
                  if (amenitiesFilters.servesLunch && !isAmenityTrue(props.servesLunch)) return false
                  if (amenitiesFilters.servesDinner && !isAmenityTrue(props.servesDinner)) return false
                  
                  // Beverages
                  if (amenitiesFilters.servesCoffee && !isAmenityTrue(props.servesCoffee)) return false
                  if (amenitiesFilters.servesBeer && !isAmenityTrue(props.servesBeer)) return false
                  if (amenitiesFilters.servesWine && !isAmenityTrue(props.servesWine)) return false
                  if (amenitiesFilters.servesCocktails && !isAmenityTrue(props.servesCocktails)) return false
                  
                  // Features
                  if (amenitiesFilters.outdoorSeating && !isAmenityTrue(props.outdoorSeating)) return false
                  if (amenitiesFilters.liveMusic && !isAmenityTrue(props.liveMusic)) return false
                  if (amenitiesFilters.allowsDogs && !isAmenityTrue(props.allowsDogs)) return false
                  if (amenitiesFilters.goodForGroups && !isAmenityTrue(props.goodForGroups)) return false
                  if (amenitiesFilters.goodForChildren && !isAmenityTrue(props.goodForChildren)) return false
                  
                  // Accessibility
                  if (amenitiesFilters.wheelchairAccessible) {
                    const accessibility = props.accessibilityOptions
                    if (!accessibility || typeof accessibility !== 'object') return false
                    if (!accessibility.wheelchairAccessibleEntrance) return false
                  }
                  
                  return true
                })
              } : businessesData
              
              return (
                <Source
                  id="businesses-amenities"
                  type="geojson"
                  data={filtered}
                >
                  <Layer
                    id="businesses-amenities-layer"
                    type="circle"
                    paint={{
                      'circle-radius': 6,
                      'circle-color': '#4caf50',
                      'circle-opacity': 0.8,
                      'circle-stroke-width': 1,
                      'circle-stroke-color': '#ffffff'
                    }}
                  />
                </Source>
              )
            })()}
            
            {/* Categories Mode */}
            {shouldRenderCategory('businessCategories') && businessesData && (() => {
              // Filter businesses based on selected categories
              const hasActiveFilters = Object.values(categoriesFilters || {}).some(v => v)
              const filtered = hasActiveFilters ? {
                type: 'FeatureCollection',
                features: businessesData.features.filter(f => {
                  const primaryType = f.properties.primaryType || ''
                  // Check if this business's primaryType matches any selected category filter
                  return categoriesFilters[primaryType] === true
                })
              } : businessesData
              
              // Category color mapping matching the UI groups
              const getCategoryColor = (primaryType) => {
                // Food & Dining - Orange
                if (['african_restaurant', 'american_restaurant', 'asian_restaurant', 'bakery', 'bar', 'bar_and_grill',
                     'barbecue_restaurant', 'breakfast_restaurant', 'buffet_restaurant', 'cafe', 'cafeteria',
                     'chinese_restaurant', 'coffee_shop', 'fast_food_restaurant', 'food_court', 'hamburger_restaurant',
                     'indian_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'meal_takeaway',
                     'mediterranean_restaurant', 'mexican_restaurant', 'night_club', 'pizza_restaurant', 'ramen_restaurant',
                     'restaurant', 'seafood_restaurant', 'sushi_restaurant', 'thai_restaurant', 'vegan_restaurant', 'wine_bar'].includes(primaryType)) {
                  return '#ff6b35'
                }
                // Shopping - Pink/Rose
                if (['auto_parts_store', 'bicycle_store', 'book_store', 'cell_phone_store', 'clothing_store', 'convenience_store',
                     'department_store', 'discount_store', 'drugstore', 'electronics_store', 'florist', 'furniture_store',
                     'gift_shop', 'grocery_store', 'hardware_store', 'home_goods_store', 'home_improvement_store',
                     'jewelry_store', 'liquor_store', 'market', 'pet_store', 'shoe_store', 'shopping_mall',
                     'sporting_goods_store', 'store', 'supermarket'].includes(primaryType)) {
                  return '#c44569'
                }
                // Lodging - Blue
                if (['bed_and_breakfast', 'hostel', 'hotel', 'lodging', 'motel'].includes(primaryType)) {
                  return '#4a90e2'
                }
                // Culture & Entertainment - Magenta
                if (['art_gallery', 'community_center', 'convention_center', 'cultural_center', 'event_venue',
                     'movie_theater', 'museum', 'performing_arts_theater', 'visitor_center'].includes(primaryType)) {
                  return '#e056fd'
                }
                // Religious Buildings - Gold
                if (['church', 'mosque', 'place_of_worship', 'synagogue'].includes(primaryType)) {
                  return '#f7b731'
                }
                // Health & Wellness - Green
                if (['beauty_salon', 'dental_clinic', 'dentist', 'doctor', 'fitness_center', 'gym', 'hair_salon',
                     'health', 'hospital', 'medical_lab', 'pharmacy', 'physiotherapist', 'spa'].includes(primaryType)) {
                  return '#5cd65c'
                }
                // Education - Teal
                if (['library', 'preschool', 'school', 'secondary_school', 'university'].includes(primaryType)) {
                  return '#0fb9b1'
                }
                // Financial Services - Emerald
                if (['accounting', 'atm', 'bank', 'finance', 'insurance_agency', 'real_estate_agency'].includes(primaryType)) {
                  return '#20bf6b'
                }
                // Transportation - Gray
                if (['bus_station', 'car_dealer', 'car_rental', 'car_repair', 'car_wash',
                     'electric_vehicle_charging_station', 'gas_station', 'parking'].includes(primaryType)) {
                  return '#778ca3'
                }
                // Recreation & Sports - Amber
                if (['athletic_field', 'park', 'sports_club', 'sports_complex', 'swimming_pool', 'yoga_studio'].includes(primaryType)) {
                  return '#fa8231'
                }
                // Public Services - Indigo
                if (['city_hall', 'courthouse', 'embassy', 'lawyer', 'local_government_office', 'police', 'post_office'].includes(primaryType)) {
                  return '#4b7bec'
                }
                // Tourist Attractions - Cyan
                if (['tourist_attraction'].includes(primaryType)) {
                  return '#45aaf2'
                }
                // Default
                return '#9ca3af'
              }
              
              return (
                <Source
                  id="businesses-categories"
                  type="geojson"
                  data={filtered}
                >
                  <Layer
                    id="businesses-categories-layer"
                    type="circle"
                    paint={{
                      'circle-radius': 7,
                      'circle-color': [
                        'case',
                        ['has', 'primaryType'],
                        [
                          'let',
                          'type', ['get', 'primaryType'],
                          [
                            'match',
                            ['var', 'type'],
                            // Food & Dining - Orange
                            ['african_restaurant', 'american_restaurant', 'asian_restaurant', 'bakery', 'bar', 'bar_and_grill',
                             'barbecue_restaurant', 'breakfast_restaurant', 'buffet_restaurant', 'cafe', 'cafeteria',
                             'chinese_restaurant', 'coffee_shop', 'fast_food_restaurant', 'food_court', 'hamburger_restaurant',
                             'indian_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'meal_takeaway',
                             'mediterranean_restaurant', 'mexican_restaurant', 'night_club', 'pizza_restaurant', 'ramen_restaurant',
                             'restaurant', 'seafood_restaurant', 'sushi_restaurant', 'thai_restaurant', 'vegan_restaurant', 'wine_bar'],
                            '#ff6b35',
                            // Shopping - Pink/Rose
                            ['auto_parts_store', 'bicycle_store', 'book_store', 'cell_phone_store', 'clothing_store', 'convenience_store',
                             'department_store', 'discount_store', 'drugstore', 'electronics_store', 'florist', 'furniture_store',
                             'gift_shop', 'grocery_store', 'hardware_store', 'home_goods_store', 'home_improvement_store',
                             'jewelry_store', 'liquor_store', 'market', 'pet_store', 'shoe_store', 'shopping_mall',
                             'sporting_goods_store', 'store', 'supermarket'],
                            '#c44569',
                            // Lodging - Blue
                            ['bed_and_breakfast', 'hostel', 'hotel', 'lodging', 'motel'],
                            '#4a90e2',
                            // Culture & Entertainment - Magenta
                            ['art_gallery', 'community_center', 'convention_center', 'cultural_center', 'event_venue',
                             'movie_theater', 'museum', 'performing_arts_theater', 'visitor_center'],
                            '#e056fd',
                            // Religious Buildings - Gold
                            ['church', 'mosque', 'place_of_worship', 'synagogue'],
                            '#f7b731',
                            // Health & Wellness - Green
                            ['beauty_salon', 'dental_clinic', 'dentist', 'doctor', 'fitness_center', 'gym', 'hair_salon',
                             'health', 'hospital', 'medical_lab', 'pharmacy', 'physiotherapist', 'spa'],
                            '#5cd65c',
                            // Education - Teal
                            ['library', 'preschool', 'school', 'secondary_school', 'university'],
                            '#0fb9b1',
                            // Financial Services - Emerald
                            ['accounting', 'atm', 'bank', 'finance', 'insurance_agency', 'real_estate_agency'],
                            '#20bf6b',
                            // Transportation - Gray
                            ['bus_station', 'car_dealer', 'car_rental', 'car_repair', 'car_wash',
                             'electric_vehicle_charging_station', 'gas_station', 'parking'],
                            '#778ca3',
                            // Recreation & Sports - Amber
                            ['athletic_field', 'park', 'sports_club', 'sports_complex', 'swimming_pool', 'yoga_studio'],
                            '#fa8231',
                            // Public Services - Indigo
                            ['city_hall', 'courthouse', 'embassy', 'lawyer', 'local_government_office', 'police', 'post_office'],
                            '#4b7bec',
                            // Tourist Attractions - Cyan
                            ['tourist_attraction'],
                            '#45aaf2',
                            // Default
                            '#9ca3af'
                          ]
                        ],
                        '#9ca3af'
                      ],
                      'circle-opacity': 0.85,
                      'circle-stroke-width': 2,
                      'circle-stroke-color': '#ffffff',
                      'circle-stroke-opacity': 0.8
                    }}
                  />
                </Source>
              )
            })()}
            
            {/* Property Sales - Bubble chart */}
            {shouldRenderCategory('propertySales') && propertiesData && (
              <Source
                id="properties-sales"
                type="geojson"
                data={propertiesData}
              >
                <Layer
                  id="properties-sales-layer"
                  type="circle"
                  paint={{
                    'circle-radius': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'transfer_count'], 1],
                      1, 8,
                      3, 14,
                      5, 20,
                      10, 28,
                      15, 36,
                      20, 44
                    ],
                    'circle-color': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'total_value'], 0],
                      0, '#dbeafe',
                      1000000, '#93c5fd',
                      5000000, '#60a5fa',
                      10000000, '#3b82f6',
                      20000000, '#2563eb',
                      50000000, '#1d4ed8',
                      100000000, '#1e40af'
                    ],
                    'circle-opacity': 0.75,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                  }}
                />
              </Source>
            )}

            {shouldRenderCategory('landParcels') && landParcelsData && (
              <Source id="land-parcels" type="geojson" data={landParcelsData}>
                <Layer
                  id="land-parcels-fill"
                  type="fill"
                  paint={{
                    'fill-color': parcelColorMode === 'valueChange'
                      ? PARCEL_VALUE_CHANGE_COLOR_EXPRESSION
                      : PARCEL_ZONING_COLOR_EXPRESSION,
                    'fill-opacity': [
                      'case',
                      ['boolean', ['get', 'is_city_owned'], false],
                      0.72,
                      0.46
                    ]
                  }}
                />
                <Layer
                  id="land-parcels-outline"
                  type="line"
                  paint={{
                    'line-color': [
                      'case',
                      ['boolean', ['get', 'is_city_owned'], false],
                      '#f8fafc',
                      '#0f172a'
                    ],
                    'line-width': [
                      'case',
                      ['boolean', ['get', 'is_city_owned'], false],
                      1.5,
                      0.45
                    ],
                    'line-opacity': 0.78
                  }}
                />
              </Source>
            )}
        
        {/* Walkability Layers */}
        {/* Pedestrian Routes - Gradient based on trip count */}
        {shouldRenderCategory('pedestrianRoutes') && pedestrianData && (
              <Source
                id="pedestrian-routes"
                type="geojson"
                data={pedestrianData}
              >
                <Layer
                  id="pedestrian-routes-layer"
                  type="line"
                  filter={showPopularRoutesOnly
                    ? ['==', ['coalesce', ['get', 'popular_corridor_flag'], 0], 1]
                    : ['>=', ['coalesce', ['get', 'total_trip_count'], 0], 1]
                  }
                  paint={{
                    'line-color': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'total_trip_count'], 0],
                      0, '#7c2d12',
                      10, '#9a3412',
                      20, '#c2410c',
                      40, '#ea580c',
                      80, '#f97316',
                      150, '#fb923c',
                      250, '#fdba74'
                    ],
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'total_trip_count'], 0],
                      0, 2,
                      50, 4,
                      100, 5,
                      200, 6,
                      400, 8
                    ],
                    'line-opacity': 0.85
                  }}
                />
              </Source>
            )}
        
        {/* Cycling Routes - Gradient based on trip count */}
        {shouldRenderCategory('cyclingRoutes') && cyclingData && (
          <Source
            id="cycling-routes"
            type="geojson"
            data={cyclingData}
          >
                <Layer
                  id="cycling-routes-layer"
                  type="line"
                  filter={showPopularRoutesOnly
                    ? ['==', ['coalesce', ['get', 'popular_corridor_flag'], 0], 1]
                    : ['>=', ['coalesce', ['get', 'total_trip_count'], 0], 1]
                  }
                  paint={{
                'line-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'total_trip_count'], 0],
                  0, '#1d4ed8',
                  20, '#2563eb',
                  40, '#3b82f6',
                  80, '#60a5fa',
                  160, '#93c5fd',
                  320, '#bfdbfe'
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'total_trip_count'], 0],
                  0, 2,
                  100, 4,
                  200, 5,
                  400, 6,
                  800, 8
                ],
                'line-opacity': 0.85
              }}
            />
          </Source>
        )}


        {shouldRenderCategory('roadSteepness') && roadSteepnessData?.features?.length > 0 && (
          <Source id="road-steepness" type="geojson" data={roadSteepnessData}>
            <Layer
              id="road-steepness-glow"
              type="line"
              paint={{
                'line-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'abs_net_grade_pct'], 0],
                  0, '#22c55e',
                  4, '#facc15',
                  8, '#f97316',
                  12, '#dc2626',
                  18, '#7f1d1d'
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'abs_net_grade_pct'], 0],
                  0, 5,
                  8, 8,
                  14, 12
                ],
                'line-blur': 5,
                'line-opacity': 0.28
              }}
            />
            <Layer
              id="road-steepness-layer"
              type="line"
              paint={{
                'line-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'abs_net_grade_pct'], 0],
                  0, '#22c55e',
                  4, '#facc15',
                  8, '#f97316',
                  12, '#dc2626',
                  18, '#7f1d1d'
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'abs_net_grade_pct'], 0],
                  0, 2.5,
                  4, 4,
                  8, 5.5,
                  14, 7
                ],
                'line-opacity': 0.92
              }}
            />
            <Layer
              id="road-steepness-uphill-arrows"
              type="symbol"
              layout={{
                'symbol-placement': 'line',
                'symbol-spacing': 70,
                'text-field': '➜',
                'text-size': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13, 13,
                  16, 18
                ],
                'text-allow-overlap': true,
                'text-ignore-placement': true,
                'text-rotation-alignment': 'map',
                'text-keep-upright': false
              }}
              paint={{
                'text-color': '#f8fafc',
                'text-halo-color': '#111827',
                'text-halo-width': 1.5,
                'text-opacity': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'abs_net_grade_pct'], 0],
                  0, 0.35,
                  3, 0.75,
                  8, 1
                ]
              }}
            />
          </Source>
        )}
        
        {/* Network Analysis - Betweenness Centrality */}
        {(() => {
          const shouldRender = shouldRenderCategory('networkAnalysis')
          const hasData = !!networkData
          console.log('Network Analysis Render Check:', { shouldRender, hasData, featuresCount: networkData?.features?.length })
          return shouldRender && hasData
        })() && (() => {
              // Get field name based on selected metric
              const metricConfig = {
                betweenness_400: { field: 'cc_betweenness_400', scale: [0, 20, 50, 100, 200, 500, 1000] },
                betweenness_800: { field: 'cc_betweenness_800', scale: [0, 100, 500, 1000, 2000, 5000, 10000] },
                betweenness_beta_400: { field: 'cc_betweenness_beta_400', scale: [0, 1, 2, 5, 10, 20, 50] },
                betweenness_beta_800: { field: 'cc_betweenness_beta_800', scale: [0, 10, 20, 50, 100, 200, 500] },
                harmonic_400: { field: 'cc_harmonic_400', scale: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6] },
                harmonic_800: { field: 'cc_harmonic_800', scale: [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2] }
              }
              
              const config = metricConfig[networkMetric] || metricConfig.betweenness_800
              
              // Color schemes based on metric type
              const getColorScheme = (metric) => {
                // Movement potential (betweenness) - Fire colors
                if (metric.includes('betweenness') && !metric.includes('beta')) {
                  return ['#1e3a8a', '#3b82f6', '#fbbf24', '#f97316', '#dc2626', '#991b1b', '#7f1d1d']
                }
                // Integration (beta betweenness) - Emerald to gold
                else if (metric.includes('beta')) {
                  return ['#064e3b', '#059669', '#10b981', '#34d399', '#fbbf24', '#f59e0b', '#ea580c']
                }
                // Accessibility (harmonic) - Purple to green
                else if (metric.includes('harmonic')) {
                  return ['#581c87', '#7c3aed', '#a855f7', '#c084fc', '#10b981', '#34d399', '#6ee7b7']
                }
                // Default
                return ['#fef9c3', '#fef08a', '#fde047', '#facc15', '#f59e0b', '#ea580c', '#dc2626']
              }
              
              const colors = getColorScheme(networkMetric)
              
              const networkWidthExpr = [
                'interpolate', ['linear'],
                ['coalesce', ['get', config.field], 0],
                config.scale[0], 2,
                config.scale[2], 3,
                config.scale[4], 5,
                config.scale[5], 7,
                config.scale[6], 10
              ]
              const networkColorExpr = [
                'interpolate', ['linear'],
                ['coalesce', ['get', config.field], 0],
                config.scale[0], colors[0],
                config.scale[1], colors[1],
                config.scale[2], colors[2],
                config.scale[3], colors[3],
                config.scale[4], colors[4],
                config.scale[5], colors[5],
                config.scale[6], colors[6]
              ]
              return (
                <Source
                  id="network-betweenness"
                  type="geojson"
                  data={networkData}
                >
                  {/* Outer glow */}
                  <Layer
                    id="network-glow-outer"
                    type="line"
                    paint={{
                      'line-color': networkColorExpr,
                      'line-width': ['*', networkWidthExpr, 4],
                      'line-blur': 12,
                      'line-opacity': 0.18
                    }}
                  />
                  {/* Mid glow */}
                  <Layer
                    id="network-glow-mid"
                    type="line"
                    paint={{
                      'line-color': networkColorExpr,
                      'line-width': ['*', networkWidthExpr, 2.2],
                      'line-blur': 5,
                      'line-opacity': 0.35
                    }}
                  />
                  {/* Main line */}
                  <Layer
                    id="network-betweenness-layer"
                    type="line"
                    paint={{
                      'line-color': networkColorExpr,
                      'line-width': networkWidthExpr,
                      'line-opacity': [
                        'interpolate', ['linear'],
                        ['coalesce', ['get', config.field], 0],
                        config.scale[0], 0.6,
                        config.scale[3], 0.85,
                        config.scale[6], 0.95
                      ]
                    }}
                  />
                </Source>
              )
            })()}
        
        {/* Transit Accessibility - Walking times from train/bus */}
        {shouldRenderCategory('transitAccessibility') && transitData && (
          <Source
            id="transit-accessibility"
            type="geojson"
            data={transitData}
          >
            <Layer
              id="transit-accessibility-layer"
              type="line"
              paint={{
                'line-color': [
                  'interpolate',
                  ['linear'],
                  // Use the appropriate time based on transitView
                  transitView === 'bus' ? ['coalesce', ['get', 'walk_time_bus'], 999] :
                  transitView === 'train' ? ['coalesce', ['get', 'walk_time_train'], 999] :
                  ['min',
                    ['coalesce', ['get', 'walk_time_bus'], 999],
                    ['coalesce', ['get', 'walk_time_train'], 999]
                  ],
                  0, '#064e3b',     // Dark green - immediate access
                  2, '#059669',     // Green - excellent
                  5, '#34d399',     // Light green - good
                  8, '#fbbf24',     // Yellow - moderate
                  10, '#f97316',    // Orange - limited
                  15, '#dc2626',    // Red - poor
                  20, '#991b1b'     // Dark red - very limited
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  transitView === 'bus' ? ['coalesce', ['get', 'walk_time_bus'], 999] :
                  transitView === 'train' ? ['coalesce', ['get', 'walk_time_train'], 999] :
                  ['min',
                    ['coalesce', ['get', 'walk_time_bus'], 999],
                    ['coalesce', ['get', 'walk_time_train'], 999]
                  ],
                  0, 6,
                  5, 4,
                  10, 3,
                  20, 2
                ],
                'line-opacity': 0.85
              }}
            />
          </Source>
        )}
        
        {/* Bus Stops - White outlined circles */}
        {shouldRenderCategory('transitAccessibility') && busStopsData && (
          <Source
            id="bus-stops"
            type="geojson"
            data={busStopsData}
          >
            <Layer
              id="bus-stops-layer"
              type="circle"
              paint={{
                'circle-radius': 5,
                'circle-color': 'rgba(255, 255, 255, 0.05)',
                'circle-stroke-color': 'rgba(255, 255, 255, 0.4)',
                'circle-stroke-width': 1.5
              }}
            />
          </Source>
        )}
        
        {/* Train Station - White outlined polygon */}
        {shouldRenderCategory('transitAccessibility') && trainStationData && (
          <Source
            id="train-station"
            type="geojson"
            data={trainStationData}
          >
            <Layer
              id="train-station-outline"
              type="line"
              paint={{
                'line-color': 'rgba(255, 255, 255, 0.4)',
                'line-width': 1.5
              }}
            />
            <Layer
              id="train-station-fill"
              type="fill"
              paint={{
                'fill-color': 'rgba(255, 255, 255, 0.1)',
                'fill-opacity': 0.3
              }}
            />
          </Source>
        )}
        
        {/* Lighting Layers */}
        {/* Lighting Segments Layer */}
        {shouldRenderCategory('streetLighting') && lightingSegments && (
              <Source
                id="lighting-segments"
                type="geojson"
                data={lightingSegments}
              >
                <Layer
                  id="lighting-segments-layer"
                  type="line"
                  paint={{
                    'line-color': lightingThresholds ? [
                      'case',
                      ['==', ['get', 'mean_lux'], null],
                      '#4b5563',
                      [
                        'step',
                        ['get', 'mean_lux'],
                        '#dc2626',  // Bottom 20% - Red
                        lightingThresholds.bottom20,
                        '#f59e0b',  // Middle 60% - Orange
                        lightingThresholds.top20,
                        '#10b981'   // Top 20% - Green
                      ]
                    ] : [
                      'case',
                      ['==', ['get', 'mean_lux'], null],
                      '#4b5563',
                      [
                        'step',
                        ['get', 'mean_lux'],
                        '#dc2626',
                        20,
                        '#f59e0b',
                        80,
                        '#10b981'
                      ]
                    ],
                    'line-width': 5,
                    'line-opacity': 0.9
                  }}
                />
              </Source>
            )}
            
            {/* Mission Interventions Layer - Mission for Inner City Projects */}
            {shouldRenderCategory('missionInterventions') && missionInterventions && (
              <Source
                id="mission-interventions"
                type="geojson"
                data={missionInterventions}
              >
                {/* Outer glow layer */}
                <Layer
                  id="mission-interventions-outer-glow"
                  type="line"
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 16,
                    'line-opacity': 0.2,
                    'line-blur': 8
                  }}
                />
                {/* Inner glow layer */}
                <Layer
                  id="mission-interventions-glow"
                  type="line"
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 10,
                    'line-opacity': 0.5,
                    'line-blur': 4
                  }}
                />
                {/* Main line */}
                <Layer
                  id="mission-interventions-layer"
                  type="line"
                  paint={{
                    'line-color': '#ffffff',
                    'line-width': 3,
                    'line-opacity': 1.0
                  }}
                />
              </Source>
            )}
            
            {/* Municipal Street Lights Layer */}
            {shouldRenderCategory('municipalLights') && streetLights && (
              <Source
                id="municipal-lights"
                type="geojson"
                data={streetLights}
              >
                <Layer
                  id="municipal-lights-layer"
                  type="circle"
                  paint={{
                    'circle-radius': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      12, 3,
                      16, 6
                    ],
                    'circle-color': [
                      'case',
                      ['==', ['get', 'operational'], false],
                      '#dc2626', // Red for broken lights
                      '#10b981'  // Green for operational lights
                    ],
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff'
                  }}
                />
              </Source>
            )}
        
        {/* Heat Streets Layer */}
        {shouldRenderCategory('heatStreets') && temperatureData && (
          <Source
            id="heat-streets"
            type="geojson"
            data={temperatureData}
          >
            <Layer
              id="heat-streets-layer"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['==', ['get', 'pedestrian_heat_band'], 'top_10'],
                  '#991b1b',
                  ['==', ['get', 'pedestrian_heat_band'], 'top_20'],
                  '#ef4444',
                  ['==', ['get', 'pedestrian_heat_band'], 'bottom_20'],
                  '#2563eb',
                  ['has', 'pedestrian_heat_percentile'],
                  [
                    'step',
                    ['get', 'pedestrian_heat_percentile'],
                    '#2563eb',
                    20, '#22c55e',
                    40, '#facc15',
                    60, '#f97316',
                    80, '#ef4444',
                    90, '#991b1b'
                  ],
                  '#4b5563'
                ],
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'pedestrian_heat_percentile'], 0],
                  0, 3,
                  80, 5.5,
                  90, 7.5
                ],
                'line-opacity': 0.9
              }}
            />
          </Source>
        )}

        {shouldRenderCategory('heatGrid') && heatGridData && (
          <Source
            id="climate-heat-grid"
            type="geojson"
            data={heatGridData}
            promoteId="feature_id_key"
          >
            <Layer
              id="climate-heat-grid-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate',
                  ['linear'],
                  ['to-number', ['coalesce', ['get', 'heat_grid_color_value'], ['get', 'heat_relative_percentile'], ['get', 'thermal_percentile'], 50]],
                  0, '#dbeafe',
                  15, '#67e8f9',
                  35, '#22c55e',
                  55, '#facc15',
                  72, '#fb923c',
                  86, '#ef4444',
                  100, '#7f1d1d'
                ],
                'fill-opacity': 0.72
              }}
            />
            <Layer
              id="climate-heat-grid-outline"
              type="line"
              paint={{
                'line-color': '#7c2d12',
                'line-width': 0.35,
                'line-opacity': 0.35
              }}
            />
            {selectedHeatGridFeatureKeys[0] && (
              <Layer
                id="climate-heat-grid-primary-outline"
                type="line"
                filter={['==', ['get', 'feature_id_key'], String(selectedHeatGridFeatureKeys[0])]}
                paint={{
                  'line-color': '#f97316',
                  'line-width': 3,
                  'line-opacity': 0.95
                }}
              />
            )}
            {selectedHeatGridFeatureKeys[1] && (
              <Layer
                id="climate-heat-grid-compare-outline"
                type="line"
                filter={['==', ['get', 'feature_id_key'], String(selectedHeatGridFeatureKeys[1])]}
                paint={{
                  'line-color': '#38bdf8',
                  'line-width': 3,
                  'line-opacity': 0.95
                }}
              />
            )}
          </Source>
        )}

        {shouldRenderCategory('climateShade') && shadeData && (
          <Source
            id="climate-shade"
            type="geojson"
            data={shadeData}
            promoteId="ogc_fid"
          >
            <Layer
              id="climate-shade-fill"
              type="fill"
              paint={{
                'fill-color': '#0f766e',
                'fill-opacity': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'area_m2'], 0],
                  0, 0.2,
                  80, 0.46,
                  300, 0.72
                ]
              }}
            />
            <Layer
              id="climate-shade-outline"
              type="line"
              paint={{
                'line-color': '#99f6e4',
                'line-width': 0.5,
                'line-opacity': 0.35
              }}
            />
          </Source>
        )}

        {shouldRenderCategory('estimatedWind') && estimatedWindData && (
          <Source
            id="climate-wind"
            type="geojson"
            data={estimatedWindData}
            promoteId="ogc_fid"
          >
            <Layer
              id="climate-wind-fill"
              type="fill"
              paint={{
                'fill-color': WIND_FILL_COLOR,
                'fill-opacity': WIND_FILL_OPACITY,
                'fill-outline-color': 'rgba(255,255,255,0)',
                'fill-antialias': false
              }}
            />
            <Layer
              id="climate-wind-outline"
              type="line"
              filter={WIND_TUNNEL_FILTER}
              paint={{
                'line-color': '#fecdd3',
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  13, 0.15,
                  16, 0.45
                ],
                'line-opacity': 0.2
              }}
            />
          </Source>
        )}
        
        {/* ── Environment: H3 hexagon grid with bloom glow ──────────── */}
        {shouldRenderCategory('airQuality') && gridGeoJSON && (
          <Source id="env-grid" type="geojson" data={gridGeoJSON}>
            {/* Outer bloom glow — wide blurred halo */}
            <Layer
              id="env-hex-glow-outer"
              type="fill"
              paint={{
                'fill-color': envColorExpr,
                'fill-opacity': 0.12 * hexOpacity,
                'fill-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
            {/* Hex outline glow — soft wide bloom border */}
            <Layer
              id="env-hex-bloom"
              type="line"
              paint={{
                'line-color': envColorExpr,
                'line-width': 14,
                'line-blur': 12,
                'line-opacity': 0.35 * hexOpacity,
                'line-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
            {/* Inner glow ring — tighter bloom */}
            <Layer
              id="env-hex-bloom-inner"
              type="line"
              paint={{
                'line-color': envColorExpr,
                'line-width': 6,
                'line-blur': 5,
                'line-opacity': 0.5 * hexOpacity,
                'line-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
            {/* Core hex fill */}
            <Layer
              id="env-grid-fill"
              type="fill"
              paint={{
                'fill-color': envColorExpr,
                'fill-opacity': 0.6 * hexOpacity,
                'fill-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
            {/* Crisp hex outline */}
            <Layer
              id="env-grid-outline"
              type="line"
              paint={{
                'line-color': 'rgba(255,255,255,0.45)',
                'line-width': 1,
                'line-opacity': hexOpacity,
                'line-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
            {/* Value label centred on each hex */}
            <Layer
              id="env-grid-label"
              type="symbol"
              minzoom={13}
              layout={{
                'text-field': ['to-string', ['round', ['coalesce', ['get', envIndex === 'avg' ? 'avg_uaqi' : (ENV_METRICS[envIndex] || ENV_METRICS.uaqi).field], 0]]],
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-size': 13,
                'text-allow-overlap': true
              }}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': 'rgba(0,0,0,0.9)',
                'text-halo-width': 2,
                'text-opacity': hexOpacity,
                'text-opacity-transition': { duration: 600, delay: 0 }
              }}
            />
          </Source>
        )}

        {/* Greenery Layers */}
        {/* Greenery access street segments */}
        {shouldRenderCategory('greeneryIndex') && greeneryAndSkyview && (
              <Source
                id="greenery-access"
                type="geojson"
                data={greeneryAndSkyview}
              >
                <Layer
                  id="greenery-access-layer"
                  type="line"
                  paint={{
                    'line-color': [
                      ...(greeneryMapMode === 'minutes'
                        ? [
                            'interpolate',
                            ['linear'],
                            ['coalesce', ['get', 'quality_adjusted_park_minutes'], 18],
                            0, '#14532d',
                            2, '#166534',
                            5, '#22c55e',
                            8, '#84cc16',
                            12, '#facc15',
                            15, '#f59e0b',
                            20, '#ea580c'
                          ]
                        : [
                            'step',
                            ['coalesce', ['get', 'greenery_access_percentile'], 50],
                            '#14532d',
                            10, '#166534',
                            25, '#22c55e',
                            50, '#84cc16',
                            75, '#d9f99d',
                            90, '#f59e0b'
                          ])
                    ],
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      11, 3.2,
                      14, 5.2,
                      17, 8
                    ],
                    'line-opacity': 0.9
                  }}
                />
                <Layer
                  id="greenery-access-gap-overlay"
                  type="line"
                  filter={showUnderservedGreenery
                    ? ['==', ['get', 'underserved_15_min'], true]
                    : ['==', ['get', 'residential_access_gap'], true]}
                  paint={{
                    'line-color': showUnderservedGreenery ? '#ef4444' : '#f59e0b',
                    'line-width': [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      11, 1.1,
                      14, 1.8,
                      17, 2.8
                    ],
                    'line-dasharray': [1.2, 1.2],
                    'line-opacity': 0.95
                  }}
                />
              </Source>
            )}

            {shouldRenderCategory('urbanHeatConcrete') && ecologyHeatPolygonData && (
              <Source
                id="ecology-heat"
                type="geojson"
                data={ecologyHeatPolygonData}
                promoteId="feature_id_key"
              >
                <Layer
                  id="ecology-heat-fill"
                  type="fill"
                  filter={ecologyMetricFilter}
                  paint={{
                    'fill-color': ecologyMetricPaint,
                    'fill-opacity': 0.12
                  }}
                />
                <Layer
                  id="ecology-heat-volume"
                  type="fill-extrusion"
                  minzoom={13}
                  filter={ecologyMetricFilter}
                  paint={{
                    'fill-extrusion-color': ecologyMetricPaint,
                    'fill-extrusion-height': ecologyHeatVolumeHeight,
                    'fill-extrusion-base': 0.45,
                    'fill-extrusion-opacity': 0.97,
                    'fill-extrusion-vertical-gradient': true
                  }}
                />
                <Layer
                  id="ecology-heat-hit"
                  type="fill"
                  filter={ecologyMetricFilter}
                  paint={{
                    'fill-color': '#ffffff',
                    'fill-opacity': 0.01
                  }}
                />
              </Source>
            )}

            {shouldRenderCategory('urbanHeatConcrete') && ecologySelectionGeometryData && (
              <Source
                id="ecology-heat-selection-geometry"
                type="geojson"
                data={ecologySelectionGeometryData}
              >
                <Layer
                  id="ecology-heat-primary-outline"
                  type="line"
                  filter={['==', ['get', 'selection_role'], 'primary']}
                  paint={{
                    'line-color': '#f97316',
                    'line-width': 3.2,
                    'line-opacity': 0.95
                  }}
                />
                <Layer
                  id="ecology-heat-compare-outline"
                  type="line"
                  filter={['==', ['get', 'selection_role'], 'compare']}
                  paint={{
                    'line-color': '#67e8f9',
                    'line-width': 3.2,
                    'line-opacity': 0.95,
                    'line-dasharray': [2, 1]
                  }}
                />
              </Source>
            )}

            {shouldRenderCategory('urbanHeatConcrete') && ecologySelectionMarkerData && (
              <Source
                id="ecology-heat-selection-points"
                type="geojson"
                data={ecologySelectionMarkerData}
              >
                <Layer
                  id="ecology-heat-selection-circles"
                  type="circle"
                  paint={{
                    'circle-radius': 14,
                    'circle-color': ['get', 'marker_color'],
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 2,
                    'circle-opacity': 0.95
                  }}
                />
                <Layer
                  id="ecology-heat-selection-labels"
                  type="symbol"
                  layout={{
                    'text-field': ['get', 'marker_label'],
                    'text-size': 12,
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-allow-overlap': true,
                    'text-ignore-placement': true
                  }}
                  paint={{
                    'text-color': '#ffffff'
                  }}
                />
              </Source>
            )}
            
            {/* Tree Canopy Layer */}
            {shouldRenderCategory('treeCanopy') && treeCanopyData && (
              <Source
                id="tree-canopy"
                type="geojson"
                data={treeCanopyData}
              >
                <Layer
                  id="tree-canopy-layer"
                  type="fill"
                  paint={{
                    'fill-color': '#2d7a2e',
                    'fill-opacity': 0.6
                  }}
                />
              </Source>
            )}
            
            {/* Green destination nodes */}
            {showGreenDestinations && (shouldRenderCategory('greeneryIndex') || activeCategory == null) && parksData && (
              <Source
                id="green-destinations"
                type="geojson"
                data={parksData}
              >
                <Layer
                  id="greenery-destination-layer"
                  type="circle"
                  paint={{
                    'circle-color': [
                      'match',
                      ['coalesce', ['get', 'destination_type'], 'other'],
                      'park', '#22c55e',
                      'garden', '#84cc16',
                      'beach', '#38bdf8',
                      '#94a3b8'
                    ],
                    'circle-radius': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'quality_score'], 45],
                      40, 5,
                      70, 8,
                      100, 12
                    ],
                    'circle-stroke-color': '#ecfdf5',
                    'circle-stroke-width': 1.6,
                    'circle-opacity': 0.92
                  }}
                />
              </Source>
            )}

        {/* ── City Events Layers ────────────────────────────────────── */}
        {shouldRenderCategory('cityEvents') && eventsData && (() => {
          // Filter by selected month if provided
          const activeMonthKey = eventsMonth
            ? `${String(Math.floor(eventsMonth / 100)).padStart(4, '0')}-${String(eventsMonth % 100).padStart(2, '0')}`
            : null

          const filteredEvents = activeMonthKey
            ? {
                type: 'FeatureCollection',
                features: eventsData.features.filter(f => f.properties?.date?.startsWith(activeMonthKey))
              }
            : eventsData

          if (!filteredEvents.features.length) return null

          return (
            <Source id="city-events" type="geojson" data={filteredEvents}>
              {/* Heatmap — green hotspots where events cluster */}
              <Layer
                id="events-heatmap-layer"
                type="heatmap"
                paint={{
                  'heatmap-weight': 1,
                  'heatmap-intensity': [
                    'interpolate', ['linear'], ['zoom'],
                    0, 1,
                    15, 3
                  ],
                  'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0,   'rgba(0, 0, 0, 0)',
                    0.1, 'rgba(0, 80, 30, 0.3)',
                    0.3, 'rgba(0, 160, 60, 0.5)',
                    0.6, 'rgba(0, 220, 90, 0.75)',
                    0.8, 'rgba(50, 255, 130, 0.9)',
                    1.0, 'rgba(160, 255, 180, 1.0)'
                  ],
                  'heatmap-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    0, 4,
                    12, 20,
                    15, 35
                  ],
                  'heatmap-opacity': 0.85
                }}
              />
              {/* Clickable point layer visible at closer zoom */}
              <Layer
                id="events-points-layer"
                type="circle"
                minzoom={13}
                paint={{
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    13, 4,
                    16, 8
                  ],
                  'circle-color': '#22c55e',
                  'circle-opacity': 0.85,
                  'circle-stroke-width': 1.5,
                  'circle-stroke-color': '#ffffff'
                }}
              />
            </Source>
          )
        })()}

        {/* ── Traffic Layers ───────────────────────────────────────── */}
        {shouldRenderCategory('trafficFlow') && trafficData && (() => {
          // Map scenario id -> kpi field
          const scenarioFields = {
            WORK_MORNING:     'kpi_work_morning',
            WORK_SCHOOL_RUN:  'kpi_work_school_run',
            WORK_EVENING:     'kpi_work_evening',
            MISSION_FEB_EVENT:'kpi_mission_feb_event',
            FIRST_THURSDAY:   'kpi_first_thursday',
            NIGHTLIFE_SAT:    'kpi_nightlife_peak',
            BASELINE:         'kpi_baseline'
          }
          const field = scenarioFields[trafficScenario] || 'kpi_work_morning'

          return (
            <Source
              id="traffic-segments"
              type="geojson"
              data={trafficData}
            >
              {/* Outer atmosphere glow */}
              <Layer
                id="traffic-layer-outer-glow"
                type="line"
                paint={{
                  'line-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0,    '#00bfae',
                    0.6,  '#10b981',
                    1.0,  '#fbbf24',
                    1.6,  '#ef4444',
                    2.0,  '#ff0044'
                  ],
                  'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    12, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 8,  1.0, 16, 2.0, 24],
                    16, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 16, 1.0, 28, 2.0, 40]
                  ],
                  'line-opacity': 0.07,
                  'line-blur': 12
                }}
              />
              {/* Mid glow */}
              <Layer
                id="traffic-layer-glow"
                type="line"
                paint={{
                  'line-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0,    '#00bfae',
                    0.6,  '#10b981',
                    1.0,  '#fbbf24',
                    1.3,  '#f59e0b',
                    1.6,  '#ef4444',
                    2.0,  '#ff0044'
                  ],
                  'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    12, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 4,  1.0, 8,  2.0, 14],
                    16, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 8,  1.0, 14, 2.0, 22]
                  ],
                  'line-opacity': 0.22,
                  'line-blur': 5
                }}
              />
              {/* Main traffic line */}
              <Layer
                id="traffic-layer"
                type="line"
                paint={{
                  'line-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0,    '#00bfae',
                    0.3,  '#34d399',
                    0.6,  '#10b981',
                    1.0,  '#fbbf24',
                    1.3,  '#f59e0b',
                    1.6,  '#ef4444',
                    2.0,  '#ff0044'
                  ],
                  'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    12, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 1.5, 0.6, 2, 1.0, 3, 1.6, 5, 2.0, 7],
                    16, ['interpolate', ['linear'], ['coalesce', ['get', field], 0], 0, 3,   0.6, 4, 1.0, 6, 1.6, 9, 2.0, 12]
                  ],
                  'line-opacity': 0.95
                }}
              />
              {/* Animated flow on congested roads (KPI > 1.3) */}
              <Layer
                id="traffic-flow-animated"
                type="line"
                filter={['>', ['coalesce', ['get', field], 0], 1.3]}
                paint={{
                  'line-color': '#ff4466',
                  'line-width': [
                    'interpolate', ['linear'], ['zoom'],
                    12, 1.5,
                    16, 3
                  ],
                  'line-opacity': 0.8,
                  'line-dasharray': [2, 2]
                }}
              />
            </Source>
          )
        })()}

        {/* Sentiment Layers */}
        {shouldRenderCategory('streetSentiment') && sentimentSegments && (
          <Source id="sentiment-streets" type="geojson" data={sentimentSegments}>
            <Layer
              id="sentiment-streets-glow"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['==', ['get', 'avg_sentiment'], null], 'rgba(15,23,42,0.2)',
                  ['interpolate', ['linear'], [
                    'coalesce',
                    ['to-number', ['get', 'sentiment_percentile']],
                    ['*', ['+', ['coalesce', ['to-number', ['get', 'avg_sentiment']], 0], 1], 50]
                  ],
                    0, '#7f1d1d',
                    10, '#dc2626',
                    25, '#f97316',
                    40, '#facc15',
                    55, '#a3e635',
                    70, '#22c55e',
                    90, '#06b6d4',
                    100, '#bae6fd'
                  ]
                ],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  12, ['case', ['==', ['get', 'avg_sentiment'], null], 1, 7],
                  16, ['case', ['==', ['get', 'avg_sentiment'], null], 2, 14]
                ],
                'line-opacity': ['case', ['==', ['get', 'avg_sentiment'], null], 0.03, 0.28],
                'line-blur': 7
              }}
            />
            <Layer
              id="sentiment-streets-layer"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['==', ['get', 'avg_sentiment'], null], 'rgba(15,23,42,0.14)',
                  ['interpolate', ['linear'], [
                    'coalesce',
                    ['to-number', ['get', 'sentiment_percentile']],
                    ['*', ['+', ['coalesce', ['to-number', ['get', 'avg_sentiment']], 0], 1], 50]
                  ],
                    0, '#991b1b',
                    10, '#ef4444',
                    25, '#fb923c',
                    40, '#fde047',
                    55, '#bef264',
                    70, '#4ade80',
                    90, '#22d3ee',
                    100, '#e0f2fe'
                  ]
                ],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  12, ['case', ['==', ['get', 'avg_sentiment'], null], 0.7, ['interpolate', ['linear'], ['coalesce', ['get', 'comment_count'], 0], 1, 2.5, 50, 4, 250, 6.5]],
                  16, ['case', ['==', ['get', 'avg_sentiment'], null], 1.2, ['interpolate', ['linear'], ['coalesce', ['get', 'comment_count'], 0], 1, 4.5, 50, 7, 250, 12]]
                ],
                'line-opacity': ['case', ['==', ['get', 'avg_sentiment'], null], 0.06, 0.98]
              }}
            />
          </Source>
        )}

        {shouldRenderCategory('serviceRequests') && serviceRequests && (
          <>
            {serviceRequestClustersByGroup.map((group) => (
              <Source
                key={group.id}
                id={`service-requests-clusters-${group.slug}`}
                type="geojson"
                data={group.data}
                cluster={true}
                clusterMaxZoom={16}
                clusterRadius={58}
              >
                <Layer
                  id={`service-requests-cluster-zone-${group.slug}`}
                  type="circle"
                  filter={['has', 'point_count']}
                  paint={{
                    'circle-radius': [
                      'interpolate', ['linear'], ['get', 'point_count'],
                      2, 28,
                      8, 48,
                      20, 72,
                      60, 104
                    ],
                    'circle-color': group.color,
                    'circle-opacity': [
                      'interpolate', ['linear'], ['zoom'],
                      11, 0.42,
                      15, 0.34,
                      18, 0.22
                    ],
                    'circle-blur': 0.68,
                    'circle-stroke-width': 0
                  }}
                />
                <Layer
                  id={`service-requests-cluster-core-${group.slug}`}
                  type="circle"
                  filter={['has', 'point_count']}
                  paint={{
                    'circle-radius': [
                      'interpolate', ['linear'], ['get', 'point_count'],
                      2, 8,
                      8, 14,
                      20, 22,
                      60, 32
                    ],
                    'circle-color': group.color,
                    'circle-opacity': 0.72,
                    'circle-stroke-color': 'rgba(248,250,252,0.62)',
                    'circle-stroke-width': 0.9,
                    'circle-blur': 0.08
                  }}
                />
                <Layer
                  id={`service-requests-cluster-count-${group.slug}`}
                  type="symbol"
                  filter={['has', 'point_count']}
                  layout={{
                    'text-field': ['get', 'point_count_abbreviated'],
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                    'text-size': ['interpolate', ['linear'], ['get', 'point_count'], 2, 10, 20, 12, 60, 14],
                    'text-allow-overlap': true
                  }}
                  paint={{
                    'text-color': '#f8fafc',
                    'text-halo-color': 'rgba(15,23,42,0.85)',
                    'text-halo-width': 1.2
                  }}
                />
              </Source>
            ))}
            <Source id="service-requests" type="geojson" data={serviceRequests}>
              <Layer
                id="service-requests-points-layer"
                type="circle"
                paint={{
                  'circle-radius': [
                    'interpolate', ['linear'], ['zoom'],
                    11, 1.2,
                    15, 2.4,
                    18, 4
                  ],
                  'circle-color': '#f8fafc',
                  'circle-stroke-color': [
                    'match',
                    ['coalesce', ['get', 'complaint_group'], 'Other'],
                    ...SERVICE_REQUEST_GROUPS.flatMap((group) => [group.id, group.color]),
                    '#94a3b8'
                  ],
                  'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 16, 0.8],
                  'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.16, 16, 0.42],
                  'circle-blur': 0.12
                }}
              />
            </Source>
          </>
        )}
        
        {/* 3D Buildings — composite tileset from dark-v11 */}
        {(() => {
          const isEnvironmentView = dashboardMode === 'environment'
          const isHeatView = activeCategory === 'urbanHeatConcrete'
          const buildingBaseExpr = isHeatView
            ? ['+', ['coalesce', ['get', 'min_height'], 0], ECOLOGY_BUILDING_LIFT_M]
            : ['coalesce', ['get', 'min_height'], 0]
          const buildingHeightExpr = isHeatView
            ? ['+', ['max', 10, ['coalesce', ['get', 'height'], 6]], ECOLOGY_BUILDING_LIFT_M]
            : ['coalesce', ['get', 'height'], 4]
          const buildingMaskSpec = {
            id: '3d-building-footprint-mask',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill',
            minzoom: 14,
            filter: ['==', ['get', 'extrude'], 'true'],
            paint: {
              'fill-color': '#120d0b',
              'fill-opacity': isHeatView
                ? [
                    'interpolate', ['linear'], ['zoom'],
                    14, 0.78,
                    16, 0.84,
                    18, 0.9
                  ]
                : 0
            }
          }
          const buildingPedestalSpec = {
            id: '3d-building-pedestal',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            filter: ['==', ['get', 'extrude'], 'true'],
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['coalesce', ['get', 'height'], 0],
                0, '#0f1218',
                20, '#161c26',
                60, '#20293a',
                120, '#2d3950',
                200, '#42536d'
              ],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-height': ['+', ['coalesce', ['get', 'min_height'], 0], ECOLOGY_BUILDING_LIFT_M],
              'fill-extrusion-opacity': isHeatView ? 1 : 0,
              'fill-extrusion-vertical-gradient': true
            }
          }
          const spec = {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            filter: ['==', ['get', 'extrude'], 'true'],
            paint: {
              'fill-extrusion-color': isHeatView
                ? [
                    'interpolate', ['linear'], ['coalesce', ['get', 'height'], 0],
                    0, '#121418',
                    20, '#1b222d',
                    60, '#2b3444',
                    120, '#425167',
                    200, '#647a94'
                  ]
                : [
                    'interpolate', ['linear'], ['coalesce', ['get', 'height'], 0],
                    0, '#1c1c1e',
                    20, '#242426',
                    60, '#303032',
                    120, '#3c3c3e',
                    200, '#48484a'
                  ],
              'fill-extrusion-height': buildingHeightExpr,
              'fill-extrusion-base': buildingBaseExpr,
              'fill-extrusion-opacity': isHeatView ? 1 : (isEnvironmentView ? 1 : 0.72),
              'fill-extrusion-vertical-gradient': true
            }
          }
          return (
            <>
              <Layer {...buildingMaskSpec} />
              <Layer {...buildingPedestalSpec} />
              <Layer {...spec} />
            </>
          )
        })()}

        {/* Popup */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.longitude}
            latitude={popupInfo.latitude}
            anchor="bottom"
            onClose={() => setPopupInfo(null)}
            closeButton={true}
            closeOnClick={false}
          >
            <div className="map-popup">
              {dashboardMode === 'business' && (
                <>
                  {/* Business Liveliness Mode */}
                  {businessMode === 'liveliness' && (
                    <>
                      <h3>{getBusinessName(popupInfo.feature.properties)}</h3>
                      {popupInfo.feature.properties.primaryType && (
                        <p><strong>Type:</strong> {popupInfo.feature.properties.primaryType.replace(/_/g, ' ')}</p>
                      )}
                      {popupInfo.feature.properties.regularOpeningHours?.weekdayDescriptions && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Opening Hours:</strong>
                          <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                            {popupInfo.feature.properties.regularOpeningHours.weekdayDescriptions.map((desc, i) => (
                              <div key={i}>{desc}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {popupInfo.feature.properties.currentlyOpen !== undefined && (
                        <p style={{ marginTop: '0.5rem', color: popupInfo.feature.properties.currentlyOpen ? '#4caf50' : '#ef4444' }}>
                          <strong>{popupInfo.feature.properties.currentlyOpen ? 'Open Now' : 'Closed'}</strong>
                        </p>
                      )}
                    </>
                  )}
                  
                  {/* Vendor Opinions Mode */}
                  {businessMode === 'opinions' && (
                    <>
                      <h3>{getBusinessName(popupInfo.feature.properties) || popupInfo.feature.properties.business_name || 'Vendor'}</h3>
                      {popupInfo.feature.properties.stake_big_change && (
                        <p><strong>Main Challenge:</strong> {popupInfo.feature.properties.stake_big_change}</p>
                      )}
                      {popupInfo.feature.properties.stake_consent === 'yes' && (
                        <p style={{ fontSize: '0.75rem', color: '#4caf50' }}>Consented to interview</p>
                      )}
                    </>
                  )}
                  
                  {/* Review Ratings Mode */}
                  {businessMode === 'ratings' && (
                    <>
                      <h3>{getBusinessName(popupInfo.feature.properties)}</h3>
                      {popupInfo.feature.properties.rating && (
                        <p><strong>Rating:</strong> {popupInfo.feature.properties.rating}</p>
                      )}
                      {popupInfo.feature.properties.userRatingCount && (
                        <p><strong>Reviews:</strong> {popupInfo.feature.properties.userRatingCount}</p>
                      )}
                      {popupInfo.feature.properties.primaryType && (
                        <p><strong>Type:</strong> {popupInfo.feature.properties.primaryType.replace(/_/g, ' ')}</p>
                      )}
                    </>
                  )}
                  
                  {/* Amenities Mode */}
                  {businessMode === 'amenities' && (
                    <>
                      <h3>{getBusinessName(popupInfo.feature.properties)}</h3>
                      {popupInfo.feature.properties.primaryType && (
                        <p><strong>Type:</strong> {popupInfo.feature.properties.primaryType.replace(/_/g, ' ')}</p>
                      )}
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        <strong>Amenities:</strong>
                        <div style={{ marginTop: '0.25rem' }}>
                          {/* Dining Options */}
                          {isAmenityTrue(popupInfo.feature.properties.dineIn) && <p style={{ margin: '0.25rem 0' }}>Dine-in</p>}
                          {isAmenityTrue(popupInfo.feature.properties.takeout) && <p style={{ margin: '0.25rem 0' }}>Takeout</p>}
                          {isAmenityTrue(popupInfo.feature.properties.delivery) && <p style={{ margin: '0.25rem 0' }}>Delivery</p>}
                          {isAmenityTrue(popupInfo.feature.properties.curbsidePickup) && <p style={{ margin: '0.25rem 0' }}>Curbside Pickup</p>}
                          {isAmenityTrue(popupInfo.feature.properties.reservable) && <p style={{ margin: '0.25rem 0' }}>Reservations</p>}
                          
                          {/* Food & Beverage */}
                          {isAmenityTrue(popupInfo.feature.properties.servesBreakfast) && <p style={{ margin: '0.25rem 0' }}>Breakfast</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesBrunch) && <p style={{ margin: '0.25rem 0' }}>Brunch</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesLunch) && <p style={{ margin: '0.25rem 0' }}>Lunch</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesDinner) && <p style={{ margin: '0.25rem 0' }}>Dinner</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesCoffee) && <p style={{ margin: '0.25rem 0' }}>Coffee</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesBeer) && <p style={{ margin: '0.25rem 0' }}>Beer</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesWine) && <p style={{ margin: '0.25rem 0' }}>Wine</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesCocktails) && <p style={{ margin: '0.25rem 0' }}>Cocktails</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesDessert) && <p style={{ margin: '0.25rem 0' }}>Desserts</p>}
                          {isAmenityTrue(popupInfo.feature.properties.servesVegetarianFood) && <p style={{ margin: '0.25rem 0' }}>Vegetarian Options</p>}
                          
                          {/* Ambiance & Features */}
                          {isAmenityTrue(popupInfo.feature.properties.outdoorSeating) && <p style={{ margin: '0.25rem 0' }}>Outdoor Seating</p>}
                          {isAmenityTrue(popupInfo.feature.properties.liveMusic) && <p style={{ margin: '0.25rem 0' }}>Live Music</p>}
                          {isAmenityTrue(popupInfo.feature.properties.allowsDogs) && <p style={{ margin: '0.25rem 0' }}>Dog Friendly</p>}
                          
                          {/* Family & Groups */}
                          {isAmenityTrue(popupInfo.feature.properties.goodForChildren) && <p style={{ margin: '0.25rem 0' }}>Kid Friendly</p>}
                          {isAmenityTrue(popupInfo.feature.properties.menuForChildren) && <p style={{ margin: '0.25rem 0' }}>Kids Menu</p>}
                          {isAmenityTrue(popupInfo.feature.properties.goodForGroups) && <p style={{ margin: '0.25rem 0' }}>Good for Groups</p>}
                          {isAmenityTrue(popupInfo.feature.properties.goodForWatchingSports) && <p style={{ margin: '0.25rem 0' }}>Sports Viewing</p>}
                          
                          {/* Facilities */}
                          {isAmenityTrue(popupInfo.feature.properties.restroom) && <p style={{ margin: '0.25rem 0' }}>Restroom</p>}
                          
                          {/* Accessibility */}
                          {(() => {
                            const accessibility = popupInfo.feature.properties.accessibilityOptions;
                            if (accessibility && typeof accessibility === 'object') {
                              return (
                                <>
                                  {accessibility.wheelchairAccessibleEntrance && <p style={{ margin: '0.25rem 0' }}>Wheelchair Accessible Entrance</p>}
                                  {accessibility.wheelchairAccessibleParking && <p style={{ margin: '0.25rem 0' }}>Accessible Parking</p>}
                                  {accessibility.wheelchairAccessibleRestroom && <p style={{ margin: '0.25rem 0' }}>Accessible Restroom</p>}
                                  {accessibility.wheelchairAccessibleSeating && <p style={{ margin: '0.25rem 0' }}>Accessible Seating</p>}
                                </>
                              );
                            }
                            return null;
                          })()}
                          
                          {/* Payment Options */}
                          {(() => {
                            const payment = popupInfo.feature.properties.paymentOptions;
                            if (payment && typeof payment === 'object') {
                              return (
                                <>
                                  {payment.acceptsCreditCards && <p style={{ margin: '0.25rem 0' }}>Credit Cards</p>}
                                  {payment.acceptsDebitCards && <p style={{ margin: '0.25rem 0' }}>Debit Cards</p>}
                                  {payment.acceptsNfc && <p style={{ margin: '0.25rem 0' }}>Contactless Payment</p>}
                                  {payment.acceptsCashOnly && <p style={{ margin: '0.25rem 0' }}>Cash Only</p>}
                                </>
                              );
                            }
                            return null;
                          })()}
                          
                          {/* No amenities message */}
                          {(() => {
                            const props = popupInfo.feature.properties;
                            const hasAnyAmenity = isAmenityTrue(props.dineIn) || isAmenityTrue(props.takeout) || isAmenityTrue(props.delivery) || 
                              isAmenityTrue(props.curbsidePickup) || isAmenityTrue(props.reservable) ||
                              isAmenityTrue(props.servesBreakfast) || isAmenityTrue(props.servesBrunch) || isAmenityTrue(props.servesLunch) || 
                              isAmenityTrue(props.servesDinner) || isAmenityTrue(props.servesCoffee) ||
                              isAmenityTrue(props.servesBeer) || isAmenityTrue(props.servesWine) || isAmenityTrue(props.servesCocktails) || 
                              isAmenityTrue(props.servesDessert) || isAmenityTrue(props.servesVegetarianFood) ||
                              isAmenityTrue(props.outdoorSeating) || isAmenityTrue(props.liveMusic) || isAmenityTrue(props.allowsDogs) || 
                              isAmenityTrue(props.goodForChildren) || isAmenityTrue(props.menuForChildren) ||
                              isAmenityTrue(props.goodForGroups) || isAmenityTrue(props.goodForWatchingSports) || isAmenityTrue(props.restroom) || 
                              props.accessibilityOptions || props.paymentOptions;
                            return !hasAnyAmenity && <p style={{ margin: '0.25rem 0', color: '#999' }}>No amenities information available</p>;
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                  
                  {/* Categories Mode */}
                  {businessMode === 'categories' && (
                    <>
                      <h3>{getBusinessName(popupInfo.feature.properties)}</h3>
                      {popupInfo.feature.properties.primaryType && (
                        <p><strong>Category:</strong> {popupInfo.feature.properties.primaryType.replace(/_/g, ' ')}</p>
                      )}
                      {popupInfo.feature.properties.rating && (
                        <p><strong>Rating:</strong> {popupInfo.feature.properties.rating}</p>
                      )}
                    </>
                  )}
                  
                  {/* Property Sales Mode */}
                  {businessMode === 'property' && (
                    <>
                      <h3>Property Sale</h3>
                      {popupInfo.feature.properties.address && (
                        <p><strong>Address:</strong> {popupInfo.feature.properties.address}</p>
                      )}
                      {popupInfo.feature.properties.property_category && (
                        <p><strong>Category:</strong> {popupInfo.feature.properties.property_category}</p>
                      )}
                      {popupInfo.feature.properties.transfer_count && (
                        <p><strong>Number of Transfers:</strong> {popupInfo.feature.properties.transfer_count}</p>
                      )}
                      {popupInfo.feature.properties.total_value && (
                        <p><strong>Total Value:</strong> R{(popupInfo.feature.properties.total_value / 1000000).toFixed(2)}M</p>
                      )}
                      {popupInfo.feature.properties.avg_price && (
                        <p><strong>Average Price:</strong> R{(popupInfo.feature.properties.avg_price / 1000000).toFixed(2)}M</p>
                      )}
                      {popupInfo.feature.properties.property_type && (
                        <p><strong>Type:</strong> {popupInfo.feature.properties.property_type}</p>
                      )}
                    </>
                  )}

                  {businessMode === 'parcels' && (
                    <>
                      <h3>{popupInfo.feature.properties.address || popupInfo.feature.properties.prty_nmbr || 'Land Parcel'}</h3>
                      <p><strong>Zoning:</strong> {popupInfo.feature.properties.zoning}</p>
                      <p><strong>Group:</strong> {popupInfo.feature.properties.zoning_group}</p>
                      <p><strong>Market Value:</strong> {formatRandCompact(popupInfo.feature.properties.market_value)}</p>
                      <p><strong>Previous GV:</strong> {formatRandCompact(popupInfo.feature.properties.market_value_previous)}</p>
                      <p><strong>GV 2025:</strong> {formatRandCompact(popupInfo.feature.properties.market_value_2025)}</p>
                      <p>
                        <strong>Change:</strong> {formatRandCompact(popupInfo.feature.properties.market_value_change)}
                        {Number.isFinite(Number(popupInfo.feature.properties.market_value_change_pct))
                          ? ` (${Number(popupInfo.feature.properties.market_value_change_pct).toFixed(1)}%)`
                          : ''}
                      </p>
                      <p><strong>Movement:</strong> {popupInfo.feature.properties.value_change_group || 'No comparison'}</p>
                      {popupInfo.feature.properties.area_m2 && (
                        <p><strong>Area:</strong> {Number(popupInfo.feature.properties.area_m2).toLocaleString(undefined, { maximumFractionDigits: 0 })} m2</p>
                      )}
                      <p><strong>Ownership:</strong> {popupInfo.feature.properties.is_city_owned ? 'City owned' : (popupInfo.feature.properties.owner_type || 'Unknown')}</p>
                      {popupInfo.feature.properties.prty_nmbr && (
                        <p><strong>Property No:</strong> {popupInfo.feature.properties.prty_nmbr}</p>
                      )}
                    </>
                  )}

                  {/* City Events Mode */}
                  {(businessMode === 'events' || popupInfo?.feature?.source === 'city-events') && (() => {
                    const eventGroup = popupInfo.eventGroup || null
                    const activeEvent = eventGroup?.[popupInfo.activeEventIndex || 0] || popupInfo.feature
                    const p = activeEvent?.properties || {}
                    const dateObj = p.date ? new Date(p.date + 'T00:00:00') : null
                    const formattedDate = dateObj
                      ? dateObj.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : p.date
                    const formattedTime = p.time ? p.time.slice(0, 5) : null
                    return (
                      <>
                        {eventGroup?.length > 1 && (
                          <div className="event-popup-stack">
                            <div className="event-popup-stack-header">
                              {eventGroup.length} events at this location
                            </div>
                            <div className="event-popup-stack-list">
                              {eventGroup.map((eventFeature, index) => {
                                const eventProps = eventFeature.properties || {}
                                const itemDate = eventProps.date
                                  ? new Date(`${eventProps.date}T${(eventProps.time || '00:00:00').slice(0, 8)}`)
                                  : null
                                const itemLabel = itemDate && !Number.isNaN(itemDate.getTime())
                                  ? itemDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
                                  : (eventProps.date || 'Date TBC')
                                return (
                                  <button
                                    key={`${eventProps.name || 'event'}-${index}`}
                                    type="button"
                                    className={`event-popup-stack-item ${index === (popupInfo.activeEventIndex || 0) ? 'active' : ''}`}
                                    onClick={() => {
                                      setPopupInfo((current) => current ? {
                                        ...current,
                                        feature: eventFeature,
                                        activeEventIndex: index
                                      } : current)
                                    }}
                                  >
                                    <span className="event-popup-stack-title">{eventProps.name || `Event ${index + 1}`}</span>
                                    <span className="event-popup-stack-meta">
                                      {itemLabel}{eventProps.time ? ` · ${eventProps.time.slice(0, 5)}` : ''}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        <h3 style={{ marginBottom: '0.5rem' }}>{p.name || 'Event'}</h3>
                        {p.venue && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <span style={{ color: '#4ade80' }}>📍</span> <strong>Venue:</strong> {p.venue}
                          </p>
                        )}
                        {formattedDate && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <span style={{ color: '#4ade80' }}>🗓</span> <strong>Date:</strong> {formattedDate}
                          </p>
                        )}
                        {formattedTime && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <span style={{ color: '#4ade80' }}>🕐</span> <strong>Time:</strong> {formattedTime}
                          </p>
                        )}
                        {p.url && (
                          <p style={{ margin: '0.55rem 0 0' }}>
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="event-popup-link"
                            >
                              View event details
                            </a>
                          </p>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
              
              {dashboardMode === 'walkability' && popupInfo.feature.source === 'road-steepness' && (() => {
                const p = popupInfo.feature.properties
                const grade = Math.abs(Number(p.net_grade_pct) || 0)
                const from = Number(p.uphill_from_elev_m)
                const to = Number(p.uphill_to_elev_m)
                const feel = grade < 1 ? 'Flat' : grade < 4 ? 'Gentle' : grade < 8 ? 'Moderate' : grade < 12 ? 'Steep' : 'Very steep'
                return (
                  <>
                    <h3>{p.street_name || 'Street Segment'}</h3>
                    <p><strong>Grade:</strong> {grade.toFixed(1)}% ({feel})</p>
                    <p><strong>Uphill:</strong> follow the arrows on the map</p>
                    {Number.isFinite(from) && Number.isFinite(to) && (
                      <p><strong>Elevation:</strong> {from.toFixed(1)} m → {to.toFixed(1)} m</p>
                    )}
                    {p.length_m != null && <p><strong>Length:</strong> {Number(p.length_m).toFixed(0)} m</p>}
                  </>
                )
              })()}

              {dashboardMode === 'walkability' && popupInfo.feature.source !== 'bus-stops' && popupInfo.feature.source !== 'train-station' && popupInfo.feature.source !== 'road-steepness' && (
                <>
                  <h3>{popupInfo.feature.properties.street_name || popupInfo.feature.properties.STR_NAME || 'Street Segment'}</h3>
                  {popupInfo.feature.properties.total_count && (
                    <p><strong>Total Trips:</strong> {popupInfo.feature.properties.total_count}</p>
                  )}
                  {popupInfo.feature.properties.hillier_integration_400 && (
                    <p><strong>Integration:</strong> {popupInfo.feature.properties.hillier_integration_400.toFixed(2)}</p>
                  )}
                </>
              )}
              
              {/* Bus Stops and Train Station */}
              {popupInfo.feature.source === 'bus-stops' && (
                <>
                  <h3>{popupInfo.feature.properties.STOP_NAME || 'Bus Stop'}</h3>
                  {popupInfo.feature.properties.STOP_TYPE && (
                    <p><strong>Type:</strong> {popupInfo.feature.properties.STOP_TYPE}</p>
                  )}
                  {popupInfo.feature.properties.STOP_STS && (
                    <p><strong>Status:</strong> {popupInfo.feature.properties.STOP_STS}</p>
                  )}
                  {popupInfo.feature.properties.STOP_DSCR && (
                    <p><strong>Description:</strong> {popupInfo.feature.properties.STOP_DSCR}</p>
                  )}
                </>
              )}
              
              {popupInfo.feature.source === 'train-station' && (
                <>
                  <h3>Train Station</h3>
                  <p>Cape Town Railway Station</p>
                </>
              )}
              
              {dashboardMode === 'lighting' && (
                <>
                  {/* Mission Interventions */}
                  {popupInfo.feature.source === 'mission-interventions' && (
                    <>
                      <h3>{popupInfo.feature.properties.title || 'Lighting Intervention'}</h3>
                      {popupInfo.feature.properties.description && (
                        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                          {popupInfo.feature.properties.description}
                        </p>
                      )}
                      {popupInfo.feature.properties.image && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <img 
                            src={popupInfo.feature.properties.image} 
                            alt={popupInfo.feature.properties.title}
                            style={{ 
                              width: '200px',
                              height: '140px',
                              objectFit: 'cover',
                              borderRadius: '4px',
                              display: 'block'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                              console.log('Image failed to load:', popupInfo.feature.properties.image);
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Municipal Street Lights */}
                  {popupInfo.feature.source === 'municipal-lights' && (
                    <>
                      <h3>Street Light</h3>
                      {popupInfo.feature.properties.light_id && (
                        <p><strong>Light ID:</strong> {popupInfo.feature.properties.light_id}</p>
                      )}
                      {popupInfo.feature.properties.pole_num && (
                        <p><strong>Pole Number:</strong> {popupInfo.feature.properties.pole_num}</p>
                      )}
                      {popupInfo.feature.properties.wattage && (
                        <p><strong>Wattage:</strong> {popupInfo.feature.properties.wattage}W</p>
                      )}
                      {popupInfo.feature.properties.lamptype && (
                        <p><strong>Lamp Type:</strong> {popupInfo.feature.properties.lamptype}</p>
                      )}
                      {popupInfo.feature.properties.fixturesupport && (
                        <p><strong>Support:</strong> {popupInfo.feature.properties.fixturesupport}</p>
                      )}
                      {popupInfo.feature.properties.lightcount && (
                        <p><strong>Light Count:</strong> {popupInfo.feature.properties.lightcount}</p>
                      )}
                      <p style={{ 
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        backgroundColor: popupInfo.feature.properties.operational ? '#d1fae5' : '#fee2e2',
                        color: popupInfo.feature.properties.operational ? '#065f46' : '#991b1b',
                        fontWeight: 'bold'
                      }}>
                        Status: {popupInfo.feature.properties.operational ? 'Operational' : 'Non-Operational'}
                      </p>
                      {!popupInfo.feature.properties.operational && popupInfo.feature.properties.Notes && (
                        <div style={{ 
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          backgroundColor: '#fef3c7',
                          borderLeft: '3px solid #f59e0b',
                          fontSize: '0.875rem'
                        }}>
                          <strong>Note:</strong> {popupInfo.feature.properties.Notes}
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Road Segments (original lighting data) */}
                  {popupInfo.feature.source === 'lighting-segments' && (() => {
                    const p = popupInfo.feature.properties
                    const meanLux = parseFloat(p.mean_lux)
                    const minLux = parseFloat(p.min_lux)
                    const maxLux = parseFloat(p.max_lux)
                    const stdLux = parseFloat(p.std_lux)
                    const nearbyLights = parseInt(p.nearby_lights_count)
                    const coverage = parseFloat(p.pct_above_5lux)
                    return (
                      <>
                        <h3>{p.street_name || p.STR_NAME || 'Street Segment'}</h3>
                        {!isNaN(meanLux) && (
                          <>
                            <p><strong>Mean Lux:</strong> {meanLux.toFixed(2)}</p>
                            {!isNaN(minLux) && <p><strong>Min Lux:</strong> {minLux.toFixed(2)}</p>}
                            {!isNaN(maxLux) && <p><strong>Max Lux:</strong> {maxLux.toFixed(2)}</p>}
                            {!isNaN(stdLux) && <p><strong>Std Dev:</strong> {stdLux.toFixed(2)}</p>}
                            {!isNaN(nearbyLights) && <p><strong>Nearby Lights:</strong> {nearbyLights}</p>}
                            {!isNaN(coverage) && <p><strong>Coverage ≥5 Lux:</strong> {coverage.toFixed(1)}%</p>}
                          </>
                        )}
                      </>
                    )
                  })()}
                </>
              )}
              
              {dashboardMode === 'climate' && popupInfo.feature.source === 'heat-streets' && (() => {
                const props = popupInfo.feature.properties
                const streetName = props.street_name || 'Street Segment'
                return (
                  <>
                    <h3>{streetName}</h3>
                    <p><strong>Hot Street Score:</strong> {Number(props.hot_street_score || 0).toFixed(1)}</p>
                    <p><strong>Class:</strong> {props.hot_street_class || 'Unclassified'}</p>
                    <p><strong>Heat Model LST:</strong> {Number(props.mean_heat_model_lst_c || 0).toFixed(1)}°C</p>
                    <p><strong>Pedestrian Heat Score:</strong> {Number(props.mean_pedestrian_heat_score || 0).toFixed(1)}</p>
                    {props.pedestrian_heat_percentile != null && (
                      <p><strong>Pedestrian Rank:</strong> Top {Math.max(1, Math.round(100 - Number(props.pedestrian_heat_percentile)))}% hottest</p>
                    )}
                    <p><strong>Canopy:</strong> {Number(props.mean_effective_canopy_pct || 0).toFixed(1)}%</p>
                  </>
                )
              })()}

              {dashboardMode === 'climate' && popupInfo.feature.source === 'climate-heat-grid' && (() => {
                const props = popupInfo.feature.properties
                const valueFrom = (...keys) => {
                  for (const key of keys) {
                    const value = props[key]
                    if (value !== null && value !== undefined && value !== '') return value
                  }
                  return null
                }
                const numberLabel = (value, suffix = '') => {
                  const parsed = Number(value)
                  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}${suffix}` : '—'
                }
                return (
                  <>
                    <h3>Heat Grid #{props.feature_id || props.ogc_fid}</h3>
                    <p><strong>Modelled LST:</strong> {numberLabel(valueFrom('predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'), '°C')}</p>
                    <p><strong>Relative Heat Band:</strong> {props.heat_relative_band ? String(props.heat_relative_band).replace(/_/g, ' ') : '—'}</p>
                    <p><strong>Urban Heat Score:</strong> {numberLabel(props.urban_heat_score)}</p>
                    <p><strong>Pedestrian Heat Score:</strong> {numberLabel(props.pedestrian_heat_score)}</p>
                    <p><strong>Priority:</strong> {props.priority_class || '—'}{valueFrom('priority_score') != null ? ` (${numberLabel(props.priority_score)})` : ''}</p>
                    <p><strong>Night Heat Retention:</strong> {numberLabel(valueFrom('night_heat_retention_c', 'retained_heat_score'), '°C')}</p>
                    <p><strong>Effective Canopy:</strong> {numberLabel(props.effective_canopy_pct, '%')}</p>
                    <p><strong>Thermal Confidence:</strong> {props.thermal_confidence_class || '—'}</p>
                  </>
                )
              })()}

              {dashboardMode === 'climate' && popupInfo.feature.source === 'climate-shade' && (() => {
                const props = popupInfo.feature.properties
                return (
                  <>
                    <h3>Shade Patch</h3>
                    <p><strong>Hour:</strong> {props.hour || '—'}</p>
                    <p><strong>Area:</strong> {Number(props.area_m2 || 0).toFixed(1)} m²</p>
                    <p><strong>Source:</strong> climate.shade</p>
                  </>
                )
              })()}

              {dashboardMode === 'climate' && popupInfo.feature.source === 'climate-wind' && (() => {
                const props = popupInfo.feature.properties
                const windFactor = Number(props.wind_speed_factor)
                const simulatedWindSpeed = Number(windSpeedKmh)
                const estimatedSpeed = Number.isFinite(windFactor) && Number.isFinite(simulatedWindSpeed)
                  ? windFactor * simulatedWindSpeed
                  : null
                return (
                  <>
                    <h3>{props.ventilation_class || 'Estimated Wind'}</h3>
                    <p><strong>Simulated Wind:</strong> {Number.isFinite(simulatedWindSpeed) ? simulatedWindSpeed.toFixed(0) : '—'} km/h</p>
                    <p><strong>Estimated Speed:</strong> {estimatedSpeed !== null ? estimatedSpeed.toFixed(1) : '—'} km/h</p>
                    <p><strong>Direction:</strong> {props.direction || '—'}</p>
                  </>
                )
              })()}
              
              {dashboardMode === 'traffic' && (() => {
                const p = popupInfo.feature.properties
                const scenarioFields = {
                  WORK_MORNING:     'kpi_work_morning',
                  WORK_SCHOOL_RUN:  'kpi_work_school_run',
                  WORK_EVENING:     'kpi_work_evening',
                  MISSION_FEB_EVENT:'kpi_mission_feb_event',
                  FIRST_THURSDAY:   'kpi_first_thursday',
                  NIGHTLIFE_SAT:    'kpi_nightlife_peak',
                  BASELINE:         'kpi_baseline'
                }
                const scenarioLabels = {
                  WORK_MORNING:     'Work Morning (07:30)',
                  WORK_SCHOOL_RUN:  'School / Lunch Run (14:30)',
                  WORK_EVENING:     'Evening Rush (17:00)',
                  MISSION_FEB_EVENT:'Inner City Saturday (11:00)',
                  FIRST_THURSDAY:   'First Thursday (19:00)',
                  NIGHTLIFE_SAT:    'Nightlife Peak (22:30)',
                  BASELINE:         'Baseline (03:00)'
                }
                const field = scenarioFields[trafficScenario] || 'kpi_work_morning'
                const kpi = parseFloat(p[field])
                const kpiColor = kpi >= 1.6 ? '#ef4444' : kpi >= 1.3 ? '#f59e0b' : kpi >= 1.0 ? '#fbbf24' : kpi >= 0.6 ? '#10b981' : '#3b82f6'
                return (
                  <>
                    <h3>{p.STR_NAME || p.street_name || 'Street Segment'}</h3>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 0.5rem 0' }}>
                      Scenario: <strong style={{ color: '#e8f5e9' }}>{scenarioLabels[trafficScenario]}</strong>
                    </p>
                    {!isNaN(kpi) && (
                      <p style={{ margin: '0.25rem 0' }}>
                        <strong>Traffic KPI:</strong>{' '}
                        <span style={{ color: kpiColor, fontWeight: 700 }}>{kpi.toFixed(3)}</span>
                      </p>
                    )}
                    {p.congestion_level && (
                      <p style={{ margin: '0.25rem 0' }}>
                        <strong>Congestion Level:</strong> {p.congestion_level}
                      </p>
                    )}
                    {p.static_duration_s && (
                      <p style={{ margin: '0.25rem 0' }}>
                        <strong>Free-flow Duration:</strong> {p.static_duration_s}s
                      </p>
                    )}
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #2a3f2d', paddingTop: '0.5rem' }}>
                      <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: 0 }}>All scenarios:</p>
                      {Object.entries(scenarioFields).map(([sid, sfield]) => {
                        const v = parseFloat(p[sfield])
                        if (isNaN(v)) return null
                        const c = v >= 1.6 ? '#ef4444' : v >= 1.3 ? '#f59e0b' : v >= 1.0 ? '#fbbf24' : v >= 0.6 ? '#10b981' : '#3b82f6'
                        return (
                          <div key={sid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', padding: '0.1rem 0' }}>
                            <span style={{ color: sid === trafficScenario ? '#e8f5e9' : '#9ca3af' }}>{scenarioLabels[sid]}</span>
                            <span style={{ color: c, fontWeight: 600 }}>{v.toFixed(2)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}

              {dashboardMode === 'sentiment' && popupInfo.feature.source === 'service-requests' && (() => {
                const p = popupInfo.feature.properties
                const responseDays = Number(p.response_days)
                const isComplete = p.record_status === 'complete'
                const statusColor = isComplete ? '#e5e7eb' : '#38bdf8'
                return (
                  <>
                    <h3>{p.complaint_type || 'Service Request'}</h3>
                    <p style={{ margin: '0.25rem 0' }}><strong>Group:</strong> {p.complaint_group || 'Other'}</p>
                    <p style={{ margin: '0.25rem 0' }}>
                      <strong>Record:</strong>{' '}
                      <span style={{ color: statusColor, fontWeight: 700 }}>
                        {isComplete ? 'Complete dates' : 'Incomplete dates'}
                      </span>
                    </p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Created:</strong> {p.created_on_date || p.created_date || '—'}</p>
                    {(p.completed_date && p.completed_date !== '#') && (
                      <p style={{ margin: '0.25rem 0' }}><strong>Completed:</strong> {p.completed_date}</p>
                    )}
                    <p style={{ margin: '0.25rem 0' }}>
                      <strong>Response:</strong>{' '}
                      {Number.isFinite(responseDays) ? `${responseDays.toFixed(responseDays >= 10 ? 0 : 1)} days` : 'Not calculated'}
                    </p>
                    <p style={{ margin: '0.25rem 0' }}><strong>Work center:</strong> {p.work_center || 'Unknown'}</p>
                    {p.notification && (
                      <p style={{ margin: '0.25rem 0', color: '#94a3b8' }}><strong>Notification:</strong> {p.notification}</p>
                    )}
                  </>
                )
              })()}

              {dashboardMode === 'sentiment' && popupInfo.feature.source === 'sentiment-streets' && sentimentPerspective === 'retail' && (() => {
                const p = popupInfo.feature.properties
                const score = Number(p.avg_sentiment)
                const index = Number(p.sentiment_index)
                const percentile = Number(p.sentiment_percentile)
                const attention = Number(p.attention_score)
                const count = Number(p.comment_count || 0)
                const pos = Number(p.positive_count || 0)
                const neg = Number(p.negative_count || 0)
                const mixed = Math.max(0, count - pos - neg)
                const color = Number.isFinite(score)
                  ? score >= 0.25 ? '#22c55e' : score <= -0.25 ? '#ef4444' : '#94a3b8'
                  : '#64748b'
                return (
                  <>
                    <h3>{p.sentiment_street_name || p.street_name || 'Retail Sentiment'}</h3>
                    {Number.isFinite(score) ? (
                      <>
                        <p style={{ margin: '0.25rem 0' }}>
                          <strong>Average Sentiment:</strong>{' '}
                          <span style={{ color, fontWeight: 700 }}>
                            {score.toFixed(2)}
                          </span>
                        </p>
                        {Number.isFinite(index) && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <strong>Weighted Index:</strong>{' '}
                            <span style={{ color, fontWeight: 700 }}>{index.toFixed(2)}</span>
                            {Number.isFinite(percentile) && <span style={{ color: '#9ca3af' }}> · P{percentile.toFixed(0)}</span>}
                          </p>
                        )}
                        <p style={{ margin: '0.25rem 0' }}>
                          <strong>Review Comments:</strong> {count.toLocaleString()}
                        </p>
                        {Number.isFinite(attention) && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <strong>Attention Score:</strong> {attention.toFixed(0)}
                          </p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', marginTop: '0.65rem' }}>
                          <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.24)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#86efac' }}>{pos}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Positive</span>
                          </div>
                          <div style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#cbd5e1' }}>{mixed}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Mixed</span>
                          </div>
                          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.24)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#fca5a5' }}>{neg}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Negative</span>
                          </div>
                        </div>
                        <p style={{ marginTop: '0.65rem', color: '#9ca3af', fontSize: '0.72rem' }}>
                          Derived only from Google Maps review text matched to this street. Scores use the same sentiment model as the public-area lens.
                        </p>
                      </>
                    ) : (
                      <p style={{ color: '#9ca3af' }}>No Google Maps review sentiment matched to this road yet.</p>
                    )}
                  </>
                )
              })()}

              {dashboardMode === 'sentiment' && popupInfo.feature.source === 'sentiment-streets' && sentimentPerspective === 'public' && (() => {
                const p = popupInfo.feature.properties
                const score = Number(p.avg_sentiment)
                const index = Number(p.sentiment_index)
                const percentile = Number(p.sentiment_percentile)
                const attention = Number(p.attention_score)
                const count = Number(p.comment_count || 0)
                const pos = Number(p.positive_count || 0)
                const neg = Number(p.negative_count || 0)
                const mixed = Math.max(0, count - pos - neg)
                const color = Number.isFinite(score)
                  ? score >= 0.25 ? '#22c55e' : score <= -0.25 ? '#ef4444' : '#94a3b8'
                  : '#64748b'
                const topics = Array.isArray(p.topics) ? p.topics : (() => {
                  try { return JSON.parse(p.topics || '[]') } catch { return [] }
                })()
                return (
                  <>
                    <h3>{p.sentiment_street_name || p.street_name || 'Street Sentiment'}</h3>
                    {Number.isFinite(score) ? (
                      <>
                        <p style={{ margin: '0.25rem 0' }}>
                          <strong>Average Sentiment:</strong>{' '}
                          <span style={{ color, fontWeight: 700 }}>{score.toFixed(2)}</span>
                        </p>
                        {Number.isFinite(index) && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <strong>Weighted Index:</strong>{' '}
                            <span style={{ color, fontWeight: 700 }}>{index.toFixed(2)}</span>
                            {Number.isFinite(percentile) && <span style={{ color: '#9ca3af' }}> · P{percentile.toFixed(0)}</span>}
                          </p>
                        )}
                        <p style={{ margin: '0.25rem 0' }}>
                          <strong>Comments:</strong> {count.toLocaleString()}
                        </p>
                        {Number.isFinite(attention) && (
                          <p style={{ margin: '0.25rem 0' }}>
                            <strong>Attention Score:</strong> {attention.toFixed(0)}
                          </p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.35rem', marginTop: '0.65rem' }}>
                          <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.24)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#86efac' }}>{pos}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Positive</span>
                          </div>
                          <div style={{ background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#cbd5e1' }}>{mixed}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Mixed</span>
                          </div>
                          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.24)', borderRadius: 6, padding: '0.35rem', textAlign: 'center' }}>
                            <strong style={{ color: '#fca5a5' }}>{neg}</strong>
                            <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.68rem' }}>Negative</span>
                          </div>
                        </div>
                        {topics.length > 0 && (
                          <div style={{ marginTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem' }}>
                            <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 0.3rem' }}>Topics</p>
                            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.74rem' }}>{topics.slice(0, 5).join(', ')}</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ color: '#9ca3af' }}>No sentiment comments matched to this road yet.</p>
                    )}
                  </>
                )
              })()}

              {(dashboardMode === 'environment' || dashboardMode === 'greenery') && (() => {
                const p = popupInfo.feature.properties
                const adjustedMinutes = parseFloat(p.quality_adjusted_park_minutes)
                const walkMinutes = parseFloat(p.walk_time_minutes)
                const qualityScore = parseFloat(p.quality_score ?? p.park_quality_score)
                const canopyRatio = parseFloat(p.canopy_cover_ratio)
                const accessPercentile = parseFloat(p.greenery_access_percentile)
                const streetViewUrl = p.destination_type ? getStreetViewUrl(popupInfo.feature) : null
                return (
                  <>
                    <h3>{p.name || p.str_name || p.street_name || p.STR_NAME || 'Greenery Analysis'}</h3>
                    {p.destination_type ? (
                      <>
                        <p><strong>Destination Type:</strong> {String(p.destination_type).replace(/_/g, ' ')}</p>
                        {p.destination_group && <p><strong>Group:</strong> {String(p.destination_group).replace(/_/g, ' ')}</p>}
                        {!isNaN(qualityScore) && <p><strong>Quality Score:</strong> {qualityScore.toFixed(0)}/100</p>}
                        {p.quality_class && <p><strong>Quality Class:</strong> {String(p.quality_class).replace(/_/g, ' ')}</p>}
                        {!isNaN(canopyRatio) && <p><strong>Canopy Cover:</strong> {(canopyRatio * 100).toFixed(0)}%</p>}
                        {p.area_ha != null && <p><strong>Area:</strong> {p.area_ha} ha</p>}
                        {p.access_reason && <p><strong>Access Basis:</strong> {String(p.access_reason).replace(/_/g, ' ')}</p>}
                        {streetViewUrl && (
                          <p style={{ marginTop: '0.65rem' }}>
                            <a
                              href={streetViewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="event-popup-link"
                            >
                              Open Street View
                            </a>
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {!isNaN(adjustedMinutes) && <p><strong>Adjusted Green Access:</strong> {adjustedMinutes.toFixed(1)} min</p>}
                        {!isNaN(walkMinutes) && <p><strong>Raw Walk Time:</strong> {walkMinutes.toFixed(1)} min</p>}
                        {!isNaN(accessPercentile) && <p><strong>Relative Rank:</strong> {accessPercentile.toFixed(0)}th percentile</p>}
                        {!isNaN(qualityScore) && <p><strong>Nearest Green Quality:</strong> {qualityScore.toFixed(0)}/100</p>}
                        {p.park_quality_class && <p><strong>Quality Class:</strong> {String(p.park_quality_class).replace(/_/g, ' ')}</p>}
                        {p.segment_length_m != null && <p><strong>Segment Length:</strong> {Number(p.segment_length_m).toFixed(0)} m</p>}
                        {p.residential_buildings_250m != null && <p><strong>Residential Buildings in 250m:</strong> {p.residential_buildings_250m}</p>}
                        {p.underserved_15_min && <p><strong>15+ Min Flag:</strong> Underserved green access</p>}
                        {p.residential_access_gap && <p><strong>Gap Flag:</strong> Residential access gap</p>}
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </Popup>
        )}

      </Map>

      {activeCategory === 'urbanHeatConcrete' && (
        <div className="ecology-map-atmosphere">
          <div className="ecology-map-kicker">{ecologyMetricConfig.label}</div>
          <strong>
            {selectedEcologyPrimaryKey
              ? `Tracking #${selectedEcologyPrimaryKey}${selectedEcologyCompareKey ? ` vs #${selectedEcologyCompareKey}` : ''}`
              : `${ecologyHeatPolygonData?.features?.length || 0} mapped sections`}
          </strong>
          <p>{ecologyMetricConfig.description}. Click once to inspect a section, then click another one to compare.</p>
          {(selectedEcologyPrimaryKey || selectedEcologyCompareKey) && (
            <div className="ecology-map-compare-key">
              {selectedEcologyPrimaryKey && (
                <div className="ecology-map-compare-item">
                  <span className="ecology-map-compare-badge warm">A</span>
                  <span>Primary segment</span>
                </div>
              )}
              {selectedEcologyCompareKey && (
                <div className="ecology-map-compare-item">
                  <span className="ecology-map-compare-badge cool">B</span>
                  <span>Compare segment</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ExplorerMap
