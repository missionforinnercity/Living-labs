/**
 * Narrative Tour Scoring System
 * Combines multiple datasets to score street segments for narrative experiences
 */

/**
 * Score street segments for "Perfect Evening Walk" narrative
 * Criteria:
 * - Well-lit streets (avg_illuminance > 20 lux)
 * - High pedestrian activity 
 * - Nearby cafes/restaurants with outdoor seating
 * - Comfortable shade/temperature
 */
export function scoreEveningWalk(roadSegments, poiData, shadeData, walkabilityData) {
  if (!roadSegments || !roadSegments.features) return roadSegments
  
  return {
    ...roadSegments,
    features: roadSegments.features.map(segment => {
      let score = 0
      const props = segment.properties
      
      // Lighting score (0-40 points)
      // Evening walks need good lighting (20-50 lux optimal)
      if (props.avg_illuminance) {
        const lux = parseFloat(props.avg_illuminance)
        if (lux >= 20 && lux <= 80) {
          score += 40 // Perfect evening lighting
        } else if (lux >= 10 && lux < 20) {
          score += 25 // Adequate
        } else if (lux > 80) {
          score += 30 // Very bright
        } else {
          score += 5 // Too dark
        }
      }
      
      // Walkability score (0-30 points)
      // Based on pedestrian activity 
      if (props.ped_count) {
        const pedCount = parseFloat(props.ped_count)
        score += Math.min(30, (pedCount / 100) * 30)
      }
      
      // Safety score (0-20 points)
      // Well-maintained, well-lit streets score higher
      if (props.pct_above_5lux) {
        score += Math.min(20, (parseFloat(props.pct_above_5lux) / 100) * 20)
      }
      
      // Comfort score (0-10 points)
      // Temperature and shade factor
      if (props.surface_temp_celsius) {
        const temp = parseFloat(props.surface_temp_celsius)
        if (temp >= 15 && temp <= 25) {
          score += 10 // Perfect temperature
        } else if (temp > 25 && temp <= 30) {
          score += 5 // Warm but tolerable
        }
      }
      
      return {
        ...segment,
        properties: {
          ...props,
          narrative_score: Math.round(score),
          narrative_category: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
        }
      }
    })
  }
}

/**
 * Score streets for "Morning Coffee Run" narrative
 * Criteria:
 * - Nearby coffee shops, cafes, bakeries
 * - Pleasant walkability (lower traffic OK in morning)
 * - Outdoor seating availability
 * - Morning sun exposure (moderate shade)
 */
export function scoreMorningCoffee(roadSegments, poiData) {
  if (!roadSegments || !roadSegments.features) return roadSegments
  
  return {
    ...roadSegments,
    features: roadSegments.features.map(segment => {
      let score = 0
      const props = segment.properties
      
      // TODO: Calculate spatial proximity to coffee shops
      // This would require spatial indexing or turf.js
      
      // Walkability (0-40 points)
      if (props.ped_count) {
        score += Math.min(40, (parseFloat(props.ped_count) / 80) * 40)
      }
      
      // Lighting not as critical in morning (0-20 points)
      if (props.avg_illuminance) {
        score += Math.min(20, (parseFloat(props.avg_illuminance) / 30) * 20)
      }
      
      // Sun exposure (0-40 points)
      if (props.vegetation_index) {
        // Moderate vegetation for pleasant morning walk
        const veg = parseFloat(props.vegetation_index)
        if (veg >= 0.3 && veg <= 0.7) {
          score += 40
        } else {
          score += 20
        }
      }
      
      return {
        ...segment,
        properties: {
          ...props,
          narrative_score: Math.round(score),
          narrative_category: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
        }
      }
    })
  }
}

/**
 * Score streets for "Safe Cycling Route" narrative
 * Criteria:
 * - High cycling activity
 * - Good street lighting for visibility
 * - Lower pedestrian density (less conflict)
 * - Connected network (betweenness centrality)
 */
