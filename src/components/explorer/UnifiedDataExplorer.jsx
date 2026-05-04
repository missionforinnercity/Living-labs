import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import * as turf from '@turf/turf'
import TrafficAnalytics from './TrafficAnalytics'
import EventInsightsPanel from './EventInsightsPanel'
import {
  formatStravaDaypartLabel,
  summarizeStravaDayparts
} from '../../utils/dataLoader'
import { buildEnvDisplayData } from '../../features/environment/data'
import { useExplorerBusinessData } from '../../features/business/useExplorerBusinessData'
import { useExplorerWalkabilityData } from '../../features/walkability/useExplorerWalkabilityData'
import { useExplorerLightingData } from '../../features/lighting/useExplorerLightingData'
import { useExplorerEnvironmentData } from '../../features/environment/useExplorerEnvironmentData'
import { useExplorerTrafficData } from '../../features/traffic/useExplorerTrafficData'
import './UnifiedDataExplorer.css'

const ExplorerMap = lazy(() => import('./ExplorerMap'))
const BusinessAnalytics = lazy(() => import('./BusinessAnalytics'))
const WalkabilityAnalytics = lazy(() => import('./WalkabilityAnalytics'))
const LightingAnalytics = lazy(() => import('./LightingAnalytics'))
const MicroclimateControlPanel = lazy(() => import('./MicroclimateControlPanel'))
const GreeneryAnalytics = lazy(() => import('./GreeneryAnalytics'))
const EcologyHeatAnalytics = lazy(() => import('./EcologyHeatAnalytics'))
const EcologyHeatDetailPanel = lazy(() => import('./EcologyHeatDetailPanel'))
const DateAvailabilityCalendar = lazy(() => import('./DateAvailabilityCalendar'))

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

const GREENERY_DESTINATION_COLORS = {
  park: '#22c55e',
  garden: '#84cc16',
  beach: '#38bdf8',
  other: '#94a3b8'
}

const GREENERY_QUALITY_COLORS = {
  very_high: '#14532d',
  high: '#22c55e',
  medium: '#84cc16',
  low: '#facc15',
  very_low: '#f97316',
  unknown: '#64748b'
}

