import { useEffect, useState } from 'react'
import { loadExplorerLightingData } from './data'

export function useExplorerLightingData({ dashboardMode, lockedLayers }) {
  const [lightingSegments, setLightingSegments] = useState(null)
  const [streetLights, setStreetLights] = useState(null)
  const [missionInterventions, setMissionInterventions] = useState(null)
  const [lightingThresholds, setLightingThresholds] = useState(null)

  useEffect(() => {
    const loadLightingExplorerState = async () => {
      try {
        const {
          lightingSegments: segments,
          missionInterventions: projects,
          streetLights,
          lightingThresholds: thresholds
        } = await loadExplorerLightingData()

        setLightingThresholds(thresholds)
        setLightingSegments(segments)
        setMissionInterventions(projects)
        setStreetLights(streetLights)
        console.log('Lighting data loaded:', {
          segments: segments?.features?.length,
          missionInterventions: projects?.features?.length,
          streetLights: streetLights?.features?.length
        })
      } catch (error) {
        console.error('Error loading lighting data:', error)
      }
    }

    const hasLockedLightingLayer = ['streetLighting', 'municipalLights', 'missionInterventions'].some((id) => lockedLayers.has(id))
    if (dashboardMode === 'lighting' || hasLockedLightingLayer) {
      loadLightingExplorerState()
    }
  }, [dashboardMode, lockedLayers])

  return {
    lightingSegments,
    streetLights,
    missionInterventions,
    lightingThresholds
  }
}
