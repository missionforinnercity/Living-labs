import React, { useState, useEffect, useRef, useCallback } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import proj4 from 'proj4'
import ExplorerMap from './ExplorerMap'
import BusinessAnalytics from './BusinessAnalytics'
import WalkabilityAnalytics from './WalkabilityAnalytics'
import LightingAnalytics from './LightingAnalytics'
import TemperatureAnalytics from './TemperatureAnalytics'
import GreeneryAnalytics from './GreeneryAnalytics'
import EnvironmentAnalytics from './EnvironmentAnalytics'
import TrafficAnalytics, { TRAFFIC_SCENARIOS } from './TrafficAnalytics'
import { generateReport } from '../../utils/reportGenerator'
import './UnifiedDataExplorer.css'

// Define coordinate reference systems
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

// Function to transform GeoJSON coordinates between CRS
const transformGeoJSON = (geojson, sourceCRS, targetCRS) => {
  if (!geojson || !geojson.features) return geojson
  
  const transform = proj4(sourceCRS, targetCRS)
  
  const transformCoordinates = (coords, depth) => {
    if (depth === 0) {
      // [x, y] coordinate pair
      return transform.forward(coords)
    }
    // Recursively transform nested coordinate arrays
    return coords.map(c => transformCoordinates(c, depth - 1))
  }
  
  const transformedFeatures = geojson.features.map(feature => {
    if (!feature.geometry || !feature.geometry.coordinates) {
      return feature
    }
    
    let depth
    switch (feature.geometry.type) {
      case 'Point':
        depth = 0
        break
      case 'LineString':
      case 'MultiPoint':
        depth = 1
        break
      case 'Polygon':
      case 'MultiLineString':
        depth = 2
        break
      case 'MultiPolygon':
        depth = 3
        break
      default:
        return feature
    }
    
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: transformCoordinates(feature.geometry.coordinates, depth)
      }
    }
  })
  
  return {
    ...geojson,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
    },
    features: transformedFeatures
  }
}

const DASHBOARD_MODES = [
  { id: 'business', label: 'Business Analytics' },
  { id: 'walkability', label: 'Walkability & Cycling' },
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
  { id: 'pedestrianRoutes', label: 'Pedestrian Routes', dashboard: 'walkability', dataKey: 'pedestrianActivity' },
  { id: 'cyclingRoutes', label: 'Cycling Routes', dashboard: 'walkability', dataKey: 'cyclingActivity' },
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
  { id: 'greeneryIndex', label: 'Greenery Index', dashboard: 'environment', dataKey: 'greenerySegments' },
  { id: 'treeCanopy', label: 'Tree Canopy', dashboard: 'environment', dataKey: 'treeCanopy' },
  { id: 'parksNearby', label: 'Parks Nearby', dashboard: 'environment', dataKey: 'parksNearby' },
  // Traffic layers
  { id: 'trafficFlow', label: 'Traffic Flow', dashboard: 'traffic', dataKey: 'trafficSegments' }
]

