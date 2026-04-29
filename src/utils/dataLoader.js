/**
 * Data loading utilities
 */

const STRAVA_AGGREGATED_PATH = '/data/walkabilty/strava_metro_monthly_aggregated.geojson'

function sumValues(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0)
}

function weightedAverage(entries, valueKey, weightKey = 'total_trip_count') {
  const weighted = entries.reduce((sum, entry) => {
    const value = Number(entry?.[valueKey])
    const weight = Number(entry?.[weightKey]) || 0
    if (!Number.isFinite(value) || weight <= 0) return sum
    return sum + (value * weight)
  }, 0)

  const totalWeight = entries.reduce((sum, entry) => sum + (Number(entry?.[weightKey]) || 0), 0)
  return totalWeight > 0 ? weighted / totalWeight : 0
}

function sortStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

const VISUAL_PROMINENCE_THRESHOLDS = {
  ped: 150,
  ride: 160
}

function formatMonthLabel(monthKey) {
  const [year, month] = String(monthKey).split('-').map(Number)
  if (!year || !month) return String(monthKey)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

const STRAVA_DAYPART_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  other: 'Other'
}

function titleCaseLabel(value) {
  return String(value)
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function normalizeStravaDaypart(daypartKey) {
  const value = String(daypartKey || '').trim().toLowerCase()
  if (!value) return 'other'
  if (value.includes('morning')) return 'morning'
  if (value.includes('midday') || value.includes('afternoon')) return 'afternoon'
  if (value.includes('evening') || value.includes('night')) return 'evening'
  return value
}

export function formatStravaDaypartLabel(daypartKey) {
  const normalized = normalizeStravaDaypart(daypartKey)
  return STRAVA_DAYPART_LABELS[normalized] || titleCaseLabel(daypartKey)
}

export function summarizeStravaDayparts(daypartValues = {}) {
  const totals = new Map()

  Object.entries(daypartValues || {}).forEach(([daypartKey, value]) => {
    const normalized = normalizeStravaDaypart(daypartKey)
    const existing = totals.get(normalized) || 0
    totals.set(normalized, existing + (Number(value) || 0))
  })

  return ['morning', 'afternoon', 'evening', 'other']
    .filter(key => (totals.get(key) || 0) > 0)
    .map(key => ({
      key,
      label: formatStravaDaypartLabel(key),
      value: totals.get(key) || 0
    }))
}

function annotatePopularCorridors(features) {
  if (!features.length) return features

  const sorted = [...features].sort((a, b) => (
    (Number(b.properties?.total_trip_count) || 0) - (Number(a.properties?.total_trip_count) || 0)
  ))
  const mode = String(features[0]?.properties?.source_mode || '').toLowerCase() === 'cycling' ? 'ride' : 'ped'
  const visualThreshold = VISUAL_PROMINENCE_THRESHOLDS[mode] || 0
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.1))
  const topTripThreshold = Number(sorted[topCount - 1]?.properties?.total_trip_count) || 0
  const rankLookup = new Map()
  let previousTripCount = null
  let currentRank = 0

  sorted.forEach((feature, index) => {
    const tripCount = Number(feature.properties?.total_trip_count) || 0
    if (tripCount !== previousTripCount) {
      currentRank = index + 1
      previousTripCount = tripCount
    }
    rankLookup.set(Number(feature.properties?.edge_uid), currentRank)
  })

  return features.map((feature) => {
    const rank = rankLookup.get(Number(feature.properties?.edge_uid)) || sorted.length
    const tripCount = Number(feature.properties?.total_trip_count) || 0
    const percentile = sorted.length > 1
      ? Math.max(0, 100 - ((rank - 1) / (sorted.length - 1)) * 100)
      : 100
    const meetsTopDecile = tripCount >= topTripThreshold
    const meetsVisualThreshold = tripCount >= visualThreshold
    const isPopular = tripCount > 0 && (meetsTopDecile || meetsVisualThreshold)

    return {
      ...feature,
      properties: {
        ...feature.properties,
        corridor_rank: rank,
        corridor_percentile: Number(percentile.toFixed(1)),
        corridor_threshold_trip_count: topTripThreshold,
        corridor_visual_threshold_trip_count: visualThreshold,
        corridor_selection_method: 'inclusive_top_decile_or_visual_prominence',
        popular_corridor_flag: isPopular ? 1 : 0
      }
    }
  })
}

