import { useEffect, useState } from 'react'
import { loadExplorerTrafficData } from './data'

export function useExplorerTrafficData({ dashboardMode, activeCategory, lockedLayers }) {
  const [trafficData, setTrafficData] = useState(null)

  useEffect(() => {
    const loadTrafficExplorerState = async () => {
      try {
        const data = await loadExplorerTrafficData()
        setTrafficData(data)
        console.log('Traffic data loaded:', data.features?.length, 'segments')
      } catch (error) {
        console.error('Error loading traffic data:', error)
      }
    }

    const isTrafficActive = activeCategory === 'trafficFlow'
    const hasLockedTrafficLayer = lockedLayers.has('trafficFlow')
    if ((dashboardMode === 'traffic' && (isTrafficActive || !activeCategory)) || hasLockedTrafficLayer) {
      loadTrafficExplorerState()
    }
  }, [activeCategory, dashboardMode, lockedLayers])

  return { trafficData }
}
