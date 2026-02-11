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
  { id: 'business', label: 'Business Analytics', icon: '🏪' },
  { id: 'walkability', label: 'Walkability & Cycling', icon: '🚶' },
  { id: 'lighting', label: 'Street Lighting', icon: '💡' },
  { id: 'temperature', label: 'Surface Temperature', icon: '🌡️' },
  { id: 'greenery', label: 'Greenery', icon: '🌳' }
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
  
  // Categories filters state
  const [categoriesFilters, setCategoriesFilters] = useState({
    restaurant: false,
    cafe: false,
    art_gallery: false,
    bar: false,
    store: false,
    lodging: false
  })
  
  // Walkability dashboard state
  const [walkabilityMode, setWalkabilityMode] = useState('pedestrian') // 'pedestrian', 'cycling', 'network'
  const [networkMetric, setNetworkMetric] = useState('betweenness_800') // betweenness metric to display
  const [networkData, setNetworkData] = useState(null)
  const [pedestrianData, setPedestrianData] = useState(null)
  const [cyclingData, setCyclingData] = useState(null)
  
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
    businesses: true,
    streetStalls: false,
    properties: false,
    // Walkability layers
    network: true,
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
    
    if (dashboardMode === 'business') {
      loadBusinessData()
    }
  }, [dashboardMode])
  
  // Load walkability data
  useEffect(() => {
    const loadWalkabilityData = async () => {
      try {
        // Load network data from shade dataset (has betweenness centrality)
        const shadeFile = '/data/shade/winter/2025-06-21_0800.geojson'
        
        const [network, pedestrian, cycling] = await Promise.all([
          fetch(shadeFile).then(r => r.json()),
          fetch('/data/walkabilty/processed/pedestrian_month_all.geojson').then(r => r.json()),
          fetch('/data/walkabilty/processed/cycling_month_all.geojson').then(r => r.json())
        ])
        
        console.log('Walkability data loaded:', {
          network: network.features?.length,
          pedestrian: pedestrian.features?.length,
          cycling: cycling.features?.length
        })
        
        setNetworkData(network)
        setPedestrianData(pedestrian)
        setCyclingData(cycling)
      } catch (error) {
        console.error('Error loading walkability data:', error)
      }
    }
    
    if (dashboardMode === 'walkability') {
      loadWalkabilityData()
    }
  }, [dashboardMode])
  
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
    
    if (dashboardMode === 'lighting') {
      loadLightingData()
    }
  }, [dashboardMode])
  
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
    
    if (dashboardMode === 'temperature') {
      loadTemperatureData()
    }
  }, [dashboardMode])
  
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
        const response = await fetch(`/data/shade/${season}/${date}_${timeOfDay}.geojson`)
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
    
    if (dashboardMode === 'greenery') {
      loadShadeData()
      loadGreeneryData()
    }
  }, [dashboardMode, season, timeOfDay])
  
  // Auto-enable appropriate layers when switching dashboard modes
  useEffect(() => {
    if (dashboardMode === 'temperature') {
      setVisibleLayers(prev => ({ ...prev, temperatureSegments: true }))
    } else if (dashboardMode === 'greenery') {
      setVisibleLayers(prev => ({ ...prev, greenerySegments: true }))
    }
  }, [dashboardMode])
  
  const toggleLayer = (layerId) => {
    setVisibleLayers(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }))
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
          {dashboardMode === 'business' && (
            <BusinessAnalytics
              businessMode={businessMode}
              onModeChange={setBusinessMode}
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
            />
          )}
          
          {dashboardMode === 'walkability' && (
            <WalkabilityAnalytics
              walkabilityMode={walkabilityMode}
              onWalkabilityModeChange={setWalkabilityMode}
              networkMetric={networkMetric}
              onNetworkMetricChange={setNetworkMetric}
              pedestrianData={pedestrianData}
              cyclingData={cyclingData}
              networkData={networkData}
            />
          )}
          
          {dashboardMode === 'lighting' && (
            <LightingAnalytics
              segmentsData={lightingSegments}
              projectsData={lightingProjects}
              visibleLayers={visibleLayers}
              onLayerToggle={toggleLayer}
            />
          )}
          
          {dashboardMode === 'temperature' && (
            <TemperatureAnalytics
              temperatureData={temperatureData}
              visibleLayers={visibleLayers}
              onLayerToggle={toggleLayer}
            />
          )}
          
          {dashboardMode === 'greenery' && (
            <GreeneryAnalytics
              shadeData={shadeData}
              greeneryAndSkyview={greeneryAndSkyview}
              treeCanopyData={treeCanopyData}
              parksData={parksData}
              visibleLayers={visibleLayers}
              onLayerToggle={toggleLayer}
            />
          )}
        </aside>
        
        <main className="explorer-map-container">
          <ExplorerMap
            dashboardMode={dashboardMode}
            businessMode={businessMode}
            walkabilityMode={walkabilityMode}
            networkMetric={networkMetric}
            dayOfWeek={dayOfWeek}
            hour={hour}
            businessesData={businessesData}
            streetStallsData={streetStallsData}
            surveyData={surveyData}
            propertiesData={propertiesData}
            networkData={networkData}
            pedestrianData={pedestrianData}
            cyclingData={cyclingData}
            lightingSegments={lightingSegments}
            lightingProjects={lightingProjects}
            temperatureData={temperatureData}
            shadeData={shadeData}
            season={season}
            greeneryAndSkyview={greeneryAndSkyview}
            treeCanopyData={treeCanopyData}
            parksData={parksData}
            visibleLayers={visibleLayers}
            onMapLoad={setMap}
            opinionSource={opinionSource}
            amenitiesFilters={amenitiesFilters}
            categoriesFilters={categoriesFilters}
            selectedSegment={selectedSegment}
            onSegmentSelect={setSelectedSegment}
          />
          
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
      </div>
    </div>
  )
}

export default UnifiedDataExplorer