function buildActivityFeature(feature, statsEntries, mode) {
  const totalTripCount = sumValues(statsEntries.map(entry => entry.total_trip_count))
  if (totalTripCount <= 0) return null

  const forwardTripCount = sumValues(statsEntries.map(entry => entry.forward_trip_count))
  const reverseTripCount = sumValues(statsEntries.map(entry => entry.reverse_trip_count))
  const male = sumValues(statsEntries.map(entry => entry.male_people_count))
  const female = sumValues(statsEntries.map(entry => entry.female_people_count))
  const unknownGender = sumValues(statsEntries.map(entry => entry.unspecified_people_count))
  const commute = sumValues(statsEntries.map(entry => entry.commute_trip_count))
  const recreation = sumValues(statsEntries.map(entry => entry.leisure_trip_count))
  const totalPeople = sumValues(statsEntries.map(entry => entry.total_people_count))
  const overallAvgSpeed = weightedAverage(statsEntries, 'overall_avg_speed_mps')
  const forwardAvgSpeed = weightedAverage(statsEntries, 'forward_avg_speed_mps', 'forward_trip_count')
  const reverseAvgSpeed = weightedAverage(statsEntries, 'reverse_avg_speed_mps', 'reverse_trip_count')
  const rideCount = sumValues(statsEntries.map(entry => entry.ride_count))
  const ebikeRideCount = sumValues(statsEntries.map(entry => entry.ebike_ride_count))
  const sourceMonths = sortStrings(new Set(statsEntries.map(entry => entry._month)))
  const sourceDayparts = sortStrings(new Set(statsEntries.map(entry => entry._daypart)))

  return {
    type: 'Feature',
    geometry: feature.geometry,
    properties: {
      edgeUID: feature.properties?.edge_uid,
      osmId: feature.properties?.osm_reference_id,
      edge_uid: feature.properties?.edge_uid,
      total_trip_count: totalTripCount,
      forward_trip_count: forwardTripCount,
      reverse_trip_count: reverseTripCount,
      avg_speed: overallAvgSpeed,
      forward_average_speed_meters_per_second: forwardAvgSpeed || overallAvgSpeed,
      reverse_average_speed_meters_per_second: reverseAvgSpeed || overallAvgSpeed,
      total_trips: totalTripCount,
      total_people_count: totalPeople,
      male,
      female,
      unknown_gender: unknownGender,
      age_13_19: 0,
      age_20_34: sumValues(statsEntries.map(entry => entry.age_18_34_people_count)),
      age_35_54: sumValues(statsEntries.map(entry => entry.age_35_54_people_count)),
      age_55_64: sumValues(statsEntries.map(entry => entry.age_55_64_people_count)),
      age_65_plus: sumValues(statsEntries.map(entry => entry.age_65_plus_people_count)),
      commute,
      recreation,
      ride_count: mode === 'ride' ? rideCount : 0,
      ebike_ride_count: mode === 'ride' ? ebikeRideCount : 0,
      source_months: sourceMonths,
      source_dayparts: sourceDayparts,
      source_mode: mode === 'ride' ? 'cycling' : 'pedestrian'
    }
  }
}

