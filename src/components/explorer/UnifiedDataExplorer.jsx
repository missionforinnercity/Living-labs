import React, { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import proj4 from 'proj4'
import ExplorerMap from './ExplorerMap'
import BusinessAnalytics from './BusinessAnalytics'
import WalkabilityAnalytics from './WalkabilityAnalytics'
import LightingAnalytics from './LightingAnalytics'
import TemperatureAnalytics from './TemperatureAnalytics'
import GreeneryAnalytics from './GreeneryAnalytics'
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
  { id: 'greenery', label: 'Greenery' }
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
  // Walkability layers
  { id: 'pedestrianRoutes', label: 'Pedestrian Routes', dashboard: 'walkability', dataKey: 'pedestrianActivity' },
  { id: 'cyclingRoutes', label: 'Cycling Routes', dashboard: 'walkability', dataKey: 'cyclingActivity' },
  { id: 'networkAnalysis', label: 'Network Analysis', dashboard: 'walkability', dataKey: 'network' },
  { id: 'transitAccessibility', label: 'Transit Accessibility', dashboard: 'walkability', dataKey: 'transitData' },
  // Lighting layers
  { id: 'streetLighting', label: 'Street Lighting', dashboard: 'lighting', dataKey: 'lightingSegments' },
  { id: 'lightingProjects', label: 'Municipal Street Lights', dashboard: 'lighting', dataKey: 'lightingProjects' },
  // Temperature layers
  { id: 'surfaceTemperature', label: 'Surface Temperature', dashboard: 'temperature', dataKey: 'temperatureSegments' },
  // Greenery layers
  { id: 'greeneryIndex', label: 'Greenery Index', dashboard: 'greenery', dataKey: 'greenerySegments' },
  { id: 'treeCanopy', label: 'Tree Canopy', dashboard: 'greenery', dataKey: 'treeCanopy' },
  { id: 'parksNearby', label: 'Parks Nearby', dashboard: 'greenery', dataKey: 'parksNearby' }
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
  const [lightingProjects, setLightingProjects] = useState(null)
  const [lightIntensityRaster, setLightIntensityRaster] = useState(null)
  
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
  
  // Layer visibility
  const [visibleLayers, setVisibleLayers] = useState({
    // Business layers
    businesses: false,
    streetStalls: false,
    properties: false,
    // Walkability layers
    network: false,
    pedestrianActivity: false,
    cyclingActivity: false,
    // Lighting layers
    lightingSegments: false,
    lightingProjects: false,
    lightIntensity: false,
    // Temperature layers
    temperatureSegments: false,
    // Greenery layers
    greenerySegments: false,
    treeCanopy: false,
    parksNearby: false
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
        const [businesses, stalls, properties, survey] = await Promise.all([
          fetch('/data/business/POI_enriched_20260120_185944.geojson').then(r => r.json()),
          fetch('/data/business/streetStalls.geojson').then(r => r.json()),
          fetch('/data/business/properties_consolidated.geojson').then(r => r.json()),
          fetch('/data/business/survey_data.geojson').then(r => r.json())
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
      } catch (error) {
        console.error('Error loading business data:', error)
      }
    }
    
    // Load business data when dashboard is business OR when any business layer is locked
    const hasLockedBusinessLayer = ['businessLiveliness', 'vendorOpinions', 'businessRatings', 'amenities', 'businessCategories', 'propertySales'].some(id => lockedLayers.has(id))
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
        const [segments, projects] = await Promise.all([
          fetch('/data/lighting/road_segments_lighting_kpis.geojson').then(r => r.json()),
          fetch('/data/lighting/lighting.geojson').then(r => r.json())
        ])
        
        setLightingSegments(segments)
        setLightingProjects(projects)
        // Light intensity raster will be loaded separately in the map component
      } catch (error) {
        console.error('Error loading lighting data:', error)
      }
    }
    
    // Load lighting data when dashboard is lighting OR when any lighting layer is locked
    const hasLockedLightingLayer = ['streetLighting', 'lightingProjects'].some(id => lockedLayers.has(id))
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
  
  // Load shade/greenery data
  useEffect(() => {
    const loadShadeData = async () => {
      try {
        // Map season to the correct date in the file path
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
        
        // Transform tree canopy from EPSG:3857 to EPSG:4326 if needed
        const transformedTreeCanopy = transformGeoJSON(treeCanopyData, 'EPSG:3857', 'EPSG:4326')
        
        setGreeneryAndSkyview(greeneryData)
        setTreeCanopyData(transformedTreeCanopy)
        setParksData(parksData)
        console.log('Loaded greenery layers:', { greeneryData, treeCanopyData: transformedTreeCanopy, parksData })
      } catch (error) {
        console.error('Error loading greenery data:', error)
      }
    }
    
    // Load greenery data when dashboard is greenery OR when any greenery layer is locked
    const hasLockedGreeneryLayer = ['greeneryIndex', 'treeCanopy', 'parksNearby'].some(id => lockedLayers.has(id))
    if (dashboardMode === 'greenery' || hasLockedGreeneryLayer) {
      loadShadeData()
      loadGreeneryData()
    }
  }, [dashboardMode, season, timeOfDay, lockedLayers])
  
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
        propertySales: 'property'
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
      </div>
      
      <div className="explorer-content">
        <aside className="explorer-sidebar">
          {/* Category Selector - Always visible */}
          <div className="category-selector">
            <h3>Data Layers</h3>
            {getCurrentDashboardCategories().map(category => (
              <button
                key={category.id}
                className={`category-btn ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => selectCategory(category.id)}
              >
                <span className="category-dot"></span>
                <span className="category-icon">{category.icon}</span>
                <span className="category-label">{category.label}</span>
              </button>
            ))}
          </div>
          
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
                  property: 'propertySales'
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
              hideLayerControls={true}
            />
          )}
          
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
              projectsData={lightingProjects}
              hideLayerControls={true}
            />
          )}
          
          {dashboardMode === 'temperature' && (
            <TemperatureAnalytics
              temperatureData={temperatureData}
              hideLayerControls={true}
            />
          )}
          
          {dashboardMode === 'greenery' && (
            <GreeneryAnalytics
              shadeData={shadeData}
              greeneryAndSkyview={greeneryAndSkyview}
              treeCanopyData={treeCanopyData}
              parksData={parksData}
              hideLayerControls={true}
            />
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
            lightingProjects={lightingProjects}
            temperatureData={temperatureData}
            shadeData={shadeData}
            season={season}
            greeneryAndSkyview={greeneryAndSkyview}
            treeCanopyData={treeCanopyData}
            parksData={parksData}
            visibleLayers={visibleLayers}
            layerStack={layerStack}
            activeCategory={activeCategory}
            onMapLoad={setMap}
            opinionSource={opinionSource}
            amenitiesFilters={amenitiesFilters}
            categoriesFilters={categoriesFilters}
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
        </main>
        
        {/* Persistent Layer Stack UI */}
        {layerStack.length > 0 && (
          <div className="persistent-layer-stack">
            <h4>📍 Map Layers</h4>
            <p className="stack-hint">Top layers render above · Drag to reorder</p>
            <div className="layer-stack-items">
              {layerStack.map((layer, index) => (
                <div 
                  key={layer.id} 
                  className={`layer-stack-item ${layer.locked ? 'locked' : ''}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('index', index.toString())}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const fromIndex = parseInt(e.dataTransfer.getData('index'))
                    if (fromIndex !== index) {
                      moveLayerInStack(fromIndex, index)
                    }
                  }}
                >
                  <span className="drag-handle">⋮⋮</span>
                  <span className="layer-icon">{layer.icon}</span>
                  <span className="layer-label">{layer.label}</span>
                  <button 
                    className={`lock-btn ${layer.locked ? 'locked' : ''}`}
                    onClick={() => toggleLayerLock(layer.id)}
                    title={layer.locked ? 'Unlock layer' : 'Lock layer to persist'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>
                  <button 
                    className="remove-layer-btn"
                    onClick={() => removeFromStack(layer.id)}
                    title="Remove layer from map"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UnifiedDataExplorer
