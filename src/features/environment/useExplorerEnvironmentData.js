import { useEffect, useRef, useState } from 'react'
import {
  loadExplorerAirQualityData,
  loadExplorerGreeneryData,
  loadExplorerShadeData,
  loadExplorerTemperatureData
} from './data'

export function useExplorerEnvironmentData({ dashboardMode, lockedLayers, season, timeOfDay }) {
  const [temperatureData, setTemperatureData] = useState(null)
  const [shadeData, setShadeData] = useState(null)
  const [greeneryAndSkyview, setGreeneryAndSkyview] = useState(null)
  const [treeCanopyData, setTreeCanopyData] = useState(null)
  const [parksData, setParksData] = useState(null)
  const [ecologyHeatByYear, setEcologyHeatByYear] = useState({})
  const [envCurrentData, setEnvCurrentData] = useState(null)
  const [envHistoryData, setEnvHistoryData] = useState(null)
  const envLastFetch = useRef(0)

  useEffect(() => {
    const loadTemperatureExplorerState = async () => {
      try {
        const data = await loadExplorerTemperatureData()
        setTemperatureData(data)
        console.log('Loaded temperature timeseries data:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading temperature data:', error)
      }
    }

    const hasLockedTempLayer = lockedLayers.has('surfaceTemperature')
    if (dashboardMode === 'temperature' || hasLockedTempLayer) {
      loadTemperatureExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  useEffect(() => {
    const loadShadeExplorerState = async () => {
      try {
        const data = await loadExplorerShadeData(season, timeOfDay)
        setShadeData(data)
        console.log(`Loaded shade data: ${season} ${timeOfDay}`)
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

    const hasLockedEnvLayer = ['greeneryIndex', 'treeCanopy', 'parksNearby', 'airQuality', 'urbanHeatConcrete'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'environment' || hasLockedEnvLayer) {
      loadShadeExplorerState()
      loadGreeneryExplorerState()
      loadAirQualityExplorerState()
    }
  }, [dashboardMode, envCurrentData, lockedLayers, season, timeOfDay])

  return {
    temperatureData,
    shadeData,
    greeneryAndSkyview,
    treeCanopyData,
    parksData,
    ecologyHeatByYear,
    envCurrentData,
    envHistoryData
  }
}