export function buildStravaActivityLayers(stravaData, options = {}) {
  const features = stravaData?.features ?? []
  const requestedMonths = options.months && options.months !== 'all'
    ? new Set(Array.isArray(options.months) ? options.months : [options.months])
    : null
  const requestedDayparts = options.dayparts && options.dayparts !== 'all'
    ? new Set(Array.isArray(options.dayparts) ? options.dayparts : [options.dayparts])
    : null

  const selectedMonths = new Set()
  const selectedDayparts = new Set()
  const pedestrianFeatures = []
  const cyclingFeatures = []
  let pedestrianTrips = 0
  let cyclingTrips = 0

  features.forEach(feature => {
    const monthlyStats = feature.properties?.monthly_stats ?? {}
    const pedEntries = []
    const rideEntries = []

    Object.entries(monthlyStats).forEach(([monthKey, monthValue]) => {
      if (requestedMonths && !requestedMonths.has(monthKey)) return
      const dayparts = monthValue?.dayparts ?? {}

      Object.entries(dayparts).forEach(([daypartKey, daypartValue]) => {
        if (requestedDayparts && !requestedDayparts.has(daypartKey)) return
        selectedMonths.add(monthKey)
        selectedDayparts.add(daypartKey)

        if (daypartValue?.ped) pedEntries.push({ ...daypartValue.ped, _month: monthKey, _daypart: daypartKey })
        if (daypartValue?.ride) rideEntries.push({ ...daypartValue.ride, _month: monthKey, _daypart: daypartKey })
      })
    })

    const pedestrianFeature = buildActivityFeature(feature, pedEntries, 'ped')
    if (pedestrianFeature) {
      pedestrianTrips += pedestrianFeature.properties.total_trip_count
      pedestrianFeatures.push(pedestrianFeature)
    }

    const cyclingFeature = buildActivityFeature(feature, rideEntries, 'ride')
    if (cyclingFeature) {
      cyclingTrips += cyclingFeature.properties.total_trip_count
      cyclingFeatures.push(cyclingFeature)
    }
  })

  const months = sortStrings(selectedMonths)
  const dayparts = sortStrings(selectedDayparts)
  const enrichedPedestrianFeatures = annotatePopularCorridors(pedestrianFeatures)
  const enrichedCyclingFeatures = annotatePopularCorridors(cyclingFeatures)

  const peakStats = {
    source: 'strava_metro_monthly_aggregated.geojson',
    months,
    dayparts,
    pedestrian: {
      total_trips: pedestrianTrips,
      active_segments: pedestrianFeatures.length,
      popular_segments: enrichedPedestrianFeatures.filter(feature => feature.properties?.popular_corridor_flag === 1).length
    },
    cycling: {
      total_trips: cyclingTrips,
      active_segments: cyclingFeatures.length,
      popular_segments: enrichedCyclingFeatures.filter(feature => feature.properties?.popular_corridor_flag === 1).length
    }
  }

  return {
    pedestrian: { type: 'FeatureCollection', features: enrichedPedestrianFeatures },
    cycling: { type: 'FeatureCollection', features: enrichedCyclingFeatures },
    peakStats,
    meta: {
      months,
      dayparts
    }
  }
}

export function getStravaAvailableMonths(stravaData) {
  const months = new Set()
  ;(stravaData?.features ?? []).forEach(feature => {
    Object.keys(feature.properties?.monthly_stats ?? {}).forEach(month => months.add(month))
  })
  return sortStrings(months).map(month => ({
    key: month,
    label: formatMonthLabel(month)
  }))
}

export function filterStravaAnomaliesByMonth(anomaliesData, monthKey) {
  const features = (anomaliesData?.features ?? []).filter(feature => {
    if (!monthKey) return true
    return feature.properties?.month_start?.slice(0, 7) === monthKey
  })

  return {
    type: 'FeatureCollection',
    features
  }
}

