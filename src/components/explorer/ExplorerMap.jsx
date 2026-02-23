import React, { useEffect, useRef, useState } from 'react'
import Map, { Source, Layer, Popup } from 'react-map-gl'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
  visibleLayers,
  layerStack = [],
  activeCategory,
  onMapLoad,
  opinionSource,
  amenitiesFilters,
  categoriesFilters,
  selectedSegment,
  onSegmentSelect,
  onRouteSegmentClick,
  trafficData,
  trafficScenario = 'WORK_MORNING',
  eventsData,
  eventsMonth
}) => {
  const mapRef = useRef()
  
  // Helper function to check if a category should be rendered
  const shouldRenderCategory = (categoryId) => {
    // Check if this category is in the layer stack (either as active or locked)
    return layerStack.some(layer => layer.id === categoryId) || activeCategory === categoryId
  }
  
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
    pitch: 0,
    bearing: 0
  })
  
  const [selectedFeature, setSelectedFeature] = useState(null)
  const [popupInfo, setPopupInfo] = useState(null)
  
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
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v10"
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
            {shouldRenderCategory('businessRatings') && businessesData && (
              <Source
                id="businesses-ratings"
                type="geojson"
                data={businessesData}
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
            )}
            
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
              
              return (
                <Source
                  id="network-betweenness"
                  type="geojson"
                  data={networkData}
                >
                  <Layer
                    id="network-betweenness-layer"
                    type="line"
                    paint={{
                      'line-color': [
                        'interpolate',
                        ['linear'],
                        ['coalesce', ['get', config.field], 0],
                        config.scale[0], colors[0],
                        config.scale[1], colors[1],
                        config.scale[2], colors[2],
                        config.scale[3], colors[3],
                        config.scale[4], colors[4],
                        config.scale[5], colors[5],
                        config.scale[6], colors[6]
                      ],
                      'line-width': [
                        'interpolate',
                        ['linear'],
                        ['coalesce', ['get', config.field], 0],
                        config.scale[0], 2,
                        config.scale[2], 3,
                        config.scale[4], 5,
                        config.scale[5], 7,
                        config.scale[6], 10
                      ],
                      'line-opacity': [
                        'interpolate',
                        ['linear'],
                        ['coalesce', ['get', config.field], 0],
                        config.scale[0], 0.6,
                        config.scale[3], 0.8,
                        config.scale[5], 0.9,
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
              {/* Glow / halo underneath */}
              <Layer
                id="traffic-layer-glow"
                type="line"
                paint={{
                  'line-color': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0,    '#1e3a8a',
                    0.3,  '#2563eb',
                    0.6,  '#10b981',
                    1.0,  '#fbbf24',
                    1.3,  '#f59e0b',
                    1.6,  '#ef4444',
                    2.0,  '#7f1d1d'
                  ],
                  'line-width': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0, 6, 1.0, 10, 2.0, 14
                  ],
                  'line-opacity': 0.2,
                  'line-blur': 4
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
                    0,    '#1e3a8a',
                    0.3,  '#2563eb',
                    0.6,  '#10b981',
                    1.0,  '#fbbf24',
                    1.3,  '#f59e0b',
                    1.6,  '#ef4444',
                    2.0,  '#7f1d1d'
                  ],
                  'line-width': [
                    'interpolate', ['linear'],
                    ['coalesce', ['get', field], 0],
                    0, 2, 0.6, 3, 1.0, 4, 1.6, 6, 2.0, 8
                  ],
                  'line-opacity': 0.92
                }}
              />
            </Source>
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

              {dashboardMode === 'greenery' && (() => {
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
      </Map>
    </div>
  )
}

export default ExplorerMap
