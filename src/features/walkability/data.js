import proj4 from 'proj4'
import {
  getStravaAvailableMonths,
  loadWalkabilityData as loadActiveMobilityData
} from '../../utils/dataLoader'

proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

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

function addTripPercentiles(featureCollection) {
  if (!featureCollection?.features?.length) return featureCollection

  const tripCounts = featureCollection.features.map((feature) => feature.properties?.total_trip_count || 0)
  const sortedCounts = [...tripCounts].sort((a, b) => a - b)
  const minCount = sortedCounts[0]
  const maxCount = sortedCounts[sortedCounts.length - 1]

  return {
    ...featureCollection,
    features: featureCollection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        trip_percentile: maxCount === minCount
          ? 50
          : ((feature.properties.total_trip_count - minCount) / (maxCount - minCount)) * 100
      }
    }))
  }
}

export async function loadExplorerWalkabilityData() {
  const [walkability, anomalies, transit, busStops, trainStation] = await Promise.all([
    loadActiveMobilityData(),
    fetchJson('/data/walkabilty/strava_metro_anomalies.geojson', 'Anomalies file failed'),
    fetchJson('/data/walkabilty/roads_with_walking_times.geojson', 'Transit walking times file failed'),
    fetchJson('/data/walkabilty/bus stops.geojson', 'Bus stops file failed'),
    fetchJson('/data/walkabilty/trainStation.geojson', 'Train station file failed')
  ])

  const { network, pedestrian, cycling, stravaAggregated } = walkability

  return {
    network: transformGeoJSON(network, 'EPSG:3857', 'EPSG:4326'),
    pedestrian: addTripPercentiles(pedestrian),
    cycling: addTripPercentiles(cycling),
    stravaAggregated,
    availableMonths: getStravaAvailableMonths(stravaAggregated),
    anomalies,
    transit,
    busStops,
    trainStation
  }
}
