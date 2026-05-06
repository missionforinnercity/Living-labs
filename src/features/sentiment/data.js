import { fetchJson } from '../shared/http'

let roadSegmentsPromise = null

async function fetchSentimentJson(path, errorLabel) {
  try {
    return await fetchJson(path, errorLabel)
  } catch (error) {
    const shouldRetryLocalApi = (
      path.startsWith('/api/')
      && typeof window !== 'undefined'
      && window.location.hostname === 'localhost'
      && /404|Failed to fetch|NetworkError/i.test(error.message || '')
    )

    if (!shouldRetryLocalApi) throw error
    return fetchJson(`http://localhost:3001${path}`, errorLabel)
  }
}

export async function loadExplorerSentimentData(month = 'all') {
  const params = new URLSearchParams()
  if (month && month !== 'all') params.set('month', month)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const [sentimentFeatureCollection, roadSegments] = await Promise.all([
    fetchSentimentJson(`/api/sentiment/street-segments${suffix}`, 'Sentiment street layer load failed'),
    loadRoadSegments()
  ])

  return enrichSentimentPercentiles(
    buildNamedStreetSentimentLayer(sentimentFeatureCollection, roadSegments)
  )
}

export async function loadExplorerSentimentAnalytics() {
  return fetchSentimentJson('/api/sentiment/analytics', 'Sentiment analytics load failed')
}

function loadRoadSegments() {
  if (!roadSegmentsPromise) {
    roadSegmentsPromise = fetchJson('/data/roads/segments.geojson', 'Road segment geometry load failed')
  }
  return roadSegmentsPromise
}

function buildNamedStreetSentimentLayer(sentimentFeatureCollection, roadSegments) {
  const sentimentByStreet = new Map()

  ;(sentimentFeatureCollection?.features || []).forEach((feature) => {
    const properties = feature?.properties || {}
    if (!Number.isFinite(Number(properties.avg_sentiment))) return

    const keys = [
      properties.sentiment_street_name,
      properties.street_name,
      properties.street_name_modified
    ].map(streetKey).filter(Boolean)

    keys.forEach((key) => {
      const existing = sentimentByStreet.get(key)
      const currentCount = Number(properties.comment_count || 0)
      const existingCount = Number(existing?.comment_count || 0)
      if (!existing || currentCount > existingCount) {
        sentimentByStreet.set(key, {
          sentiment_street_name: properties.sentiment_street_name || properties.street_name,
          comment_count: properties.comment_count,
          positive_count: properties.positive_count,
          negative_count: properties.negative_count,
          avg_sentiment: properties.avg_sentiment,
          sentiment_index: properties.sentiment_index,
          sentiment_percentile: properties.sentiment_percentile,
          sentiment_decile: properties.sentiment_decile,
          confidence_weight: properties.confidence_weight,
          negative_share: properties.negative_share,
          positive_share: properties.positive_share,
          negative_burden: properties.negative_burden,
          positive_burden: properties.positive_burden,
          attention_score: properties.attention_score,
          avg_stars: properties.avg_stars,
          topics: properties.topics,
          categories: properties.categories,
          sentiment_class: properties.sentiment_class
        })
      }
    })
  })

  const features = (roadSegments?.features || []).flatMap((feature) => {
    const roadProperties = feature?.properties || {}
    const match = [
      roadProperties.STR_NAME,
      roadProperties.STR_NAME_MDF,
      roadProperties.street_name
    ].map(streetKey).filter(Boolean).map((key) => sentimentByStreet.get(key)).find(Boolean)

    if (!match) return []

    return explodeLineFeature({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        objectid: roadProperties.OBJECTID,
        sl_str_name_key: roadProperties.SL_STR_NAME_KEY,
        street_name: roadProperties.STR_NAME || roadProperties.street_name,
        street_name_modified: roadProperties.STR_NAME_MDF || null,
        shape_length: roadProperties.Shape__Length,
        ...match
      }
    })
  })

  return {
    type: 'FeatureCollection',
    features: dedupeFeaturesByGeometry(features),
    metadata: {
      ...(sentimentFeatureCollection?.metadata || {}),
      source: 'data/roads/segments.geojson joined to sentiment by normalized street name',
      totalRoadSegments: roadSegments?.features?.length || 0,
      matchedStreetNames: sentimentByStreet.size
    }
  }
}

function enrichSentimentPercentiles(featureCollection) {
  const features = featureCollection?.features || []
  const scored = features
    .map((feature) => ({
      feature,
      score: Number(feature?.properties?.sentiment_index ?? feature?.properties?.avg_sentiment)
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score)

  if (!scored.length) return featureCollection

  const denominator = Math.max(1, scored.length - 1)
  scored.forEach((item, index) => {
    const percentile = (index / denominator) * 100
    item.feature.properties = {
      ...item.feature.properties,
      sentiment_index: Number.isFinite(Number(item.feature.properties?.sentiment_index))
        ? item.feature.properties.sentiment_index
        : item.score,
      sentiment_percentile: Number.isFinite(Number(item.feature.properties?.sentiment_percentile))
        ? item.feature.properties.sentiment_percentile
        : Number(percentile.toFixed(1)),
      sentiment_decile: Number.isFinite(Number(item.feature.properties?.sentiment_decile))
        ? item.feature.properties.sentiment_decile
        : Math.floor(percentile / 10) * 10
    }
  })

  return featureCollection
}

function explodeLineFeature(feature) {
  const geometry = feature?.geometry
  if (!geometry) return []
  if (geometry.type === 'LineString') return [feature]
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.map((coordinates, index) => ({
      ...feature,
      properties: {
        ...(feature.properties || {}),
        sentiment_part_index: index
      },
      geometry: {
        type: 'LineString',
        coordinates
      }
    }))
  }
  return []
}

function dedupeFeaturesByGeometry(features) {
  const byGeometry = new Map()

  features.forEach((feature) => {
    const key = geometryKey(feature.geometry)
    if (!key) return
    if (!byGeometry.has(key)) {
      byGeometry.set(key, feature)
    }
  })

  return [...byGeometry.values()]
}

function geometryKey(geometry) {
  if (!geometry?.coordinates?.length) return ''
  const forward = geometry.coordinates
    .map((coordinate) => coordinate.map((value) => Number(value).toFixed(6)).join(','))
    .join('|')
  const reverse = [...geometry.coordinates]
    .reverse()
    .map((coordinate) => coordinate.map((value) => Number(value).toFixed(6)).join(','))
    .join('|')
  return forward < reverse ? forward : reverse
}

function streetKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s+(street|st|road|rd|avenue|ave|mall|pass|lane|ln|drive|dr|boulevard|blvd)$/i, '')
    .trim()
}