const formatGreeneryStreetName = (value) => {
  if (!value) return 'Unnamed street'
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

const formatMinutes = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)} min` : '—'
}

const clampRatio = (value) => Math.max(0, Math.min(100, value))

const DASHBOARD_MODES = [
  { id: 'business', label: 'Business Analytics' },
  { id: 'walkability', label: 'Active Mobility' },
  { id: 'lighting', label: 'Street Lighting' },
  { id: 'climate', label: 'Climate' },
  { id: 'environment', label: 'Environment' },
  { id: 'traffic', label: 'Traffic' }
]

// All available layer categories - these are what users click to view
const LAYER_CATEGORIES = [
  // Business layers
  { id: 'businessLiveliness', label: 'Business Liveliness', dashboard: 'business', dataKey: 'businesses' },
  { id: 'vendorOpinions', label: 'Vendor Opinions', dashboard: 'business', dataKey: 'streetStalls' },
  { id: 'businessRatings', label: 'Business Ratings', dashboard: 'business', dataKey: 'businesses' },
  { id: 'amenities', label: 'Amenities', dashboard: 'business', dataKey: 'businesses' },
  { id: 'businessCategories', label: 'Business Categories', dashboard: 'business', dataKey: 'businesses' },
  { id: 'propertySales', label: 'Property Sales', dashboard: 'business', dataKey: 'properties' },
  { id: 'cityEvents', label: 'City Events', dashboard: 'business', dataKey: 'eventsData' },
  // Walkability layers
  { id: 'activeMobility', label: 'Walking, Running & Cycling', dashboard: 'walkability', dataKey: 'activeMobility' },
  { id: 'mobilityAnomalies', label: 'Mobility Anomalies', dashboard: 'walkability', dataKey: 'activeMobilityAnomalies' },
  { id: 'roadSteepness', label: 'Road Steepness', dashboard: 'walkability', dataKey: 'roadSteepness' },
  { id: 'networkAnalysis', label: 'Network Analysis', dashboard: 'walkability', dataKey: 'network' },
  { id: 'transitAccessibility', label: 'Transit Accessibility', dashboard: 'walkability', dataKey: 'transitData' },
  // Lighting layers
  { id: 'streetLighting', label: 'Street Lighting KPIs', dashboard: 'lighting', dataKey: 'lightingSegments' },
  { id: 'municipalLights', label: 'Municipal Street Lights', dashboard: 'lighting', dataKey: 'streetLights' },
  { id: 'missionInterventions', label: 'Mission Interventions', dashboard: 'lighting', dataKey: 'missionInterventions' },
  // Climate layers
  { id: 'heatStreets', label: 'Heat Streets', dashboard: 'climate', dataKey: 'heatStreets' },
  { id: 'heatGrid', label: 'Heat Grid', dashboard: 'climate', dataKey: 'heatGrid' },
  { id: 'climateShade', label: 'Shade', dashboard: 'climate', dataKey: 'climateShade' },
  { id: 'estimatedWind', label: 'Est. Wind', dashboard: 'climate', dataKey: 'estimatedWind' },
  { id: 'urbanHeatConcrete', label: 'Heat Islands & Cool Islands', dashboard: 'climate', dataKey: 'ecologyHeat' },
  { id: 'airQuality',   label: 'Air Quality',  dashboard: 'climate', dataKey: 'airQualityVoronoi' },
  // Environment layers
  { id: 'greeneryIndex', label: 'Greenery Access', dashboard: 'environment', dataKey: 'greenerySegments' },
  { id: 'treeCanopy', label: 'Tree Canopy', dashboard: 'environment', dataKey: 'treeCanopy' },
  // Traffic layers
  { id: 'trafficFlow', label: 'Traffic Flow', dashboard: 'traffic', dataKey: 'trafficSegments' }
]

const getExplorerUrlState = () => {
  if (typeof window === 'undefined') return {}

  const params = new URLSearchParams(window.location.search)
  const dashboardModeParam = params.get('explorerMode')
  const requestedDashboardMode = dashboardModeParam === 'temperature' ? 'climate' : dashboardModeParam
  const requestedActiveCategoryParam = params.get('explorerCategory')
  const requestedActiveCategory = requestedActiveCategoryParam === 'surfaceTemperature'
    ? 'heatStreets'
    : requestedActiveCategoryParam
  const activeCategoryConfig = LAYER_CATEGORIES.find((category) => category.id === requestedActiveCategory)
  const dashboardMode = activeCategoryConfig?.dashboard || requestedDashboardMode

  return {
    dashboardMode: DASHBOARD_MODES.some((mode) => mode.id === dashboardMode) ? dashboardMode : null,
    activeCategory: activeCategoryConfig ? requestedActiveCategory : null
  }
}

const UnifiedDataExplorer = () => {
  const initialExplorerState = getExplorerUrlState()
  const [dashboardMode, setDashboardMode] = useState(initialExplorerState.dashboardMode || 'business')
  const [map, setMap] = useState(null)
  
  // Business dashboard state
  const [businessMode, setBusinessMode] = useState('liveliness') // 'liveliness', 'opinions', 'ratings', 'amenities', 'categories', 'property'
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay())
  const [hour, setHour] = useState(new Date().getHours())
  const [eventsMonth, setEventsMonth] = useState(null) // null = all months, 1-12 for specific month
  const [eventsScope, setEventsScope] = useState('cbd')
  const [eventsPanelMinimized, setEventsPanelMinimized] = useState(false)
  const [eventsPanelHeight, setEventsPanelHeight] = useState(520)
  const eventsPanelDrag = useRef({ active: false, startY: 0, startHeight: 520 })

  // Opinion mode state
  const [opinionSource, setOpinionSource] = useState('both') // 'formal', 'informal', 'both'
  
  // Amenities filters state
  const [amenitiesFilters, setAmenitiesFilters] = useState({
    allowsDogs: false,
    servesBeer: false,
    servesWine: false,
    servesCoffee: false,
    outdoorSeating: false,
    liveMusic: false
  })
  
  // Categories filters state - hierarchical structure
  const [categoriesFilters, setCategoriesFilters] = useState({})
  const [expandedGroups, setExpandedGroups] = useState({})
  
  // Walkability dashboard state
  const [walkabilityMode, setWalkabilityMode] = useState('activity') // 'activity', 'network', 'transit'
  const [routeLayerMode, setRouteLayerMode] = useState('combined') // 'combined' | 'walking' | 'cycling' | 'anomalies'
  const [showPopularRoutesOnly, setShowPopularRoutesOnly] = useState(false)
  const [networkMetric, setNetworkMetric] = useState('betweenness_800') // betweenness metric to display
  const [transitView, setTransitView] = useState('combined') // 'combined', 'bus', 'train'
  const [selectedWalkabilityMonth, setSelectedWalkabilityMonth] = useState(null)
  const [selectedAnomalySegment, setSelectedAnomalySegment] = useState(null)
  const [selectedRouteSegment, setSelectedRouteSegment] = useState(null)
  const [compareRouteSegment, setCompareRouteSegment] = useState(null)
  const [routePanelMinimized, setRoutePanelMinimized] = useState(false)
  
  // Lighting dashboard state
  const [lightIntensityRaster, setLightIntensityRaster] = useState(null)
  
  // Climate heat street state
  const [selectedSegment, setSelectedSegment] = useState(null)
  
  // Shade dashboard state - keeping for greenery
  const [season, setSeason] = useState('summer')
  const [timeOfDay, setTimeOfDay] = useState('1400')
  const [windDirection, setWindDirection] = useState('se')
  const [windSpeedKmh, setWindSpeedKmh] = useState(18)
  
  // New greenery data layers
  const [ecologyYear, setEcologyYear] = useState(2026)
  const [ecologyMetric, setEcologyMetric] = useState('predicted_lst_c_fusion')
  const [selectedEcologyFeatureKeys, setSelectedEcologyFeatureKeys] = useState([])
  const [ecologyPanelMinimized, setEcologyPanelMinimized] = useState(false)
  const ecologyDetailPanelRef = useRef(null)

  // Environment / air quality state (fetched from API)
  const [envIndex, setEnvIndex] = useState('uaqi') // which metric to display on the map
  const [envDate, setEnvDate] = useState(null)     // null = live; 'YYYY-MM-DD' = historical day
  const [envDetailGrid, setEnvDetailGrid] = useState(null) // grid_id for bottom detail panel
  const [envPanelMinimized, setEnvPanelMinimized] = useState(false)
  const envDetailPanelRef = useRef(null)
  const [selectedGreeneryStreetKeys, setSelectedGreeneryStreetKeys] = useState([])
  const [greeneryPanelMinimized, setGreeneryPanelMinimized] = useState(false)
  const greeneryDetailPanelRef = useRef(null)
  const [showGreenDestinations, setShowGreenDestinations] = useState(true)
  const [greeneryInsightsExpanded, setGreeneryInsightsExpanded] = useState(false)
  const [greeneryMapMode, setGreeneryMapMode] = useState('percentile')
  const [showUnderservedGreenery, setShowUnderservedGreenery] = useState(true)

  // Layer visibility
  const [visibleLayers, setVisibleLayers] = useState({
    // Business layers
    businesses: false,
    streetStalls: false,
    properties: false,
    eventsData: false,
    // Walkability layers
    network: false,
    pedestrianActivity: false,
    cyclingActivity: false,
    roadSteepness: false,
    // Lighting layers
    lightingSegments: false,
    streetLights: false,
    missionInterventions: false,
    // Climate layers
    heatStreets: false,
    heatGrid: false,
    climateShade: false,
    estimatedWind: false,
    // Environment / greenery layers
    airQualityVoronoi: false,
    ecologyHeat: false,
    greenerySegments: false,
    treeCanopy: false,
    parksNearby: false,
    // Traffic layers
    trafficSegments: false
  })
  
  // Active layer stack - shows what's currently on the map
  const [layerStack, setLayerStack] = useState([])
  
  // Track which layers are locked (persist when clicking other categories)
  const [lockedLayers, setLockedLayers] = useState(new Set())
  
  // Currently selected category (for highlighting in sidebar)
  const [activeCategory, setActiveCategory] = useState(initialExplorerState.activeCategory || null)

  const {
    businessesData,
    streetStallsData,
    propertiesData,
    surveyData,
    eventsData,
    ccidBoundary
  } = useExplorerBusinessData({ dashboardMode, lockedLayers })

  const {
    networkData,
    pedestrianData,
    cyclingData,
    stravaAggregated,
    walkabilityMonths,
    filteredStravaAnomalies,
    transitData,
    busStopsData,
    trainStationData,
    roadSteepnessData,
    selectedRouteHistory,
    compareRouteHistory,
    effectiveSelectedMonth
  } = useExplorerWalkabilityData({
    dashboardMode,
    lockedLayers,
    selectedMonth: selectedWalkabilityMonth,
    selectedRouteSegment,
    compareRouteSegment
  })

  const {
    lightingSegments,
    streetLights,
    missionInterventions,
    lightingThresholds
  } = useExplorerLightingData({ dashboardMode, lockedLayers })

  const {
    temperatureData,
    heatGridData,
    shadeData,
    estimatedWindData,
    greeneryAndSkyview,
    treeCanopyData,
    parksData,
    ecologyHeatByYear,
    envCurrentData,
    envHistoryData
  } = useExplorerEnvironmentData({ dashboardMode, activeCategory, lockedLayers, season, timeOfDay, windDirection, windSpeedKmh })

  const { trafficData } = useExplorerTrafficData({ dashboardMode, lockedLayers })

  const filteredEventsData = useMemo(() => {
    if (!eventsData?.features) return eventsData
    if (eventsScope === 'all' || !ccidBoundary?.features?.length) return eventsData

    const boundaryFeatures = ccidBoundary.features.filter((feature) => {
      const type = feature?.geometry?.type
      return type === 'Polygon' || type === 'MultiPolygon'
    })

    if (!boundaryFeatures.length) return eventsData

    const features = eventsData.features.filter((feature) => {
      const coordinates = feature?.geometry?.coordinates
      if (!Array.isArray(coordinates) || coordinates.length < 2) return false
      const point = turf.point(coordinates)
      return boundaryFeatures.some((boundaryFeature) => turf.booleanPointInPolygon(point, boundaryFeature))
    })

    return {
      ...eventsData,
      features,
      metadata: {
        ...(eventsData.metadata || {}),
        filteredFeatures: features.length,
        geographyMode: eventsScope,
        geographyLabel: 'Cape Town CBD'
      }
    }
  }, [ccidBoundary, eventsData, eventsScope])

  const envHistoryDates = useMemo(() => {
    if (!envHistoryData?.rows) return []
    return [...new Set(envHistoryData.rows.map(r => r.hour_utc?.slice(0, 10)).filter(Boolean))].sort()
  }, [envHistoryData])

  const envDisplayData = useMemo(() => {
    return buildEnvDisplayData(envHistoryData, envDate)
  }, [envDate, envHistoryData])

  const greeneryStreetSummaries = useMemo(() => {
    const features = greeneryAndSkyview?.features || []
    if (!features.length) return {}

    const summaryByStreet = {}
    features.forEach((feature) => {
      const props = feature.properties || {}
      const streetKey = props.str_name || props.str_name_mdf || props.segment_id
      if (!streetKey) return

      if (!summaryByStreet[streetKey]) {
        summaryByStreet[streetKey] = {
          streetKey,
          displayName: formatGreeneryStreetName(streetKey),
          features: [],
          segmentProfile: [],
          qualityClasses: { very_high: 0, high: 0, medium: 0, low: 0, very_low: 0, unknown: 0 }
        }
      }

      const bucket = summaryByStreet[streetKey]
      const adjustedMinutes = Number(props.quality_adjusted_park_minutes)
      const walkMinutes = Number(props.walk_time_minutes)
      const bestCaseMinutes = Number(props.best_case_minutes)
      const worstCaseMinutes = Number(props.worst_case_minutes)
      const parkQualityScore = Number(props.park_quality_score)
      const segmentLengthM = Number(props.segment_length_m)
      const buildings250m = Number(props.residential_buildings_250m)
      const qualityClass = props.park_quality_class || 'unknown'

      bucket.features.push(feature)
      bucket.segmentProfile.push({
        segment: bucket.features.length,
        adjustedMinutes: Number.isFinite(adjustedMinutes) ? adjustedMinutes : null,
        walkMinutes: Number.isFinite(walkMinutes) ? walkMinutes : null,
        qualityScore: Number.isFinite(parkQualityScore) ? parkQualityScore : null
      })
      bucket.qualityClasses[qualityClass] = (bucket.qualityClasses[qualityClass] || 0) + 1
      bucket.totalLengthM = (bucket.totalLengthM || 0) + (Number.isFinite(segmentLengthM) ? segmentLengthM : 0)
      bucket.gapSegments = (bucket.gapSegments || 0) + (props.residential_access_gap ? 1 : 0)
      bucket.residentialSegments = (bucket.residentialSegments || 0) + (props.is_residential_proxy ? 1 : 0)
      bucket.residentialBuildings250m = (bucket.residentialBuildings250m || 0) + (Number.isFinite(buildings250m) ? buildings250m : 0)
      bucket.adjustedMinutesTotal = (bucket.adjustedMinutesTotal || 0) + (Number.isFinite(adjustedMinutes) ? adjustedMinutes : 0)
      bucket.adjustedMinutesCount = (bucket.adjustedMinutesCount || 0) + (Number.isFinite(adjustedMinutes) ? 1 : 0)
      bucket.walkMinutesTotal = (bucket.walkMinutesTotal || 0) + (Number.isFinite(walkMinutes) ? walkMinutes : 0)
      bucket.walkMinutesCount = (bucket.walkMinutesCount || 0) + (Number.isFinite(walkMinutes) ? 1 : 0)
      bucket.bestCaseTotal = (bucket.bestCaseTotal || 0) + (Number.isFinite(bestCaseMinutes) ? bestCaseMinutes : 0)
      bucket.bestCaseCount = (bucket.bestCaseCount || 0) + (Number.isFinite(bestCaseMinutes) ? 1 : 0)
      bucket.worstCaseTotal = (bucket.worstCaseTotal || 0) + (Number.isFinite(worstCaseMinutes) ? worstCaseMinutes : 0)
      bucket.worstCaseCount = (bucket.worstCaseCount || 0) + (Number.isFinite(worstCaseMinutes) ? 1 : 0)
      bucket.qualityScoreTotal = (bucket.qualityScoreTotal || 0) + (Number.isFinite(parkQualityScore) ? parkQualityScore : 0)
      bucket.qualityScoreCount = (bucket.qualityScoreCount || 0) + (Number.isFinite(parkQualityScore) ? 1 : 0)
    })

    Object.values(summaryByStreet).forEach((bucket) => {
      const segmentCount = bucket.features.length || 1
      bucket.segmentCount = bucket.features.length
      bucket.avgAdjustedMinutes = bucket.adjustedMinutesCount ? bucket.adjustedMinutesTotal / bucket.adjustedMinutesCount : null
      bucket.avgWalkMinutes = bucket.walkMinutesCount ? bucket.walkMinutesTotal / bucket.walkMinutesCount : null
      bucket.avgBestCaseMinutes = bucket.bestCaseCount ? bucket.bestCaseTotal / bucket.bestCaseCount : null
      bucket.avgWorstCaseMinutes = bucket.worstCaseCount ? bucket.worstCaseTotal / bucket.worstCaseCount : null
      bucket.avgParkQualityScore = bucket.qualityScoreCount ? bucket.qualityScoreTotal / bucket.qualityScoreCount : null
      bucket.accessGapShare = (bucket.gapSegments / segmentCount) * 100
      bucket.avgResidentialBuildings250m = bucket.residentialBuildings250m / segmentCount
      bucket.radarMetrics = [
        { metric: 'Access speed', value: clampRatio(100 - ((bucket.avgAdjustedMinutes || 0) / 18) * 100) },
        { metric: 'Green quality', value: clampRatio(bucket.avgParkQualityScore || 0) },
        { metric: 'Res. coverage', value: clampRatio((bucket.residentialSegments / segmentCount) * 100) },
        { metric: 'Gap risk', value: clampRatio(100 - bucket.accessGapShare) },
        { metric: 'Street length', value: clampRatio((bucket.totalLengthM / 2000) * 100) }
      ]
      bucket.qualityMixChart = Object.entries(bucket.qualityClasses)
        .filter(([, count]) => count > 0)
        .map(([qualityClass, count]) => ({
          qualityClass,
          label: qualityClass.replace(/_/g, ' '),
          count,
          color: GREENERY_QUALITY_COLORS[qualityClass] || GREENERY_QUALITY_COLORS.unknown
        }))
    })

    return summaryByStreet
  }, [greeneryAndSkyview])

  const selectedGreenerySummaries = useMemo(() => {
    return selectedGreeneryStreetKeys
      .map((key) => greeneryStreetSummaries[key])
      .filter(Boolean)
  }, [greeneryStreetSummaries, selectedGreeneryStreetKeys])

  const greeneryStreetComparisonData = useMemo(() => {
    const [primary, compare] = selectedGreenerySummaries
    if (!primary) return null

    return [
      { metric: 'Adjusted', primary: primary.avgAdjustedMinutes, compare: compare?.avgAdjustedMinutes ?? null },
      { metric: 'Walk', primary: primary.avgWalkMinutes, compare: compare?.avgWalkMinutes ?? null },
      { metric: 'Quality', primary: primary.avgParkQualityScore, compare: compare?.avgParkQualityScore ?? null },
      { metric: 'Gap share', primary: primary.accessGapShare, compare: compare?.accessGapShare ?? null },
      { metric: 'Buildings', primary: primary.avgResidentialBuildings250m, compare: compare?.avgResidentialBuildings250m ?? null }
    ]
  }, [selectedGreenerySummaries])

  const greenerySegmentTrendData = useMemo(() => {
    const [primary, compare] = selectedGreenerySummaries
    if (!primary) return []
    const size = Math.max(primary.segmentProfile.length, compare?.segmentProfile?.length || 0)
    return Array.from({ length: size }, (_, index) => ({
      segment: `S${index + 1}`,
      primaryAdjusted: primary.segmentProfile[index]?.adjustedMinutes ?? null,
      primaryQuality: primary.segmentProfile[index]?.qualityScore ?? null,
      compareAdjusted: compare?.segmentProfile?.[index]?.adjustedMinutes ?? null,
      compareQuality: compare?.segmentProfile?.[index]?.qualityScore ?? null
    }))
  }, [selectedGreenerySummaries])

  const greeneryNearestDestinations = useMemo(() => {
    const destinations = parksData?.features || []
    return selectedGreenerySummaries.map((summary) => {
      const ranked = destinations
        .map((destination) => {
          const destinationPoint = turf.point(destination.geometry.coordinates)
          const nearestDistance = summary.features.reduce((best, feature) => {
            try {
              const distance = turf.pointToLineDistance(destinationPoint, feature, { units: 'kilometers' }) * 1000
              return best == null || distance < best ? distance : best
            } catch {
              return best
            }
          }, null)
          return {
            name: destination.properties?.name || 'Green destination',
            type: destination.properties?.destination_type || 'other',
            qualityScore: Number(destination.properties?.quality_score),
            distanceM: nearestDistance,
            color: GREENERY_DESTINATION_COLORS[destination.properties?.destination_type] || GREENERY_DESTINATION_COLORS.other
          }
        })
        .filter((item) => item.distanceM != null)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 5)
      return { streetKey: summary.streetKey, destinations: ranked }
    })
  }, [parksData, selectedGreenerySummaries])

  useEffect(() => {
    if (!selectedWalkabilityMonth && effectiveSelectedMonth) {
      setSelectedWalkabilityMonth(effectiveSelectedMonth)
    }
  }, [effectiveSelectedMonth, selectedWalkabilityMonth])

  const openEnvGridDetail = useCallback((gridId) => {
    if (!gridId) return
    setSelectedGreeneryStreetKeys([])
    setGreeneryPanelMinimized(false)
    setEnvDetailGrid(gridId)
    setEnvPanelMinimized(false)
  }, [])

  const openGreeneryStreetDetail = useCallback((streetKey) => {
    if (!streetKey) return
    setEnvDetailGrid(null)
    setEnvPanelMinimized(false)
    setSelectedGreeneryStreetKeys((current) => {
      const [primaryKey, compareKey] = current
      if (!primaryKey) return [streetKey]
      if (streetKey === primaryKey) return compareKey ? [primaryKey] : [primaryKey]
      if (streetKey === compareKey) return [primaryKey]
      if (!compareKey) return [primaryKey, streetKey]
      return [primaryKey, streetKey]
    })
    setGreeneryPanelMinimized(false)
  }, [])

  useEffect(() => {
    if (!envDetailGrid || envPanelMinimized) return
    const timer = setTimeout(() => {
      envDetailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 120)
    return () => clearTimeout(timer)
  }, [envDetailGrid, envPanelMinimized])

  useEffect(() => {
    if (!selectedGreeneryStreetKeys.length || greeneryPanelMinimized) return
    const timer = setTimeout(() => {
      greeneryDetailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 120)
    return () => clearTimeout(timer)
  }, [greeneryPanelMinimized, selectedGreeneryStreetKeys])

  const ecologyCurrentData = useMemo(() => ecologyHeatByYear[ecologyYear] || null, [ecologyHeatByYear, ecologyYear])
  const ecologyAvailableYears = useMemo(
    () => Object.keys(ecologyHeatByYear).map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    [ecologyHeatByYear]
  )

  useEffect(() => {
    if (!ecologyAvailableYears.length || ecologyHeatByYear[ecologyYear]) return
    setEcologyYear(ecologyAvailableYears[ecologyAvailableYears.length - 1])
  }, [ecologyAvailableYears, ecologyHeatByYear, ecologyYear])

  const ecologyFeatureSeriesById = useMemo(() => {
    const series = {}
    Object.entries(ecologyHeatByYear).forEach(([yearKey, featureCollection]) => {
      ;(featureCollection?.features || []).forEach((feature) => {
        const featureKey = toEcologyFeatureKey(feature.properties?.feature_id)
        if (!featureKey) return
        if (!series[featureKey]) series[featureKey] = []
        series[featureKey].push({
          ...feature.properties,
          feature_id_key: featureKey,
          analysis_year: Number(yearKey),
          feature_id: feature.properties?.feature_id
        })
      })
    })
    Object.values(series).forEach((entries) => entries.sort((a, b) => a.analysis_year - b.analysis_year))
    return series
  }, [ecologyHeatByYear])

  const selectedEcologyFeatureSeries = useMemo(() => {
    const primarySelection = parseEcologySelectionKey(selectedEcologyFeatureKeys[0])
    if (!primarySelection?.parentKey) return []
    return ecologyFeatureSeriesById[primarySelection.parentKey] || []
  }, [ecologyFeatureSeriesById, selectedEcologyFeatureKeys])

  const compareEcologyFeatureSeries = useMemo(() => {
    const compareSelection = parseEcologySelectionKey(selectedEcologyFeatureKeys[1])
    if (!compareSelection?.parentKey) return []
    return ecologyFeatureSeriesById[compareSelection.parentKey] || []
  }, [ecologyFeatureSeriesById, selectedEcologyFeatureKeys])

  const ecologyCurrentFeatureLookup = useMemo(() => {
    const lookup = {}
    ;(ecologyCurrentData?.features || []).forEach((feature) => {
      const featureKey = toEcologyFeatureKey(feature.properties?.feature_id)
      if (!featureKey) return
      lookup[featureKey] = {
        ...feature.properties,
        feature_id_key: featureKey
      }
    })
    return lookup
  }, [ecologyCurrentData])

  const selectedEcologyFeature = useMemo(() => {
    const primarySelection = parseEcologySelectionKey(selectedEcologyFeatureKeys[0])
    if (!primarySelection?.parentKey) return null
    const currentFeature = ecologyCurrentFeatureLookup[primarySelection.parentKey] || selectedEcologyFeatureSeries[selectedEcologyFeatureSeries.length - 1] || null
    if (!currentFeature) return null
    return {
      ...currentFeature,
      feature_id_key: primarySelection.selectionKey,
      parent_feature_id_key: primarySelection.parentKey,
      segment_index: primarySelection.segmentIndex,
      segment_count: primarySelection.segmentCount,
      segment_label: primarySelection.segmentIndex && primarySelection.segmentCount
        ? `Segment ${primarySelection.segmentIndex} of ${primarySelection.segmentCount}`
        : null
    }
  }, [ecologyCurrentFeatureLookup, selectedEcologyFeatureKeys, selectedEcologyFeatureSeries])

  const compareEcologyFeature = useMemo(() => {
    const compareSelection = parseEcologySelectionKey(selectedEcologyFeatureKeys[1])
    if (!compareSelection?.parentKey) return null
    const currentFeature = ecologyCurrentFeatureLookup[compareSelection.parentKey] || compareEcologyFeatureSeries[compareEcologyFeatureSeries.length - 1] || null
    if (!currentFeature) return null
    return {
      ...currentFeature,
      feature_id_key: compareSelection.selectionKey,
      parent_feature_id_key: compareSelection.parentKey,
      segment_index: compareSelection.segmentIndex,
      segment_count: compareSelection.segmentCount,
      segment_label: compareSelection.segmentIndex && compareSelection.segmentCount
        ? `Segment ${compareSelection.segmentIndex} of ${compareSelection.segmentCount}`
        : null
    }
  }, [compareEcologyFeatureSeries, ecologyCurrentFeatureLookup, selectedEcologyFeatureKeys])

  const openEcologyFeatureDetail = useCallback((featureId) => {
    const featureKey = toEcologyFeatureKey(featureId)
    if (!featureKey) return
    setSelectedEcologyFeatureKeys((current) => {
      const [primaryKey, compareKey] = current
      if (!primaryKey) return [featureKey]
      if (featureKey === primaryKey) return compareKey ? [primaryKey] : [primaryKey]
      if (featureKey === compareKey) return [primaryKey]
      if (!compareKey) return [primaryKey, featureKey]
      return [primaryKey, featureKey]
    })
    setEcologyPanelMinimized(false)
  }, [])

  useEffect(() => {
    if (!selectedEcologyFeatureKeys.length || ecologyPanelMinimized) return
    const timer = setTimeout(() => {
      ecologyDetailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 120)
    return () => clearTimeout(timer)
  }, [selectedEcologyFeatureKeys, ecologyPanelMinimized])

  const [trafficScenario, setTrafficScenario] = useState('WORK_MORNING')

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const sidebarDragRef = useRef(null)
  const effectiveSidebarWidth = greeneryInsightsExpanded ? Math.max(sidebarWidth, 620) : sidebarWidth

  // Rating filter — null = all, Set of floor values e.g. new Set([4,5])
  const [ratingFilter, setRatingFilter] = useState(null)

  // Export report state
  const [isExporting, setIsExporting] = useState(false)
  const [reportLightMode, setReportLightMode] = useState(false)
  const [drawBboxMode, setDrawBboxMode] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    params.set('explorerMode', dashboardMode)
    if (activeCategory) {
      params.set('explorerCategory', activeCategory)
    } else {
      params.delete('explorerCategory')
    }

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [dashboardMode, activeCategory])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncFromUrl = () => {
      const nextState = getExplorerUrlState()
      if (nextState.dashboardMode) setDashboardMode(nextState.dashboardMode)
      setActiveCategory(nextState.activeCategory || null)
    }

    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  useEffect(() => {
    if (dashboardMode !== 'climate' || activeCategory === 'urbanHeatConcrete') return
    setSelectedEcologyFeatureKeys([])
    setEcologyPanelMinimized(false)
  }, [dashboardMode, activeCategory])

  useEffect(() => {
    const greeneryCategoryActive = dashboardMode === 'environment'
    if (!greeneryCategoryActive && greeneryInsightsExpanded) {
      setGreeneryInsightsExpanded(false)
    }
  }, [activeCategory, dashboardMode, greeneryInsightsExpanded])

  useEffect(() => {
    if (dashboardMode !== 'environment') return
    if (activeCategory === 'greeneryIndex' || activeCategory === 'treeCanopy' || activeCategory === null) {
      setShowGreenDestinations(true)
    }
  }, [activeCategory, dashboardMode])
  
  // Listen for clear segment selection event
  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedRouteSegment(null)
      setCompareRouteSegment(null)
      setSelectedAnomalySegment(null)
      setRoutePanelMinimized(false)
    }
    window.addEventListener('clearSegmentSelection', handleClearSelection)
    return () => window.removeEventListener('clearSegmentSelection', handleClearSelection)
  }, [])
  
  // Select a layer category - this is the main interaction
  const selectCategory = (categoryId) => {
    console.log('selectCategory called:', categoryId)
    const category = LAYER_CATEGORIES.find(c => c.id === categoryId)
    if (!category) return
    
    console.log('Category found:', category)
    
    // Set the active category
    setActiveCategory(categoryId)
    
    // Get all dataKeys that are locked (from locked categoryIds)
    const lockedDataKeys = new Set(
      LAYER_CATEGORIES
        .filter(c => lockedLayers.has(c.id))
        .map(c => c.dataKey)
    )
    
    // Update visible layers: turn off all layers except locked ones, turn on the selected one
    setVisibleLayers(prev => {
      const updated = { ...prev }
      
      // Turn off all layers that aren't locked
      Object.keys(updated).forEach(dataKey => {
        if (!lockedDataKeys.has(dataKey)) {
          updated[dataKey] = false
        }
      })
      
      // Turn on the selected layer's data key
      updated[category.dataKey] = true
      
      return updated
    })
    
    // Update stack: remove unlocked items, add the new one
    setLayerStack(prev => {
      // Keep only locked items
      const lockedItems = prev.filter(item => lockedLayers.has(item.id))
      
      // Check if this category is already in the stack
      const existingIndex = lockedItems.findIndex(item => item.id === categoryId)
      if (existingIndex >= 0) {
        console.log('Category already in stack:', categoryId)
        return lockedItems
      }
      
      // Add the new category to the stack
      const newStack = [...lockedItems, {
        id: categoryId,
        label: category.label,
        dataKey: category.dataKey,
        dashboard: category.dashboard,
        locked: false
      }]
      console.log('New layer stack:', newStack)
      return newStack
    })
    
    // Also set the businessMode/walkabilityMode for the sidebar content
    if (category.dashboard === 'business') {
      const modeMap = {
        businessLiveliness: 'liveliness',
        vendorOpinions: 'opinions',
        businessRatings: 'ratings',
        amenities: 'amenities',
        businessCategories: 'categories',
        propertySales: 'property',
        cityEvents: 'events'
      }
      if (modeMap[categoryId]) {
        setBusinessMode(modeMap[categoryId])
      }
    } else if (category.dashboard === 'walkability') {
      const modeMap = {
        activeMobility: 'activity',
        mobilityAnomalies: 'activity',
        roadSteepness: 'steepness',
        networkAnalysis: 'network',
        transitAccessibility: 'transit'
      }
      if (modeMap[categoryId]) {
        setWalkabilityMode(modeMap[categoryId])
      }
    } else if (category.dashboard === 'climate') {
      if (categoryId === 'airQuality') setEnvIndex('uaqi')
    }
    
    // Switch to the appropriate dashboard
    setDashboardMode(category.dashboard)
  }
  
  // Toggle lock on a layer in the stack
  const toggleLayerLock = (categoryId) => {
    const newLockedLayers = new Set(lockedLayers)
    const isNowLocked = !newLockedLayers.has(categoryId)
    
    if (isNowLocked) {
      newLockedLayers.add(categoryId)
    } else {
      newLockedLayers.delete(categoryId)
    }
    
    setLockedLayers(newLockedLayers)
    
    // Update the locked property in the stack
    setLayerStack(prev => prev.map(item => 
      item.id === categoryId ? { ...item, locked: isNowLocked } : item
    ))
  }
  
  // Remove a layer from the stack
  const removeFromStack = (categoryId) => {
    const category = LAYER_CATEGORIES.find(c => c.id === categoryId)
    
    // Remove from locked set
    const newLockedLayers = new Set(lockedLayers)
    newLockedLayers.delete(categoryId)
    setLockedLayers(newLockedLayers)
    
    // Remove from stack
    setLayerStack(prev => prev.filter(item => item.id !== categoryId))
    
    // Turn off the layer if it's the one being removed
    if (category) {
      setVisibleLayers(prev => ({
        ...prev,
        [category.dataKey]: false
      }))
    }
  }
  
  // Activate all layers for a given dashboard at once
  const selectAllLayersForDashboard = (dashboard) => {
    const cats = LAYER_CATEGORIES.filter(c => c.dashboard === dashboard)
    const ids = cats.map(c => c.id)

    const newLockedLayers = new Set(lockedLayers)
    ids.forEach(id => newLockedLayers.add(id))
    setLockedLayers(newLockedLayers)

    setVisibleLayers(prev => {
      const updated = { ...prev }
      cats.forEach(c => { updated[c.dataKey] = true })
      return updated
    })

    setLayerStack(prev => {
      const existingIds = new Set(prev.map(item => item.id))
      const updated = prev.map(item =>
        ids.includes(item.id) ? { ...item, locked: true } : item
      )
      const newItems = cats
        .filter(c => !existingIds.has(c.id))
        .map(c => ({ id: c.id, label: c.label, dataKey: c.dataKey, dashboard: c.dashboard, locked: true }))
      return [...updated, ...newItems]
    })

    setActiveCategory(null)
    setDashboardMode(dashboard)
  }

  // Move layer in stack (for reordering)
  const moveLayerInStack = (fromIndex, toIndex) => {
    const newStack = [...layerStack]
    const [moved] = newStack.splice(fromIndex, 1)
    newStack.splice(toIndex, 0, moved)
    setLayerStack(newStack)
  }
  
  // Get categories for current dashboard
  const getCurrentDashboardCategories = () => {
    return LAYER_CATEGORIES.filter(c => (
      c.dashboard === dashboardMode
      && !(dashboardMode === 'walkability' && c.id === 'mobilityAnomalies')
    ))
  }

  const showAllLayersToggle = useMemo(() => {
    if (dashboardMode !== 'environment' && dashboardMode !== 'climate') return false
    return getCurrentDashboardCategories().length > 1
  }, [dashboardMode])

  // Get businesses matching the current category/filters for bottom panel
  const getActiveBusinesses = () => {
    if (dashboardMode !== 'business' || !activeCategory) return []

    let features = []
    if (activeCategory === 'cityEvents') {
      features = filteredEventsData?.features || []
    } else if (activeCategory === 'propertySales') {
      features = propertiesData?.features || []
    } else if (activeCategory === 'vendorOpinions') {
      features = streetStallsData?.features || []
    } else {
      features = businessesData?.features || []
    }

    if (activeCategory === 'amenities') {
      const active = Object.entries(amenitiesFilters).filter(([, v]) => v).map(([k]) => k)
      if (active.length > 0) {
        features = features.filter(f => active.every(k => f.properties[k]))
      }
    }

    return features
      .filter(f => {
        const p = f.properties
        return (p.displayName?.text || p.name) && p.businessStatus !== 'CLOSED_PERMANENTLY'
      })
      .sort((a, b) => (b.properties.rating || 0) - (a.properties.rating || 0))
      .slice(0, 40)
  }
  
  // Compute stats for a business category selection
  const computeCategoryStats = () => {
    if (dashboardMode !== 'business' || !activeCategory || !businessesData) return null
    if (['propertySales', 'cityEvents', 'vendorOpinions'].includes(activeCategory)) return null

    const categoryMap = {
      businessLiveliness: null,     // all businesses
      businessRatings: null,
      amenities: null,
      businessCategories: null
    }
    if (!(activeCategory in categoryMap)) return null

    const features = businessesData.features || []
    const active = features.filter(f => f.properties.businessStatus !== 'CLOSED_PERMANENTLY')

    const withRating = active.filter(f => f.properties.rating > 0)
    const avgRating = withRating.length > 0
      ? (withRating.reduce((s, f) => s + f.properties.rating, 0) / withRating.length).toFixed(1)
      : null

    // Rating distribution
    const ratingBuckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    withRating.forEach(f => {
      const bucket = Math.floor(f.properties.rating)
      if (ratingBuckets[bucket] !== undefined) ratingBuckets[bucket]++
    })

    // Open now count
    const now = new Date()
    const nowDay = now.getDay()
    const nowHour = now.getHours()
    const openCount = active.filter(f => {
      try {
        const hrs = f.properties.regularOpeningHours
        if (!hrs || !hrs.weekdayDescriptions) return false
        // simple check: use isBusinessOpen util
        return true
      } catch { return false }
    }).length
    // Use dayOfWeek/hour state as proxy
    const openNowCount = active.filter(f => {
      try {
        const hrs = f.properties.regularOpeningHours
        if (!hrs || !hrs.periods) return false
        return true
      } catch { return false }
    }).length

    // Top types
    const typeCounts = {}
    active.forEach(f => {
      const t = f.properties.primaryType
      if (t) typeCounts[t] = (typeCounts[t] || 0) + 1
    })
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    // Avg review count
    const withReviews = active.filter(f => f.properties.userRatingCount > 0)
    const avgReviewCount = withReviews.length > 0
      ? Math.round(withReviews.reduce((s, f) => s + (f.properties.userRatingCount || 0), 0) / withReviews.length)
      : null

    return {
      total: active.length,
      avgRating,
      ratingBuckets,
      topTypes,
      avgReviewCount,
      withRatingCount: withRating.length
    }
  }

  // Export: step 1 – toggle draw-bbox mode
  const handleExportReport = useCallback(() => {
    if (isExporting) return
    setDrawBboxMode(prev => !prev)
  }, [isExporting])

  // Export: step 2 – user drew a bbox on the map
  const handleBboxDrawn = useCallback(async ({ bbox }) => {
    setDrawBboxMode(false)
    setIsExporting(true)
    try {
      const { generateReport } = await import('../../utils/reportGenerator')
      await generateReport(map, layerStack, {
        businessesData,
        streetStallsData,
        propertiesData,
        eventsData: filteredEventsData,
        pedestrianData,
        cyclingData,
        networkData,
        transitData,
        roadSteepnessData,
        lightingSegments,
        streetLights,
        missionInterventions,
        temperatureData,
        greeneryAndSkyview,
        treeCanopyData,
        parksData,
        trafficData,
      }, dashboardMode, bbox, { lightMode: reportLightMode })
    } catch (err) {
      console.error('Report generation failed:', err)
    } finally {
      setIsExporting(false)
    }
  }, [map, layerStack, businessesData, streetStallsData, propertiesData, filteredEventsData, pedestrianData, cyclingData, networkData, transitData, roadSteepnessData, lightingSegments, streetLights, missionInterventions, temperatureData, greeneryAndSkyview, treeCanopyData, parksData, trafficData, dashboardMode, reportLightMode])

  // Resize drag handlers
  const startSidebarDrag = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev) => {
      const delta = startX - ev.clientX
      const next = Math.max(280, Math.min(640, startWidth + delta))
      setSidebarWidth(next)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const startEventsPanelDrag = useCallback((event) => {
    event.preventDefault()
    eventsPanelDrag.current = {
      active: true,
      startY: event.clientY,
      startHeight: eventsPanelHeight
    }

    const onMove = (moveEvent) => {
      if (!eventsPanelDrag.current.active) return
      const delta = eventsPanelDrag.current.startY - moveEvent.clientY
      const maxHeight = Math.max(window.innerHeight - 180, 360)
      const nextHeight = Math.min(maxHeight, Math.max(280, eventsPanelDrag.current.startHeight + delta))
      setEventsPanelHeight(nextHeight)
      setEventsPanelMinimized(false)
    }

    const onUp = () => {
      eventsPanelDrag.current.active = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [eventsPanelHeight])

  const routeCompareData = useMemo(() => {
    if (!selectedRouteHistory) return null

    const monthLookup = new Map()
    ;(selectedRouteHistory.monthly || []).forEach(item => {
      monthLookup.set(item.month, {
        month: item.month,
        monthLabel: item.monthLabel,
        aTrips: item.totalTrips,
        bTrips: 0,
        aPeople: item.totalPeople,
        bPeople: 0
      })
    })
    ;(compareRouteHistory?.monthly || []).forEach(item => {
      const existing = monthLookup.get(item.month) || {
        month: item.month,
        monthLabel: item.monthLabel,
        aTrips: 0,
        bTrips: 0,
        aPeople: 0,
        bPeople: 0
      }
      existing.bTrips = item.totalTrips
      existing.bPeople = item.totalPeople
      monthLookup.set(item.month, existing)
    })

    return {
      monthly: [...monthLookup.values()].sort((a, b) => a.month.localeCompare(b.month)),
      gender: [
        { label: 'Male', a: selectedRouteHistory.summary.male, b: compareRouteHistory?.summary.male || 0 },
        { label: 'Female', a: selectedRouteHistory.summary.female, b: compareRouteHistory?.summary.female || 0 },
        { label: 'Unspecified', a: selectedRouteHistory.summary.unspecified, b: compareRouteHistory?.summary.unspecified || 0 }
      ],
      ages: [
        { label: '18-34', a: selectedRouteHistory.summary.age18to34, b: compareRouteHistory?.summary.age18to34 || 0 },
        { label: '35-54', a: selectedRouteHistory.summary.age35to54, b: compareRouteHistory?.summary.age35to54 || 0 },
        { label: '55-64', a: selectedRouteHistory.summary.age55to64, b: compareRouteHistory?.summary.age55to64 || 0 },
        { label: '65+', a: selectedRouteHistory.summary.age65plus, b: compareRouteHistory?.summary.age65plus || 0 }
      ]
    }
  }, [selectedRouteHistory, compareRouteHistory])

  return (
    <div className="unified-data-explorer">
      <div className="explorer-header">
        <h2>Data Explorer</h2>
        <div className="dashboard-mode-selector">
          {DASHBOARD_MODES.map(mode => (
            <button
              key={mode.id}
              className={`mode-btn ${dashboardMode === mode.id ? 'active' : ''}`}
              onClick={() => setDashboardMode(mode.id)}
            >
              <span className="mode-icon">{mode.icon}</span>
              <span className="mode-label">{mode.label}</span>
            </button>
          ))}
        </div>
        <label className="report-light-toggle" title="Light mode uses a white background to save ink when printing">
          <input
            type="checkbox"
            checked={reportLightMode}
            onChange={e => setReportLightMode(e.target.checked)}
            disabled={isExporting}
          />
          <span>Light report</span>
        </label>
        <button
          className={`export-report-btn ${isExporting ? 'exporting' : ''} ${drawBboxMode ? 'draw-active' : ''}`}
          onClick={handleExportReport}
          disabled={isExporting}
          title={drawBboxMode ? 'Click to cancel drawing' : 'Draw a bounding box to export a report'}
        >
          {isExporting ? (
            <>
              <span className="export-spinner" />
              <span className="export-label">Generating…</span>
            </>
          ) : drawBboxMode ? (
            <>
              <svg className="export-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
              </svg>
              <span className="export-label">Cancel Draw</span>
            </>
          ) : (
            <>
              <svg className="export-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/>
              </svg>
              <span className="export-label">Export Report</span>
            </>
          )}
        </button>
      </div>
      
      {/* Category sub-nav — horizontal pill bar below mode tabs */}
      <div className="category-subnav">
        {/* All Layers toggle — only for dashboards with multiple layer types */}
        {showAllLayersToggle && (() => {
          const dashCats = getCurrentDashboardCategories()
          const allActive = dashCats.every(c => layerStack.some(l => l.id === c.id))
          return (
            <button
              className={`category-pill category-pill--all ${allActive ? 'active' : ''}`}
              onClick={() => selectAllLayersForDashboard(dashboardMode)}
            >
              <span className="category-pill-dot category-pill-dot--all"></span>
              <span className="category-pill-label">All Layers</span>
            </button>
          )
        })()}
        {getCurrentDashboardCategories().map(category => (
          <button
            key={category.id}
            className={`category-pill ${activeCategory === category.id || (layerStack.some(l => l.id === category.id) && !activeCategory) ? 'active' : ''}`}
            onClick={() => selectCategory(category.id)}
          >
            <span className="category-pill-dot"></span>
            <span className="category-pill-label">{category.label}</span>
          </button>
        ))}
      </div>

      <div className="explorer-content">
        <aside className={`explorer-sidebar ${greeneryInsightsExpanded ? 'explorer-sidebar--wide' : ''}`} style={{ width: effectiveSidebarWidth }}>
          <div className="sidebar-resize-handle" onMouseDown={startSidebarDrag} />
          <div className="explorer-sidebar-main">
          {/* Dashboard-specific content */}
          <Suspense fallback={<div className="app-panel-loading">Loading analytics panel...</div>}>
            {dashboardMode === 'business' && (
              <BusinessAnalytics
                businessMode={businessMode}
                onModeChange={(mode) => {
                  setBusinessMode(mode)
                  // Map business mode back to category
                  const categoryMap = {
                    liveliness: 'businessLiveliness',
                    opinions: 'vendorOpinions',
                    ratings: 'businessRatings',
                    amenities: 'amenities',
                    categories: 'businessCategories',
                    property: 'propertySales',
                    events: 'cityEvents'
                  }
                  if (categoryMap[mode]) {
                    selectCategory(categoryMap[mode])
                  }
                }}
                dayOfWeek={dayOfWeek}
                hour={hour}
                onDayChange={setDayOfWeek}
                onHourChange={setHour}
                businessesData={businessesData}
                streetStallsData={streetStallsData}
                propertiesData={propertiesData}
                surveyData={surveyData}
                opinionSource={opinionSource}
                onOpinionSourceChange={setOpinionSource}
                amenitiesFilters={amenitiesFilters}
                onAmenitiesFiltersChange={setAmenitiesFilters}
                categoriesFilters={categoriesFilters}
                onCategoriesFiltersChange={setCategoriesFilters}
                expandedGroups={expandedGroups}
                onExpandedGroupsChange={setExpandedGroups}
                eventsData={filteredEventsData}
                eventsMonth={eventsMonth}
                onEventsMonthChange={setEventsMonth}
                eventsScope={eventsScope}
                onEventsScopeChange={setEventsScope}
                renderEventsInline={businessMode !== 'events'}
                hideLayerControls={true}
              />
            )}

          {/* Business category stats panel */}
          {dashboardMode === 'business' && (() => {
            const stats = computeCategoryStats()
            if (!stats) return null
            const maxBucket = Math.max(...Object.values(stats.ratingBuckets), 1)
            return (
              <div className="biz-stats-panel">
                <div className="biz-stats-header">
                  <span className="biz-stats-title">Category Intelligence</span>
                  <span className="biz-stats-count">{stats.total.toLocaleString()} businesses</span>
                </div>
                <div className="biz-stats-grid">
                  <div className="biz-stat-card">
                    <div className="biz-stat-value">{stats.avgRating ?? '—'}</div>
                    <div className="biz-stat-label">Avg Rating</div>
                  </div>
                  <div className="biz-stat-card">
                    <div className="biz-stat-value">{stats.withRatingCount}</div>
                    <div className="biz-stat-label">Rated</div>
                  </div>
                  <div className="biz-stat-card">
                    <div className="biz-stat-value">{stats.avgReviewCount ?? '—'}</div>
                    <div className="biz-stat-label">Avg Reviews</div>
                  </div>
                  <div className="biz-stat-card">
                    <div className="biz-stat-value">{stats.topTypes.length > 0 ? stats.topTypes[0][1] : '—'}</div>
                    <div className="biz-stat-label">Top Type Count</div>
                  </div>
                </div>
                <div className="biz-stats-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Rating Distribution</span>
                  {ratingFilter && ratingFilter.size > 0 && (
                    <button className="biz-filter-clear" onClick={() => setRatingFilter(null)}>clear filter</button>
                  )}
                </div>
                <div className="biz-rating-dist">
                  {[5,4,3,2,1].map(star => {
                    const count = stats.ratingBuckets[star] || 0
                    const pct = maxBucket > 0 ? (count / maxBucket) * 100 : 0
                    const isSelected = ratingFilter && ratingFilter.has(star)
                    const hasFilter = ratingFilter && ratingFilter.size > 0
                    const toggleStar = () => {
                      setRatingFilter(prev => {
                        const next = new Set(prev || [])
                        if (next.has(star)) { next.delete(star) } else { next.add(star) }
                        return next.size === 0 ? null : next
                      })
                    }
                    return (
                      <div
                        key={star}
                        className={`biz-rating-row biz-rating-row--clickable ${isSelected ? 'selected' : ''} ${hasFilter && !isSelected ? 'dimmed' : ''}`}
                        onClick={toggleStar}
                        title={`${isSelected ? 'Deselect' : 'Select'} ${star}-star businesses`}
                      >
                        <span className="biz-rating-star">{star}★</span>
                        <div className="biz-rating-bar-track">
                          <div className="biz-rating-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="biz-rating-count">{count}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="biz-stats-section-label">Top Business Types</div>
                <div className="biz-top-types">
                  {stats.topTypes.map(([type, count]) => (
                    <div key={type} className="biz-type-row">
                      <span className="biz-type-name">{type.replace(/_/g, ' ')}</span>
                      <span className="biz-type-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

            {dashboardMode === 'walkability' && (
              <WalkabilityAnalytics
                walkabilityMode={walkabilityMode}
                onWalkabilityModeChange={(mode) => {
                  setWalkabilityMode(mode)
                  // Map walkability mode back to category
                  const categoryMap = {
                    activity: 'activeMobility',
                    steepness: 'roadSteepness',
                    network: 'networkAnalysis',
                    transit: 'transitAccessibility'
                  }
                  if (categoryMap[mode]) {
                    selectCategory(categoryMap[mode])
                  }
                }}
                networkMetric={networkMetric}
                onNetworkMetricChange={setNetworkMetric}
                transitView={transitView}
                onTransitViewChange={setTransitView}
                routeLayerMode={routeLayerMode}
                onRouteLayerModeChange={(mode) => {
                  setRouteLayerMode(mode)
                  selectCategory(mode === 'anomalies' ? 'mobilityAnomalies' : 'activeMobility')
                }}
                showPopularRoutesOnly={showPopularRoutesOnly}
                onShowPopularRoutesOnlyChange={setShowPopularRoutesOnly}
                walkabilityMonths={walkabilityMonths}
                selectedMonth={selectedWalkabilityMonth}
                onMonthChange={setSelectedWalkabilityMonth}
                pedestrianData={pedestrianData}
                cyclingData={cyclingData}
                anomaliesData={filteredStravaAnomalies}
                networkData={networkData}
                transitData={transitData}
                roadSteepnessData={roadSteepnessData}
                hideLayerControls={true}
                selectedSegment={selectedRouteSegment}
              />
            )}
          
            {dashboardMode === 'lighting' && (
              <LightingAnalytics
                segmentsData={lightingSegments}
                projectsData={missionInterventions}
                streetLightsData={streetLights}
                lightingThresholds={lightingThresholds}
                hideLayerControls={true}
              />
            )}
          
            {dashboardMode === 'climate' && (
              <>
                <MicroclimateControlPanel
                  activeCategory={activeCategory}
                  onCategorySelect={selectCategory}
                  heatGridData={heatGridData}
                  ecologyCurrentData={ecologyCurrentData}
                  shadeData={shadeData}
                  estimatedWindData={estimatedWindData}
                  temperatureData={temperatureData}
                  ecologyMetric={ecologyMetric}
                  onEcologyMetricChange={setEcologyMetric}
                  timeOfDay={timeOfDay}
                  onTimeOfDayChange={setTimeOfDay}
                  windDirection={windDirection}
                  onWindDirectionChange={setWindDirection}
                  windSpeedKmh={windSpeedKmh}
                  onWindSpeedKmhChange={setWindSpeedKmh}
                  selectedFeature={selectedEcologyFeature}
                  comparisonFeature={compareEcologyFeature}
                />
                {activeCategory === 'urbanHeatConcrete' && selectedEcologyFeature && (
                  <EcologyHeatAnalytics
                    currentData={ecologyCurrentData}
                    ecologyYear={ecologyYear}
                    onEcologyYearChange={setEcologyYear}
                    ecologyMetric={ecologyMetric}
                    onEcologyMetricChange={setEcologyMetric}
                    selectedFeature={selectedEcologyFeature}
                    selectedSeries={selectedEcologyFeatureSeries}
                    comparisonFeature={compareEcologyFeature}
                    comparisonSeries={compareEcologyFeatureSeries}
                    availableYears={ecologyAvailableYears}
                  />
                )}
              </>
            )}
          
            {dashboardMode === 'environment' && (
              <>
                <GreeneryAnalytics
                  greeneryAndSkyview={greeneryAndSkyview}
                  parksData={parksData}
                  hideLayerControls={true}
                  allLayersActive={LAYER_CATEGORIES.filter(c => c.dashboard === 'environment').every(c => layerStack.some(l => l.id === c.id))}
                  showGreenDestinations={showGreenDestinations}
                  onToggleGreenDestinations={() => setShowGreenDestinations((current) => !current)}
                  insightsExpanded={greeneryInsightsExpanded}
                  onInsightsExpandedChange={setGreeneryInsightsExpanded}
                  greeneryMapMode={greeneryMapMode}
                  onGreeneryMapModeChange={setGreeneryMapMode}
                  showUnderservedGreenery={showUnderservedGreenery}
                  onShowUnderservedGreeneryChange={setShowUnderservedGreenery}
                />
              </>
            )}
          </Suspense>

          {dashboardMode === 'traffic' && (
            <TrafficAnalytics
              trafficData={trafficData}
              activeScenario={trafficScenario}
              onScenarioChange={(scenario) => {
                setTrafficScenario(scenario)
                selectCategory('trafficFlow')
              }}
              hideLayerControls={true}
            />
          )}
          </div>

          {/* Active Layers — inline at sidebar bottom */}
          {layerStack.length > 0 && (
            <div className="sidebar-layer-stack">
              <div className="sidebar-layer-stack-header">
                <span className="sidebar-layer-stack-label">Active Layers</span>
                <span className="sidebar-layer-stack-count">{layerStack.length}</span>
              </div>
              {layerStack.map((layer) => (
                <div key={layer.id} className="sidebar-layer-item">
                  <span className="sidebar-layer-name">{layer.label}</span>
                  <button
                    className="sidebar-layer-remove"
                    onClick={() => removeFromStack(layer.id)}
                    title="Remove layer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
        
        <main className="explorer-map-container">
          <Suspense fallback={<div className="app-map-loading">Loading explorer map...</div>}>
            <ExplorerMap
              dashboardMode={dashboardMode}
              businessMode={businessMode}
              walkabilityMode={walkabilityMode}
              routeLayerMode={routeLayerMode}
              showPopularRoutesOnly={showPopularRoutesOnly}
              networkMetric={networkMetric}
              transitView={transitView}
              dayOfWeek={dayOfWeek}
              hour={hour}
              businessesData={businessesData}
              streetStallsData={streetStallsData}
              surveyData={surveyData}
              propertiesData={propertiesData}
              networkData={networkData}
              pedestrianData={pedestrianData}
              cyclingData={cyclingData}
              anomaliesData={filteredStravaAnomalies}
              transitData={transitData}
              busStopsData={busStopsData}
              trainStationData={trainStationData}
              roadSteepnessData={roadSteepnessData}
              lightingSegments={lightingSegments}
              streetLights={streetLights}
              missionInterventions={missionInterventions}
              lightingThresholds={lightingThresholds}
              temperatureData={temperatureData}
              heatGridData={heatGridData}
              shadeData={shadeData}
              estimatedWindData={estimatedWindData}
              windSpeedKmh={windSpeedKmh}
              season={season}
              greeneryAndSkyview={greeneryAndSkyview}
              treeCanopyData={treeCanopyData}
              parksData={parksData}
              showGreenDestinations={showGreenDestinations}
              greeneryMapMode={greeneryMapMode}
              showUnderservedGreenery={showUnderservedGreenery}
              ecologyHeatData={ecologyCurrentData}
              ecologyMetric={ecologyMetric}
              selectedEcologyFeatureKeys={selectedEcologyFeatureKeys}
              envCurrentData={envDisplayData}
              envHistoryData={envHistoryData}
              envIndex={envIndex}
              onEnvGridDetail={openEnvGridDetail}
              onGreeneryStreetSelect={openGreeneryStreetDetail}
              onEcologyFeatureSelect={openEcologyFeatureDetail}
              visibleLayers={visibleLayers}
              layerStack={layerStack}
              activeCategory={activeCategory}
              onMapLoad={setMap}
              enableCanvasCapture={drawBboxMode || isExporting}
              drawBboxMode={drawBboxMode}
              onBboxDrawn={handleBboxDrawn}
              opinionSource={opinionSource}
              amenitiesFilters={amenitiesFilters}
              categoriesFilters={categoriesFilters}
              eventsData={filteredEventsData}
              eventsMonth={eventsMonth}
              eventsScope={eventsScope}
              trafficData={trafficData}
              trafficScenario={trafficScenario}
              ratingFilter={ratingFilter ? Array.from(ratingFilter) : null}
              selectedSegment={selectedSegment}
              onSegmentSelect={setSelectedSegment}
              onRouteSegmentClick={(segment) => {
                if (segment?.anomaly_score != null) {
                  setSelectedAnomalySegment(segment)
                  setSelectedRouteSegment(null)
                  setCompareRouteSegment(null)
                  setRoutePanelMinimized(false)
                  return
                }
                setSelectedAnomalySegment(null)
                if (!selectedRouteSegment || Number(selectedRouteSegment.edge_uid) === Number(segment.edge_uid)) {
                  setSelectedRouteSegment(segment)
                } else if (!compareRouteSegment || Number(compareRouteSegment.edge_uid) === Number(segment.edge_uid)) {
                  setCompareRouteSegment(segment)
                } else {
                  setCompareRouteSegment(segment)
                }
                setRoutePanelMinimized(false)
              }}
            />
          </Suspense>

          {dashboardMode === 'walkability' && selectedRouteSegment && selectedRouteHistory && (
            <div
              className={`bottom-panel route-history-panel ${routePanelMinimized ? 'route-history-panel--minimized' : ''}`}
              style={{ right: `${effectiveSidebarWidth + 32}px` }}
            >
              <div className="panel-header">
                <h3>Route Compare: A {selectedRouteHistory.edgeUid}{compareRouteHistory ? ` vs B ${compareRouteHistory.edgeUid}` : ''}</h3>
                <div className="panel-header-actions">
                  <button onClick={() => setRoutePanelMinimized(value => !value)} className="close-btn" title={routePanelMinimized ? 'Expand panel' : 'Minimize panel'}>
                    {routePanelMinimized ? '▢' : '–'}
                  </button>
                  <button onClick={() => { setCompareRouteSegment(null) }} className="close-btn" title="Clear route B">B</button>
                  <button onClick={() => { setSelectedRouteSegment(null); setCompareRouteSegment(null); setRoutePanelMinimized(false) }} className="close-btn">✕</button>
                </div>
              </div>
              {!routePanelMinimized && (
              <>
              <div className="route-history-meta">
                <div className="route-history-chip">
                  <span>Route A Trips</span>
                  <strong>{selectedRouteHistory.summary.totalTrips.toLocaleString()}</strong>
                </div>
                <div className="route-history-chip">
                  <span>Route B Trips</span>
                  <strong>{compareRouteHistory ? compareRouteHistory.summary.totalTrips.toLocaleString() : 'Select route B'}</strong>
                </div>
                <div className="route-history-chip">
                  <span>Trip Delta</span>
                  <strong>{compareRouteHistory ? (selectedRouteHistory.summary.totalTrips - compareRouteHistory.summary.totalTrips).toLocaleString() : '—'}</strong>
                </div>
                <div className="route-history-chip">
                  <span>People Delta</span>
                  <strong>{compareRouteHistory ? (selectedRouteHistory.summary.totalPeople - compareRouteHistory.summary.totalPeople).toLocaleString() : '—'}</strong>
                </div>
                <div className="route-history-chip">
                  <span>Current Filter Month</span>
                  <strong>{walkabilityMonths.find(m => m.key === selectedWalkabilityMonth)?.label ?? 'All'}</strong>
                </div>
              </div>
              <div className="charts-container route-history-charts">
                <div className="chart-panel">
                  <h4>Monthly Trip Comparison</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={routeCompareData?.monthly || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="monthLabel" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="aTrips" name="Route A" stroke="#f97316" strokeWidth={3} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="bTrips" name="Route B" stroke="#60a5fa" strokeWidth={3} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Monthly People Comparison</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={routeCompareData?.monthly || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="monthLabel" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="aPeople" name="Route A" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="bPeople" name="Route B" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Monthly Mode Split</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={selectedRouteHistory.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="monthLabel" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="walkingTrips" name="Walking / Running" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cyclingTrips" name="Cycling" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Gender Distribution A vs B</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={routeCompareData?.gender || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="a" name="Route A" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="b" name="Route B" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Purpose Split</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Walk Leisure', value: selectedRouteHistory.summary.walkingLeisure },
                          { name: 'Walk Commute', value: selectedRouteHistory.summary.walkingCommute },
                          { name: 'Cycle Leisure', value: selectedRouteHistory.summary.cyclingLeisure },
                          { name: 'Cycle Commute', value: selectedRouteHistory.summary.cyclingCommute }
                        ].filter(item => item.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={82}
                        paddingAngle={2}
                      >
                        {['#fdba74', '#f97316', '#93c5fd', '#2563eb'].map((color, index) => <Cell key={color + index} fill={color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Daypart Distribution</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={selectedRouteHistory.daypartTotals}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="walkingTrips" name="Walking / Running" fill="#fb923c" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cyclingTrips" name="Cycling" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel">
                  <h4>Age Profile A vs B</h4>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={routeCompareData?.ages || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="a" name="Route A" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="b" name="Route B" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel chart-panel--radar">
                  <h4>Route Profile A vs B</h4>
                  <ResponsiveContainer width="100%" height={260}>
                    <RadarChart
                      data={[
                        {
                          metric: 'Walk Trips',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.walkingTrips), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.walkingTrips), 0)
                        },
                        {
                          metric: 'Cycle Trips',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.cyclingTrips), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.cyclingTrips), 0)
                        },
                        {
                          metric: 'Walk Speed',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.walkingAvgSpeed * 40), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.walkingAvgSpeed * 40), 0)
                        },
                        {
                          metric: 'Cycle Speed',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.cyclingAvgSpeed * 20), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.cyclingAvgSpeed * 20), 0)
                        },
                        {
                          metric: 'Walk Commute',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.walkingCommute), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.walkingCommute), 0)
                        },
                        {
                          metric: 'Cycle Commute',
                          value: Math.max(...selectedRouteHistory.monthly.map(item => item.cyclingCommute), 0),
                          compare: Math.max(...(compareRouteHistory?.monthly || []).map(item => item.cyclingCommute), 0)
                        }
                      ]}
                    >
                      <PolarGrid stroke="rgba(255,255,255,0.12)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 11 }} />
                      <PolarRadiusAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }} />
                      <Radar
                        name="Route A"
                        dataKey="value"
                        stroke="#f97316"
                        fill="#f97316"
                        fillOpacity={0.24}
                      />
                      {compareRouteHistory && (
                        <Radar
                          name="Route B"
                          dataKey="compare"
                          stroke="#60a5fa"
                          fill="#60a5fa"
                          fillOpacity={0.18}
                        />
                      )}
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="chart-panel chart-panel--facts">
                  <h4>Quick Reads A vs B</h4>
                  <div className="route-facts-grid">
                    <div className="route-fact route-fact--orange">
                      <span>A Walk / Run Trips</span>
                      <strong>{selectedRouteHistory.summary.walkingTrips.toLocaleString()}</strong>
                    </div>
                    <div className="route-fact route-fact--blue">
                      <span>B Walk / Run Trips</span>
                      <strong>{compareRouteHistory ? compareRouteHistory.summary.walkingTrips.toLocaleString() : '—'}</strong>
                    </div>
                    <div className="route-fact route-fact--green">
                      <span>A Cycling Trips</span>
                      <strong>{selectedRouteHistory.summary.cyclingTrips.toLocaleString()}</strong>
                    </div>
                    <div className="route-fact route-fact--pink">
                      <span>B Cycling Trips</span>
                      <strong>{compareRouteHistory ? compareRouteHistory.summary.cyclingTrips.toLocaleString() : '—'}</strong>
                    </div>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {dashboardMode === 'walkability' && selectedAnomalySegment && (
            <div
              className={`bottom-panel route-history-panel ${routePanelMinimized ? 'route-history-panel--minimized' : ''}`}
              style={{ right: `${effectiveSidebarWidth + 32}px` }}
            >
              <div className="panel-header">
                <h3>Anomaly Detail: edge {selectedAnomalySegment.edge_uid}</h3>
                <div className="panel-header-actions">
                  <button onClick={() => setRoutePanelMinimized(value => !value)} className="close-btn" title={routePanelMinimized ? 'Expand panel' : 'Minimize panel'}>
                    {routePanelMinimized ? '▢' : '–'}
                  </button>
                  <button onClick={() => { setSelectedAnomalySegment(null); setRoutePanelMinimized(false) }} className="close-btn">✕</button>
                </div>
              </div>
              {!routePanelMinimized && (
                <>
                  <div className="route-history-meta">
                    <div className="route-history-chip">
                      <span>Likely Cause</span>
                      <strong>{selectedAnomalySegment.likely_reason || 'Unknown'}</strong>
                    </div>
                    <div className="route-history-chip">
                      <span>Confidence</span>
                      <strong>{selectedAnomalySegment.confidence || '—'}</strong>
                    </div>
                    <div className="route-history-chip">
                      <span>Event Date</span>
                      <strong>{selectedAnomalySegment.event_date || selectedAnomalySegment.date || '—'}</strong>
                    </div>
                    <div className="route-history-chip">
                      <span>Event Type</span>
                      <strong>{selectedAnomalySegment.event_type || 'unknown'}</strong>
                    </div>
                    <div className="route-history-chip">
                      <span>Anomaly Score</span>
                      <strong>{Number(selectedAnomalySegment.anomaly_score || 0).toFixed(2)}</strong>
                    </div>
                    <div className="route-history-chip">
                      <span>Status</span>
                      <strong>{selectedAnomalySegment.status || '—'}</strong>
                    </div>
                  </div>
                  <div className="charts-container route-history-charts">
                    <div className="chart-panel chart-panel--facts">
                      <h4>Anomaly Snapshot</h4>
                      <div className="route-facts-grid">
                        <div className="route-fact route-fact--orange">
                          <span>Observed Total</span>
                          <strong>{Number(selectedAnomalySegment.observed_total || 0).toLocaleString()}</strong>
                        </div>
                        <div className="route-fact route-fact--blue">
                          <span>Baseline Total</span>
                          <strong>{Number(selectedAnomalySegment.baseline_total || 0).toLocaleString()}</strong>
                        </div>
                        <div className="route-fact route-fact--green">
                          <span>Percent Delta</span>
                          <strong>{`${(Number(selectedAnomalySegment.percent_delta || 0) * 100).toFixed(1)}%`}</strong>
                        </div>
                        <div className="route-fact route-fact--pink">
                          <span>Daypart Trips</span>
                          <strong>{Number(selectedAnomalySegment.route_daypart_trip_count || 0).toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="chart-panel">
                      <h4>Observed vs Baseline</h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={[
                          { label: 'Observed', value: Number(selectedAnomalySegment.observed_total || 0) },
                          { label: 'Baseline', value: Number(selectedAnomalySegment.baseline_total || 0) },
                          { label: 'Route Total', value: Number(selectedAnomalySegment.route_total_trip_count || 0) }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                          <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#c084fc" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-panel">
                      <h4>Top Dayparts</h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={summarizeStravaDayparts(selectedAnomalySegment.top_dayparts)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="label" stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                          <YAxis stroke="rgba(255,255,255,0.65)" tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#f472b6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-panel chart-panel--facts">
                      <h4>Context</h4>
                      <div className="anomaly-context-grid">
                        <div className="anomaly-context-item">
                          <span>Dataset</span>
                          <strong>{selectedAnomalySegment.dataset_name}</strong>
                        </div>
                        <div className="anomaly-context-item">
                          <span>Month</span>
                          <strong>{selectedAnomalySegment.month_label}</strong>
                        </div>
                        <div className="anomaly-context-item">
                          <span>Daypart</span>
                          <strong>{formatStravaDaypartLabel(selectedAnomalySegment.daypart)}</strong>
                        </div>
                        <div className="anomaly-context-item">
                          <span>Event</span>
                          <strong>{selectedAnomalySegment.event_name || 'unknown'}</strong>
                        </div>
                        <div className="anomaly-context-item anomaly-context-item--wide">
                          <span>Source Summary</span>
                          <strong>{selectedAnomalySegment.source_summary || 'No summary attached'}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Bottom panel for temperature seasonal charts */}
          {dashboardMode === 'climate' && activeCategory === 'heatStreets' && selectedSegment && (
            <div className="bottom-panel">
              <div className="panel-header">
                <h3>{selectedSegment.street_name || 'Street Segment'} - Heat Street Detail</h3>
                <button onClick={() => setSelectedSegment(null)} className="close-btn">✕</button>
              </div>
              <div className="charts-container">
                <div className="env-detail-summary-row ecology-summary-row">
                  <div className="env-detail-stat">
                    <span className="env-detail-stat-label">Hot street score</span>
                    <strong>{Number(selectedSegment.hot_street_score || 0).toFixed(1)}</strong>
                  </div>
                  <div className="env-detail-stat">
                    <span className="env-detail-stat-label">Heat model LST</span>
                    <strong>{Number(selectedSegment.mean_heat_model_lst_c || 0).toFixed(1)}°C</strong>
                  </div>
                  <div className="env-detail-stat">
                    <span className="env-detail-stat-label">Pedestrian heat</span>
                    <strong>{Number(selectedSegment.mean_pedestrian_heat_score || 0).toFixed(1)}</strong>
                  </div>
                  <div className="env-detail-stat">
                    <span className="env-detail-stat-label">Pedestrian rank</span>
                    <strong>
                      {selectedSegment.pedestrian_heat_percentile != null
                        ? `Top ${Math.max(1, Math.round(100 - Number(selectedSegment.pedestrian_heat_percentile)))}%`
                        : 'Unranked'}
                    </strong>
                  </div>
                  <div className="env-detail-stat">
                    <span className="env-detail-stat-label">Class</span>
                    <strong>{selectedSegment.hot_street_class || 'Unclassified'}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Greenery detail bottom panel ── */}
          {dashboardMode === 'environment' && selectedGreenerySummaries.length > 0 && activeCategory !== 'urbanHeatConcrete' && (() => {
            const [primaryStreet, compareStreet] = selectedGreenerySummaries
            const primaryDestinations = greeneryNearestDestinations.find((entry) => entry.streetKey === primaryStreet.streetKey)?.destinations || []
            const compareDestinations = compareStreet
              ? (greeneryNearestDestinations.find((entry) => entry.streetKey === compareStreet.streetKey)?.destinations || [])
              : []
            const greeneryRadarData = primaryStreet.radarMetrics.map((metric, index) => ({
              metric: metric.metric,
              primary: metric.value,
              compare: compareStreet?.radarMetrics?.[index]?.value ?? null
            }))
            const qualityKeys = ['very_high', 'high', 'medium', 'low', 'very_low', 'unknown']
            const greeneryQualityCompareData = qualityKeys.map((qualityKey) => ({
              quality: qualityKey.replace(/_/g, ' '),
              primary: primaryStreet.qualityClasses[qualityKey] || 0,
              compare: compareStreet?.qualityClasses?.[qualityKey] || 0,
              color: GREENERY_QUALITY_COLORS[qualityKey] || GREENERY_QUALITY_COLORS.unknown
            }))

            return (
              <div
                ref={greeneryDetailPanelRef}
                className={`bottom-panel greenery-bottom-panel ${greeneryPanelMinimized ? 'greenery-minimized' : ''}`}
                style={{ marginRight: effectiveSidebarWidth + 32 }}
              >
                <div className="panel-header greenery-panel-header">
                  <div className="greenery-panel-headline">
                    <div className="greenery-panel-score">
                      {Math.round(primaryStreet.avgParkQualityScore || 0)}
                    </div>
                    <div>
                      <h3>{primaryStreet.displayName} — Greenery Access Detail</h3>
                      <div className="greenery-panel-subtitle">
                        {primaryStreet.segmentCount} mapped segments · adjusted access {formatMinutes(primaryStreet.avgAdjustedMinutes)}
                      </div>
                      <div className="ecology-comparison-key">
                        <div className="ecology-comparison-key-item">
                          <span className="ecology-role-badge warm">A</span>
                          <span>{primaryStreet.displayName}</span>
                        </div>
                        {compareStreet && (
                          <div className="ecology-comparison-key-item">
                            <span className="ecology-role-badge cool">B</span>
                            <span>{compareStreet.displayName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={() => setGreeneryPanelMinimized((current) => !current)}
                      className="close-btn"
                      title={greeneryPanelMinimized ? 'Expand' : 'Minimize'}
                    >{greeneryPanelMinimized ? '▲' : '▼'}</button>
                    <button
                      onClick={() => { setSelectedGreeneryStreetKeys([]); setGreeneryPanelMinimized(false) }}
                      className="close-btn"
                    >✕</button>
                  </div>
                </div>

                {!greeneryPanelMinimized && (
                  <div className="charts-container greenery-charts-container">
                    <div className="env-detail-summary-row ecology-summary-row greenery-summary-row">
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Primary adjusted</span>
                        <strong>{formatMinutes(primaryStreet.avgAdjustedMinutes)}</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Primary quality</span>
                        <strong>{Math.round(primaryStreet.avgParkQualityScore || 0)}/100</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Gap share</span>
                        <strong>{primaryStreet.accessGapShare.toFixed(0)}%</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Compare street</span>
                        <strong>{compareStreet ? compareStreet.displayName : 'Click another street'}</strong>
                      </div>
                    </div>

                    <div className="greenery-detail-layout">
                      <div className="greenery-detail-column">
                        <div className="ecology-chart-card">
                          <div className="ecology-chart-head">
                            <span>Street Comparison</span>
                            <strong>Average access metrics</strong>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={greeneryStreetComparisonData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="metric" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                                formatter={(value, name) => {
                                  const label = name === 'primary' ? primaryStreet.displayName : compareStreet?.displayName || 'Compare'
                                  return [Number(value).toFixed(1), label]
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="primary" fill="#22c55e" radius={[8, 8, 0, 0]} name={primaryStreet.displayName} />
                              {compareStreet && <Bar dataKey="compare" fill="#38bdf8" radius={[8, 8, 0, 0]} name={compareStreet.displayName} />}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="ecology-chart-card">
                          <div className="ecology-chart-head">
                            <span>Segment Profile</span>
                            <strong>Adjusted access time by segment</strong>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <LineChart data={greenerySegmentTrendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="segment" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                                formatter={(value, name) => {
                                  const label = name === 'primaryAdjusted' ? primaryStreet.displayName : compareStreet?.displayName || 'Compare'
                                  return [value != null ? `${Number(value).toFixed(1)} min` : '—', label]
                                }}
                              />
                              <Line type="monotone" dataKey="primaryAdjusted" stroke="#22c55e" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
                              {compareStreet && <Line type="monotone" dataKey="compareAdjusted" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="greenery-detail-column">
                        <div className="ecology-chart-card">
                          <div className="ecology-chart-head">
                            <span>Street Spidergram</span>
                            <strong>Performance profile</strong>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <RadarChart data={greeneryRadarData}>
                              <PolarGrid stroke="rgba(255,255,255,0.12)" />
                              <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} />
                              <Radar dataKey="primary" stroke="#22c55e" fill="#22c55e" fillOpacity={0.32} />
                              {compareStreet && <Radar dataKey="compare" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.18} />}
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="ecology-chart-card">
                          <div className="ecology-chart-head">
                            <span>Quality Mix</span>
                            <strong>Nearest green destination class</strong>
                          </div>
                          <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={greeneryQualityCompareData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                              <XAxis dataKey="quality" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} allowDecimals={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                                formatter={(value, name) => [Number(value), name === 'primary' ? primaryStreet.displayName : compareStreet?.displayName || 'Compare']}
                              />
                              <Bar dataKey="primary" fill="#22c55e" radius={[8, 8, 0, 0]} />
                              {compareStreet && <Bar dataKey="compare" fill="#38bdf8" radius={[8, 8, 0, 0]} />}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>

                    <div className="greenery-destination-grid">
                      <div className="ecology-rank-card">
                        <span>Nearest Green Destinations</span>
                        <strong>{primaryStreet.displayName}</strong>
                        <div className="greenery-destination-list">
                          {primaryDestinations.map((destination) => (
                            <div key={`${primaryStreet.streetKey}-${destination.name}`} className="greenery-destination-item">
                              <div>
                                <strong>{destination.name}</strong>
                                <small>{String(destination.type).replace(/_/g, ' ')}</small>
                              </div>
                              <div className="greenery-destination-metrics">
                                <span style={{ color: destination.color }}>{destination.qualityScore ? `${Math.round(destination.qualityScore)}/100` : '—'}</span>
                                <small>{destination.distanceM != null ? `${Math.round(destination.distanceM)} m` : '—'}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="ecology-rank-card">
                        <span>Nearest Green Destinations</span>
                        <strong>{compareStreet ? compareStreet.displayName : 'Comparison slot'}</strong>
                        <div className="greenery-destination-list">
                          {(compareStreet ? compareDestinations : []).map((destination) => (
                            <div key={`${compareStreet.streetKey}-${destination.name}`} className="greenery-destination-item">
                              <div>
                                <strong>{destination.name}</strong>
                                <small>{String(destination.type).replace(/_/g, ' ')}</small>
                              </div>
                              <div className="greenery-destination-metrics">
                                <span style={{ color: destination.color }}>{destination.qualityScore ? `${Math.round(destination.qualityScore)}/100` : '—'}</span>
                                <small>{destination.distanceM != null ? `${Math.round(destination.distanceM)} m` : '—'}</small>
                              </div>
                            </div>
                          ))}
                          {!compareStreet && (
                            <div className="greenery-destination-empty">
                              Click a second street to compare destination reach, quality mix, and segment performance.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Environment detail bottom panel ── */}
          {dashboardMode === 'climate' && activeCategory === 'airQuality' && envDetailGrid && (() => {
            const gridRow = envDisplayData?.rows?.find(r => r.grid_id === envDetailGrid) || envCurrentData?.rows?.find(r => r.grid_id === envDetailGrid)
            const currentGridRow = envCurrentData?.rows?.find(r => r.grid_id === envDetailGrid)
            const histRows = (envHistoryData?.rows || []).filter(r => r.grid_id === envDetailGrid)
            if (!gridRow || histRows.length === 0) return null

            const POLL_DESC = {
              poll_o3:  { label: 'O\u2083 (Ozone)', desc: 'Ground-level ozone formed by sunlight reacting with vehicle & industrial emissions. Irritates airways and worsens asthma.', safe: 100, color: '#4fc3f7', unit: '\u00b5g/m\u00b3' },
              poll_no2: { label: 'NO\u2082 (Nitrogen Dioxide)', desc: 'Produced mainly by traffic and power plants. Inflames the lining of the lungs and reduces immunity to infections.', safe: 40, color: '#ce93d8', unit: '\u00b5g/m\u00b3' },
              poll_pm10:{ label: 'PM10 (Coarse Particles)', desc: 'Dust, pollen, and construction debris \u226410\u00b5m. Can penetrate the upper airways and trigger coughing and breathing difficulties.', safe: 50, color: '#ffcc80', unit: '\u00b5g/m\u00b3' },
              poll_co:  { label: 'CO (Carbon Monoxide)', desc: 'Colourless, odourless gas from incomplete combustion. Reduces oxygen delivery in the blood; dangerous at high levels.', safe: 500, color: '#a5d6a7', unit: '\u00b5g/m\u00b3' },
              poll_so2: { label: 'SO\u2082 (Sulphur Dioxide)', desc: 'Released by burning fossil fuels containing sulphur. Causes throat and eye irritation and aggravates respiratory conditions.', safe: 20, color: '#fff176', unit: '\u00b5g/m\u00b3' },
            }
            const POLLUTANT_KEYS = Object.keys(POLL_DESC)
            const numberOrNull = (value) => {
              const parsed = parseFloat(value)
              return Number.isFinite(parsed) ? parsed : null
            }
            const formatDayLabel = (day) => new Date(day + 'T12:00:00Z').toLocaleDateString('en-ZA', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })
            const formatLocalHour = (value) => new Date(value).toLocaleTimeString('en-ZA', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'Africa/Johannesburg'
            })

            // Sort history by time
            const sorted = [...histRows].sort((a, b) => new Date(a.hour_utc) - new Date(b.hour_utc))
            const availableDays = [...new Set(sorted.map(r => r.hour_utc?.slice(0, 10)).filter(Boolean))].sort()
            const activeDay = (envDate && availableDays.includes(envDate))
              ? envDate
              : (availableDays[availableDays.length - 1] || null)
            const selectedDayRows = activeDay
              ? sorted.filter(r => r.hour_utc?.slice(0, 10) === activeDay)
              : []
            const hourlyData = selectedDayRows.map(r => ({
              hour: formatLocalHour(r.hour_utc),
              uaqi: numberOrNull(r.uaqi),
              poll_o3: numberOrNull(r.poll_o3),
              poll_no2: numberOrNull(r.poll_no2),
              poll_pm10: numberOrNull(r.poll_pm10),
              poll_co: numberOrNull(r.poll_co),
              poll_so2: numberOrNull(r.poll_so2)
            }))

            // Group by day for daily aggregation
            const byDay = {}
            sorted.forEach(r => {
              const day = new Date(r.hour_utc).toISOString().slice(0, 10)
              if (!byDay[day]) byDay[day] = []
              byDay[day].push(r)
            })
            const dailyData = Object.entries(byDay)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, rows]) => {
                const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
                const max = (arr) => arr.length ? Math.max(...arr) : null
                const uaqiVals = rows.map(r => r.uaqi).filter(v => v != null)
                const entry = {
                  day,
                  displayDay: formatDayLabel(day),
                  uaqi_avg: avg(uaqiVals),
                  uaqi_max: max(uaqiVals),
                  hours: rows.length,
                }
                POLLUTANT_KEYS.forEach(pk => {
                  const vals = rows.map(r => parseFloat(r[pk])).filter(v => !isNaN(v))
                  entry[pk + '_avg'] = avg(vals)
                  entry[pk + '_max'] = max(vals)
                })
                return entry
              })

            // UAQI band helper
            const uaqiBand = (v) => {
              if (v <= 25) return { label: 'Excellent', color: '#22d3ee' }
              if (v <= 50) return { label: 'Good', color: '#34d399' }
              if (v <= 75) return { label: 'Moderate', color: '#facc15' }
              if (v <= 100) return { label: 'Poor', color: '#f97316' }
              return { label: 'Very Poor', color: '#ef4444' }
            }
            const band = uaqiBand(gridRow.uaqi ?? currentGridRow?.uaqi ?? 0)

            // Peak day
            const peakDay = dailyData.reduce((best, d) => (!best || (d.uaqi_max || 0) > (best.uaqi_max || 0)) ? d : best, null)
            const worstHour = hourlyData.reduce((best, point) => {
              if (point.uaqi == null) return best
              if (!best || point.uaqi > best.uaqi) return point
              return best
            }, null)
            const bestHour = hourlyData.reduce((best, point) => {
              if (point.uaqi == null) return best
              if (!best || point.uaqi < best.uaqi) return point
              return best
            }, null)

            return (
              <div
                ref={envDetailPanelRef}
                className={`bottom-panel env-bottom-panel ${envPanelMinimized ? 'env-minimized' : ''}`}
                style={{ marginRight: effectiveSidebarWidth + 32 }}
              >
                <div className="panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: band.color }}>{Math.round(gridRow.uaqi ?? currentGridRow?.uaqi ?? 0)}</span>
                    <div>
                      <h3 style={{ margin: 0 }}>{(gridRow.grid_id || '').replace(/_/g, ' ')} — Air Quality Detail</h3>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{band.label} · {sorted.length} hourly readings · {dailyData.length} days</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button
                      onClick={() => setEnvPanelMinimized(m => !m)}
                      className="close-btn"
                      title={envPanelMinimized ? 'Expand' : 'Minimize'}
                    >{envPanelMinimized ? '▲' : '▼'}</button>
                    <button onClick={() => { setEnvDetailGrid(null); setEnvPanelMinimized(false) }} className="close-btn">✕</button>
                  </div>
                </div>

                {!envPanelMinimized && <div className="charts-container" style={{ display: 'flex', gap: 16, padding: '12px 16px', overflow: 'auto' }}>
                  {/* Left: Daily + hourly UAQI charts */}
                  <div style={{ flex: '1 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="env-detail-toolbar">
                      <div>
                        <div className="env-detail-toolbar-label">Time Lens</div>
                        <div className="env-detail-toolbar-subtitle">Hourly chart follows the selected map day</div>
                      </div>
                      <Suspense fallback={<div className="app-panel-loading">Loading date selector...</div>}>
                        <DateAvailabilityCalendar
                          availableDates={availableDays}
                          selectedDate={envDate}
                          onChange={setEnvDate}
                          label="Detail day"
                        />
                      </Suspense>
                    </div>

                    <div className="env-detail-summary-row">
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Selected Day</span>
                        <strong>{activeDay ? formatDayLabel(activeDay) : '—'}</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Best Hour</span>
                        <strong>{bestHour ? `${bestHour.hour} · ${Math.round(bestHour.uaqi)}` : '—'}</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Worst Hour</span>
                        <strong>{worstHour ? `${worstHour.hour} · ${Math.round(worstHour.uaqi)}` : '—'}</strong>
                      </div>
                      <div className="env-detail-stat">
                        <span className="env-detail-stat-label">Samples</span>
                        <strong>{hourlyData.length} hourly points</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Daily UAQI (Avg & Peak)</span>
                      {peakDay && (
                        <span style={{ fontSize: 10, color: '#f97316', background: 'rgba(249,115,22,0.12)', padding: '2px 8px', borderRadius: 4 }}>
                          Peak: {peakDay.displayDay} ({Math.round(peakDay.uaqi_max)})
                        </span>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="displayDay" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['dataMin - 2', 'dataMax + 5']} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11, color: '#e2e8f0' }}
                          formatter={(v, name) => [Math.round(v), name === 'uaqi_avg' ? 'Avg' : 'Peak']}
                        />
                        <Line type="monotone" dataKey="uaqi_avg" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} name="uaqi_avg" />
                        <Line type="monotone" dataKey="uaqi_max" stroke="#f97316" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} name="uaqi_max" />
                        <Legend
                          formatter={(value) => value === 'uaqi_avg' ? 'Daily Average' : 'Daily Peak'}
                          wrapperStyle={{ fontSize: 10, color: '#94a3b8' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Time of Day vs Air Quality
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>
                        Cape Town local time
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={hourlyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="hour" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['dataMin - 2', 'dataMax + 5']} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 6, fontSize: 11, color: '#e2e8f0' }}
                          formatter={(value) => [value != null ? Math.round(value) : '—', 'UAQI']}
                          labelFormatter={(value) => `${value} on ${activeDay ? formatDayLabel(activeDay) : 'selected day'}`}
                        />
                        <Line type="monotone" dataKey="uaqi" stroke={band.color} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Right: Pollutant cards with descriptions + daily bars */}
                  <div style={{ flex: '1 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Pollutant Breakdown</span>
                    {POLLUTANT_KEYS.map(pk => {
                      const meta = POLL_DESC[pk]
                      const currentVal = parseFloat(gridRow[pk + '_value'] ?? currentGridRow?.[pk + '_value'])
                      const safe = !isNaN(currentVal) && currentVal <= meta.safe
                      return (
                        <div key={pk} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                            {!isNaN(currentVal) && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: safe ? meta.color : '#f87171' }}>
                                {currentVal.toFixed(1)} {meta.unit}
                                <span style={{ fontSize: 9, marginLeft: 4, color: '#64748b' }}>safe: {meta.safe}</span>
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.45, marginBottom: 6 }}>{meta.desc}</div>
                          {/* Mini daily chart */}
                          <ResponsiveContainer width="100%" height={50}>
                            <LineChart data={dailyData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                              <XAxis dataKey="displayDay" hide />
                              <YAxis hide domain={['dataMin - 1', 'dataMax + 1']} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 4, fontSize: 10, color: '#e2e8f0' }}
                                formatter={(v) => [v != null ? v.toFixed(1) : '—', meta.label]}
                                labelFormatter={(l) => l}
                              />
                              <Line type="monotone" dataKey={pk + '_avg'} stroke={meta.color} strokeWidth={1.5} dot={{ r: 2 }} />
                              <Line type="monotone" dataKey={pk + '_max'} stroke="#f87171" strokeWidth={1} strokeDasharray="3 2" dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    })}
                  </div>
                </div>}
              </div>
            )
          })()}

          {dashboardMode === 'climate' && activeCategory === 'urbanHeatConcrete' && selectedEcologyFeature && (
            <Suspense fallback={<div className="app-panel-loading">Loading ecology detail...</div>}>
              <EcologyHeatDetailPanel
                featureSeries={selectedEcologyFeatureSeries}
                currentFeature={selectedEcologyFeature}
                compareFeature={compareEcologyFeature}
                compareSeries={compareEcologyFeatureSeries}
                currentYearData={ecologyCurrentData}
                selectedYear={ecologyYear}
                sidebarWidth={effectiveSidebarWidth}
                panelRef={ecologyDetailPanelRef}
                minimized={ecologyPanelMinimized}
                onToggleMinimized={() => setEcologyPanelMinimized(current => !current)}
                onClose={() => { setSelectedEcologyFeatureKeys([]); setEcologyPanelMinimized(false) }}
              />
            </Suspense>
          )}
        </main>

        {/* Business bottom panel */}
        {dashboardMode === 'business' && businessMode === 'events' ? (
          <div
            className={`biz-bottom-panel events-bottom-panel ${eventsPanelMinimized ? 'events-bottom-panel--minimized' : ''}`}
            style={{ right: `${effectiveSidebarWidth + 32}px`, height: eventsPanelMinimized ? 92 : `${eventsPanelHeight}px` }}
          >
            <div className="events-bottom-panel-resize" onMouseDown={startEventsPanelDrag}>
              <span className="events-bottom-panel-grip" />
            </div>
            <div className="bbp-header events-bottom-panel-header">
              <div>
                <span className="bbp-title">Event Analytics</span>
                <div className="events-bottom-panel-subtitle">Drag up to expand the graphs and live event insights.</div>
              </div>
              <div className="panel-header-actions">
                <button
                  onClick={() => setEventsPanelMinimized((value) => !value)}
                  className="close-btn"
                  title={eventsPanelMinimized ? 'Expand panel' : 'Minimize panel'}
                >
                  {eventsPanelMinimized ? '▲' : '▼'}
                </button>
              </div>
            </div>
            {!eventsPanelMinimized && (
              <div className="events-bottom-panel-body">
                <EventInsightsPanel
                  eventsData={filteredEventsData}
                  eventsMonth={eventsMonth}
                  onEventsMonthChange={setEventsMonth}
                  eventsScope={eventsScope}
                  onEventsScopeChange={setEventsScope}
                  variant="bottom"
                />
              </div>
            )}
          </div>
        ) : (() => {
          const businesses = getActiveBusinesses()
          if (businesses.length === 0) return null
          const categoryLabel = LAYER_CATEGORIES.find(c => c.id === activeCategory)?.label || 'Businesses'
          return (
            <div className="biz-bottom-panel">
              <div className="bbp-header">
                <span className="bbp-title">{categoryLabel}</span>
                <span className="bbp-count">{businesses.length}</span>
              </div>
              <div className="bbp-list">
                {businesses.map((feature, i) => {
                  const p = feature.properties
                  const name = p.displayName?.text || p.name || 'Unknown'
                  const type = p.primaryTypeDisplayName?.text || p.types?.[0]?.replace(/_/g, ' ') || ''
                  const rating = p.rating
                  const isOpen = p.currentOpeningHours?.openNow
                  const addr = p.shortFormattedAddress || ''
                  const price = p.priceLevel ? '·'.repeat(parseInt(p.priceLevel.replace('PRICE_LEVEL_', '') || 0)) : ''
                  return (
                    <div key={p.id || i} className="bbp-card">
                      <div className="bbp-card-name" title={name}>{name}</div>
                      {type && <div className="bbp-card-type">{type}</div>}
                      <div className="bbp-card-meta">
                        {rating != null && (
                          <span className="bbp-rating">★ {rating.toFixed(1)}</span>
                        )}
                        {price && <span className="bbp-price">{price}</span>}
                        {isOpen != null && (
                          <span className={`bbp-status ${isOpen ? 'open' : 'closed'}`}>
                            {isOpen ? 'Open' : 'Closed'}
                          </span>
                        )}
                      </div>
                      {addr && <div className="bbp-card-address" title={addr}>{addr}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

export default UnifiedDataExplorer
