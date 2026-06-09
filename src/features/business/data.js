import { loadCCIDBoundary } from '../../utils/dataLoader'
import { fetchJson } from '../shared/http'

function enrichProperties(properties) {
  return {
    ...properties,
    features: (properties.features || []).map((feature) => {
      const transactions = feature.properties?.properties || []
      const transferCount = transactions.filter((transaction) => {
        const price = transaction.sale_price
        return price && price !== 'DONATION' && price !== 'CRST' && price.startsWith('R')
      }).length

      const totalValue = transactions.reduce((sum, transaction) => {
        const price = transaction.sale_price
        if (!price || price === 'DONATION' || price === 'CRST' || !price.startsWith('R')) {
          return sum
        }

        const numericValue = parseFloat(price.replace('R ', '').replace(/\s/g, ''))
        return sum + (Number.isNaN(numericValue) ? 0 : numericValue)
      }, 0)

      return {
        ...feature,
        properties: {
          ...feature.properties,
          transfer_count: transferCount,
          total_value: totalValue
        }
      }
    })
  }
}

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
  includeProperties = false,
  includeSurvey = false,
  includeEvents = false,
  includeLandParcels = false,
  includeOpenSpaces = false,
  includeBusinessBundle = null
} = {}) {
  if (includeBusinessBundle !== null) {
    includeBusinesses = includeBusinessBundle
    includeStreetStalls = includeBusinessBundle
    includeProperties = includeBusinessBundle
    includeSurvey = includeBusinessBundle
    includeEvents = includeBusinessBundle
  }

  const [
    businesses,
    stalls,
    properties,
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
    includeProperties
      ? loadOptional(() => fetchJson('/data/business/properties_consolidated.geojson', 'Property load failed'), 'data/business/properties_consolidated.geojson')
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
    properties: properties ? enrichProperties(properties) : null,
    survey,
    eventsData,
    landParcels,
    openSpaces
  }
}
