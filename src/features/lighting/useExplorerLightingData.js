import { useEffect, useState } from 'react'
import { loadExplorerLightingData } from './data'

const LIGHTING_LAYERS = ['streetLighting', 'municipalLights', 'missionInterventions']

export function useExplorerLightingData({ dashboardMode, activeCategory, lockedLayers }) {
  const [lightingSegments, setLightingSegments] = useState(null)
  const [streetLights, setStreetLights] = useState(null)
  const [missionInterventions, setMissionInterventions] = useState(null)
  const [lightingThresholds, setLightingThresholds] = useState(null)

  useEffect(() => {
    const loadLightingExplorerState = async () => {
      try {
        const requestedLayers = new Set([...lockedLayers])
        const isActiveLightingLayer = LIGHTING_LAYERS.includes(activeCategory)
        if (isActiveLightingLayer) requestedLayers.add(activeCategory)
        if (dashboardMode === 'lighting' && !isActiveLightingLayer) requestedLayers.add('streetLighting')

        const {
          lightingSegments: segments,
          missionInterventions: projects,
          streetLights,
          lightingThresholds: thresholds
        } = await loadExplorerLightingData({
          includeSegments: requestedLayers.has('streetLighting'),
          includeProjects: requestedLayers.has('missionInterventions'),
          includeStreetLights: requestedLayers.has('municipalLights')
        })

        if (requestedLayers.has('streetLighting')) {
          setLightingThresholds(thresholds)
          setLightingSegments(segments)
        }
        if (requestedLayers.has('missionInterventions')) setMissionInterventions(projects)
        if (requestedLayers.has('municipalLights')) setStreetLights(streetLights)
        console.log('Lighting data loaded:', {
          segments: segments?.features?.length,
          missionInterventions: projects?.features?.length,
          streetLights: streetLights?.features?.length
        })
      } catch (error) {
        console.error('Error loading lighting data:', error)
      }
    }

    const hasLockedLightingLayer = LIGHTING_LAYERS.some((id) => lockedLayers.has(id))
    if (dashboardMode === 'lighting' || hasLockedLightingLayer) {
      loadLightingExplorerState()
    }
  }, [activeCategory, dashboardMode, lockedLayers])

  return {
    lightingSegments,
    streetLights,
    missionInterventions,
    lightingThresholds
  }
}