export function buildRouteHistory(stravaData, edgeUid) {
  if (edgeUid == null) return null
  const feature = (stravaData?.features ?? []).find(item => Number(item.properties?.edge_uid) === Number(edgeUid))
  if (!feature) return null

  const monthly = []
  const dayparts = []
  const daypartTotalsMap = new Map()

  Object.entries(feature.properties?.monthly_stats ?? {}).forEach(([monthKey, monthValue]) => {
    let pedTrips = 0
    let cyclingTrips = 0
    let pedCommute = 0
    let pedLeisure = 0
    let cyclingCommute = 0
    let cyclingLeisure = 0
    let pedSpeedWeighted = 0
    let pedSpeedWeight = 0
    let cyclingSpeedWeighted = 0
    let cyclingSpeedWeight = 0
    let walkingPeople = 0
    let cyclingPeople = 0
    let male = 0
    let female = 0
    let unspecified = 0
    let age18to34 = 0
    let age35to54 = 0
    let age55to64 = 0
    let age65plus = 0
    let rideCount = 0
    let ebikeRideCount = 0

    Object.entries(monthValue?.dayparts ?? {}).forEach(([daypartKey, daypartValue]) => {
      const ped = daypartValue?.ped ?? {}
      const ride = daypartValue?.ride ?? {}
      const pedTripsValue = Number(ped.total_trip_count) || 0
      const cyclingTripsValue = Number(ride.total_trip_count) || 0
      const pedPeople = Number(ped.total_people_count) || 0
      const cyclingPeopleValue = Number(ride.total_people_count) || 0
      const maleValue = (Number(ped.male_people_count) || 0) + (Number(ride.male_people_count) || 0)
      const femaleValue = (Number(ped.female_people_count) || 0) + (Number(ride.female_people_count) || 0)
      const unspecifiedValue = (Number(ped.unspecified_people_count) || 0) + (Number(ride.unspecified_people_count) || 0)

      dayparts.push({
        month: monthKey,
        monthLabel: formatMonthLabel(monthKey),
        daypart: daypartKey,
        daypartLabel: formatStravaDaypartLabel(daypartKey),
        walkingTrips: pedTripsValue,
        cyclingTrips: cyclingTripsValue,
        walkingPeople: pedPeople,
        cyclingPeople: cyclingPeopleValue,
        totalTrips: pedTripsValue + cyclingTripsValue,
        totalPeople: pedPeople + cyclingPeopleValue,
        male: maleValue,
        female: femaleValue,
        unspecified: unspecifiedValue,
        walkingCommute: Number(ped.commute_trip_count) || 0,
        walkingLeisure: Number(ped.leisure_trip_count) || 0,
        cyclingCommute: Number(ride.commute_trip_count) || 0,
        cyclingLeisure: Number(ride.leisure_trip_count) || 0
      })

      const normalizedDaypart = normalizeStravaDaypart(daypartKey)
      const existingDaypart = daypartTotalsMap.get(normalizedDaypart) || {
        key: normalizedDaypart,
        label: formatStravaDaypartLabel(normalizedDaypart),
        walkingTrips: 0,
        cyclingTrips: 0,
        totalTrips: 0,
        walkingPeople: 0,
        cyclingPeople: 0,
        totalPeople: 0
      }
      existingDaypart.walkingTrips += pedTripsValue
      existingDaypart.cyclingTrips += cyclingTripsValue
      existingDaypart.totalTrips += pedTripsValue + cyclingTripsValue
      existingDaypart.walkingPeople += pedPeople
      existingDaypart.cyclingPeople += cyclingPeopleValue
      existingDaypart.totalPeople += pedPeople + cyclingPeopleValue
      daypartTotalsMap.set(normalizedDaypart, existingDaypart)

      pedTrips += pedTripsValue
      cyclingTrips += cyclingTripsValue
      pedCommute += Number(ped.commute_trip_count) || 0
      pedLeisure += Number(ped.leisure_trip_count) || 0
      cyclingCommute += Number(ride.commute_trip_count) || 0
      cyclingLeisure += Number(ride.leisure_trip_count) || 0
      walkingPeople += pedPeople
      cyclingPeople += cyclingPeopleValue
      male += maleValue
      female += femaleValue
      unspecified += unspecifiedValue
      age18to34 += (Number(ped.age_18_34_people_count) || 0) + (Number(ride.age_18_34_people_count) || 0)
      age35to54 += (Number(ped.age_35_54_people_count) || 0) + (Number(ride.age_35_54_people_count) || 0)
      age55to64 += (Number(ped.age_55_64_people_count) || 0) + (Number(ride.age_55_64_people_count) || 0)
      age65plus += (Number(ped.age_65_plus_people_count) || 0) + (Number(ride.age_65_plus_people_count) || 0)
      rideCount += Number(ride.ride_count) || 0
      ebikeRideCount += Number(ride.ebike_ride_count) || 0

      if (Number.isFinite(Number(ped.overall_avg_speed_mps)) && pedTripsValue > 0) {
        pedSpeedWeighted += Number(ped.overall_avg_speed_mps) * pedTripsValue
        pedSpeedWeight += pedTripsValue
      }
      if (Number.isFinite(Number(ride.overall_avg_speed_mps)) && cyclingTripsValue > 0) {
        cyclingSpeedWeighted += Number(ride.overall_avg_speed_mps) * cyclingTripsValue
        cyclingSpeedWeight += cyclingTripsValue
      }
    })

    monthly.push({
      month: monthKey,
      monthLabel: formatMonthLabel(monthKey),
      walkingTrips: pedTrips,
      cyclingTrips,
      totalTrips: pedTrips + cyclingTrips,
      walkingPeople,
      cyclingPeople,
      totalPeople: walkingPeople + cyclingPeople,
      male,
      female,
      unspecified,
      age18to34,
      age35to54,
      age55to64,
      age65plus,
      walkingCommute: pedCommute,
      walkingLeisure: pedLeisure,
      cyclingCommute,
      cyclingLeisure,
      rideCount,
      ebikeRideCount,
      walkingAvgSpeed: pedSpeedWeight > 0 ? pedSpeedWeighted / pedSpeedWeight : 0,
      cyclingAvgSpeed: cyclingSpeedWeight > 0 ? cyclingSpeedWeighted / cyclingSpeedWeight : 0
    })
  })

  monthly.sort((a, b) => a.month.localeCompare(b.month))
  dayparts.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month)
    return a.daypart.localeCompare(b.daypart)
  })
  const daypartTotals = ['morning', 'afternoon', 'evening', 'other']
    .map(key => daypartTotalsMap.get(key))
    .filter(item => item && item.totalTrips > 0)

  const totals = monthly.reduce((acc, item) => ({
    walkingTrips: acc.walkingTrips + item.walkingTrips,
    cyclingTrips: acc.cyclingTrips + item.cyclingTrips,
    totalTrips: acc.totalTrips + item.totalTrips,
    walkingPeople: acc.walkingPeople + item.walkingPeople,
    cyclingPeople: acc.cyclingPeople + item.cyclingPeople,
    totalPeople: acc.totalPeople + item.totalPeople,
    male: acc.male + item.male,
    female: acc.female + item.female,
    unspecified: acc.unspecified + item.unspecified,
    walkingCommute: acc.walkingCommute + item.walkingCommute,
    walkingLeisure: acc.walkingLeisure + item.walkingLeisure,
    cyclingCommute: acc.cyclingCommute + item.cyclingCommute,
    cyclingLeisure: acc.cyclingLeisure + item.cyclingLeisure,
    rideCount: acc.rideCount + item.rideCount,
    ebikeRideCount: acc.ebikeRideCount + item.ebikeRideCount,
    age18to34: acc.age18to34 + item.age18to34,
    age35to54: acc.age35to54 + item.age35to54,
    age55to64: acc.age55to64 + item.age55to64,
    age65plus: acc.age65plus + item.age65plus
  }), {
    walkingTrips: 0,
    cyclingTrips: 0,
    totalTrips: 0,
    walkingPeople: 0,
    cyclingPeople: 0,
    totalPeople: 0,
    male: 0,
    female: 0,
    unspecified: 0,
    walkingCommute: 0,
    walkingLeisure: 0,
    cyclingCommute: 0,
    cyclingLeisure: 0,
    rideCount: 0,
    ebikeRideCount: 0,
    age18to34: 0,
    age35to54: 0,
    age55to64: 0,
    age65plus: 0
  })

  const strongestMonth = monthly.reduce((best, item) => {
    if (!best || item.totalTrips > best.totalTrips) return item
    return best
  }, null)

  return {
    edgeUid: feature.properties?.edge_uid,
    osmReferenceId: feature.properties?.osm_reference_id,
    geometry: feature.geometry,
    monthly,
    dayparts,
    daypartTotals,
    summary: {
      ...totals,
      strongestMonth: strongestMonth?.monthLabel || null,
      strongestMonthTrips: strongestMonth?.totalTrips || 0,
      monthsTracked: monthly.length
    }
  }
}

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
  const [network, stravaAggregated] = await Promise.all([
    fetch('/data/processed/walkability/network_connectivity.geojson').then(r => r.json()),
    fetch(STRAVA_AGGREGATED_PATH).then(r => r.json())
  ])

  const { pedestrian, cycling, peakStats, meta } = buildStravaActivityLayers(stravaAggregated)
  
  return { 
    network,      // Network connectivity - street segments with analysis
    pedestrian,   // Aggregated walking/running activity derived from Strava source
    cycling,      // Aggregated cycling activity derived from Strava source
    peakStats,    // Source summary for available active-mobility data
    stravaAggregated,
    meta
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
  const [rankedResponse, steepnessResponse] = await Promise.all([
    fetch('/data/processed/walkability/walkability_ranked.geojson'),
    fetch('/api/transport/road-steepness')
  ])
  if (!rankedResponse.ok) throw new Error('Failed to load walkability_ranked.geojson')
  if (!steepnessResponse.ok) throw new Error('Failed to load road steepness from API')

  const ranked = await rankedResponse.json()
  const steepness = await steepnessResponse.json()
  return applyRoadSteepnessToWalkability(ranked, steepness)
}

