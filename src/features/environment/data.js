import * as turf from '@turf/turf'
import { transformGeoJSON } from '../shared/geo'
import { fetchJson } from '../shared/http'

const SEASON_DATES = {
  summer: '2024-12-21',
  autumn: '2025-03-20',
  winter: '2025-06-21',
  spring: '2025-09-22'
}

function enrichGreenDestinationsData(destinationsData) {
  if (!destinationsData?.features?.length) return destinationsData

  return {
    ...destinationsData,
    features: destinationsData.features.map((feature) => {
      const areaM2 = Number(feature?.properties?.area_m2)
      let areaHa = Number.isFinite(areaM2) && areaM2 > 0 ? areaM2 / 10000 : null

      if (areaHa == null) {
        try {
          areaHa = turf.area(feature) / 10000
        } catch {
          areaHa = null
        }
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          area_ha: areaHa != null && Number.isFinite(areaHa) && areaHa > 0 ? Number(areaHa.toFixed(2)) : null
        }
      }
    })
  }
}

function enrichGreeneryAccessData(greeneryData) {
  if (!greeneryData?.features?.length) return greeneryData

  const validValues = greeneryData.features
    .map((feature) => Number(feature?.properties?.quality_adjusted_park_minutes))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!validValues.length) return greeneryData

  const percentileAt = (value) => {
    const lastIndex = validValues.length - 1
    if (lastIndex <= 0) return 50
    let index = validValues.findIndex((entry) => entry >= value)
    if (index < 0) index = lastIndex
    return (index / lastIndex) * 100
  }

  return {
    ...greeneryData,
    features: greeneryData.features.map((feature) => {
      const adjustedMinutes = Number(feature?.properties?.quality_adjusted_park_minutes)
      const percentile = Number.isFinite(adjustedMinutes) ? percentileAt(adjustedMinutes) : null

      return {
        ...feature,
        properties: {
          ...feature.properties,
          greenery_access_percentile: percentile != null ? Number(percentile.toFixed(2)) : null,
          greenery_access_decile: percentile != null ? Math.min(10, Math.max(1, Math.ceil(percentile / 10) || 1)) : null,
          underserved_15_min: Number.isFinite(adjustedMinutes) ? adjustedMinutes > 15 : false
        }
      }
    })
  }
}

function percentileRank(value, sortedValues) {
  if (!Number.isFinite(value) || !sortedValues.length) return null
  if (sortedValues.length === 1) return 100

  let index = sortedValues.findIndex((entry) => entry >= value)
  if (index < 0) index = sortedValues.length - 1
  return (index / (sortedValues.length - 1)) * 100
}

function relativeHeatBand(percentile) {
  if (!Number.isFinite(percentile)) return null
  if (percentile >= 90) return 'top_10'
  if (percentile >= 80) return 'top_20'
  if (percentile >= 60) return 'warm'
  if (percentile <= 20) return 'coolest_20'
  return 'middle'
}

