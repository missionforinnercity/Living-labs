import { loadCCIDBoundary } from '../../utils/dataLoader'
import { fetchJson } from '../shared/http'

async function loadEventsData() {
  try {
    const response = await fetch('/api/planning/events')
    if (!response.ok) {
      throw new Error(`Events API failed: ${response.status} ${response.statusText}`)
    }
    return response.json()
  } catch {
    const fallback = await fetch('/data/business/events.geojson')
      .then((response) => (response.ok ? response.json() : { type: 'FeatureCollection', features: [] }))
      .catch(() => ({ type: 'FeatureCollection', features: [] }))

    return {
      ...fallback,
      metadata: {
        totalRows: fallback.features?.length || 0,
        totalFeatures: fallback.features?.length || 0,
        venueCount: new Set((fallback.features || []).map((feature) => feature.properties?.venue).filter(Boolean)).size,
        fetchedAt: new Date().toISOString(),
        source: 'static fallback /data/business/events.geojson',
        fallback: true
      }
    }
  }
}

async function loadLandParcelsData() {
  return fetchJson('/api/cadastre/landparcels?scope=ccid', 'Land parcel cadastre load failed')
}

async function loadOpenSpacesData() {
  return fetchJson('/api/cadastre/squares?scope=ccid', 'Open spaces cadastre load failed')
}

async function loadParcelSalesData() {
  return fetchJson('/api/cadastre/sales?scope=ccid', 'Parcel sales cadastre load failed')
}

export async function loadExplorerBusinessBoundary() {
  return loadCCIDBoundary()
}

const emptyCollection = (source, error = null) => ({
  type: 'FeatureCollection',
  features: [],
  metadata: error ? { error: error.message, source } : { source }
})

const loadOptional = (loader, source) => loader().catch((error) => {
  console.error(error)
  return emptyCollection(source, error)
})

export async function loadExplorerBusinessData({
  includeBusinesses = false,
  includeStreetStalls = false,
  includeParcelSales = false,
  includeSurvey = false,
  includeEvents = false,
  includeLandParcels = false,
  includeOpenSpaces = false,
  includeBusinessBundle = null
} = {}) {
  if (includeBusinessBundle !== null) {
    includeBusinesses = includeBusinessBundle
    includeStreetStalls = includeBusinessBundle
    includeSurvey = includeBusinessBundle
    includeEvents = includeBusinessBundle
  }

  const [
    businesses,
    stalls,
    parcelSales,
    survey,
    eventsData,
    landParcels,
    openSpaces
  ] = await Promise.all([
    includeBusinesses
      ? loadOptional(() => fetchJson('/data/business/POI_enriched_20260120_185944.geojson', 'Business POI load failed'), 'data/business/POI_enriched_20260120_185944.geojson')
      : Promise.resolve(null),
    includeStreetStalls
      ? loadOptional(() => fetchJson('/data/business/streetStalls.geojson', 'Street stalls load failed'), 'data/business/streetStalls.geojson')
      : Promise.resolve(null),
    includeParcelSales
      ? loadOptional(loadParcelSalesData, 'cadastre.sales')
      : Promise.resolve(null),
    includeSurvey
      ? loadOptional(() => fetchJson('/data/business/survey_data.geojson', 'Survey load failed'), 'data/business/survey_data.geojson')
      : Promise.resolve(null),
    includeEvents
      ? loadEventsData()
      : Promise.resolve(null),
    includeLandParcels
      ? loadOptional(loadLandParcelsData, 'cadastre.landparcels_gv')
      : Promise.resolve(null),
    includeOpenSpaces
      ? loadOptional(loadOpenSpacesData, 'cadastre.squares')
      : Promise.resolve(null)
  ])

  return {
    businesses,
    streetStalls: stalls,
    parcelSales,
    survey,
    eventsData,
    landParcels,
    openSpaces
  }
}
