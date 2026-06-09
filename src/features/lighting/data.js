import { fetchJson } from '../shared/http'

function computeLightingThresholds(segments) {
  const validSegments = (segments?.features || []).filter((feature) => {
    const meanLux = feature.properties?.mean_lux
    return meanLux !== null && meanLux !== undefined && meanLux > 0
  })

  if (!validSegments.length) return null

  const luxValues = validSegments
    .map((feature) => feature.properties.mean_lux)
    .sort((a, b) => a - b)

  return {
    bottom20: luxValues[Math.floor(luxValues.length * 0.2)],
    top20: luxValues[Math.floor(luxValues.length * 0.8)]
  }
}

export async function loadExplorerLightingData({
  includeSegments = false,
  includeProjects = false,
  includeStreetLights = false
} = {}) {
  const [segments, projects, streetLights] = await Promise.all([
    includeSegments
      ? fetchJson('/data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson', 'Lighting segment load failed')
      : Promise.resolve(null),
    includeProjects
      ? fetchJson('/data/lighting/streetLighting.json', 'Lighting project load failed')
      : Promise.resolve(null),
    includeStreetLights
      ? fetchJson('/data/lighting/new_Lights/Street_lights.geojson', 'Street light load failed')
      : Promise.resolve(null)
  ])

  return {
    lightingSegments: segments,
    missionInterventions: projects,
    streetLights,
    lightingThresholds: computeLightingThresholds(segments)
  }
}
