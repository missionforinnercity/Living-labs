import React, { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { 
  loadShadeData, 
  loadLightingData, 
  loadWalkabilityData, 
  loadBusinessData, 
  loadCCIDBoundary,
  colorScales, 
  createColorExpression,
  filterPOIByTime,
  createPOIExpression,
  createRoadLightingExpression
} from '../utils/dataLoader'
import {
  scoreEveningWalk,
  scoreMorningCoffee,
  scoreCyclingRoute,
  scoreAfternoonShade,
  scoreRetailDistrict,
  getNarrativeColorExpression,
  getNarrativeWidthExpression
} from '../utils/narrativeScoring'
import {
  thermalColorExpression,
  safetyColorExpression,
} from '../utils/walkabilityEngine'
import { MAPBOX_TOKEN } from '../utils/mapboxToken'
import './Map.css'

mapboxgl.accessToken = MAPBOX_TOKEN

const Map = ({ mode, activeLayers, temporalState, explorerFilters, selectedTour, districtGeoJSON, selectedDistrictId, districtBounds, onDistrictClick, compareDistricts, showDistricts, walkabilityData: walkabilityIndexData, onSegmentClick, compareSegments, focusedSegment }) => {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [currentShadeMetric, setCurrentShadeMetric] = useState('shade_coverage_pct')
  const [lightingData, setLightingData] = useState(null)
  const [netWalkData, setNetWalkData] = useState(null)
  const [walkabilityMode, setWalkabilityMode] = useState('activity') // 'activity', 'network', 'pedestrian', 'cycling'
  const [businessData, setBusinessData] = useState(null)
  const [isLoadingLayer, setIsLoadingLayer] = useState(null)
  const [poiFilter, setPOIFilter] = useState('all') // Filter for POI types in Data Explorer

  // Initialize map
  useEffect(() => {
    if (map.current) return // Already initialized
    if (!mapContainer.current) return // Container not ready

    console.log('Initializing Mapbox map...')
    console.log('Map container:', mapContainer.current)
    console.log('Mapbox token:', mapboxgl.accessToken ? 'Set' : 'Missing')
    let isCleanedUp = false

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [18.4241, -33.9249], // Cape Town CBD
        zoom: 14,
        pitch: 0,
        bearing: 0
      })

      map.current.on('load', () => {
        if (!isCleanedUp) {
          setMapLoaded(true)
          console.log('Map loaded successfully')
        }
      })

      map.current.on('error', (e) => {
        console.error('Map error:', e.error)
        console.error('Error details:', {
          message: e.error?.message,
          status: e.error?.status,
          url: e.error?.url
        })
      })

      setTimeout(() => {
        if (map.current && !isCleanedUp && !map.current.loaded()) {
          console.warn('Map still loading after 10 seconds...')
          console.log('Map loaded status:', map.current.loaded())
          console.log('Map style loaded:', map.current.isStyleLoaded())
        }
      }, 10000)

      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
      map.current.addControl(new mapboxgl.ScaleControl(), 'bottom-left')
    } catch (error) {
      console.error('Error initializing map:', error)
    }

    return () => {
      isCleanedUp = true
      if (map.current) {
        console.log('Cleaning up map')
        map.current.remove()
        map.current = null
      }
    }
  }, [])

  // Load and update shade layer
  useEffect(() => {
    if (!activeLayers.shade) {
      // Remove shade layer if it exists and map is loaded
      if (mapLoaded && map.current) {
        if (map.current.getLayer('shade-layer-glow')) {
          map.current.removeLayer('shade-layer-glow')
        }
        if (map.current.getLayer('shade-layer')) {
          map.current.removeLayer('shade-layer')
        }
        if (map.current.getSource('shade')) {
          map.current.removeSource('shade')
        }
      }
      return
    }

    if (!mapLoaded) return

    const loadShade = async () => {
      try {
        setIsLoadingLayer('shade')
        const data = await loadShadeData(temporalState.season, temporalState.timeOfDay)
        
        // Remove existing layer/source
        if (map.current.getLayer('shade-layer-glow')) {
          map.current.removeLayer('shade-layer-glow')
        }
        if (map.current.getLayer('shade-layer')) {
          map.current.removeLayer('shade-layer')
        }
        if (map.current.getSource('shade')) {
          map.current.removeSource('shade')
        }

        // Add new source and layer
        map.current.addSource('shade', {
          type: 'geojson',
          data: data
        })

        const colorExpression = createColorExpression(
          currentShadeMetric,
          colorScales.shade[currentShadeMetric]
        )

        map.current.addLayer({
          id: 'shade-layer-glow',
          type: 'line',
          source: 'shade',
          paint: {
            'line-color': colorExpression,
            'line-width': 10,
            'line-opacity': 0.18,
            'line-blur': 8,
          }
        })
        map.current.addLayer({
          id: 'shade-layer',
          type: 'line',
          source: 'shade',
          paint: {
            'line-color': colorExpression,
            'line-width': 3,
            'line-opacity': 0.8
          }
        })

        // Remove old event handlers to prevent memory leaks
        map.current.off('click', 'shade-layer')
        map.current.off('mouseenter', 'shade-layer')
        map.current.off('mouseleave', 'shade-layer')

        // Add popup on click
        map.current.on('click', 'shade-layer', (e) => {
          const props = e.features[0].properties
          const coordinates = e.lngLat
          
          new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px;">Shade & Comfort</h3>
                <div style="font-size: 12px;">
                  <strong>Shade Coverage:</strong> ${parseFloat(props.shade_coverage_pct || 0).toFixed(1)}%<br/>
                  <strong>Surface Temp:</strong> ${parseFloat(props.surface_temp_celsius || 0).toFixed(1)}°C<br/>
                  <strong>Vegetation Index:</strong> ${parseFloat(props.vegetation_index || 0).toFixed(2)}<br/>
                  <strong>Comfort:</strong> ${props.comfort_level || 'N/A'}<br/>
                  <strong>Sky View Factor:</strong> ${parseFloat(props.sky_view_factor || 0).toFixed(2)}
                </div>
              </div>
            `)
            .addTo(map.current)
        })

        // Change cursor on hover
        map.current.on('mouseenter', 'shade-layer', () => {
          map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', 'shade-layer', () => {
          map.current.getCanvas().style.cursor = ''
        })

        console.log(`Loaded shade data: ${temporalState.season} ${temporalState.timeOfDay}`)
        setIsLoadingLayer(null)
      } catch (error) {
        console.error('Error loading shade data:', error)
        setIsLoadingLayer(null)
      }
    }

    loadShade()
  }, [mapLoaded, activeLayers.shade, temporalState.season, temporalState.timeOfDay, currentShadeMetric])

  // Load and update lighting layer
  useEffect(() => {
    if (!activeLayers.lighting) {
      // Remove lighting layers if they exist and map is loaded
      if (mapLoaded && map.current) {
        ['lighting-kpis-glow', 'lighting-kpis', 'lighting-fixtures', 'lighting-projects-glow', 'lighting-projects'].forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId)
          }
        })
        ;['lighting-kpis-source', 'lighting-fixtures-source', 'lighting-projects-source'].forEach(sourceId => {
          if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId)
          }
        })
      }
      return
    }

    if (!mapLoaded) return

    const loadLighting = async () => {
      try {
        setIsLoadingLayer('lighting')
        // Use cached data if already loaded
        const data = lightingData || await loadLightingData()
        if (!lightingData) setLightingData(data)
        
        // 1. Add lighting KPIs layer (road segments colored by lux)
        if (map.current.getLayer('lighting-kpis')) {
          map.current.removeLayer('lighting-kpis')
        }
        if (map.current.getSource('lighting-kpis-source')) {
          map.current.removeSource('lighting-kpis-source')
        }

        map.current.addSource('lighting-kpis-source', {
          type: 'geojson',
          data: data.kpis
        })

        const luxColorExpression = createColorExpression('mean_lux', colorScales.lighting.mean_lux)

        map.current.addLayer({
          id: 'lighting-kpis-glow',
          type: 'line',
          source: 'lighting-kpis-source',
          paint: {
            'line-color': luxColorExpression,
            'line-width': 16,
            'line-opacity': 0.20,
            'line-blur': 10,
          }
        })
        map.current.addLayer({
          id: 'lighting-kpis',
          type: 'line',
          source: 'lighting-kpis-source',
          paint: {
            'line-color': luxColorExpression,
            'line-width': 4,
            'line-opacity': 0.7
          }
        })

        // 2. Add lighting fixtures layer (street light points)
        if (map.current.getLayer('lighting-fixtures')) {
          map.current.removeLayer('lighting-fixtures')
        }
        if (map.current.getSource('lighting-fixtures-source')) {
          map.current.removeSource('lighting-fixtures-source')
        }

        map.current.addSource('lighting-fixtures-source', {
          type: 'geojson',
          data: data.fixtures
        })

        map.current.addLayer({
          id: 'lighting-fixtures',
          type: 'circle',
          source: 'lighting-fixtures-source',
          paint: {
            'circle-radius': [
              'interpolate', ['linear'], ['get', 'Wattage'],
              0, 3,
              150, 4,
              250, 5,
              400, 6
            ],
            'circle-color': [
              'match', ['get', 'LampType'],
              'High Pressure Sodium', '#ff9800',
              '#ffd54f'
            ],
            'circle-opacity': 0.9,
            'circle-blur': 0.25,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.55)'
          }
        })

        // 3. Add lighting projects layer (narrative descriptions)
        if (map.current.getLayer('lighting-projects')) {
          map.current.removeLayer('lighting-projects')
        }
        if (map.current.getSource('lighting-projects-source')) {
          map.current.removeSource('lighting-projects-source')
        }

        map.current.addSource('lighting-projects-source', {
          type: 'geojson',
          data: data.projects
        })

        map.current.addLayer({
          id: 'lighting-projects-glow',
          type: 'line',
          source: 'lighting-projects-source',
          paint: {
            'line-color': '#9c27b0',
            'line-width': 18,
            'line-opacity': 0.18,
            'line-blur': 10,
          }
        })
        map.current.addLayer({
          id: 'lighting-projects',
          type: 'line',
          source: 'lighting-projects-source',
          paint: {
            'line-color': '#9c27b0',
            'line-width': 5,
            'line-opacity': 0.9
          }
        })

        // Add popups for KPIs
        map.current.on('click', 'lighting-kpis', (e) => {
          const props = e.features[0].properties
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px;">Lighting Quality</h3>
                <div style="font-size: 12px;">
                  <strong>Street:</strong> ${props.STR_NAME || 'N/A'}<br/>
                  <strong>Mean Lux:</strong> ${parseFloat(props.mean_lux || 0).toFixed(1)}<br/>
                  <strong>Min Lux:</strong> ${parseFloat(props.min_lux || 0).toFixed(1)}<br/>
                  <strong>Max Lux:</strong> ${parseFloat(props.max_lux || 0).toFixed(1)}<br/>
                  <strong>Coverage:</strong> ${parseFloat(props.pct_above_5lux || 0).toFixed(1)}% above 5 lux
                </div>
              </div>
            `)
            .addTo(map.current)
        })

        // Add popups for fixtures
        map.current.on('click', 'lighting-fixtures', (e) => {
          const props = e.features[0].properties
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 8px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px;">Street Light</h3>
                <div style="font-size: 12px;">
                  <strong>ID:</strong> ${props.Light_ID || props.OBJECTID || 'N/A'}<br/>
                  <strong>Wattage:</strong> ${props.Wattage || 'N/A'}W<br/>
                  <strong>Lamp Type:</strong> ${props.LampType || 'N/A'}<br/>
                  <strong>Fixture:</strong> ${props.FixtureSupport || 'N/A'}<br/>
                  <strong>Owner:</strong> ${props.Ownership || 'N/A'}
                </div>
              </div>
            `)
            .addTo(map.current)
        })

        // Add popups for projects (narrative)
        map.current.on('click', 'lighting-projects', (e) => {
          const props = e.features[0].properties
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 12px; max-width: 300px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #9c27b0;">${props.title || 'Lighting Project'}</h3>
                <p style="font-size: 12px; margin: 0; line-height: 1.5;">${props.description || 'Infrastructure enhancement project'}</p>
              </div>
            `)
            .addTo(map.current)
        })

        // Change cursor on hover
        ;['lighting-kpis', 'lighting-fixtures', 'lighting-projects'].forEach(layerId => {
          map.current.on('mouseenter', layerId, () => {
            map.current.getCanvas().style.cursor = 'pointer'
          })
          map.current.on('mouseleave', layerId, () => {
            map.current.getCanvas().style.cursor = ''
          })
        })

        console.log('Loaded lighting data')
        setIsLoadingLayer(null)
      } catch (error) {
        console.error('Error loading lighting data:', error)
        setIsLoadingLayer(null)
      }
    }

    loadLighting()
  }, [mapLoaded, activeLayers.lighting])

  // Load and update walkability layer
  useEffect(() => {
    if (!activeLayers.walkability) {
      // Remove walkability layers if they exist and map is loaded
      if (mapLoaded && map.current) {
        ['walkability-network-glow', 'walkability-network', 'walkability-pedestrian-glow', 'walkability-pedestrian', 'walkability-cycling-glow', 'walkability-cycling', 'walkability-arrows'].forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId)
          }
        })
        ;['walkability-network-source', 'walkability-pedestrian-source', 'walkability-cycling-source'].forEach(sourceId => {
          if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId)
          }
        })
      }
      return
    }

    if (!mapLoaded) return

    const loadWalkability = async () => {
      try {
        setIsLoadingLayer('walkability')
        // Use cached data if already loaded
        const data = netWalkData || await loadWalkabilityData()
        if (!netWalkData) setNetWalkData(data)
        
        // Remove existing layers
        ;['walkability-network-glow', 'walkability-network', 'walkability-pedestrian-glow', 'walkability-pedestrian', 'walkability-cycling-glow', 'walkability-cycling'].forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId)
          }
        })

        const addPedestrianLayers = () => {
          if (map.current.getSource('walkability-pedestrian-source')) {
            map.current.removeSource('walkability-pedestrian-source')
          }

          map.current.addSource('walkability-pedestrian-source', {
            type: 'geojson',
            data: data.pedestrian
          })

          map.current.addLayer({
            id: 'walkability-pedestrian-glow',
            type: 'line',
            source: 'walkability-pedestrian-source',
            paint: {
              'line-color': '#f97316',
              'line-width': [
                'interpolate', ['linear'], ['get', 'total_trip_count'],
                0, 7,
                100, 12,
                200, 18,
                300, 24
              ],
              'line-opacity': 0.14,
              'line-blur': 8,
            }
          })
          map.current.addLayer({
            id: 'walkability-pedestrian',
            type: 'line',
            source: 'walkability-pedestrian-source',
            paint: {
              'line-color': '#fb923c',
              'line-width': [
                'interpolate', ['linear'], ['get', 'total_trip_count'],
                0, 1.5,
                100, 3,
                200, 4.5,
                300, 6
              ],
              'line-opacity': 0.82
            }
          })
        }

        const addCyclingLayers = () => {
          if (map.current.getSource('walkability-cycling-source')) {
            map.current.removeSource('walkability-cycling-source')
          }

          map.current.addSource('walkability-cycling-source', {
            type: 'geojson',
            data: data.cycling
          })

          map.current.addLayer({
            id: 'walkability-cycling-glow',
            type: 'line',
            source: 'walkability-cycling-source',
            paint: {
              'line-color': '#2563eb',
              'line-width': [
                'interpolate', ['linear'], ['get', 'total_trip_count'],
                0, 8,
                100, 14,
                200, 20,
                400, 26
              ],
              'line-opacity': 0.16,
              'line-blur': 8,
            }
          })
          map.current.addLayer({
            id: 'walkability-cycling',
            type: 'line',
            source: 'walkability-cycling-source',
            paint: {
              'line-color': '#60a5fa',
              'line-width': [
                'interpolate', ['linear'], ['get', 'total_trip_count'],
                0, 2,
                100, 4,
                200, 6,
                400, 8
              ],
              'line-opacity': 0.82
            }
          })
        }

        if (walkabilityMode === 'network') {
          // Network centrality view
          if (map.current.getSource('walkability-network-source')) {
            map.current.removeSource('walkability-network-source')
          }

          map.current.addSource('walkability-network-source', {
            type: 'geojson',
            data: data.network
          })

          const betweennessExpression = createColorExpression(
            'cc_betweenness_400',
            colorScales.walkability.betweenness
          )

          map.current.addLayer({
            id: 'walkability-network-glow',
            type: 'line',
            source: 'walkability-network-source',
            paint: {
              'line-color': betweennessExpression,
              'line-width': [
                'interpolate', ['linear'], ['get', 'cc_betweenness_400'],
                0, 8,
                500, 14,
                1000, 22,
                2000, 28
              ],
              'line-opacity': 0.15,
              'line-blur': 8,
            }
          })
          map.current.addLayer({
            id: 'walkability-network',
            type: 'line',
            source: 'walkability-network-source',
            paint: {
              'line-color': betweennessExpression,
              'line-width': [
                'interpolate', ['linear'], ['get', 'cc_betweenness_400'],
                0, 2,
                500, 4,
                1000, 6,
                2000, 8
              ],
              'line-opacity': 0.7
            }
          })

          map.current.on('click', 'walkability-network', (e) => {
            const props = e.features[0].properties
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px;">Network Centrality</h3>
                  <div style="font-size: 12px;">
                    <strong>Betweenness (400m):</strong> ${parseFloat(props.cc_betweenness_400 || 0).toFixed(1)}<br/>
                    <strong>Density:</strong> ${parseFloat(props.cc_density_400 || 0).toFixed(1)}<br/>
                    <strong>Harmonic:</strong> ${parseFloat(props.cc_harmonic_400 || 0).toFixed(3)}<br/>
                    <strong>Integration:</strong> ${parseFloat(props.cc_hillier_400 || 0).toFixed(3)}
                  </div>
                </div>
              `)
              .addTo(map.current)
          })

        } else if (walkabilityMode === 'activity') {
          addPedestrianLayers()
          addCyclingLayers()
        } else if (walkabilityMode === 'pedestrian') {
          addPedestrianLayers()

          map.current.on('click', 'walkability-pedestrian', (e) => {
            const props = e.features[0].properties
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px;">Walking / Running Activity</h3>
                  <div style="font-size: 12px;">
                    <strong>Total Trips:</strong> ${props.total_trip_count || 0}<br/>
                    <strong>Forward:</strong> ${props.forward_trip_count || 0}<br/>
                    <strong>Reverse:</strong> ${props.reverse_trip_count || 0}<br/>
                    <strong>Avg Speed:</strong> ${parseFloat(props.avg_speed || 0).toFixed(2)} m/s<br/>
                    <strong>Recreation:</strong> ${((props.recreation || 0) / (props.total_trips || 1) * 100).toFixed(0)}%<br/>
                    <strong>Commute:</strong> ${((props.commute || 0) / (props.total_trips || 1) * 100).toFixed(0)}%
                  </div>
                </div>
              `)
              .addTo(map.current)
          })

        } else if (walkabilityMode === 'cycling') {
          addCyclingLayers()

          map.current.on('click', 'walkability-cycling', (e) => {
            const props = e.features[0].properties
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px;">Cycling Activity</h3>
                  <div style="font-size: 12px;">
                    <strong>Total Trips:</strong> ${props.total_trip_count || 0}<br/>
                    <strong>E-Bikes:</strong> ${props.ebike_ride_count || 0}<br/>
                    <strong>Regular:</strong> ${props.ride_count || 0}<br/>
                    <strong>Avg Speed:</strong> ${parseFloat(props.forward_average_speed_meters_per_second || 0).toFixed(2)} m/s<br/>
                    <strong>Recreation:</strong> ${((props.recreation || 0) / (props.total_trips || 1) * 100).toFixed(0)}%<br/>
                    <strong>Commute:</strong> ${((props.commute || 0) / (props.total_trips || 1) * 100).toFixed(0)}%
                  </div>
                </div>
              `)
              .addTo(map.current)
          })
        }

        // Change cursor on hover
        ;['walkability-network', 'walkability-pedestrian', 'walkability-cycling'].forEach(layerId => {
          map.current.on('mouseenter', layerId, () => {
            map.current.getCanvas().style.cursor = 'pointer'
          })
          map.current.on('mouseleave', layerId, () => {
            map.current.getCanvas().style.cursor = ''
          })
        })

        if (walkabilityMode === 'activity') {
          map.current.on('click', 'walkability-pedestrian', (e) => {
            const props = e.features[0].properties
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px;">Walking / Running Activity</h3>
                  <div style="font-size: 12px;">
                    <strong>Total Trips:</strong> ${props.total_trip_count || 0}<br/>
                    <strong>Avg Speed:</strong> ${parseFloat(props.avg_speed || 0).toFixed(2)} m/s
                  </div>
                </div>
              `)
              .addTo(map.current)
          })

          map.current.on('click', 'walkability-cycling', (e) => {
            const props = e.features[0].properties
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 14px;">Cycling Activity</h3>
                  <div style="font-size: 12px;">
                    <strong>Total Trips:</strong> ${props.total_trip_count || 0}<br/>
                    <strong>E-Bikes:</strong> ${props.ebike_ride_count || 0}
                  </div>
                </div>
              `)
              .addTo(map.current)
          })
        }

        console.log(`Loaded walkability data: ${walkabilityMode} mode`)
        setIsLoadingLayer(null)
      } catch (error) {
        console.error('Error loading walkability data:', error)
        setIsLoadingLayer(null)
      }
    }

    loadWalkability()
  }, [mapLoaded, activeLayers.walkability, walkabilityMode])

  // Load and update business layer
  useEffect(() => {
    if (!activeLayers.business) {
      // Remove business layers if they exist and map is loaded
      if (mapLoaded && map.current) {
        ['business-poi-clusters', 'business-poi-cluster-count', 'business-poi-points', 'business-properties'].forEach(layerId => {
          if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId)
          }
        })
        ;['business-poi-source', 'business-properties-source'].forEach(sourceId => {
          if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId)
          }
        })
      }
      return
    }

    if (!mapLoaded) return

    const loadBusiness = async () => {
      try {
        setIsLoadingLayer('business')
        console.log('Loading business data (POI, properties, stalls, surveys)...')
        // Use cached data if already loaded
        const data = businessData || await loadBusinessData()
        if (!businessData) setBusinessData(data)
        
        // Filter POI by time if in narrative mode
        let filteredPOI = data.poi
        if (mode === 'narrative' && temporalState.hour) {
          filteredPOI = filterPOIByTime(data.poi, temporalState.hour)
          console.log(`Filtered POI for hour ${temporalState.hour}: ${filteredPOI.features.length} features`)
        }
        
        // Filter by type if in explorer mode
        if (mode === 'explorer' && poiFilter !== 'all') {
          filteredPOI = {
            ...filteredPOI,
            features: filteredPOI.features.filter(f => 
              f.properties.primaryType?.toLowerCase().includes(poiFilter.toLowerCase())
            )
          }
          console.log(`Filtered POI by type '${poiFilter}': ${filteredPOI.features.length} features`)
        }
        
        // 1. Add POI layer with clustering
        if (map.current.getSource('business-poi-source')) {
          map.current.removeSource('business-poi-source')
        }

        map.current.addSource('business-poi-source', {
          type: 'geojson',
          data: filteredPOI,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 80
        })

        // Cluster circles
        map.current.addLayer({
          id: 'business-poi-clusters',
          type: 'circle',
          source: 'business-poi-source',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#e91e63',
              10, '#c2185b',
              25, '#ad1457',
              50, '#880e4f'
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              15,
              10, 20,
              25, 25,
              50, 30
            ],
            'circle-opacity': 0.8,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
          }
        })

        // Cluster count labels
        map.current.addLayer({
          id: 'business-poi-cluster-count',
          type: 'symbol',
          source: 'business-poi-source',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12
          },
          paint: {
            'text-color': '#ffffff'
          }
        })

        // Individual POI points
        map.current.addLayer({
          id: 'business-poi-points',
          type: 'circle',
          source: 'business-poi-source',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': createPOIExpression(),
            'circle-radius': [
              'case',
              ['==', ['get', 'outdoorSeating'], 'True'],
              10, // Larger for outdoor seating
              7   // Normal size
            ],
            'circle-opacity': 0.85,
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'outdoorSeating'], 'True'],
              3,  // Thicker stroke for outdoor seating
              2
            ],
            'circle-stroke-color': [
              'case',
              ['==', ['get', 'outdoorSeating'], 'True'],
              '#ffffff',
              '#f0f0f0'
            ]
          }
        })

        // 2. Add property markers
        if (map.current.getSource('business-properties-source')) {
          map.current.removeSource('business-properties-source')
        }

        map.current.addSource('business-properties-source', {
          type: 'geojson',
          data: data.properties
        })

        map.current.addLayer({
          id: 'business-properties',
          type: 'circle',
          source: 'business-properties-source',
          paint: {
            'circle-color': '#4caf50',
            'circle-radius': 6,
            'circle-opacity': 0.7,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
          }
        })

        // Add popup for POI
        map.current.on('click', 'business-poi-points', (e) => {
          const props = e.features[0].properties
          const rating = parseFloat(props.rating || 0)
          const stars = '★'.repeat(Math.round(rating))
          
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 10px; max-width: 300px;">
                <h3 style="margin: 0 0 6px 0; font-size: 14px; font-weight: 600;">${props.name || 'Business'}</h3>
                ${rating > 0 ? `<div style="margin-bottom: 6px;">${stars} ${rating} (${props.userRatingCount || 0} reviews)</div>` : ''}
                <div style="font-size: 12px; color: #666;">
                  ${props.primaryTypeDisplayName || props.primaryType || 'Business'}<br/>
                  ${props.editorialSummary || ''}
                </div>
                ${props.outdoorSeating === 'true' ? '<div style="margin-top: 6px; color: #4caf50; font-size: 11px;">Outdoor Seating Available</div>' : ''}
              </div>
            `)
            .addTo(map.current)
        })

        // Add popup for properties
        map.current.on('click', 'business-properties', (e) => {
          const props = e.features[0].properties
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 10px;">
                <h3 style="margin: 0 0 6px 0; font-size: 14px;">${props.address || 'Property'}</h3>
                <div style="font-size: 12px;">
                  <strong>Category:</strong> ${props.property_category || 'N/A'}<br/>
                  <strong>Units:</strong> ${props.property_count || 0}<br/>
                  <strong>Type:</strong> ${props.transaction_type || 'N/A'}
                </div>
              </div>
            `)
            .addTo(map.current)
        })

        // Handle cluster clicks (zoom in)
        map.current.on('click', 'business-poi-clusters', (e) => {
          const features = map.current.queryRenderedFeatures(e.point, {
            layers: ['business-poi-clusters']
          })
          const clusterId = features[0].properties.cluster_id
          map.current.getSource('business-poi-source').getClusterExpansionZoom(
            clusterId,
            (err, zoom) => {
              if (err) return

              map.current.easeTo({
                center: features[0].geometry.coordinates,
                zoom: zoom
              })
            }
          )
        })

        // Change cursor on hover
        ;['business-poi-clusters', 'business-poi-points', 'business-properties'].forEach(layerId => {
          map.current.on('mouseenter', layerId, () => {
            map.current.getCanvas().style.cursor = 'pointer'
          })
          map.current.on('mouseleave', layerId, () => {
            map.current.getCanvas().style.cursor = ''
          })
        })

        console.log('Loaded business data')
        setIsLoadingLayer(null)
      } catch (error) {
        console.error('Error loading business data:', error)
        setIsLoadingLayer(null)
      }
    }

    loadBusiness()
  }, [mapLoaded, activeLayers.business, poiFilter, mode, temporalState.hour])

  // Narrative Tour: Score and highlight street segments
  useEffect(() => {
    if (!mapLoaded || !selectedTour || mode !== 'narrative') return

    const applyNarrativeScoring = async () => {
      try {
        console.log(`Applying narrative scoring for: ${selectedTour}`)
        
        // Load necessary data
        const [lightingDataset, walkabilityDataset, businessDataset, shadeDataset] = await Promise.all([
          lightingData || loadLightingData(),
          netWalkData || loadWalkabilityData(),
          businessData || loadBusinessData(),
          loadShadeData(temporalState.season, temporalState.timeOfDay).catch(() => null)
        ])

        // Cache loaded data
        if (!lightingData) setLightingData(lightingDataset)
        if (!netWalkData) setNetWalkData(walkabilityDataset)
        if (!businessData) setBusinessData(businessDataset)

        // Score street segments based on selected tour
        let scoredSegments = null
        let usedLayers = []

        switch (selectedTour) {
          case 'evening-walk':
            // Combine road lighting, walkability, and POI data
            scoredSegments = scoreEveningWalk(
              lightingDataset.roadSegments,
              businessDataset.poi,
              shadeDataset,
              walkabilityDataset.pedestrian
            )
            usedLayers = ['Road Lighting (avg lumens)', 'Pedestrian Activity', 'POI with Outdoor Seating', 'Shade Coverage']
            break

          case 'outdoor-dining':
            scoredSegments = scoreAfternoonShade(
              lightingDataset.roadSegments,
              shadeDataset
            )
            usedLayers = ['Shade Coverage', 'Surface Temperature', 'Vegetation Index', 'POI with Outdoor Seating']
            break

          case 'cool-summer-route':
            scoredSegments = scoreAfternoonShade(
              lightingDataset.roadSegments,
              shadeDataset
            )
            usedLayers = ['Shade Coverage', 'Surface Temperature', 'Vegetation Index', 'Walkability Network']
            break

          case 'retail-vibrancy':
            scoredSegments = scoreRetailDistrict(
              lightingDataset.roadSegments,
              businessDataset.poi,
              walkabilityDataset.pedestrian
            )
            usedLayers = ['Road Lighting', 'Pedestrian Activity', 'POI Density', 'Network Centrality']
            break

          case 'cultural-circuit':
            scoredSegments = scoreMorningCoffee(
              lightingDataset.roadSegments,
              businessDataset.poi
            )
            usedLayers = ['Road Lighting', 'POI (Museums, Galleries)', 'Lighting Projects', 'Event Venues']
            break

          default:
            scoredSegments = lightingDataset.roadSegments
            usedLayers = ['Road Segments']
        }

        if (!scoredSegments) return

        // Remove existing narrative layer
        if (map.current.getLayer('narrative-segments-glow')) {
          map.current.removeLayer('narrative-segments-glow')
        }
        if (map.current.getLayer('narrative-segments')) {
          map.current.removeLayer('narrative-segments')
        }
        if (map.current.getSource('narrative-segments-source')) {
          map.current.removeSource('narrative-segments-source')
        }

        // Add scored segments layer
        map.current.addSource('narrative-segments-source', {
          type: 'geojson',
          data: scoredSegments
        })

        map.current.addLayer({
          id: 'narrative-segments-glow',
          type: 'line',
          source: 'narrative-segments-source',
          paint: {
            'line-color': getNarrativeColorExpression(),
            'line-width': ['*', getNarrativeWidthExpression(), 4],
            'line-opacity': 0.18,
            'line-blur': 8,
          }
        })
        map.current.addLayer({
          id: 'narrative-segments',
          type: 'line',
          source: 'narrative-segments-source',
          paint: {
            'line-color': getNarrativeColorExpression(),
            'line-width': getNarrativeWidthExpression(),
            'line-opacity': 0.85
          }
        })

        // Add click handler for narrative segments
        map.current.off('click', 'narrative-segments')
        map.current.on('click', 'narrative-segments', (e) => {
          const props = e.features[0].properties
          const score = props.narrative_score || 0
          const category = props.narrative_category || 'N/A'
          
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="padding: 12px; min-width: 250px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #1a9850;">
                  ${selectedTour.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} Score
                </h3>
                <div style="margin-bottom: 8px;">
                  <div style="background: linear-gradient(to right, #d73027, #f39c12, #1a9850); height: 8px; border-radius: 4px; margin-bottom: 4px;"></div>
                  <div style="font-size: 16px; font-weight: bold; color: ${score >= 70 ? '#1a9850' : score >= 50 ? '#f39c12' : '#d73027'};">
                    ${score}/100 - ${category.toUpperCase()}
                  </div>
                </div>
                <div style="font-size: 12px; color: #666; margin-top: 8px;">
                  <strong>Street:</strong> ${props.STR_NAME || props.name || 'Unnamed'}<br/>
                  ${props.avg_illuminance ? `<strong>Lighting:</strong> ${parseFloat(props.avg_illuminance).toFixed(1)} lux<br/>` : ''}
                  ${props.ped_count ? `<strong>Pedestrians:</strong> ${props.ped_count}/day<br/>` : ''}
                  ${props.shade_coverage_pct ? `<strong>Shade:</strong> ${parseFloat(props.shade_coverage_pct).toFixed(1)}%<br/>` : ''}
                </div>
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; font-size: 11px; color: #999;">
                  <strong>Data sources:</strong><br/>
                  ${usedLayers.join(', ')}
                </div>
              </div>
            `)
            .addTo(map.current)
        })

        // Add hover effect
        map.current.off('mouseenter', 'narrative-segments')
        map.current.off('mouseleave', 'narrative-segments')
        
        map.current.on('mouseenter', 'narrative-segments', () => {
          map.current.getCanvas().style.cursor = 'pointer'
        })
        map.current.on('mouseleave', 'narrative-segments', () => {
          map.current.getCanvas().style.cursor = ''
        })

        console.log(`Narrative scoring applied. Used layers: ${usedLayers.join(', ')}`)

      } catch (error) {
        console.error('Error applying narrative scoring:', error)
      }
    }

    applyNarrativeScoring()

    // Cleanup narrative layer when tour is deselected
    return () => {
      if (map.current && map.current.getLayer('narrative-segments')) {
        map.current.removeLayer('narrative-segments')
        map.current.removeSource('narrative-segments-source')
      }
    }
  }, [mapLoaded, selectedTour, mode, temporalState])

  // ── District Narrative Engine — render all district polygons ──────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const SOURCE_ID = 'districts-source'
    const FILL_ID   = 'districts-fill'
    const LINE_ID   = 'districts-line'
    const GLOW_ID   = 'districts-glow'
    const CMP_A     = 'districts-cmp-a'
    const CMP_B     = 'districts-cmp-b'

    const cleanup = () => {
      if (!map.current) return
      ;[CMP_A, CMP_B, FILL_ID, LINE_ID, GLOW_ID].forEach(id => {
        if (map.current.getLayer(id)) map.current.removeLayer(id)
      })
      if (map.current.getSource(SOURCE_ID)) map.current.removeSource(SOURCE_ID)
    }

    if (!showDistricts || !districtGeoJSON || !districtGeoJSON.features?.length) {
      cleanup()
      return
    }

    cleanup()

    if (map.current.getSource(SOURCE_ID)) {
      map.current.getSource(SOURCE_ID).setData(districtGeoJSON)
    } else {
      map.current.addSource(SOURCE_ID, {
        type: 'geojson',
        data: districtGeoJSON
      })
    }

    // Soft glow (wide blurred outline)
    map.current.addLayer({
      id: GLOW_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'case',
          ['==', ['get', 'clusterId'], selectedDistrictId || ''], 18, 8
        ],
        'line-opacity': 0.20,
        'line-blur': 8
      }
    })

    // Semi-transparent fill
    map.current.addLayer({
      id: FILL_ID,
      type: 'fill',
      source: SOURCE_ID,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': [
          'case',
          ['==', ['get', 'clusterId'], selectedDistrictId || ''], 0.22, 0.10
        ]
      }
    })

    // Crisp border
    map.current.addLayer({
      id: LINE_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'case',
          ['==', ['get', 'clusterId'], selectedDistrictId || ''], 2.5, 1.5
        ],
        'line-opacity': [
          'case',
          ['==', ['get', 'clusterId'], selectedDistrictId || ''], 1.0, 0.7
        ]
      }
    })

    // Click — update stats panel
    map.current.off('click', FILL_ID)
    map.current.on('click', FILL_ID, (e) => {
      const feat  = e.features[0]
      if (!feat) return
      if (onDistrictClick) onDistrictClick(feat)
    })

    map.current.on('mouseenter', FILL_ID, () => {
      map.current.getCanvas().style.cursor = 'pointer'
    })
    map.current.on('mouseleave', FILL_ID, () => {
      map.current.getCanvas().style.cursor = ''
    })

    return cleanup
  }, [mapLoaded, showDistricts, districtGeoJSON, selectedDistrictId, onDistrictClick])

  // ── District comparison highlights (amber A / blue B) ─────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const CMP_A = 'districts-cmp-a'
    const CMP_B = 'districts-cmp-b'
    const SOURCE_ID = 'districts-source'

    const removeCompare = () => {
      if (!map.current) return
      ;[CMP_A, CMP_B].forEach(id => {
        if (map.current.getLayer(id)) map.current.removeLayer(id)
      })
    }

    removeCompare()
    if (!map.current.getSource(SOURCE_ID)) return

    const addCmpLayer = (id, clusterId, color) => {
      map.current.addLayer({
        id,
        type: 'fill',
        source: SOURCE_ID,
        filter: ['==', ['get', 'clusterId'], clusterId],
        paint: { 'fill-color': color, 'fill-opacity': 0.38 }
      })
    }

    if (compareDistricts?.[0]) {
      addCmpLayer(CMP_A, compareDistricts[0].properties.clusterId, '#e8a020')
    }
    if (compareDistricts?.[1]) {
      addCmpLayer(CMP_B, compareDistricts[1].properties.clusterId, '#3d80c0')
    }

    return removeCompare
  }, [mapLoaded, showDistricts, compareDistricts])

  // ── 15-Minute City accessibility layers ────────────────────────────────
  // ── Dual-State Walkability Index layers ─────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return

    const SRC_WLK    = 'walkability-idx-src'
    const LYR_WLK    = 'walkability-idx-line'
    const LYR_STORY_GLOW = 'walkability-story-glow'
    const LYR_STORY  = 'walkability-story-line'
    const SRC_STORY  = 'walkability-story-src'

    const cleanup = () => {
      if (!map.current) return
      ;[LYR_WLK, 'walkability-idx-glow-outer', 'walkability-idx-glow-inner', LYR_STORY_GLOW, LYR_STORY].forEach(id => {
        if (map.current.getLayer(id)) map.current.removeLayer(id)
      })
      ;[SRC_WLK, SRC_STORY].forEach(id => {
        if (map.current.getSource(id)) map.current.removeSource(id)
      })
    }

    if (!walkabilityIndexData) { cleanup(); return }

    const { fc, mode: wMode, activeTour, storyFeatures, thresholds } = walkabilityIndexData
    const EMPTY_FC = { type: 'FeatureCollection', features: [] }

    cleanup()

    // Main walkability layer — quintile step colours when thresholds are available
    const kpiProp = wMode === 'day' ? 'kpi_day' : 'kpi_night'
    const colorExpr = wMode === 'day'
      ? thermalColorExpression('kpi_day',   thresholds || null)
      : safetyColorExpression('kpi_night',  thresholds || null)

    map.current.addSource(SRC_WLK, { type: 'geojson', data: fc || EMPTY_FC })

    // Outer glow — wide, very blurred, low opacity. Creates the neon bleed.
    map.current.addLayer({
      id:     'walkability-idx-glow-outer',
      type:   'line',
      source: SRC_WLK,
      paint: {
        'line-color':   colorExpr,
        'line-width':   ['interpolate', ['linear'], ['zoom'], 12, 10, 14, 18, 16, 28],
        'line-opacity': ['interpolate', ['linear'], ['get', kpiProp], 0, 0.0, 0.2, 0.03, 0.5, 0.07, 1, 0.12],
        'line-blur':    ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 12],
        'line-cap': 'round',
        'line-join': 'round',
      }
    })

    // Inner glow — tighter, slightly brighter
    map.current.addLayer({
      id:     'walkability-idx-glow-inner',
      type:   'line',
      source: SRC_WLK,
      paint: {
        'line-color':   colorExpr,
        'line-width':   ['interpolate', ['linear'], ['zoom'], 12, 5, 14, 8, 16, 14],
        'line-opacity': ['interpolate', ['linear'], ['get', kpiProp], 0, 0.0, 0.2, 0.06, 0.5, 0.12, 1, 0.2],
        'line-blur':    ['interpolate', ['linear'], ['zoom'], 12, 3, 16, 5],
        'line-cap': 'round',
        'line-join': 'round',
      }
    })

    // Core line — crisp on top
    map.current.addLayer({
      id:     LYR_WLK,
      type:   'line',
      source: SRC_WLK,
      paint: {
        'line-color':   colorExpr,
        'line-width':   ['interpolate', ['linear'], ['zoom'], 12, 1.5, 14, 2.5, 16, 4],
        'line-opacity': ['interpolate', ['linear'], ['get', kpiProp], 0, 0.3, 0.3, 0.6, 0.6, 0.8, 1, 1],
        'line-cap': 'round',
        'line-join': 'round',
      }
    })

    // Click to select segment for compare panel
    const handleWalkClick = (e) => {
      const features = map.current.queryRenderedFeatures(e.point, { layers: [LYR_WLK] })
      if (features.length > 0 && onSegmentClick) {
        onSegmentClick({ properties: features[0].properties, geometry: features[0].geometry })
      }
    }
    map.current.on('click', LYR_WLK, handleWalkClick)
    map.current.on('mouseenter', LYR_WLK, () => { map.current.getCanvas().style.cursor = 'crosshair' })
    map.current.on('mouseleave', LYR_WLK, () => { map.current.getCanvas().style.cursor = '' })

    const fullCleanup = () => {
      cleanup()
      if (map.current) {
        map.current.off('click', LYR_WLK, handleWalkClick)
        map.current.off('mouseenter', LYR_WLK, () => {})
        map.current.off('mouseleave', LYR_WLK, () => {})
      }
    }

    // Story tour highlight overlay — outer glow + crisp core line
    if (storyFeatures && storyFeatures.length > 0 && activeTour) {
      const storyFC = { type: 'FeatureCollection', features: storyFeatures }
      map.current.addSource(SRC_STORY, { type: 'geojson', data: storyFC })

      // Wide blurred glow layer underneath
      map.current.addLayer({
        id:     LYR_STORY_GLOW,
        type:   'line',
        source: SRC_STORY,
        paint: {
          'line-color':   activeTour.glowColor || activeTour.highlightColor || '#ffffff',
          'line-width':   14,
          'line-opacity': 0.28,
          'line-blur':    8,
        }
      })

      // Crisp bright line on top
      map.current.addLayer({
        id:     LYR_STORY,
        type:   'line',
        source: SRC_STORY,
        paint: {
          'line-color':   activeTour.highlightColor || '#ffffff',
          'line-width':   3.5,
          'line-opacity': 0.95,
          'line-blur':    0,
        }
      })
    } else {
      // Ensure story layers don't linger
      if (map.current.getLayer(LYR_STORY_GLOW)) map.current.removeLayer(LYR_STORY_GLOW)
      if (map.current.getLayer(LYR_STORY))      map.current.removeLayer(LYR_STORY)
      if (map.current.getSource(SRC_STORY))     map.current.removeSource(SRC_STORY)
    }

    return fullCleanup
  }, [mapLoaded, walkabilityIndexData, onSegmentClick])

  // ── Compare segment highlight overlay ────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const SRC_SEL = 'compare-sel-src'
    const LYR_SEL = 'compare-sel-line'

    const removeSelLayer = () => {
      if (map.current.getLayer(LYR_SEL))  map.current.removeLayer(LYR_SEL)
      if (map.current.getSource(SRC_SEL)) map.current.removeSource(SRC_SEL)
    }

    removeSelLayer()

    if (!compareSegments || compareSegments.length === 0) return

    const colors = ['#e8a020', '#3d80c0']
    const features = compareSegments.map((seg, i) => ({
      ...seg,
      properties: { ...seg.properties, _selColor: colors[i] }
    }))
    const fc = { type: 'FeatureCollection', features }

    map.current.addSource(SRC_SEL, { type: 'geojson', data: fc })
    map.current.addLayer({
      id:     LYR_SEL,
      type:   'line',
      source: SRC_SEL,
      paint: {
        'line-color':   ['get', '_selColor'],
        'line-width':   5,
        'line-opacity': 1,
        'line-dasharray': [1, 0],
      }
    })

    return removeSelLayer
  }, [mapLoaded, compareSegments])

  // ── CCID boundary — permanent thin white outline ─────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current) return
    const SRC = 'ccid-boundary-src'
    const LYR_FILL   = 'ccid-boundary-fill'
    const LYR_LINE   = 'ccid-boundary-line'
    const LYR_GLOW   = 'ccid-boundary-glow'

    if (map.current.getSource(SRC)) return  // already added

    loadCCIDBoundary()
      .then(geojson => {
        if (!map.current) return
        map.current.addSource(SRC, { type: 'geojson', data: geojson })

        // Faint fill so the interior is subtly distinguishable
        map.current.addLayer({
          id: LYR_FILL, type: 'fill', source: SRC,
          paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.025 }
        })

        // Soft outer glow
        map.current.addLayer({
          id: LYR_GLOW, type: 'line', source: SRC,
          paint: {
            'line-color': '#ffffff',
            'line-width': 6,
            'line-opacity': 0.08,
            'line-blur': 4
          }
        })

        // Crisp white boundary line
        map.current.addLayer({
          id: LYR_LINE, type: 'line', source: SRC,
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.65,
            'line-dasharray': [4, 3]
          }
        })
      })
      .catch(err => console.warn('[Map] CCID boundary load failed:', err))
  }, [mapLoaded])

  // ── Fly to selected district bounds ──────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current || !districtBounds) return
    try {
      map.current.fitBounds(
        [[districtBounds[0], districtBounds[1]], [districtBounds[2], districtBounds[3]]],
        { padding: 60, duration: 1400, pitch: 20 }
      )
    } catch (e) {
      console.warn('fitBounds error:', e)
    }
  }, [mapLoaded, districtBounds])

  // ── Zoom to focused walkability segment ──────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !map.current || !focusedSegment) return
    const geom = focusedSegment.geometry
    if (!geom) return
    let allCoords = []
    if (geom.type === 'LineString') {
      allCoords = geom.coordinates
    } else if (geom.type === 'MultiLineString') {
      allCoords = geom.coordinates.flat()
    }
    if (allCoords.length === 0) return
    const lngs = allCoords.map(c => c[0])
    const lats = allCoords.map(c => c[1])
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    try {
      map.current.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 120, duration: 1200, maxZoom: 18 }
      )
    } catch (e) {
      console.warn('fitBounds segment error:', e)
    }
  }, [mapLoaded, focusedSegment])

  // Update other layers based on active state
  useEffect(() => {
    if (!mapLoaded) return

    console.log('Active layers:', activeLayers)
    console.log('Temporal state:', temporalState)
    console.log('Mode:', mode)

  }, [mapLoaded, activeLayers, temporalState, mode, explorerFilters, selectedTour])

  return (
    <div className="map-wrapper">
      <div ref={mapContainer} className="map" />
      {!mapLoaded && (
        <div className="map-loading">
          <div className="spinner"></div>
          <p>Loading map...</p>
        </div>
      )}
      
      {isLoadingLayer && (
        <div className="map-loading" style={{background: 'rgba(0,0,0,0.5)'}}>
          <div className="spinner"></div>
          <p>Loading {isLoadingLayer} layer...</p>
        </div>
      )}
      
      {/* Metric selector for shade layer */}
      {mapLoaded && activeLayers.shade && (
        <div className="map-controls">
          <div className="metric-selector">
            <label>Shade Metric:</label>
            <select 
              value={currentShadeMetric} 
              onChange={(e) => setCurrentShadeMetric(e.target.value)}
            >
              <option value="shade_coverage_pct">Shade Coverage %</option>
              <option value="surface_temp_celsius">Surface Temperature</option>
              <option value="vegetation_index">Vegetation Index</option>
              <option value="comfort_level">Comfort Level</option>
            </select>
          </div>
        </div>
      )}

      {/* Walkability mode selector */}
      {mapLoaded && activeLayers.walkability && (
        <div className="map-controls" style={{top: '60px'}}>
          <div className="metric-selector">
            <label>Walkability View:</label>
            <select 
              value={walkabilityMode} 
              onChange={(e) => setWalkabilityMode(e.target.value)}
            >
              <option value="activity">Active Mobility</option>
              <option value="network">Network Centrality</option>
              <option value="pedestrian">Walking / Running</option>
              <option value="cycling">Cycling</option>
            </select>
          </div>
        </div>
      )}

      {/* POI Filter for Data Explorer mode */}
      {mapLoaded && mode === 'explorer' && activeLayers.business && (
        <div className="map-controls" style={{top: activeLayers.shade ? '120px' : activeLayers.walkability ? '60px' : '10px'}}>
          <div className="metric-selector">
            <label>Filter Businesses:</label>
            <select 
              value={poiFilter} 
              onChange={(e) => setPOIFilter(e.target.value)}
            >
              <option value="all">All POI ({businessData?.poi?.features?.length || 0})</option>
              <option value="restaurant">Restaurants</option>
              <option value="cafe">Cafes & Coffee Shops</option>
              <option value="bar">Bars & Pubs</option>
              <option value="hotel">Hotels & Lodging</option>
              <option value="store">Stores & Shopping</option>
              <option value="gallery">Art Galleries</option>
              <option value="museum">Museums</option>
              <option value="park">Parks & Recreation</option>
              <option value="outdoor">Outdoor Seating</option>
            </select>
            <div style={{fontSize: '11px', marginTop: '4px', color: '#666'}}>
              {poiFilter === 'outdoor' && 'Shows POI with outdoor seating'}
            </div>
          </div>
        </div>
      )}

      {/* Narrative Tour Data Sources Info */}
      {mapLoaded && mode === 'narrative' && selectedTour && (
        <div className="narrative-info-panel">
          <h4>Data Layers Combined</h4>
          <p style={{fontSize: '12px', marginBottom: '8px'}}>
            Street segments scored using:
          </p>
          <ul style={{fontSize: '11px', margin: 0, paddingLeft: '20px'}}>
            {selectedTour === 'evening-walk' && (
              <>
                <li>Road Lighting (avg lumens from 1,057 segments)</li>
                <li>Pedestrian Activity</li>
                <li>POI with Outdoor Seating</li>
                <li>Shade Coverage at 7PM</li>
              </>
            )}
            {selectedTour === 'outdoor-dining' && (
              <>
                <li>Shade Coverage (619 polygons)</li>
                <li>Surface Temperature</li>
                <li>Vegetation Index</li>
                <li>POI with Outdoor Seating (4,139 points)</li>
              </>
            )}
            {selectedTour === 'cool-summer-route' && (
              <>
                <li>Shade Coverage (summer 2PM)</li>
                <li>Surface Temperature</li>
                <li>Vegetation Index for greenery access</li>
                <li>Walkability Network (691 segments)</li>
              </>
            )}
            {selectedTour === 'retail-vibrancy' && (
              <>
                <li>Road Lighting for evening shopping</li>
                <li>Pedestrian Activity density</li>
                <li>POI Density (retail focus)</li>
                <li>Network Centrality</li>
              </>
            )}
            {selectedTour === 'cultural-circuit' && (
              <>
                <li>Lighting Projects (5 narrative descriptions)</li>
                <li>POI (Museums, Galleries, Venues)</li>
                <li>Road Lighting for evening visits</li>
                <li>Event Venues</li>
              </>
            )}
          </ul>
          <div style={{marginTop: '8px', padding: '6px', background: '#f0f9ff', borderRadius: '4px', fontSize: '10px'}}>
            Click any street segment to see its score breakdown
          </div>
        </div>
      )}

      {/* Layer legend */}
      {mapLoaded && (activeLayers.lighting || activeLayers.shade || activeLayers.walkability || activeLayers.business) && (
        <div className="map-legend">
          <h4>Active Layers</h4>
          {activeLayers.shade && (
            <div className="legend-item">
              <span className="legend-color" style={{background: 'linear-gradient(to right, #fee5d9, #a50f15)'}}></span>
              <span>Shade & Comfort</span>
            </div>
          )}
          {activeLayers.lighting && (
            <>
              <div className="legend-item">
                <span className="legend-color" style={{background: 'linear-gradient(to right, #081d58, #ffffcc)'}}></span>
                <span>Lighting Quality (Lux)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{background: '#ff9800'}}></span>
                <span>Street Lights</span>
              </div>
              <div className="legend-item">
                <span className="legend-line" style={{background: '#9c27b0'}}></span>
                <span>Street Lights</span>
              </div>
            </>
          )}
          {activeLayers.walkability && (
            <div className="legend-item">
              <span className="legend-color" style={{
                background: walkabilityMode === 'network' 
                  ? 'linear-gradient(to right, #f7fbff, #084594)' 
                  : 'linear-gradient(to right, #08519c, #6baed6, #fee391, #ec7014, #d62828, #6a040f)'
              }}></span>
              <span style={{fontSize: '11px'}}>
                {walkabilityMode === 'activity'
                  ? 'Active Mobility: Orange = walking/running, Blue = cycling'
                  : walkabilityMode === 'network'
                    ? 'Network Centrality'
                    : walkabilityMode === 'pedestrian'
                      ? 'Walking / Running: Orange intensity = trip volume'
                      : 'Cycling: Blue intensity = trip volume'}
              </span>
            </div>
          )}
          {activeLayers.business && (
            <>
              <div className="legend-item">
                <span className="legend-dot" style={{background: '#e91e63'}}></span>
                <span>Businesses (POI)</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{background: '#4caf50'}}></span>
                <span>Properties</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Map
