import proj4 from 'proj4'

proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

const SEASON_DATES = {
  summer: '2024-12-21',
  autumn: '2025-03-20',
  winter: '2025-06-21',
  spring: '2025-09-22'
}

async function fetchJson(path, errorLabel) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function transformGeoJSON(geojson, sourceCRS, targetCRS) {
  if (!geojson || !geojson.features) return geojson

  const transform = proj4(sourceCRS, targetCRS)

  const transformCoordinates = (coords, depth) => {
    if (depth === 0) return transform.forward(coords)
    return coords.map((coord) => transformCoordinates(coord, depth - 1))
  }

  const features = geojson.features.map((feature) => {
    if (!feature.geometry?.coordinates) return feature

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
    features
  }
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
