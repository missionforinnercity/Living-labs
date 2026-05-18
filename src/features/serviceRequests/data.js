import { fetchJson } from '../shared/http'

async function fetchServiceRequestJson(path, errorLabel) {
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

function serviceRequestTimeframeQuery(timeframe) {
  return timeframe && timeframe !== 'all' ? `?timeframe=${encodeURIComponent(timeframe)}` : ''
}

export function loadServiceRequestStreetSegments(timeframe = 'all') {
  return fetchServiceRequestJson(`/api/service-requests/street-segments${serviceRequestTimeframeQuery(timeframe)}`, 'Service request street segments load failed')
}

export function loadServiceRequestAnalytics(timeframe = 'all') {
  return fetchServiceRequestJson(`/api/service-requests/analytics${serviceRequestTimeframeQuery(timeframe)}`, 'Service request analytics load failed')
}
