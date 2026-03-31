import { transformGeoJSON } from '../shared/geo'
import { fetchJson } from '../shared/http'

const SEASON_DATES = {
  summer: '2024-12-21',
  autumn: '2025-03-20',
  winter: '2025-06-21',
  spring: '2025-09-22'
}

function enrichTemperatureData(data) {
  if (!data?.features?.length) return data

  const allMaxTemps = []

  const featuresWithSummary = data.features.map((feature) => {
    const props = feature.properties || {}
    const processedProps = { ...props }
    const allReadings = []

    ;['summer', 'autumn', 'winter', 'spring'].forEach((season) => {
      const seasonData = props[`${season}_temperatures`]
      if (!Array.isArray(seasonData)) return

      seasonData.forEach((reading) => {
        if (reading && reading.temperature_mean !== null) {
          allReadings.push(reading.temperature_mean)
        }
      })
    })

    if (allReadings.length > 0) {
      processedProps.overall_max_temp = Math.max(...allReadings)
      processedProps.overall_min_temp = Math.min(...allReadings)
      processedProps.overall_avg_temp = allReadings.reduce((sum, value) => sum + value, 0) / allReadings.length
      allMaxTemps.push(processedProps.overall_max_temp)
    }

    return {
      ...feature,
      properties: processedProps
    }
  })

  if (!allMaxTemps.length) {
    return { ...data, features: featuresWithSummary }
  }

  const minTemp = Math.min(...allMaxTemps)
  const maxTemp = Math.max(...allMaxTemps)

  return {
    ...data,
    features: featuresWithSummary.map((feature) => ({
      ...feature,
      properties: feature.properties.overall_max_temp === undefined
        ? feature.properties
        : {
            ...feature.properties,
            temp_percentile: maxTemp === minTemp
              ? 50
              : ((feature.properties.overall_max_temp - minTemp) / (maxTemp - minTemp)) * 100
          }
    }))
  }
}

export async function loadExplorerShadeData(season, timeOfDay) {
  const date = SEASON_DATES[season] || SEASON_DATES.summer
  return fetchJson(`/data/processed/shade/${season}/${date}_${timeOfDay}.geojson`, 'Shade data load failed')
}

export async function loadExplorerGreeneryData() {
  const [greeneryAndSkyview, treeCanopyData, parksData, ...ecologyYears] = await Promise.all([
    fetchJson('/data/greenery/greenryandSkyview.geojson', 'Greenery load failed'),
    fetchJson('/data/greenery/tree_canopy.geojson', 'Tree canopy load failed'),
    fetchJson('/data/greenery/parks_nearby.geojson', 'Parks load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2020.geojson', 'Ecology 2020 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2021.geojson', 'Ecology 2021 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2022.geojson', 'Ecology 2022 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2023.geojson', 'Ecology 2023 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2024.geojson', 'Ecology 2024 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2025.geojson', 'Ecology 2025 load failed'),
    fetchJson('/data/greenery/ecology_analysis/cpt_cbd_ecology_2026.geojson', 'Ecology 2026 load failed')
  ])

  return {
    greeneryAndSkyview,
    treeCanopyData: transformGeoJSON(treeCanopyData, 'EPSG:3857', 'EPSG:4326'),
    parksData,
    ecologyHeatByYear: {
      2020: ecologyYears[0],
      2021: ecologyYears[1],
      2022: ecologyYears[2],
      2023: ecologyYears[3],
      2024: ecologyYears[4],
      2025: ecologyYears[5],
      2026: ecologyYears[6]
    }
  }
}

export async function loadExplorerTemperatureData() {
  const data = await fetchJson('/data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson', 'Temperature data load failed')
  return enrichTemperatureData(data)
}

export async function loadExplorerAirQualityData() {
  const [currentResp, historyResp] = await Promise.all([
    fetch('/api/environment/current'),
    fetch('/api/environment/history')
  ])

  return {
    currentData: currentResp.ok ? await currentResp.json() : null,
    historyData: historyResp.ok ? await historyResp.json() : null
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