function applyRoadSteepnessToWalkability(ranked, steepness) {
  if (!ranked?.features?.length || !steepness?.features?.length) return ranked

  const steepnessIndex = steepness.features.map((feature) => ({
    feature,
    centroid: featureCentroid(feature.geometry)
  }))

  let matched = 0
  ranked.features.forEach((feature) => {
    const centroid = featureCentroid(feature.geometry)
    let bestFeature = null
    let bestDistance = Infinity

    steepnessIndex.forEach((candidate) => {
      const distance = haversineDistance(centroid, candidate.centroid)
      if (distance < bestDistance) {
        bestDistance = distance
        bestFeature = candidate.feature
      }
    })

    if (!bestFeature || bestDistance > 12) return
    matched += 1
    applySteepnessScore(feature.properties, bestFeature.properties)
  })

  const dayRanked = [...ranked.features].sort((a, b) => b.properties.kpi_day - a.properties.kpi_day)
  const nightRanked = [...ranked.features].sort((a, b) => b.properties.kpi_night - a.properties.kpi_night)
  dayRanked.forEach((feature, index) => { feature.properties.day_rank = index + 1 })
  nightRanked.forEach((feature, index) => { feature.properties.night_rank = index + 1 })

  return {
    ...ranked,
    metadata: {
      ...(ranked.metadata || {}),
      roadSteepnessSource: '/api/transport/road-steepness',
      roadSteepnessMatchedFeatures: matched
    }
  }
}

