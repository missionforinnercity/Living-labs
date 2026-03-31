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

export async function loadExplorerBusinessBoundary() {
  return loadCCIDBoundary()
}

export async function loadExplorerBusinessData() {
  const [businesses, stalls, properties, survey, eventsData] = await Promise.all([
    fetchJson('/data/business/POI_enriched_20260120_185944.geojson', 'Business POI load failed'),
    fetchJson('/data/business/streetStalls.geojson', 'Street stalls load failed'),
    fetchJson('/data/business/properties_consolidated.geojson', 'Property load failed'),
    fetchJson('/data/business/survey_data.geojson', 'Survey load failed'),
    loadEventsData()
  ])

  return {
    businesses,
    streetStalls: stalls,
    properties: enrichProperties(properties),
    survey,
    eventsData
  }
}