export function scoreCyclingRoute(roadSegments, walkabilityData) {
  if (!roadSegments || !roadSegments.features) return roadSegments
  
  return {
    ...roadSegments,
    features: roadSegments.features.map(segment => {
      let score = 0
      const props = segment.properties
      
      // Cycling activity (0-40 points)
      if (props.cycle_count || props.bike_count) {
        const cycleCount = parseFloat(props.cycle_count || props.bike_count || 0)
        score += Math.min(40, (cycleCount / 150) * 40)
      }
      
      // Visibility/lighting (0-30 points)
      if (props.avg_illuminance) {
        score += Math.min(30, (parseFloat(props.avg_illuminance) / 40) * 30)
      }
      
      // Network connectivity (0-30 points)
      if (props.betweenness || props.connectivity) {
        const betweenness = parseFloat(props.betweenness || props.connectivity || 0)
        score += Math.min(30, (betweenness / 1000) * 30)
      }
      
      return {
        ...segment,
        properties: {
          ...props,
          narrative_score: Math.round(score),
          narrative_category: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
        }
      }
    })
  }
}

/**
 * Score streets for "Shaded Afternoon Stroll" narrative
 * Criteria:
 * - High shade coverage (60%+)
 * - Lower surface temperature
 * - Green vegetation access
 * - Nearby amenities
 */
export function scoreAfternoonShade(roadSegments, shadeData) {
  if (!roadSegments || !roadSegments.features) return roadSegments
  
  return {
    ...roadSegments,
    features: roadSegments.features.map(segment => {
      let score = 0
      const props = segment.properties
      
      // Shade coverage (0-50 points)
      if (props.shade_coverage_pct) {
        const shade = parseFloat(props.shade_coverage_pct)
        if (shade >= 60) {
          score += 50
        } else {
          score += (shade / 60) * 50
        }
      }
      
      // Temperature comfort (0-30 points)
      if (props.surface_temp_celsius) {
        const temp = parseFloat(props.surface_temp_celsius)
        if (temp <= 25) {
          score += 30
        } else if (temp <= 30) {
          score += 20
        } else if (temp <= 35) {
          score += 10
        }
      }
      
      // Greenery (0-20 points)
      if (props.vegetation_index) {
        score += Math.min(20, parseFloat(props.vegetation_index) * 20)
      }
      
      return {
        ...segment,
        properties: {
          ...props,
          narrative_score: Math.round(score),
          narrative_category: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
        }
      }
    })
  }
}

/**
 * Score streets for "Vibrant Retail District" narrative
 * Criteria:
 * - High density of retail/restaurants/cafes
 * - Outdoor seating availability
 * - High pedestrian activity
 * - Well-lit for evening shopping
 */
export function scoreRetailDistrict(roadSegments, poiData, walkabilityData) {
  if (!roadSegments || !roadSegments.features) return roadSegments
  
  return {
    ...roadSegments,
    features: roadSegments.features.map(segment => {
      let score = 0
      const props = segment.properties
      
      // Pedestrian activity (0-40 points)
      if (props.ped_count) {
        score += Math.min(40, (parseFloat(props.ped_count) / 150) * 40)
      }
      
      // Lighting (0-30 points) - retail areas need good lighting
      if (props.avg_illuminance) {
        score += Math.min(30, (parseFloat(props.avg_illuminance) / 50) * 30)
      }
      
      // Network centrality (0-30 points) - retail clusters on main routes
      if (props.betweenness) {
        score += Math.min(30, (parseFloat(props.betweenness) / 1500) * 30)
      }
      
      return {
        ...segment,
        properties: {
          ...props,
          narrative_score: Math.round(score),
          narrative_category: score >= 70 ? 'excellent' : score >= 50 ? 'good' : score >= 30 ? 'fair' : 'poor'
        }
      }
    })
  }
}

/**
 * Get color expression for narrative scored segments
 */
export function getNarrativeColorExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'narrative_score'],
    0, '#d73027',      // Poor (red)
    30, '#fc8d59',     // Fair (orange)
    50, '#fee08b',     // Good (yellow)
    70, '#91cf60',     // Excellent (light green)
    100, '#1a9850'     // Perfect (dark green)
  ]
}

/**
 * Get line width expression based on narrative score
 */
export function getNarrativeWidthExpression() {
  return [
    'interpolate',
    ['linear'],
    ['get', 'narrative_score'],
    0, 2,
    50, 4,
    100, 6
  ]
}