function applySteepnessScore(properties, steepnessProperties) {
  const rawSlope = gradePenalty(steepnessProperties)
  const slopeBuffer = (properties.retail_poi || 0) >= 5 ? 0.5 : 1
  const slopeScore = clamp01(rawSlope * slopeBuffer + (1 - slopeBuffer))
  const trafficMultiplier = properties.congestion_level === 'Unknown'
    ? 1.15
    : properties.congestion_level === 'Med'
      ? 0.92
      : properties.congestion_level === 'High'
        ? 0.8
        : 1

  properties.slope_penalty = round2(rawSlope)
  properties.net_grade_pct = finiteRound(steepnessProperties.net_grade_pct)
  properties.mean_abs_grade_pct = finiteRound(steepnessProperties.mean_abs_grade_pct)
  properties.uphill_from_elev_m = finiteRound(steepnessProperties.uphill_from_elev_m)
  properties.uphill_to_elev_m = finiteRound(steepnessProperties.uphill_to_elev_m)
  properties._s_slope = round2(slopeScore)
  properties.kpi_day = round2(Math.min(1, (
    0.35 * slopeScore
    + 0.25 * (properties._s_shade || 0)
    + 0.15 * (properties._s_temp || 0)
    + 0.25 * (properties._s_retail || 0)
  ) * trafficMultiplier))
  properties.kpi_night = round2(
    0.45 * (properties._s_lux || 0)
    + 0.30 * (properties._s_night || 0)
    + 0.25 * slopeScore
  )
}

function gradePenalty(properties) {
  const grade = Math.abs(Number(properties?.net_grade_pct ?? properties?.mean_abs_grade_pct))
  if (!Number.isFinite(grade)) return 1
  return clamp01(1 - Math.min(grade, 14) / 18)
}

function featureCentroid(geometry) {
  const coords = geometry?.type === 'MultiLineString'
    ? geometry.coordinates.flat()
    : geometry?.coordinates || []
  if (!coords.length) return [0, 0]
  return [
    coords.reduce((sum, coord) => sum + coord[0], 0) / coords.length,
    coords.reduce((sum, coord) => sum + coord[1], 0) / coords.length
  ]
}

function haversineDistance(a, b) {
  const toRad = (value) => value * Math.PI / 180
  const earthRadiusM = 6371000
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusM * Math.asin(Math.sqrt(x))
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function finiteRound(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? round2(numeric) : null
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
