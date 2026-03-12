import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import Map, { Source, Layer, Popup } from 'react-map-gl'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as turf from '@turf/turf'
import { latLngToCell, cellToBoundary } from 'h3-js'
import 'mapbox-gl/dist/mapbox-gl.css'
import { isBusinessOpen } from '../../utils/timeUtils'
import { colorScales } from '../../utils/dataLoader'
import './ExplorerMap.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

const ExplorerMap = ({
  dashboardMode,
  businessMode,
  walkabilityMode,
  networkMetric,
  transitView = 'combined',
  dayOfWeek,
  hour,
  businessesData,
  streetStallsData,
  surveyData,
  propertiesData,
  networkData,
  pedestrianData,
  cyclingData,
  transitData,
  busStopsData,
  trainStationData,
  lightingSegments,
  streetLights,
  missionInterventions,
  lightingThresholds,
  temperatureData,
  shadeData,
  season,
  greeneryAndSkyview,
  treeCanopyData,
  parksData,
  envCurrentData,
  envHistoryData,
  envIndex = 'uaqi',
  onEnvGridDetail,
  visibleLayers,
  layerStack = [],
  activeCategory,
  onMapLoad,
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
  eventsData,
  eventsMonth,
  ratingFilter = null   // null = all, array of floor values e.g. [4,5]
}) => {
  const mapRef = useRef()

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

  // ─── History data grouped by grid cell (for popup charts) ──────────────────
  const historyByLocation = useMemo(() => {
    const rows = envHistoryData?.rows
    if (!rows) return {}
    const map = {}
    rows.forEach(r => {
      if (!map[r.grid_id]) map[r.grid_id] = []
      map[r.grid_id].push(r)
    })
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.hour_utc) - new Date(b.hour_utc)))
    return map
  }, [envHistoryData])

  // ─── Environment popup state ───────────────────────────────────────────────
  const [envPopup, setEnvPopup] = useState(null) // { lng, lat, props }
  
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
      map.setFog({
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
  }, [mapRef.current])
  
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
  
  // Handle map click
  const handleMapClick = (event) => {
    const feature = event.features?.[0]
    console.log('Map clicked:', { feature, source: feature?.source, layerId: feature?.layer?.id })
    if (feature) {
      // For temperature dashboard, set selected segment for bottom panel
      if (dashboardMode === 'temperature' && feature.source === 'temperature-segments') {
        onSegmentSelect?.(feature.properties)
      }
      
      // For walkability dashboard, set selected route segment (no popup)
      if (dashboardMode === 'walkability' && (feature.source === 'pedestrian-routes' || feature.source === 'cycling-routes' || feature.source === 'transit-accessibility')) {
        const modeMap = {
          'pedestrian-routes': 'pedestrian',
          'cycling-routes': 'cycling',
          'transit-accessibility': 'transit'
        }
        onRouteSegmentClick?.(feature.properties, modeMap[feature.source])
        return // Don't show popup for route segments
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
        // Toggle off if clicking the same grid cell
        const clickedId = feature.properties?.grid_id
        if (envPopup && envPopup.props?.grid_id === clickedId) {
          setEnvPopup(null)
        } else {
          setEnvPopup({
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat,
            props: feature.properties
          })
        }
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
      onMapLoad(mapRef.current)
    }
  }, [mapRef.current, onMapLoad])
  
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
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        preserveDrawingBuffer={true}
        interactiveLayerIds={[
          'businesses-points-layer',
          'businesses-ratings-layer',
          'businesses-amenities-layer',
          'businesses-categories-layer',
          'survey-opinions-layer',
          'stalls-opinions-layer',
          'properties-sales-layer',
          'network-layer',
          'pedestrian-layer',
          'cycling-layer',
          'pedestrian-routes-layer',
          'cycling-routes-layer',
          'transit-accessibility-layer',
          'bus-stops-layer',
          'train-station-fill',
          'lighting-segments-layer',
          'mission-interventions-layer',
          'municipal-lights-layer',
          'temperature-segments-layer',
          'greenery-skyview-layer',
          'tree-canopy-layer',
          'parks-nearby-layer',
          'env-grid-fill',
          'traffic-layer',
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
              const ratingsData = ratingFilter && ratingFilter.length > 0
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
                  paint={{
                    'line-color': [
                      'interpolate',
                      ['linear'],
                      ['coalesce', ['get', 'total_trip_count'], 0],
                      0, '#08519c',
                      5, '#3182bd',
                      10, '#6baed6',
                      20, '#9ecae1',
                      30, '#fee391',
                      50, '#fec44f',
                      75, '#fe9929',
                      100, '#ec7014',
                      150, '#cc4c02',
                      200, '#d62828',
                      350, '#9d0208',
                      500, '#6a040f'
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
              paint={{
                'line-color': [
                  'interpolate',
                  ['linear'],
                  ['coalesce', ['get', 'total_trip_count'], 0],
                  0, '#08519c',
                  5, '#3182bd',
                  10, '#6baed6',
                  20, '#9ecae1',
                  30, '#fee391',
                  50, '#fec44f',
                  75, '#fe9929',
                  100, '#ec7014',
                  150, '#cc4c02',
                  200, '#d62828',
                  350, '#9d0208',
                  500, '#6a040f'
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
        
        {/* Temperature Layers */}
        {/* Surface Temperature Layer */}
        {shouldRenderCategory('surfaceTemperature') && temperatureData && (
          <Source
            id="temperature-segments"
            type="geojson"
            data={temperatureData}
          >
            <Layer
              id="temperature-segments-layer"
              type="line"
              paint={{
                'line-color': [
                  'case',
                  ['has', 'temp_percentile'],
                  [
                    'step',
                    ['get', 'temp_percentile'],
                    '#3b82f6',  // Coolest 20% (0-20%)
                    20, '#10b981',  // Cool (20-40%)
                    40, '#fbbf24',  // Average (40-60%)
                    60, '#f59e0b',  // Warm (60-80%)
                    80, '#ef4444'   // Hottest 20% (80-100%)
                  ],
                  '#4b5563'
                ],
                'line-width': 5,
                'line-opacity': 0.9
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
        {/* Greenery & Sky View Factor Layer */}
        {shouldRenderCategory('greeneryIndex') && greeneryAndSkyview && (
              <Source
                id="greenery-skyview-segments"
                type="geojson"
                data={greeneryAndSkyview}
              >
                <Layer
                  id="greenery-skyview-layer"
                  type="line"
                  paint={{
                    'line-color': [
                      'case',
                      ['==', ['get', 'vegetation_index'], null],
                      '#4b5563',
                      [
                        'step',
                        ['get', 'vegetation_index'],
                        '#8b4513',  // No Vegetation: <0.1
                        0.1, '#d4b896',  // Sparse: 0.1-0.3
                        0.3, '#bde69c',  // Moderate: 0.3-0.5
                        0.5, '#6ab04c',  // Dense: 0.5-0.7
                        0.7, '#2d7a2e'   // Very Dense: >0.7
                      ]
                    ],
                    'line-width': 5,
                    'line-opacity': 0.9
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
            
            {/* Parks Nearby Layer */}
            {shouldRenderCategory('parksNearby') && parksData && (
              <Source
                id="parks-nearby"
                type="geojson"
                data={parksData}
              >
                <Layer
                  id="parks-nearby-layer"
                  type="fill"
                  paint={{
                    'fill-color': '#10b981',
                    'fill-opacity': 0.4
                  }}
                />
                <Layer
                  id="parks-nearby-outline"
                  type="line"
                  paint={{
                    'line-color': '#059669',
                    'line-width': 2
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
        
        {/* 3D Buildings — composite tileset from dark-v11 */}
        {(() => {
          const spec = {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 14,
            filter: ['==', ['get', 'extrude'], 'true'],
            paint: {
              'fill-extrusion-color': [
                'interpolate', ['linear'], ['coalesce', ['get', 'height'], 0],
                0,   'rgba(28, 28, 30, 0.95)',
                20,  'rgba(36, 36, 38, 0.92)',
                60,  'rgba(48, 48, 50, 0.90)',
                120, 'rgba(60, 60, 62, 0.88)',
                200, 'rgba(72, 72, 74, 0.85)'
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'height'], 4],
              'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
              'fill-extrusion-opacity': 0.72,
              'fill-extrusion-vertical-gradient': true
            }
          }
          return <Layer {...spec} />
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

                  {/* City Events Mode */}
                  {(businessMode === 'events' || popupInfo?.feature?.source === 'city-events') && (() => {
                    const p = popupInfo.feature.properties || {}
                    const dateObj = p.date ? new Date(p.date + 'T00:00:00') : null
                    const formattedDate = dateObj
                      ? dateObj.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                      : p.date
                    const formattedTime = p.time ? p.time.slice(0, 5) : null
                    return (
                      <>
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
                      </>
                    )
                  })()}
                </>
              )}
              
              {dashboardMode === 'walkability' && popupInfo.feature.source !== 'bus-stops' && popupInfo.feature.source !== 'train-station' && (
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
              
              {dashboardMode === 'temperature' && (() => {
                const props = popupInfo.feature.properties
                const streetName = props.street_name || 'Street Segment'
                
                // Prepare chart data from all seasons
                const chartData = []
                const seasons = ['summer', 'autumn', 'winter', 'spring']
                const seasonColors = {
                  summer: '#ef4444',
                  autumn: '#f59e0b',
                  winter: '#3b82f6',
                  spring: '#10b981'
                }
                
                seasons.forEach(s => {
                  const seasonData = props[`${s}_temperatures`]
                  if (seasonData && Array.isArray(seasonData)) {
                    seasonData.forEach(reading => {
                      if (reading && reading.temperature_mean !== null) {
                        chartData.push({
                          date: reading.date,
                          timestamp: reading.timestamp,
                          season: s,
                          temperature: reading.temperature_mean,
                          displayDate: new Date(reading.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        })
                      }
                    })
                  }
                })
                
                // Sort by timestamp
                chartData.sort((a, b) => a.timestamp - b.timestamp)
                
                // Group by season for chart lines
                const seasonGroups = {}
                seasons.forEach(s => {
                  seasonGroups[s] = chartData.filter(d => d.season === s)
                })
                
                return (
                  <>
                    <h3>{streetName}</h3>
                    {chartData.length > 0 && (
                      <>
                        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
                          {seasons.map(s => {
                            const data = seasonGroups[s]
                            if (data.length === 0) return null
                            return (
                              <div key={s} style={{ width: '100%', height: '200px' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', color: seasonColors[s], fontSize: '0.875rem', textTransform: 'capitalize' }}>
                                  {s}
                                </h4>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3f2d" />
                                    <XAxis 
                                      dataKey="displayDate" 
                                      stroke="#a5d6a7" 
                                      tick={{ fontSize: 9 }}
                                      interval="preserveStartEnd"
                                    />
                                    <YAxis 
                                      stroke="#a5d6a7" 
                                      tick={{ fontSize: 9 }}
                                      domain={['dataMin - 2', 'dataMax + 2']}
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
                                      stroke={seasonColors[s]} 
                                      dot={{ r: 2 }}
                                      strokeWidth={2}
                                      connectNulls
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            )
                          })}
                        </div>
                        <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#a5d6a7' }}>
                          <strong>Data points:</strong> {chartData.length} readings from Landsat satellites
                        </p>
                      </>
                    )}
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

              {(dashboardMode === 'environment' || dashboardMode === 'greenery') && (() => {
                const p = popupInfo.feature.properties
                const vegIndex = parseFloat(p.vegetation_index)
                const svf = parseFloat(p.sky_view_factor)
                const shadePct = parseFloat(p.shade_coverage_pct)
                const surfTemp = parseFloat(p.surface_temp_celsius)
                return (
                  <>
                    <h3>{p.street_name || p.STR_NAME || 'Greenery Analysis'}</h3>
                    {!isNaN(vegIndex) && <p><strong>Vegetation Index:</strong> {vegIndex.toFixed(3)}</p>}
                    {!isNaN(svf) && <p><strong>Sky View Factor:</strong> {svf.toFixed(3)}</p>}
                    {!isNaN(shadePct) && <p><strong>Shade Coverage:</strong> {shadePct.toFixed(1)}%</p>}
                    {!isNaN(surfTemp) && <p><strong>Surface Temp:</strong> {surfTemp.toFixed(1)}°C</p>}
                    {p.PARK_NAME && (
                      <>
                        <p><strong>Park Name:</strong> {p.PARK_NAME}</p>
                        {p.SUB_AREA && <p><strong>Area:</strong> {p.SUB_AREA} ha</p>}
                        {p.PLAY_EQPM && <p><strong>Play Equipment:</strong> {p.PLAY_EQPM}</p>}
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </Popup>
        )}

        {/* ── Environment Grid Cell Popup (with historical charts) ───── */}
        {envPopup && (() => {
          const p = envPopup.props
          const locHistory = historyByLocation[p.grid_id] || []
          const uaqiBand = (() => {
            const v = p.uaqi ?? 0
            if (v <= 25) return { label: 'Excellent', color: '#22d3ee' }
            if (v <= 50) return { label: 'Good', color: '#34d399' }
            if (v <= 75) return { label: 'Moderate', color: '#facc15' }
            if (v <= 100) return { label: 'Poor', color: '#f97316' }
            return { label: 'Very Poor', color: '#ef4444' }
          })()

          const MiniAreaChart = ({ values, color, height = 40 }) => {
            if (!values || values.length < 2) return null
            const w = 220
            const mn = Math.min(...values), mx = Math.max(...values), r = mx - mn || 1
            const pts = values.map((v, i) => ({
              x: (i / (values.length - 1)) * w,
              y: height - 3 - ((v - mn) / r) * (height - 6)
            }))
            const lineD = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join('')
            const areaD = `${lineD}L${w},${height}L0,${height}Z`
            const last = pts[pts.length - 1]
            return (
              <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} style={{ display: 'block' }}>
                <path d={areaD} fill={color} opacity="0.15" />
                <path d={lineD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
              </svg>
            )
          }

          const uaqiHistory = locHistory.map(h => h.uaqi).filter(v => v != null)
          const pollutants = [
            { key: 'poll_o3_value', label: 'O₃', safe: 100, hKey: 'poll_o3', tip: 'Ground-level ozone — respiratory irritant' },
            { key: 'poll_no2_value', label: 'NO₂', safe: 40, hKey: 'poll_no2', tip: 'Vehicle & industrial exhaust — lung inflammation' },
            { key: 'poll_pm10_value', label: 'PM10', safe: 50, hKey: 'poll_pm10', tip: 'Coarse dust & construction particles' },
            { key: 'poll_co_value', label: 'CO', safe: 500, hKey: 'poll_co', tip: 'Carbon monoxide — reduces blood oxygen' },
            { key: 'poll_so2_value', label: 'SO₂', safe: 20, hKey: 'poll_so2', tip: 'Fossil fuel emissions — throat irritation' },
          ]

          return (
            <Popup
              longitude={envPopup.longitude}
              latitude={envPopup.latitude}
              onClose={() => setEnvPopup(null)}
              closeButton={true}
              anchor="bottom"
              maxWidth="310px"
              className="env-rich-popup"
            >
              <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#e2e8f0', padding: '2px 0' }}>
                {/* Header */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{(p.grid_id || '').replace(/_/g, ' ')}</div>
                  <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>500m Grid Cell</div>
                </div>

                {/* UAQI hero */}
                {p.uaqi != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: `1px solid ${uaqiBand.color}33` }}>
                    <div style={{ fontSize: 34, fontWeight: 800, color: uaqiBand.color, lineHeight: 1, letterSpacing: -2 }}>{p.uaqi}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: uaqiBand.color }}>{uaqiBand.label}</div>
                      {p.uaqi_dominant && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Dominant: <strong style={{ color: '#cbd5e1' }}>{p.uaqi_dominant.toUpperCase()}</strong></div>}
                    </div>
                  </div>
                )}

                {/* UAQI history chart */}
                {uaqiHistory.length > 2 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      <span>UAQI History</span>
                      <span style={{ color: '#94a3b8', textTransform: 'none', letterSpacing: 0 }}>
                        {Math.min(...uaqiHistory)}–{Math.max(...uaqiHistory)}
                      </span>
                    </div>
                    <MiniAreaChart values={uaqiHistory} color={uaqiBand.color} />
                  </div>
                )}

                {/* Pollutant rows with inline sparklines */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pollutants.map(({ key, label, safe, hKey, tip }) => {
                    const val = parseFloat(p[key])
                    if (isNaN(val)) return null
                    const pct = Math.min((val / (safe * 2)) * 100, 100)
                    const ok = val <= safe
                    const barColor = ok ? '#34d399' : '#f87171'
                    const hVals = locHistory.map(h => parseFloat(h[hKey])).filter(v => !isNaN(v))
                    return (
                      <div key={key}>
                        <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 44px', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }} title={tip}>{label}</span>
                          <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
                            <div style={{ position: 'absolute', top: -1, left: '50%', width: 1, height: 7, background: 'rgba(255,255,255,0.2)' }} title={`Safe: ${safe}`} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: barColor, textAlign: 'right' }}>{val.toFixed(1)}</span>
                        </div>
                        <div style={{ fontSize: 9, color: '#64748b', marginLeft: 42, marginTop: 1, lineHeight: 1.3 }}>{tip}</div>
                        {hVals.length > 2 && (
                          <div style={{ marginLeft: 42, marginTop: 2 }}>
                            <MiniAreaChart values={hVals} color={barColor} height={22} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Health advice */}
                {p.health_general && (
                  <div style={{ fontSize: 10, color: '#facc15', padding: '6px 8px', background: 'rgba(250,204,21,0.06)', borderRadius: 6, border: '1px solid rgba(250,204,21,0.15)', lineHeight: 1.5, marginTop: 8 }}>
                    ℹ {p.health_general}
                  </div>
                )}

                {/* View detailed analysis button */}
                {onEnvGridDetail && (
                  <button
                    onClick={() => { onEnvGridDetail(p.grid_id); setEnvPopup(null) }}
                    style={{ width: '100%', marginTop: 8, padding: '7px 0', background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 6, color: '#22d3ee', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,211,238,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,211,238,0.12)'}
                  >
                    📊 View Detailed Analysis
                  </button>
                )}
              </div>
            </Popup>
          )
        })()}
      </Map>
    </div>
  )
}

export default ExplorerMap