const HEAT_RELATIVE_METRICS = [
  ['predicted_lst_c_fusion', ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c']],
  ['urban_heat_score', ['urban_heat_score']],
  ['pedestrian_heat_score', ['pedestrian_heat_score']],
  ['priority_score', ['priority_score']],
  ['retained_heat_score', ['retained_heat_score']],
  ['effective_canopy_pct', ['effective_canopy_pct']]
]

function valueFromProperties(properties, keys) {
  for (const key of keys) {
    const value = Number(properties?.[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function enrichRelativeHeatData(featureCollection, defaultMetric = 'predicted_lst_c_fusion') {
  if (!featureCollection?.features?.length) return featureCollection

  const metricValues = {}
  HEAT_RELATIVE_METRICS.forEach(([metricId, keys]) => {
    metricValues[metricId] = featureCollection.features
      .map((feature) => valueFromProperties(feature?.properties, keys))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)
  })

  return {
    ...featureCollection,
    features: featureCollection.features.map((feature) => {
      const relativeProperties = {}

      HEAT_RELATIVE_METRICS.forEach(([metricId, keys]) => {
        const value = valueFromProperties(feature?.properties, keys)
        const percentile = percentileRank(value, metricValues[metricId])
        relativeProperties[`${metricId}_relative_percentile`] = percentile != null ? Number(percentile.toFixed(2)) : null
        relativeProperties[`${metricId}_relative_band`] = relativeHeatBand(percentile)
      })

      const defaultPercentile = relativeProperties[`${defaultMetric}_relative_percentile`]
      return {
        ...feature,
        properties: {
          ...feature.properties,
          ...relativeProperties,
          heat_relative_percentile: defaultPercentile,
          heat_relative_band: relativeHeatBand(defaultPercentile)
        }
      }
    }),
    metadata: {
      ...(featureCollection.metadata || {}),
      relativeHeatMetric: defaultMetric,
      relativeHeatBands: {
        top_10: 'Top 10% hottest or highest priority',
        top_20: 'Top 20% hottest or highest priority',
        warm: 'Above-middle heat pressure',
        middle: 'Middle relative range',
        coolest_20: 'Lowest 20% relative heat pressure'
      }
    }
  }
}

function heatStreetPercentileBand(percentile) {
  if (!Number.isFinite(percentile)) return null
  if (percentile >= 90) return 'top_10'
  if (percentile >= 80) return 'top_20'
  if (percentile <= 20) return 'bottom_20'
  return 'middle'
}

function enrichHeatStreetData(heatStreetData) {
  if (!heatStreetData?.features?.length) return heatStreetData

  const pedestrianScores = heatStreetData.features
    .map((feature) => Number(feature?.properties?.mean_pedestrian_heat_score))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)

  if (!pedestrianScores.length) return heatStreetData

  return {
    ...heatStreetData,
    features: heatStreetData.features.map((feature) => {
      const pedestrianHeatScore = Number(feature?.properties?.mean_pedestrian_heat_score)
      const percentile = percentileRank(pedestrianHeatScore, pedestrianScores)
      const band = heatStreetPercentileBand(percentile)

      return {
        ...feature,
        properties: {
          ...feature.properties,
          pedestrian_heat_percentile: percentile != null ? Number(percentile.toFixed(2)) : null,
          pedestrian_heat_band: band
        }
      }
    }),
    metadata: {
      ...(heatStreetData.metadata || {}),
      heatStreetRankMetric: 'mean_pedestrian_heat_score',
      heatStreetRankBands: {
        top_10: 'Hottest 10% by pedestrian heat score',
        top_20: 'Hottest 20% by pedestrian heat score',
        middle: 'Middle 60% by pedestrian heat score',
        bottom_20: 'Coolest 20% by pedestrian heat score'
      }
    }
  }
}

function groupHeatZonesByYear(heatZonesData) {
  const enrichedHeatZones = enrichRelativeHeatData(heatZonesData, 'predicted_lst_c_fusion')
  if (!enrichedHeatZones?.features?.length) return {}

  return enrichedHeatZones.features.reduce((byYear, feature) => {
    const year = Number(feature?.properties?.analysis_year) || new Date().getFullYear()
    if (!byYear[year]) {
      byYear[year] = {
        type: 'FeatureCollection',
        features: [],
        metadata: {
          ...(enrichedHeatZones.metadata || {}),
          source: enrichedHeatZones.metadata?.source || 'climate.heat_zones',
          analysis_year: year
        }
      }
    }
    byYear[year].features.push(feature)
    return byYear
  }, {})
}

export async function loadExplorerShadeData(season, timeOfDay, shadeMonth) {
  const params = new URLSearchParams()
  params.set('hour', timeOfDay || '1400')
  if (shadeMonth) params.set('month', shadeMonth)
  return fetchJson(`/api/climate/shade?${params.toString()}`, 'Climate shade data load failed')
}

export async function loadExplorerGreeneryData() {
  const [greeneryAndSkyview, treeCanopyData, parksData, heatZonesData] = await Promise.all([
    fetchJson('/api/environment/greenery-access', 'Greenery access load failed'),
    fetchJson('/data/greenery/tree_canopy.geojson', 'Tree canopy load failed'),
    fetchJson('/api/environment/green-destinations', 'Green destinations load failed'),
    fetchJson('/api/climate/heat-zones', 'Heat zones load failed')
  ])

  return {
    greeneryAndSkyview: enrichGreeneryAccessData(greeneryAndSkyview),
    treeCanopyData: transformGeoJSON(treeCanopyData, 'EPSG:3857', 'EPSG:4326'),
    parksData: enrichGreenDestinationsData(parksData),
    ecologyHeatByYear: groupHeatZonesByYear(heatZonesData)
  }
}

export async function loadExplorerTemperatureData() {
  return enrichHeatStreetData(await fetchJson('/api/climate/heat-streets', 'Heat streets data load failed'))
}

export async function loadExplorerHeatGridData() {
  return enrichRelativeHeatData(await fetchJson('/api/climate/heat-grid', 'Climate heat grid load failed'), 'predicted_lst_c_fusion')
}

export async function loadExplorerEstimatedWindData(windDirection, windSpeedKmh) {
  const params = new URLSearchParams()
  if (windDirection) params.set('direction', windDirection)
  if (windSpeedKmh !== null && windSpeedKmh !== undefined && windSpeedKmh !== '') {
    params.set('speedKmh', String(windSpeedKmh))
  }
  const query = params.toString()
  return fetchJson(`/api/climate/est-wind${query ? `?${query}` : ''}`, 'Estimated wind data load failed')
}

export async function loadExplorerAirQualityData() {
  const historyData = await fetchJson('/api/environment/history', 'Environment history load failed')
  const rows = historyData?.rows || []

  const latestByGrid = new Map()
  rows.forEach((row) => {
    const key = row?.grid_id
    if (!key) return
    const ts = row?.hour_utc || ''
    const existing = latestByGrid.get(key)
    if (!existing || ts > (existing.hour_utc || '')) {
      latestByGrid.set(key, row)
    }
  })

  const currentRows = [...latestByGrid.values()]
    .sort((a, b) => String(a.grid_id).localeCompare(String(b.grid_id)))
    .map((row) => ({
      grid_id: row.grid_id,
      latitude: row.latitude,
      longitude: row.longitude,
      fetched_utc: row.hour_utc,
      aq_datetime: row.hour_utc,
      updated_at: row.hour_utc,
      uaqi: row.uaqi,
      uaqi_display: row.uaqi,
      uaqi_category: row.uaqi_category,
      uaqi_dominant: null,
      poll_co_value: row.poll_co,
      poll_no2_value: row.poll_no2,
      poll_o3_value: row.poll_o3,
      poll_pm10_value: row.poll_pm10,
      poll_so2_value: row.poll_so2,
      health_general: row.health_general
    }))

  return {
    currentData: {
      rows: currentRows,
      fetchedAt: historyData?.fetchedAt || new Date().toISOString(),
      source: 'environment.airquality_history (latest per grid)'
    },
    historyData
  }
}

export function buildEnvDisplayData(envHistoryData, envDate) {
  if (!envHistoryData?.rows) return null

  const dates = [...new Set(envHistoryData.rows.map((row) => row.hour_utc?.slice(0, 10)).filter(Boolean))].sort()
  const targetDate = envDate || dates[dates.length - 1]
  if (!targetDate) return null

  const dayRows = envHistoryData.rows.filter((row) => row.hour_utc?.slice(0, 10) === targetDate)
  if (dayRows.length === 0) return null

  const byGrid = {}
  dayRows.forEach((row) => {
    if (!byGrid[row.grid_id]) {
      byGrid[row.grid_id] = {
        grid_id: row.grid_id,
        latitude: row.latitude,
        longitude: row.longitude,
        uaqi: [],
        poll_co_value: [],
        poll_no2_value: [],
        poll_o3_value: [],
        poll_pm10_value: [],
        poll_so2_value: []
      }
    }

    const bucket = byGrid[row.grid_id]
    if (row.uaqi != null) bucket.uaqi.push(+row.uaqi)
    if (row.poll_co != null) bucket.poll_co_value.push(+row.poll_co)
    if (row.poll_no2 != null) bucket.poll_no2_value.push(+row.poll_no2)
    if (row.poll_o3 != null) bucket.poll_o3_value.push(+row.poll_o3)
    if (row.poll_pm10 != null) bucket.poll_pm10_value.push(+row.poll_pm10)
    if (row.poll_so2 != null) bucket.poll_so2_value.push(+row.poll_so2)
  })

  const average = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
  return {
    rows: Object.values(byGrid).map((bucket) => ({
      grid_id: bucket.grid_id,
      latitude: bucket.latitude,
      longitude: bucket.longitude,
      uaqi: average(bucket.uaqi),
      poll_co_value: average(bucket.poll_co_value),
      poll_no2_value: average(bucket.poll_no2_value),
      poll_o3_value: average(bucket.poll_o3_value),
      poll_pm10_value: average(bucket.poll_pm10_value),
      poll_so2_value: average(bucket.poll_so2_value)
    })),
    fetchedAt: targetDate
  }
}
