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
  buildRouteHistory,
  buildStravaActivityLayers,
  filterStravaAnomaliesByMonth,
  formatStravaDaypartLabel,
  summarizeStravaDayparts
} from '../../utils/dataLoader'
import { loadExplorerBusinessBoundary, loadExplorerBusinessData } from '../../features/business/data'
import { loadExplorerWalkabilityData } from '../../features/walkability/data'
import { loadExplorerLightingData } from '../../features/lighting/data'
import {
  loadExplorerAirQualityData,
  loadExplorerGreeneryData,
  loadExplorerShadeData,
  loadExplorerTemperatureData
} from '../../features/environment/data'
import { loadExplorerTrafficData } from '../../features/traffic/data'
import './UnifiedDataExplorer.css'

const ExplorerMap = lazy(() => import('./ExplorerMap'))
const BusinessAnalytics = lazy(() => import('./BusinessAnalytics'))
const WalkabilityAnalytics = lazy(() => import('./WalkabilityAnalytics'))
const LightingAnalytics = lazy(() => import('./LightingAnalytics'))
const TemperatureAnalytics = lazy(() => import('./TemperatureAnalytics'))
const GreeneryAnalytics = lazy(() => import('./GreeneryAnalytics'))
const EnvironmentAnalytics = lazy(() => import('./EnvironmentAnalytics'))
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

const DASHBOARD_MODES = [
  { id: 'business', label: 'Business Analytics' },
  { id: 'walkability', label: 'Active Mobility' },
  { id: 'lighting', label: 'Street Lighting' },
  { id: 'temperature', label: 'Surface Temperature' },
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
  { id: 'networkAnalysis', label: 'Network Analysis', dashboard: 'walkability', dataKey: 'network' },
  { id: 'transitAccessibility', label: 'Transit Accessibility', dashboard: 'walkability', dataKey: 'transitData' },
  // Lighting layers
  { id: 'streetLighting', label: 'Street Lighting KPIs', dashboard: 'lighting', dataKey: 'lightingSegments' },
  { id: 'municipalLights', label: 'Municipal Street Lights', dashboard: 'lighting', dataKey: 'streetLights' },
  { id: 'missionInterventions', label: 'Mission Interventions', dashboard: 'lighting', dataKey: 'missionInterventions' },
  // Temperature layers
  { id: 'surfaceTemperature', label: 'Surface Temperature', dashboard: 'temperature', dataKey: 'temperatureSegments' },
  // Environment layers (greenery + air quality)
  { id: 'airQuality',   label: 'Air Quality',  dashboard: 'environment', dataKey: 'airQualityVoronoi' },
  { id: 'urbanHeatConcrete', label: 'Heat Islands & Cool Islands', dashboard: 'environment', dataKey: 'ecologyHeat' },
  { id: 'greeneryIndex', label: 'Greenery Index', dashboard: 'environment', dataKey: 'greenerySegments' },
  { id: 'treeCanopy', label: 'Tree Canopy', dashboard: 'environment', dataKey: 'treeCanopy' },
  { id: 'parksNearby', label: 'Parks Nearby', dashboard: 'environment', dataKey: 'parksNearby' },
  // Traffic layers
  { id: 'trafficFlow', label: 'Traffic Flow', dashboard: 'traffic', dataKey: 'trafficSegments' }
]

const getStoredExplorerState = () => {
  if (typeof window === 'undefined') return {}
  try {
    const dashboardMode = window.localStorage.getItem('explorer:dashboardMode') || null
    const activeCategory = window.localStorage.getItem('explorer:activeCategory') || null
    return { dashboardMode, activeCategory }
  } catch {
    return {}
  }
}

