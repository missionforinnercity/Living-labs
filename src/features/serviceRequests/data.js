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

export function loadServiceRequestPoints() {
  return fetchServiceRequestJson('/api/service-requests/points', 'Service request map layer load failed')
}

export function loadServiceRequestAnalytics() {
  return fetchServiceRequestJson('/api/service-requests/analytics', 'Service request analytics load failed')
}