const UnifiedDataExplorer = () => {
  const [dashboardMode, setDashboardMode] = useState('business')
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
  const [walkabilityMode, setWalkabilityMode] = useState('pedestrian') // 'pedestrian', 'cycling', 'network', 'transit'
  const [networkMetric, setNetworkMetric] = useState('betweenness_800') // betweenness metric to display
  const [transitView, setTransitView] = useState('combined') // 'combined', 'bus', 'train'
  const [networkData, setNetworkData] = useState(null)
  const [pedestrianData, setPedestrianData] = useState(null)
  const [cyclingData, setCyclingData] = useState(null)
  const [transitData, setTransitData] = useState(null)
  const [busStopsData, setBusStopsData] = useState(null)
  const [trainStationData, setTrainStationData] = useState(null)
  const [selectedRouteSegment, setSelectedRouteSegment] = useState(null)
  
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

  // Environment / air quality state (fetched from API)
  const [envCurrentData, setEnvCurrentData] = useState(null)
  const [envHistoryData, setEnvHistoryData] = useState(null)
  const [envIndex, setEnvIndex] = useState('uaqi') // which metric to display on the map
  const envLastFetch = useRef(0)
  const [envDetailGrid, setEnvDetailGrid] = useState(null) // grid_id for bottom detail panel
  const [envPanelMinimized, setEnvPanelMinimized] = useState(false)

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
  const [activeCategory, setActiveCategory] = useState(null)
  
  // Load business data
  useEffect(() => {
    const loadBusinessData = async () => {
      try {
        const [businesses, stalls, properties, survey, events] = await Promise.all([
          fetch('/data/business/POI_enriched_20260120_185944.geojson').then(r => r.json()),
          fetch('/data/business/streetStalls.geojson').then(r => r.json()),
          fetch('/data/business/properties_consolidated.geojson').then(r => r.json()),
          fetch('/data/business/survey_data.geojson').then(r => r.json()),
          fetch('/data/business/events.geojson').then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] }))
        ])
        
        // Process properties data to calculate transfer_count and total_value
        const processedProperties = {
          ...properties,
          features: properties.features.map(feature => {
            const transactions = feature.properties.properties || []
            
            // Count transactions with valid sale prices
            const transfer_count = transactions.filter(t => {
              const price = t.sale_price
              return price && price !== 'DONATION' && price !== 'CRST' && price.startsWith('R')
            }).length
            
            // Calculate total value by parsing sale_price strings like "R 1 000 000"
            const total_value = transactions.reduce((sum, t) => {
              const price = t.sale_price
              if (price && price !== 'DONATION' && price !== 'CRST' && price.startsWith('R')) {
                // Remove "R " and all spaces, then parse to number
                const numericValue = parseFloat(price.replace('R ', '').replace(/\s/g, ''))
                return sum + (isNaN(numericValue) ? 0 : numericValue)
              }
              return sum
            }, 0)
            
            return {
              ...feature,
              properties: {
                ...feature.properties,
                transfer_count,
                total_value
              }
            }
          })
        }
        
        console.log('Business data loaded:', {
          businesses: businesses.features?.length,
          stalls: stalls.features?.length,
          properties: properties.features?.length,
          survey: survey.features?.length
        })
        
        console.log('Sample processed property:', processedProperties.features[0]?.properties)
        
        setBusinessesData(businesses)
        setStreetStallsData(stalls)
        setPropertiesData(processedProperties)
        setSurveyData(survey)
        setEventsData(events)
      } catch (error) {
        console.error('Error loading business data:', error)
      }
    }
    
    // Load business data when dashboard is business OR when any business layer is locked
    const hasLockedBusinessLayer = ['businessLiveliness', 'vendorOpinions', 'businessRatings', 'amenities', 'businessCategories', 'propertySales', 'cityEvents'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'business' || hasLockedBusinessLayer) {
      loadBusinessData()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load walkability data
  useEffect(() => {
    const loadWalkabilityData = async () => {
      try {
        // Load network data and other walkability datasets
        console.log('Loading walkability files...')
        
        const [network, pedestrian, cycling, transit, busStops, trainStation] = await Promise.all([
          fetch('/data/processed/walkability/network_connectivity.geojson').then(async r => {
            if (!r.ok) throw new Error(`Network file failed: ${r.status} ${r.statusText}`)
            return r.json()
          }),
          fetch('/data/processed/walkability/pedestrian_month_all.geojson').then(async r => {
            if (!r.ok) throw new Error(`Pedestrian file failed: ${r.status} ${r.statusText}`)
            return r.json()
          }),
          fetch('/data/processed/walkability/cycling_month_all.geojson').then(async r => {
            if (!r.ok) throw new Error(`Cycling file failed: ${r.status} ${r.statusText}`)
            return r.json()
          }),
          fetch('/data/walkabilty/roads_with_walking_times.geojson').then(async r => {
            if (!r.ok) throw new Error(`Transit walking times file failed: ${r.status} ${r.statusText}`)
            return r.json()
          }),
          fetch('/data/walkabilty/bus stops.geojson').then(async r => {
            if (!r.ok) throw new Error(`Bus stops file failed: ${r.status} ${r.statusText}`)
            return r.json()
          }),
          fetch('/data/walkabilty/trainStation.geojson').then(async r => {
            if (!r.ok) throw new Error(`Train station file failed: ${r.status} ${r.statusText}`)
            return r.json()
          })
        ])

        // Calculate percentiles for pedestrian data
        if (pedestrian.features) {
          const tripCounts = pedestrian.features.map(f => f.properties.total_trip_count || 0)
          const sortedCounts = [...tripCounts].sort((a, b) => a - b)
          const minCount = sortedCounts[0]
          const maxCount = sortedCounts[sortedCounts.length - 1]

          pedestrian.features = pedestrian.features.map(feature => {
            const percentile = (maxCount === minCount)
              ? 50
              : ((feature.properties.total_trip_count - minCount) / (maxCount - minCount)) * 100
            return {
              ...feature,
              properties: {
                ...feature.properties,
                trip_percentile: percentile
              }
            }
          })
        }

        // Calculate percentiles for cycling data
        if (cycling.features) {
          const tripCounts = cycling.features.map(f => f.properties.total_trip_count || 0)
          const sortedCounts = [...tripCounts].sort((a, b) => a - b)
          const minCount = sortedCounts[0]
          const maxCount = sortedCounts[sortedCounts.length - 1]

          cycling.features = cycling.features.map(feature => {
            const percentile = (maxCount === minCount)
              ? 50
              : ((feature.properties.total_trip_count - minCount) / (maxCount - minCount)) * 100
            return {
              ...feature,
              properties: {
                ...feature.properties,
                trip_percentile: percentile
              }
            }
          })
        }

        console.log('Walkability data loaded:', {
          network: network.features?.length,
          pedestrian: pedestrian.features?.length,
          cycling: cycling.features?.length,
          transit: transit.features?.length,
          busStops: busStops.features?.length,
          trainStation: trainStation.features?.length
        })

        // Transform ONLY network data from EPSG:3857 to EPSG:4326
        // Pedestrian, cycling, and transit data are already in EPSG:4326
        const transformedNetwork = transformGeoJSON(network, 'EPSG:3857', 'EPSG:4326')

        console.log('Transformed network data sample coordinate:', transformedNetwork.features?.[0]?.geometry?.coordinates?.[0]?.[0])

        setNetworkData(transformedNetwork)
        setPedestrianData(pedestrian)
        setCyclingData(cycling)
        setTransitData(transit)
        setBusStopsData(busStops)
        setTrainStationData(trainStation)
      } catch (error) {
        console.error('Error loading walkability data:', error)
      }
    }
    
    // Load walkability data when dashboard is walkability OR when any walkability layer is locked
    const hasLockedWalkabilityLayer = ['pedestrianRoutes', 'cyclingRoutes', 'networkAnalysis', 'transitAccessibility'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'walkability' || hasLockedWalkabilityLayer) {
      loadWalkabilityData()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load lighting data
  useEffect(() => {
    const loadLightingData = async () => {
      try {
        const [segments, projects, streetLights] = await Promise.all([
          fetch('/data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson').then(r => r.json()),
          fetch('/data/lighting/streetLighting.json').then(r => r.json()),
          fetch('/data/lighting/new_Lights/Street_lights.geojson').then(r => r.json())
        ])
        
        // Calculate percentile thresholds for map styling
        if (segments?.features) {
          const validSegments = segments.features.filter(f => 
            f.properties.mean_lux !== null && 
            f.properties.mean_lux !== undefined &&
            f.properties.mean_lux > 0
          )
          
          if (validSegments.length > 0) {
            const luxValues = validSegments.map(f => f.properties.mean_lux).sort((a, b) => a - b)
            const percentile20Index = Math.floor(luxValues.length * 0.20)
            const percentile80Index = Math.floor(luxValues.length * 0.80)
            
            setLightingThresholds({
              bottom20: luxValues[percentile20Index],
              top20: luxValues[percentile80Index]
            })
          }
        }
        
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
      loadLightingData()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load temperature data
  useEffect(() => {
    const loadTemperatureData = async () => {
      try {
        const response = await fetch('/data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson')
        const data = await response.json()
        
        // Pre-process data to calculate overall max temperature for relative heat analysis
        if (data.features) {
          const allMaxTemps = []
          
          // First pass: calculate overall_max_temp for each segment
          data.features = data.features.map(feature => {
            const props = feature.properties
            const processedProps = { ...props }
            
            // Collect ALL temperature readings from ALL seasons
            const seasons = ['summer', 'autumn', 'winter', 'spring']
            const allReadings = []
            
            seasons.forEach(season => {
              const seasonData = props[`${season}_temperatures`]
              if (seasonData && Array.isArray(seasonData)) {
                seasonData.forEach(reading => {
                  if (reading && reading.temperature_mean !== null) {
                    allReadings.push(reading.temperature_mean)
                  }
                })
              }
            })
            
            // Calculate overall max temperature across all seasons
            if (allReadings.length > 0) {
              processedProps.overall_max_temp = Math.max(...allReadings)
              processedProps.overall_min_temp = Math.min(...allReadings)
              processedProps.overall_avg_temp = allReadings.reduce((sum, t) => sum + t, 0) / allReadings.length
              allMaxTemps.push(processedProps.overall_max_temp)
            }
            
            return {
              ...feature,
              properties: processedProps
            }
          })
          
          // Second pass: calculate percentile/quintile for each segment
          if (allMaxTemps.length > 0) {
            const sortedTemps = [...allMaxTemps].sort((a, b) => a - b)
            const minTemp = sortedTemps[0]
            const maxTemp = sortedTemps[sortedTemps.length - 1]
            
            data.features = data.features.map(feature => {
              if (feature.properties.overall_max_temp !== undefined) {
                // Calculate percentile (0-100)
                const percentile = ((feature.properties.overall_max_temp - minTemp) / (maxTemp - minTemp)) * 100
                feature.properties.temp_percentile = percentile
              }
              return feature
            })
          }
        }
        
        setTemperatureData(data)
        console.log('Loaded temperature timeseries data:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading temperature data:', error)
      }
    }
    
    // Load temperature data when dashboard is temperature OR when the temperature layer is locked
    const hasLockedTempLayer = lockedLayers.has('surfaceTemperature')
    if (dashboardMode === 'temperature' || hasLockedTempLayer) {
      loadTemperatureData()
    }
  }, [dashboardMode, lockedLayers])
  
  // Load shade/greenery/environment data
  useEffect(() => {
    const loadShadeData = async () => {
      try {
        const seasonDates = {
          summer: '2024-12-21',
          autumn: '2025-03-20',
          winter: '2025-06-21',
          spring: '2025-09-22'
        }
        const date = seasonDates[season] || '2024-12-21'
        const response = await fetch(`/data/processed/shade/${season}/${date}_${timeOfDay}.geojson`)
        const data = await response.json()
        setShadeData(data)
        console.log(`Loaded shade data: ${season} ${date} ${timeOfDay}`)
      } catch (error) {
        console.error('Error loading shade data:', error)
      }
    }
    
    const loadGreeneryData = async () => {
      try {
        const [greeneryResp, treeCanopyResp, parksResp] = await Promise.all([
          fetch('/data/greenery/greenryandSkyview.geojson'),
          fetch('/data/greenery/tree_canopy.geojson'),
          fetch('/data/greenery/parks_nearby.geojson')
        ])
        const [greeneryData, treeCanopyData, parksData] = await Promise.all([
          greeneryResp.json(),
          treeCanopyResp.json(),
          parksResp.json()
        ])
        const transformedTreeCanopy = transformGeoJSON(treeCanopyData, 'EPSG:3857', 'EPSG:4326')
        setGreeneryAndSkyview(greeneryData)
        setTreeCanopyData(transformedTreeCanopy)
        setParksData(parksData)
        console.log('Loaded greenery layers:', { greeneryData, treeCanopyData: transformedTreeCanopy, parksData })
      } catch (error) {
        console.error('Error loading greenery data:', error)
      }
    }

    const loadEnvData = async () => {
      // Throttle: only re-fetch if more than 3 minutes have passed
      const now = Date.now()
      if (now - envLastFetch.current < 3 * 60 * 1000 && envCurrentData) return
      try {
        const [currentResp, historyResp] = await Promise.all([
          fetch('/api/environment/current'),
          fetch('/api/environment/history')
        ])
        if (currentResp.ok) {
          const data = await currentResp.json()
          setEnvCurrentData(data)
        }
        if (historyResp.ok) {
          const data = await historyResp.json()
          setEnvHistoryData(data)
        }
        envLastFetch.current = Date.now()
        console.log('Loaded environment data from DB')
      } catch (error) {
        console.error('Error loading environment data:', error)
      }
    }
    
    const hasLockedEnvLayer = ['greeneryIndex', 'treeCanopy', 'parksNearby', 'airQuality'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'environment' || hasLockedEnvLayer) {
      loadShadeData()
      loadGreeneryData()
      loadEnvData()
    }
  }, [dashboardMode, season, timeOfDay, lockedLayers])

  // Load traffic data
  useEffect(() => {
    const loadTrafficData = async () => {
      try {
        const response = await fetch('/data/Traffic/traffic_analysis.geojson')
        const data = await response.json()
        setTrafficData(data)
        console.log('Traffic data loaded:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading traffic data:', error)
      }
    }

    const hasLockedTrafficLayer = lockedLayers.has('trafficFlow')
    if (dashboardMode === 'traffic' || hasLockedTrafficLayer) {
      loadTrafficData()
    }
  }, [dashboardMode, lockedLayers])
  
  // Listen for clear segment selection event
  useEffect(() => {
    const handleClearSelection = () => {
      setSelectedRouteSegment(null)
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
        pedestrianRoutes: 'pedestrian',
        cyclingRoutes: 'cycling',
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
    return LAYER_CATEGORIES.filter(c => c.dashboard === dashboardMode)
  }

  // Get businesses matching the current category/filters for bottom panel
  const getActiveBusinesses = () => {
    if (dashboardMode !== 'business' || !activeCategory) return []

    let features = []
    if (activeCategory === 'cityEvents') {
      features = eventsData?.features || []
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
      await generateReport(map, layerStack, {
        businessesData,
        streetStallsData,
        propertiesData,
        eventsData,
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
  }, [map, layerStack, businessesData, streetStallsData, propertiesData, eventsData, pedestrianData, cyclingData, networkData, transitData, lightingSegments, streetLights, missionInterventions, temperatureData, greeneryAndSkyview, treeCanopyData, parksData, trafficData, dashboardMode, reportLightMode])

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
              eventsData={eventsData}
              eventsMonth={eventsMonth}
              onEventsMonthChange={setEventsMonth}
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
                  pedestrian: 'pedestrianRoutes',
                  cycling: 'cyclingRoutes',
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
              pedestrianData={pedestrianData}
              cyclingData={cyclingData}
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
              <EnvironmentAnalytics
                currentData={envCurrentData}
                historyData={envHistoryData}
                envIndex={envIndex}
                onEnvIndexChange={setEnvIndex}
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
          <ExplorerMap
            dashboardMode={dashboardMode}
            businessMode={businessMode}
            walkabilityMode={walkabilityMode}
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
            envCurrentData={envCurrentData}
            envHistoryData={envHistoryData}
            envIndex={envIndex}
            onEnvGridDetail={setEnvDetailGrid}
            visibleLayers={visibleLayers}
            layerStack={layerStack}
            activeCategory={activeCategory}
            onMapLoad={setMap}
            drawBboxMode={drawBboxMode}
            onBboxDrawn={handleBboxDrawn}
            opinionSource={opinionSource}
            amenitiesFilters={amenitiesFilters}
            categoriesFilters={categoriesFilters}
            eventsData={eventsData}
            eventsMonth={eventsMonth}
            trafficData={trafficData}
            trafficScenario={trafficScenario}
            ratingFilter={ratingFilter ? Array.from(ratingFilter) : null}
            selectedSegment={selectedSegment}
            onSegmentSelect={setSelectedSegment}
            onRouteSegmentClick={(segment, mode) => {
              setSelectedRouteSegment(segment)
              if (mode !== walkabilityMode) {
                setWalkabilityMode(mode)
              }
            }}
          />
          
          {/* Listen for clear segment selection event */}
          {React.useEffect(() => {
            const handleClear = () => setSelectedRouteSegment(null)
            window.addEventListener('clearSegmentSelection', handleClear)
            return () => window.removeEventListener('clearSegmentSelection', handleClear)
          }, [])}
          
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
            const gridRow = envCurrentData?.rows?.find(r => r.grid_id === envDetailGrid)
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

            // Sort history by time
            const sorted = [...histRows].sort((a, b) => new Date(a.hour_utc) - new Date(b.hour_utc))

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
                  displayDay: new Date(day + 'T12:00:00Z').toLocaleDateString('en-ZA', { weekday: 'short', month: 'short', day: 'numeric' }),
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
            const band = uaqiBand(gridRow.uaqi ?? 0)

            // Peak day
            const peakDay = dailyData.reduce((best, d) => (!best || (d.uaqi_max || 0) > (best.uaqi_max || 0)) ? d : best, null)

            return (
              <div className={`bottom-panel env-bottom-panel ${envPanelMinimized ? 'env-minimized' : ''}`} style={{ marginRight: sidebarWidth + 32 }}>
                <div className="panel-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: band.color }}>{gridRow.uaqi}</span>
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
                  {/* Left: Daily UAQI chart */}
                  <div style={{ flex: '1 1 340px', minWidth: 280 }}>
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
                  </div>

                  {/* Right: Pollutant cards with descriptions + daily bars */}
                  <div style={{ flex: '1 1 420px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Pollutant Breakdown</span>
                    {POLLUTANT_KEYS.map(pk => {
                      const meta = POLL_DESC[pk]
                      const currentVal = parseFloat(gridRow[pk + '_value'])
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
        </main>

        {/* Business bottom panel */}
        {(() => {
          const businesses = getActiveBusinesses()
          if (businesses.length === 0) return null
          const categoryLabel = getCurrentDashboardCategories().find(c => c.id === activeCategory)?.label || 'Businesses'
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
