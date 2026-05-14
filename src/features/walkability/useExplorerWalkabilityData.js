import { useEffect, useMemo, useState } from 'react'
import {
  buildStravaActivityLayers,
  buildRouteHistory
} from '../../utils/dataLoader'
import { loadExplorerWalkabilityData } from './data'

export function useExplorerWalkabilityData({
  dashboardMode,
  lockedLayers,
  selectedMonth,
  selectedRouteSegment,
  compareRouteSegment
}) {
  const [networkData, setNetworkData] = useState(null)
  const [stravaAggregated, setStravaAggregated] = useState(null)
  const [walkabilityMonths, setWalkabilityMonths] = useState([])
  const [transitData, setTransitData] = useState(null)
  const [busStopsData, setBusStopsData] = useState(null)
  const [trainStationData, setTrainStationData] = useState(null)
  const [roadSteepnessData, setRoadSteepnessData] = useState(null)

  useEffect(() => {
    const loadWalkabilityExplorerState = async () => {
      try {
        console.log('Loading active mobility files...')

        const {
          network,
          stravaAggregated: rawStrava,
          availableMonths,
          transit,
          busStops,
          trainStation,
          roadSteepness
        } = await loadExplorerWalkabilityData()

        console.log('Active mobility data loaded:', {
          network: network.features?.length,
          transit: transit.features?.length,
          roadSteepness: roadSteepness?.features?.length,
          busStops: busStops.features?.length,
          trainStation: trainStation.features?.length
        })

        console.log('Transformed network data sample coordinate:', network.features?.[0]?.geometry?.coordinates?.[0]?.[0])

        setNetworkData(network)
        setStravaAggregated(rawStrava)
        setWalkabilityMonths(availableMonths)
        setTransitData(transit)
        setBusStopsData(busStops)
        setTrainStationData(trainStation)
        setRoadSteepnessData(roadSteepness)
      } catch (error) {
        console.error('Error loading walkability data:', error)
      }
    }

    const hasLockedWalkabilityLayer = ['activeMobility', 'networkAnalysis', 'transitAccessibility', 'roadSteepness'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'walkability' || hasLockedWalkabilityLayer) {
      loadWalkabilityExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  const effectiveSelectedMonth = selectedMonth || null

  const activityLayers = useMemo(() => {
    if (!stravaAggregated) return { pedestrianData: null, cyclingData: null }
    const { pedestrian, cycling } = buildStravaActivityLayers(
      stravaAggregated,
      effectiveSelectedMonth ? { months: effectiveSelectedMonth } : { averageMonthly: true }
    )
    return { pedestrianData: pedestrian, cyclingData: cycling }
  }, [effectiveSelectedMonth, stravaAggregated])

  const selectedRouteHistory = useMemo(() => {
    if (!selectedRouteSegment || !stravaAggregated) return null
    return buildRouteHistory(stravaAggregated, selectedRouteSegment.edge_uid)
  }, [selectedRouteSegment, stravaAggregated])

  const compareRouteHistory = useMemo(() => {
    if (!compareRouteSegment || !stravaAggregated) return null
    return buildRouteHistory(stravaAggregated, compareRouteSegment.edge_uid)
  }, [compareRouteSegment, stravaAggregated])

  return {
    networkData,
    pedestrianData: activityLayers.pedestrianData,
    cyclingData: activityLayers.cyclingData,
    stravaAggregated,
    walkabilityMonths,
    transitData,
    busStopsData,
    trainStationData,
    roadSteepnessData,
    selectedRouteHistory,
    compareRouteHistory,
    effectiveSelectedMonth
  }
}