const UnifiedDataExplorer = () => {
  const storedExplorerState = getStoredExplorerState()
  const [dashboardMode, setDashboardMode] = useState(storedExplorerState.dashboardMode || 'business')
  const [map, setMap] = useState(null)
  
  // Business dashboard state
  const [businessMode, setBusinessMode] = useState('liveliness') // 'liveliness', 'opinions', 'ratings', 'amenities', 'categories', 'property'
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay())
  const [hour, setHour] = useState(new Date().getHours())
  const [businessesData, setBusinessesData] = useState(null)
  const [streetStallsData, setStreetStallsData] = useState(null)
  const [propertiesData, setPropertiesData] = useState(null)
  const [surveyData, setSurveyData] = useState(null)
  
  // Events state
  const [eventsData, setEventsData] = useState(null)
  const [eventsMonth, setEventsMonth] = useState(null) // null = all months, 1-12 for specific month
  const [eventsScope, setEventsScope] = useState('cbd')
  const [ccidBoundary, setCcidBoundary] = useState(null)
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
  const [networkData, setNetworkData] = useState(null)
  const [pedestrianData, setPedestrianData] = useState(null)
  const [cyclingData, setCyclingData] = useState(null)
  const [stravaAggregated, setStravaAggregated] = useState(null)
  const [walkabilityMonths, setWalkabilityMonths] = useState([])
  const [selectedWalkabilityMonth, setSelectedWalkabilityMonth] = useState(null)
  const [stravaAnomalies, setStravaAnomalies] = useState(null)
  const [filteredStravaAnomalies, setFilteredStravaAnomalies] = useState(null)
  const [selectedAnomalySegment, setSelectedAnomalySegment] = useState(null)
  const [transitData, setTransitData] = useState(null)
  const [busStopsData, setBusStopsData] = useState(null)
  const [trainStationData, setTrainStationData] = useState(null)
  const [selectedRouteSegment, setSelectedRouteSegment] = useState(null)
  const [compareRouteSegment, setCompareRouteSegment] = useState(null)
  const [selectedRouteHistory, setSelectedRouteHistory] = useState(null)
  const [compareRouteHistory, setCompareRouteHistory] = useState(null)
  const [routePanelMinimized, setRoutePanelMinimized] = useState(false)
  
  // Lighting dashboard state
  const [lightingSegments, setLightingSegments] = useState(null)
  const [streetLights, setStreetLights] = useState(null)
  const [missionInterventions, setMissionInterventions] = useState(null)
  const [lightIntensityRaster, setLightIntensityRaster] = useState(null)
  const [lightingThresholds, setLightingThresholds] = useState(null)
  
  // Temperature dashboard state - using surfaceTemp dataset
  const [temperatureData, setTemperatureData] = useState(null)
  const [selectedSegment, setSelectedSegment] = useState(null)
  
  // Shade dashboard state - keeping for greenery
  const [shadeData, setShadeData] = useState(null)
  const [season, setSeason] = useState('summer')
  const [timeOfDay, setTimeOfDay] = useState('1400')
  
  // New greenery data layers
  const [greeneryAndSkyview, setGreeneryAndSkyview] = useState(null)
  const [treeCanopyData, setTreeCanopyData] = useState(null)
  const [parksData, setParksData] = useState(null)
  const [ecologyHeatByYear, setEcologyHeatByYear] = useState({})
  const [ecologyYear, setEcologyYear] = useState(2026)
  const [ecologyMetric, setEcologyMetric] = useState('urban_heat_score')
  const [selectedEcologyFeatureKeys, setSelectedEcologyFeatureKeys] = useState([])
  const [ecologyPanelMinimized, setEcologyPanelMinimized] = useState(false)
  const ecologyDetailPanelRef = useRef(null)

  // Environment / air quality state (fetched from API)
  const [envCurrentData, setEnvCurrentData] = useState(null)
  const [envHistoryData, setEnvHistoryData] = useState(null)
  const [envIndex, setEnvIndex] = useState('uaqi') // which metric to display on the map
  const [envDate, setEnvDate] = useState(null)     // null = live; 'YYYY-MM-DD' = historical day
  const envLastFetch = useRef(0)
  const [envDetailGrid, setEnvDetailGrid] = useState(null) // grid_id for bottom detail panel
  const [envPanelMinimized, setEnvPanelMinimized] = useState(false)
  const envDetailPanelRef = useRef(null)

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

  // Derive the rows shown on the map — always from history, defaulting to the latest date
  const envDisplayData = useMemo(() => {
    if (!envHistoryData?.rows) return null
    const targetDate = envDate || envHistoryDates[envHistoryDates.length - 1]
    if (!targetDate) return null
    const dayRows = envHistoryData.rows.filter(r => r.hour_utc?.slice(0, 10) === targetDate)
    if (dayRows.length === 0) return null
    // Average all hours of that day per grid cell
    const byGrid = {}
    dayRows.forEach(r => {
      if (!byGrid[r.grid_id]) byGrid[r.grid_id] = {
        grid_id: r.grid_id, latitude: r.latitude, longitude: r.longitude,
        uaqi: [], poll_co_value: [], poll_no2_value: [],
        poll_o3_value: [], poll_pm10_value: [], poll_so2_value: []
      }
      const b = byGrid[r.grid_id]
      if (r.uaqi      != null) b.uaqi.push(+r.uaqi)
      if (r.poll_co   != null) b.poll_co_value.push(+r.poll_co)
      if (r.poll_no2  != null) b.poll_no2_value.push(+r.poll_no2)
      if (r.poll_o3   != null) b.poll_o3_value.push(+r.poll_o3)
      if (r.poll_pm10 != null) b.poll_pm10_value.push(+r.poll_pm10)
      if (r.poll_so2  != null) b.poll_so2_value.push(+r.poll_so2)
    })
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    const rows = Object.values(byGrid).map(b => ({
      grid_id: b.grid_id, latitude: b.latitude, longitude: b.longitude,
      uaqi:           avg(b.uaqi),
      poll_co_value:  avg(b.poll_co_value),
      poll_no2_value: avg(b.poll_no2_value),
      poll_o3_value:  avg(b.poll_o3_value),
      poll_pm10_value: avg(b.poll_pm10_value),
      poll_so2_value: avg(b.poll_so2_value),
    }))
    return { rows, fetchedAt: targetDate }
  }, [envDate, envHistoryData, envHistoryDates])

  const openEnvGridDetail = useCallback((gridId) => {
    if (!gridId) return
    setEnvDetailGrid(gridId)
    setEnvPanelMinimized(false)
  }, [])

  useEffect(() => {
    if (!envDetailGrid || envPanelMinimized) return
    const timer = setTimeout(() => {
      envDetailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 120)
    return () => clearTimeout(timer)
  }, [envDetailGrid, envPanelMinimized])

  const ecologyCurrentData = useMemo(() => ecologyHeatByYear[ecologyYear] || null, [ecologyHeatByYear, ecologyYear])

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

  // Traffic dashboard state
  const [trafficData, setTrafficData] = useState(null)
  const [trafficScenario, setTrafficScenario] = useState('WORK_MORNING')

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(360)
  const sidebarDragRef = useRef(null)

  // Rating filter — null = all, Set of floor values e.g. new Set([4,5])
  const [ratingFilter, setRatingFilter] = useState(null)

  // Export report state
  const [isExporting, setIsExporting] = useState(false)
  const [reportLightMode, setReportLightMode] = useState(false)
  const [drawBboxMode, setDrawBboxMode] = useState(false)

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
    // Lighting layers
    lightingSegments: false,
    streetLights: false,
    missionInterventions: false,
    // Temperature layers
    temperatureSegments: false,
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
  const [activeCategory, setActiveCategory] = useState(storedExplorerState.activeCategory || null)

  useEffect(() => {
    try {
      window.localStorage.setItem('explorer:dashboardMode', dashboardMode)
      if (activeCategory) {
        window.localStorage.setItem('explorer:activeCategory', activeCategory)
      } else {
        window.localStorage.removeItem('explorer:activeCategory')
      }
    } catch {
      // Ignore storage issues and continue with in-memory state.
    }
  }, [dashboardMode, activeCategory])

  useEffect(() => {
    if (dashboardMode !== 'environment' || activeCategory === 'urbanHeatConcrete') return
    setSelectedEcologyFeatureKeys([])
    setEcologyPanelMinimized(false)
  }, [dashboardMode, activeCategory])
  
  // Load business data
  useEffect(() => {
    loadExplorerBusinessBoundary()
      .then(setCcidBoundary)
      .catch((error) => console.error('Error loading CCID boundary:', error))
  }, [])

  useEffect(() => {
    const loadBusinessExplorerState = async () => {
      try {
        const { businesses, streetStalls, properties, survey, eventsData } = await loadExplorerBusinessData()

        console.log('Business data loaded:', {
          businesses: businesses.features?.length,
          stalls: streetStalls.features?.length,
          properties: properties.features?.length,
          survey: survey.features?.length
        })

        console.log('Sample processed property:', properties.features?.[0]?.properties)

        setBusinessesData(businesses)
        setStreetStallsData(streetStalls)
        setPropertiesData(properties)
        setSurveyData(survey)
        setEventsData(eventsData)
      } catch (error) {
        console.error('Error loading business data:', error)
      }
    }
    
    // Load business data when dashboard is business OR when any business layer is locked
    const hasLockedBusinessLayer = ['businessLiveliness', 'vendorOpinions', 'businessRatings', 'amenities', 'businessCategories', 'propertySales', 'cityEvents'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'business' || hasLockedBusinessLayer) {
      loadBusinessExplorerState()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load walkability data
  useEffect(() => {
    const loadWalkabilityExplorerState = async () => {
      try {
        console.log('Loading active mobility files...')

        const {
          network,
          pedestrian,
          cycling,
          stravaAggregated: rawStrava,
          availableMonths,
          anomalies,
          transit,
          busStops,
          trainStation
        } = await loadExplorerWalkabilityData()

        console.log('Active mobility data loaded:', {
          network: network.features?.length,
          pedestrian: pedestrian.features?.length,
          cycling: cycling.features?.length,
          transit: transit.features?.length,
          busStops: busStops.features?.length,
          trainStation: trainStation.features?.length
        })

        console.log('Transformed network data sample coordinate:', network.features?.[0]?.geometry?.coordinates?.[0]?.[0])

        setNetworkData(network)
        setPedestrianData(pedestrian)
        setCyclingData(cycling)
        setStravaAggregated(rawStrava)
        setStravaAnomalies(anomalies)
        setWalkabilityMonths(availableMonths)
        setSelectedWalkabilityMonth(current => current || availableMonths[availableMonths.length - 1]?.key || null)
        setTransitData(transit)
        setBusStopsData(busStops)
        setTrainStationData(trainStation)
      } catch (error) {
        console.error('Error loading walkability data:', error)
      }
    }
    
    // Load walkability data when dashboard is walkability OR when any walkability layer is locked
    const hasLockedWalkabilityLayer = ['activeMobility', 'mobilityAnomalies', 'networkAnalysis', 'transitAccessibility'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'walkability' || hasLockedWalkabilityLayer) {
      loadWalkabilityExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  useEffect(() => {
    if (!stravaAggregated || !selectedWalkabilityMonth) return
    const { pedestrian, cycling } = buildStravaActivityLayers(stravaAggregated, { months: selectedWalkabilityMonth })
    setPedestrianData(pedestrian)
    setCyclingData(cycling)
  }, [stravaAggregated, selectedWalkabilityMonth])

  useEffect(() => {
    if (!stravaAnomalies) return
    setFilteredStravaAnomalies(filterStravaAnomaliesByMonth(stravaAnomalies, selectedWalkabilityMonth))
  }, [stravaAnomalies, selectedWalkabilityMonth])

  useEffect(() => {
    if (!selectedRouteSegment || !stravaAggregated) {
      setSelectedRouteHistory(null)
      return
    }
    setSelectedRouteHistory(buildRouteHistory(stravaAggregated, selectedRouteSegment.edge_uid))
  }, [selectedRouteSegment, stravaAggregated])

  useEffect(() => {
    if (!compareRouteSegment || !stravaAggregated) {
      setCompareRouteHistory(null)
      return
    }
    setCompareRouteHistory(buildRouteHistory(stravaAggregated, compareRouteSegment.edge_uid))
  }, [compareRouteSegment, stravaAggregated])
  
  // Load lighting data
  useEffect(() => {
    const loadLightingExplorerState = async () => {
      try {
        const {
          lightingSegments: segments,
          missionInterventions: projects,
          streetLights,
          lightingThresholds: thresholds
        } = await loadExplorerLightingData()

        setLightingThresholds(thresholds)
        setLightingSegments(segments)
        setMissionInterventions(projects)
        setStreetLights(streetLights)
        console.log('Lighting data loaded:', {
          segments: segments?.features?.length,
          missionInterventions: projects?.features?.length,
          streetLights: streetLights?.features?.length
        })
        // Light intensity raster will be loaded separately in the map component
      } catch (error) {
        console.error('Error loading lighting data:', error)
      }
    }
    
    // Load lighting data when dashboard is lighting OR when any lighting layer is locked
    const hasLockedLightingLayer = ['streetLighting', 'municipalLights', 'missionInterventions'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'lighting' || hasLockedLightingLayer) {
      loadLightingExplorerState()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load temperature data
  useEffect(() => {
    const loadTemperatureExplorerState = async () => {
      try {
        const data = await loadExplorerTemperatureData()
        setTemperatureData(data)
        console.log('Loaded temperature timeseries data:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading temperature data:', error)
      }
    }
    
    // Load temperature data when dashboard is temperature OR when the temperature layer is locked
    const hasLockedTempLayer = lockedLayers.has('surfaceTemperature')
    if (dashboardMode === 'temperature' || hasLockedTempLayer) {
      loadTemperatureExplorerState()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load shade/greenery/environment data
  useEffect(() => {
    const loadShadeExplorerState = async () => {
      try {
        const data = await loadExplorerShadeData(season, timeOfDay)
        setShadeData(data)
        console.log(`Loaded shade data: ${season} ${timeOfDay}`)
      } catch (error) {
        console.error('Error loading shade data:', error)
      }
    }

    const loadGreeneryExplorerState = async () => {
      try {
        const greeneryState = await loadExplorerGreeneryData()
        setGreeneryAndSkyview(greeneryState.greeneryAndSkyview)
        setTreeCanopyData(greeneryState.treeCanopyData)
        setParksData(greeneryState.parksData)
        setEcologyHeatByYear(greeneryState.ecologyHeatByYear)
        console.log('Loaded greenery layers:', {
          greeneryData: greeneryState.greeneryAndSkyview,
          treeCanopyData: greeneryState.treeCanopyData,
          parksData: greeneryState.parksData,
          ecologyYears: Object.keys(greeneryState.ecologyHeatByYear).length
        })
      } catch (error) {
        console.error('Error loading greenery data:', error)
      }
    }

    const loadAirQualityExplorerState = async () => {
      // Throttle: only re-fetch if more than 3 minutes have passed
      const now = Date.now()
      if (now - envLastFetch.current < 3 * 60 * 1000 && envCurrentData) return
      try {
        const { currentData, historyData } = await loadExplorerAirQualityData()
        if (currentData) setEnvCurrentData(currentData)
        if (historyData) setEnvHistoryData(historyData)
        envLastFetch.current = Date.now()
        console.log('Loaded environment data from DB')
      } catch (error) {
        console.error('Error loading environment data:', error)
      }
    }
    
    const hasLockedEnvLayer = ['greeneryIndex', 'treeCanopy', 'parksNearby', 'airQuality', 'urbanHeatConcrete'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'environment' || hasLockedEnvLayer) {
      loadShadeExplorerState()
      loadGreeneryExplorerState()
      loadAirQualityExplorerState()
    }
  }, [dashboardMode, season, timeOfDay, lockedLayers])

  // Load traffic data
  useEffect(() => {
    const loadTrafficExplorerState = async () => {
      try {
        const data = await loadExplorerTrafficData()
        setTrafficData(data)
        console.log('Traffic data loaded:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading traffic data:', error)
      }
    }

    const hasLockedTrafficLayer = lockedLayers.has('trafficFlow')
    if (dashboardMode === 'traffic' || hasLockedTrafficLayer) {
      loadTrafficExplorerState()
    }
  }, [dashboardMode, lockedLayers])
  
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
        networkAnalysis: 'network',
        transitAccessibility: 'transit'
      }
      if (modeMap[categoryId]) {
        setWalkabilityMode(modeMap[categoryId])
      }
    } else if (category.dashboard === 'environment') {
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
  }, [map, layerStack, businessesData, streetStallsData, propertiesData, filteredEventsData, pedestrianData, cyclingData, networkData, transitData, lightingSegments, streetLights, missionInterventions, temperatureData, greeneryAndSkyview, treeCanopyData, parksData, trafficData, dashboardMode, reportLightMode])

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
        {['environment'].includes(dashboardMode) && (() => {
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
        <aside className="explorer-sidebar" style={{ width: sidebarWidth }}>
          <div className="sidebar-resize-handle" onMouseDown={startSidebarDrag} />
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
          
            {dashboardMode === 'temperature' && (
              <TemperatureAnalytics
                temperatureData={temperatureData}
                hideLayerControls={true}
              />
            )}
          
            {dashboardMode === 'environment' && (
              <>
                {activeCategory === 'urbanHeatConcrete' ? (
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
                  />
                ) : (
                  <>
                    <EnvironmentAnalytics
                      currentData={envDisplayData}
                      historyData={envHistoryData}
                      envIndex={envIndex}
                      onEnvIndexChange={setEnvIndex}
                      envDate={envDate}
                      onEnvDateChange={setEnvDate}
                    />
                    <GreeneryAnalytics
                      shadeData={shadeData}
                      greeneryAndSkyview={greeneryAndSkyview}
                      treeCanopyData={treeCanopyData}
                      parksData={parksData}
                      hideLayerControls={true}
                      allLayersActive={LAYER_CATEGORIES.filter(c => c.dashboard === 'environment').every(c => layerStack.some(l => l.id === c.id))}
                    />
                  </>
                )}
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
              lightingSegments={lightingSegments}
              streetLights={streetLights}
              missionInterventions={missionInterventions}
              lightingThresholds={lightingThresholds}
              temperatureData={temperatureData}
              shadeData={shadeData}
              season={season}
              greeneryAndSkyview={greeneryAndSkyview}
              treeCanopyData={treeCanopyData}
              parksData={parksData}
              ecologyHeatData={ecologyCurrentData}
              ecologyMetric={ecologyMetric}
              selectedEcologyFeatureKeys={selectedEcologyFeatureKeys}
              envCurrentData={envDisplayData}
              envHistoryData={envHistoryData}
              envIndex={envIndex}
              onEnvGridDetail={openEnvGridDetail}
              onEcologyFeatureSelect={openEcologyFeatureDetail}
              visibleLayers={visibleLayers}
              layerStack={layerStack}
              activeCategory={activeCategory}
              onMapLoad={setMap}
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
              style={{ right: `${sidebarWidth + 32}px` }}
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
              style={{ right: `${sidebarWidth + 32}px` }}
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
          {dashboardMode === 'temperature' && selectedSegment && (
            <div className="bottom-panel">
              <div className="panel-header">
                <h3>{selectedSegment.street_name || 'Street Segment'} - Temperature Across Seasons</h3>
                <button onClick={() => setSelectedSegment(null)} className="close-btn">✕</button>
              </div>
              <div className="charts-container">
                <div id="seasonal-charts-container">
                  {(() => {
                    return ['summer', 'autumn', 'winter', 'spring'].map(seasonKey => {
                      let seasonData = selectedSegment[`${seasonKey}_temperatures`]
                      
                      // Parse JSON string if needed
                      if (typeof seasonData === 'string') {
                        try {
                          seasonData = JSON.parse(seasonData)
                        } catch (e) {
                          console.error(`Failed to parse ${seasonKey} data:`, e)
                          return null
                        }
                      }
                      
                      if (!seasonData || !Array.isArray(seasonData) || seasonData.length === 0) {
                        return null
                      }
                      
                      const chartData = seasonData
                        .filter(r => r && r.temperature_mean !== null)
                        .map(reading => ({
                          date: reading.date,
                          temperature: reading.temperature_mean,
                          displayDate: new Date(reading.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }))
                      
                      const seasonColors = {
                        summer: '#ef4444',
                        autumn: '#f59e0b',
                        winter: '#3b82f6',
                        spring: '#10b981'
                      }
                      
                      return (
                        <div key={seasonKey} style={{ display: 'flex', flexDirection: 'column' }}>
                          <h4 style={{ 
                            color: seasonColors[seasonKey], 
                            textTransform: 'capitalize', 
                            margin: '0 0 0.5rem 0',
                            fontSize: '0.875rem',
                            fontWeight: 600
                          }}>
                            {seasonKey} ({chartData.length} readings)
                          </h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#2a3f2d" />
                              <XAxis 
                                dataKey="displayDate" 
                                stroke="#a5d6a7" 
                                tick={{ fontSize: 9 }}
                                interval="preserveStartEnd"
                              />
                              <YAxis 
                                stroke="#a5d6a7" 
                                tick={{ fontSize: 10 }}
                                domain={['dataMin - 2', 'dataMax + 2']}
                              tickFormatter={(value) => `${value.toFixed(0)}°C`}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#1a1f1d', 
                                  border: '1px solid #2a3f2d',
                                  borderRadius: '4px',
                                  fontSize: '11px'
                                }}
                                labelStyle={{ color: '#e8f5e9' }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="temperature" 
                                stroke={seasonColors[seasonKey]} 
                                dot={{ r: 2 }}
                                strokeWidth={2}
                                connectNulls
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ── Environment detail bottom panel ── */}
          {dashboardMode === 'environment' && envDetailGrid && (() => {
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
                style={{ marginRight: sidebarWidth + 32 }}
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

          {dashboardMode === 'environment' && activeCategory === 'urbanHeatConcrete' && selectedEcologyFeature && (
            <Suspense fallback={<div className="app-panel-loading">Loading ecology detail...</div>}>
              <EcologyHeatDetailPanel
                featureSeries={selectedEcologyFeatureSeries}
                currentFeature={selectedEcologyFeature}
                compareFeature={compareEcologyFeature}
                compareSeries={compareEcologyFeatureSeries}
                currentYearData={ecologyCurrentData}
                selectedYear={ecologyYear}
                sidebarWidth={sidebarWidth}
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
            style={{ right: `${sidebarWidth + 32}px`, height: eventsPanelMinimized ? 92 : `${eventsPanelHeight}px` }}
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
