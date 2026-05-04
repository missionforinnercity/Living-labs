import { useEffect, useRef, useState } from 'react'
import {
  loadExplorerAirQualityData,
  loadExplorerGreeneryData,
  loadExplorerEstimatedWindData,
  loadExplorerHeatGridData,
  loadExplorerShadeData,
  loadExplorerTemperatureData
} from './data'

export function useExplorerEnvironmentData({ dashboardMode, activeCategory, lockedLayers, season, timeOfDay, shadeMonth, windDirection, windSpeedKmh }) {
  const [temperatureData, setTemperatureData] = useState(null)
  const [heatGridData, setHeatGridData] = useState(null)
  const [shadeData, setShadeData] = useState(null)
  const [estimatedWindData, setEstimatedWindData] = useState(null)
  const [greeneryAndSkyview, setGreeneryAndSkyview] = useState(null)
  const [treeCanopyData, setTreeCanopyData] = useState(null)
  const [parksData, setParksData] = useState(null)
  const [ecologyHeatByYear, setEcologyHeatByYear] = useState({})
  const [envCurrentData, setEnvCurrentData] = useState(null)
  const [envHistoryData, setEnvHistoryData] = useState(null)
  const envLastFetch = useRef(0)

  useEffect(() => {
    const loadClimateExplorerState = async () => {
      try {
        const [heatStreets, heatGrid] = await Promise.all([
          loadExplorerTemperatureData(),
          loadExplorerHeatGridData()
        ])
        setTemperatureData(heatStreets)
        setHeatGridData(heatGrid)
        console.log('Loaded climate DB layers:', {
          heatStreets: heatStreets.features?.length,
          heatGrid: heatGrid.features?.length
        })
      } catch (error) {
        console.error('Error loading climate data:', error)
      }
    }

    const hasLockedClimateLayer = ['heatStreets', 'heatGrid', 'estimatedWind'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'climate' || hasLockedClimateLayer) {
      loadClimateExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  useEffect(() => {
    const loadWindExplorerState = async () => {
      try {
        const data = await loadExplorerEstimatedWindData(windDirection, windSpeedKmh)
        setEstimatedWindData(data)
        console.log('Loaded wind scenario:', {
          direction: windDirection,
          speedKmh: windSpeedKmh,
          features: data.features?.length
        })
      } catch (error) {
        console.error('Error loading estimated wind data:', error)
      }
    }

    const shouldLoadWind = dashboardMode === 'climate' && activeCategory === 'estimatedWind'
    const hasLockedWindLayer = lockedLayers.has('estimatedWind')
    if (shouldLoadWind || hasLockedWindLayer) {
      loadWindExplorerState()
    }
  }, [activeCategory, dashboardMode, lockedLayers, windDirection, windSpeedKmh])

  useEffect(() => {
    const loadShadeExplorerState = async () => {
      try {
        const data = await loadExplorerShadeData(season, timeOfDay, shadeMonth)
        setShadeData(data)
        console.log(`Loaded shade data: ${season} ${shadeMonth || 'all-months'} ${timeOfDay}`)
      } catch (error) {
        console.error('Error loading shade data:', error)
      }
    }

    const loadGreeneryExplorerState = async () => {
      try {
        const greeneryState = await loadExplorerGreeneryData()
        setGreeneryAndSkyview(greeneryState.greeneryAndSkyview)
        setTreeCanopyData(greeneryState.treeCanopyData)
        setParksData(greeneryState.parksData)
        setEcologyHeatByYear(greeneryState.ecologyHeatByYear)
        console.log('Loaded greenery layers:', {
          greeneryData: greeneryState.greeneryAndSkyview,
          treeCanopyData: greeneryState.treeCanopyData,
          parksData: greeneryState.parksData,
          ecologyYears: Object.keys(greeneryState.ecologyHeatByYear).length
        })
      } catch (error) {
        console.error('Error loading greenery data:', error)
      }
    }

    const loadAirQualityExplorerState = async () => {
      const now = Date.now()
      if (now - envLastFetch.current < 3 * 60 * 1000 && envCurrentData) return

      try {
        const { currentData, historyData } = await loadExplorerAirQualityData()
        if (currentData) setEnvCurrentData(currentData)
        if (historyData) setEnvHistoryData(historyData)
        envLastFetch.current = Date.now()
        console.log('Loaded environment data from DB')
      } catch (error) {
        console.error('Error loading environment data:', error)
      }
    }

    const hasLockedEnvLayer = ['greeneryIndex', 'treeCanopy', 'parksNearby', 'airQuality', 'urbanHeatConcrete', 'climateShade'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'environment' || dashboardMode === 'climate' || hasLockedEnvLayer) {
      loadShadeExplorerState()
      loadGreeneryExplorerState()
      loadAirQualityExplorerState()
    }
  }, [dashboardMode, envCurrentData, lockedLayers, season, timeOfDay, shadeMonth])

  return {
    temperatureData,
    heatGridData,
    shadeData,
    estimatedWindData,
    greeneryAndSkyview,
    treeCanopyData,
    parksData,
    ecologyHeatByYear,
    envCurrentData,
    envHistoryData
  }
}
