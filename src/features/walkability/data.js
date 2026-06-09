import {
  getStravaAvailableMonths,
  loadWalkabilityData as loadActiveMobilityData
} from '../../utils/dataLoader'
import { transformGeoJSON } from '../shared/geo'
import { fetchJson } from '../shared/http'

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

export async function loadExplorerWalkabilityData({
  includeActiveMobility = false,
  includeNetwork = false,
  includeTransit = false,
  includeRoadSteepness = false
} = {}) {
  const [walkability, transit, busStops, trainStation, roadSteepness] = await Promise.all([
    (includeActiveMobility || includeNetwork)
      ? loadActiveMobilityData({
        includeNetwork,
        includeActivity: includeActiveMobility
      })
      : Promise.resolve(null),
    includeTransit
      ? fetchJson('/data/walkabilty/roads_with_walking_times.geojson', 'Transit walking times file failed')
      : Promise.resolve(null),
    includeTransit
      ? fetchJson('/data/walkabilty/bus stops.geojson', 'Bus stops file failed')
      : Promise.resolve(null),
    includeTransit
      ? fetchJson('/data/walkabilty/trainStation.geojson', 'Train station file failed')
      : Promise.resolve(null),
    includeRoadSteepness
      ? fetchJson('/api/transport/road-steepness', 'Road steepness API load failed')
      : Promise.resolve(null)
  ])

  const { network, pedestrian, cycling, stravaAggregated } = walkability || {}

  return {
    network: network ? transformGeoJSON(network, 'EPSG:3857', 'EPSG:4326') : null,
    pedestrian: pedestrian ? addTripPercentiles(pedestrian) : null,
    cycling: cycling ? addTripPercentiles(cycling) : null,
    stravaAggregated,
    availableMonths: stravaAggregated ? getStravaAvailableMonths(stravaAggregated) : [],
    transit,
    busStops,
    trainStation,
    roadSteepness
  }
}
