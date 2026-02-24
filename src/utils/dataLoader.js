/**
 * Data loading utilities
 */

export async function loadShadeData(season, timeOfDay) {
  const path = `/data/processed/shade/${season}/2025-${getSeasonDate(season)}_${timeOfDay}.geojson`
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load shade data: ${path}`)
  }
  return await response.json()
}

export async function loadLightingData() {
  const [fixtures, projects, roadSegments, streetLights] = await Promise.all([
    fetch('/data/processed/lighting/lighting.geojson').then(r => r.json()),
    fetch('/data/processed/lighting/streetLighting.json').then(r => r.json()),
    fetch('/data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson').then(r => r.json()),
    fetch('/data/lighting/new_Lights/Street_lights.geojson').then(r => r.json())
  ])
  
  return { 
    fixtures,      // Individual streetlight fixtures (4387 points)
    projects,      // Lighting projects (5 multipoint features)
    roadSegments,  // Road segments with avg lumens - PRIMARY LAYER for lighting analysis (with nearby_lights_count)
    streetLights   // Individual street lights with operational status
  }
}

export async function loadBusinessData() {
  const [poi, properties, stalls, survey] = await Promise.all([
    fetch('/data/processed/business/POI_simplified.geojson').then(r => r.json()),
    fetch('/data/processed/business/properties_consolidated.geojson').then(r => r.json()),
    fetch('/data/processed/business/streetStalls.geojson').then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] })),
    fetch('/data/processed/business/survey_data.geojson').then(r => r.json()).catch(() => ({ type: 'FeatureCollection', features: [] }))
  ])
  
  return { 
    poi,           // Detailed Google POI data with ratings, opening times, outdoor seating
    properties,    // Property sales and transfers
    stalls,        // Informal street stalls with city improvement opinions
    survey         // Formal business survey with city opinions
  }
}

export async function loadWalkabilityData() {
  const [network, pedestrian, cycling, peakStats] = await Promise.all([
    fetch('/data/processed/walkability/network_connectivity.geojson').then(r => r.json()),
    fetch('/data/processed/walkability/pedestrian_month_all.geojson').then(r => r.json()),
    fetch('/data/processed/walkability/cycling_month_all.geojson').then(r => r.json()),
    fetch('/data/processed/walkability/peak_statistics.json').then(r => r.json())
  ])
  
  return { 
    network,      // Network connectivity - street segments with analysis
    pedestrian,   // Strava pedestrian activity by segment
    cycling,      // Strava cycling activity by segment
    peakStats     // Peak activity statistics
  }
}

export async function loadParksData () {
  const res = await fetch('/data/greenery/parks_nearby.geojson')
  if (!res.ok) throw new Error('Failed to load parks data')
  return res.json()
}

export async function loadRoadSegmentsData () {
  const res = await fetch('/data/roads/segments.geojson')
  if (!res.ok) throw new Error('Failed to load road segments')
  return res.json()
}

export async function loadWalkabilityRanked () {
  const r = await fetch('/data/processed/walkability/walkability_ranked.geojson')
  if (!r.ok) throw new Error('Failed to load walkability_ranked.geojson')
  return r.json()
}

export async function loadTreeCanopyData () {
  const res = await fetch('/data/greenery/tree_canopy.geojson')
  if (!res.ok) throw new Error('Failed to load tree canopy data')
  return res.json()
}

export async function loadCCIDBoundary () {
  const res = await fetch('/data/DEM/CCID_boundary.geojson')
  if (!res.ok) throw new Error('Failed to load CCID boundary')
  return res.json()
}

/**
 * Load all friction-layer datasets needed by the True Effort 15-min engine.
 * Returns { greeneryFC, lightingRoadsFC, networkFC, surfaceTempFC, canopyFC }
 */
export async function loadFrictionData () {
  const [greenery, lightingRoads, network, surfaceTemp, canopy] = await Promise.all([
    fetch('/data/greenery/greenryandSkyview.geojson').then(r => r.json()),
    fetch('/data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson').then(r => r.json()),
    fetch('/data/processed/walkability/network_connectivity.geojson').then(r => r.json()),
    fetch('/data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson').then(r => r.json()),
    fetch('/data/greenery/tree_canopy.geojson').then(r => r.json()),
  ])
  return { greeneryFC: greenery, lightingRoadsFC: lightingRoads, networkFC: network, surfaceTempFC: surfaceTemp, canopyFC: canopy }
}

function getSeasonDate(season) {
  const dates = {
    summer: '12-21',
    autumn: '03-20',
    winter: '06-21',
    spring: '09-22'
  }
  return dates[season] || dates.summer
}

/**
 * Color scales for different metrics
 */
export const colorScales = {
  shade: {
    shade_coverage_pct: [
      [0, '#fee5d9'],
      [20, '#fcbba1'],
      [40, '#fc9272'],
      [60, '#fb6a4a'],
      [80, '#de2d26'],
      [100, '#a50f15']
    ],
    surface_temp_celsius: [
      [15, '#2166ac'],
      [20, '#4393c3'],
      [25, '#92c5de'],
      [30, '#fddbc7'],
      [35, '#f4a582'],
      [40, '#d6604d'],
      [45, '#b2182b']
    ],
    vegetation_index: [
      [0, '#fff5f0'],
      [0.2, '#fee0d2'],
      [0.4, '#c7e9c0'],
      [0.6, '#74c476'],
      [0.8, '#31a354'],
      [1.0, '#006d2c']
    ],
    comfort_level: {
      'Comfortable': '#31a354',
      'Moderate Heat': '#feb24c',
      'Hot': '#f03b20',
      'Extreme Heat': '#bd0026'
    }
  },
  lighting: {
    mean_lux: [
      [0, '#081d58'],
      [50, '#253494'],
      [100, '#225ea8'],
      [150, '#41b6c4'],
      [200, '#a1dab4'],
      [250, '#ffffcc']
    ]
  },
  walkability: {
    betweenness: [
      [0, '#f7fbff'],
      [100, '#deebf7'],
      [500, '#9ecae1'],
      [1000, '#4292c6'],
      [1500, '#2171b5'],
      [2000, '#084594']
    ],
    trip_count: [
      [0, '#08519c'],      // Deep blue - even minimal routes are visible
      [5, '#3182bd'],      // Bright blue
      [10, '#6baed6'],     // Sky blue - P50 for pedestrian  
      [20, '#9ecae1'],     // Light blue
      [30, '#fee391'],     // Bright yellow - P50 for cycling
      [50, '#fec44f'],     // Gold
      [75, '#fe9929'],     // Orange - P90 for pedestrian
      [100, '#ec7014'],    // Deep orange - P75 for cycling
      [150, '#cc4c02'],    // Orange-red
      [200, '#d62828'],    // Bright red
      [350, '#9d0208'],    // Deep red - P90 for cycling
      [500, '#6a040f']     // Very dark red - extremely busy
    ]
  }
}

/**
 * Create Mapbox expression from color scale
 */
export function createColorExpression(property, scale) {
  if (typeof scale === 'object' && !Array.isArray(scale)) {
    // Categorical (like comfort_level)
    const expression = ['match', ['get', property]]
    Object.entries(scale).forEach(([key, color]) => {
      expression.push(key, color)
    })
    expression.push('#cccccc') // Default color
    return expression
  }
  
  // Continuous scale
  const expression = ['interpolate', ['linear'], ['get', property]]
  scale.forEach(([value, color]) => {
    expression.push(value, color)
  })
  return expression
}

/**
 * Filter POI by time of day (uses opening hours and business type heuristics)
 */
export function filterPOIByTime(poiData, hour) {
  const timeCategories = {
    morning: ['coffee_shop', 'cafe', 'bakery', 'breakfast_restaurant'],
    lunch: ['restaurant', 'cafe', 'food'],
    afternoon: ['restaurant', 'shopping_mall', 'store', 'museum', 'park'],
    evening: ['restaurant', 'bar', 'cafe', 'movie_theater'],
    night: ['bar', 'night_club', 'convenience_store', '24_hour']
  }
  
  let category = 'afternoon'
  if (hour >= 6 && hour < 11) category = 'morning'
  else if (hour >= 11 && hour < 14) category = 'lunch'
  else if (hour >= 14 && hour < 17) category = 'afternoon'
  else if (hour >= 17 && hour < 22) category = 'evening'
  else if (hour >= 22 || hour < 6) category = 'night'
  
  const relevantTypes = timeCategories[category]
  
  return {
    ...poiData,
    features: poiData.features.filter(f => 
      relevantTypes.some(type => 
        f.properties.primaryType?.toLowerCase().includes(type)
      )
    )
  }
}

/**
 * Create expression for POI markers with outdoor seating highlighted
 */
export function createPOIExpression() {
  return [
    'case',
    ['==', ['get', 'outdoorSeating'], 'True'],
    '#2ecc71', // Green for outdoor seating
    [
      'match',
      ['get', 'primaryType'],
      'restaurant', '#e74c3c',
      'cafe', '#3498db',
      'coffee_shop', '#1abc9c',
      'bar', '#9b59b6',
      'hotel', '#f39c12',
      'store', '#e67e22',
      '#95a5a6' // Default gray
    ]
  ]
}

/**
 * Create expression for road segment lighting (avg lumens)
 */
export function createRoadLightingExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'avg_illuminance'],
    0, '#0a0a0a',      // Very dark (0 lux)
    5, '#1a1a2e',      // Dark streets (5 lux)
    10, '#2d3561',     // Poorly lit (10 lux)
    20, '#51557e',     // Low light (20 lux)
    30, '#816797',     // Moderate (30 lux)
    50, '#b388eb',     // Good lighting (50 lux)
    100, '#ffd23f'     // Excellent (100+ lux)
  ]
}

/**
 * Create expression for walkability segments (pedestrian count from Strava)
 */
export function createWalkabilitySegmentExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'ped_count'],
    0, '#ecf0f1',      // No activity
    10, '#3498db',     // Low
    50, '#2ecc71',     // Moderate
    100, '#f39c12',    // High
    200, '#e74c3c'     // Very high
  ]
}

/**
 * Score street segments for "perfect evening walk" narrative
 * Combines: well-lit streets + walkability + shade + nearby cafes/restaurants
 */
export function scoreEveningWalkSegments(lightingSegments, walkabilitySegments, poiData, shadeData) {
  // This is a placeholder - implement actual scoring logic
  // Score should combine:
  // - avg_illuminance > 20 (well-lit for evening)
  // - High pedestrian activity
  // - Nearby POI with outdoor seating
  // - Shade coverage for comfort
  
  return lightingSegments.features.map(segment => ({
    ...segment,
    properties: {
      ...segment.properties,
      evening_walk_score: calculateEveningScore(segment.properties)
    }
  }))
}

function calculateEveningScore(props) {
  let score = 0
  
  // Lighting (0-40 points)
  if (props.avg_illuminance) {
    score += Math.min(40, (props.avg_illuminance / 50) * 40)
  }
  
  // Walkability would be added here if we join datasets
  // POI proximity would be calculated with spatial join
  // Shade for comfort
  
  return Math.round(score)
}
