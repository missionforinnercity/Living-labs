import { fetchJson } from '../shared/http'

export async function loadHospitalityListings(scope = 'cbd') {
  return fetchJson(`/api/hospitality/airbnb-listings?scope=${encodeURIComponent(scope)}`, 'Airbnb listings load failed')
}

export async function loadHospitalityAnalytics(scope = 'cbd') {
  return fetchJson(`/api/hospitality/airbnb-analytics?scope=${encodeURIComponent(scope)}`, 'Airbnb analytics load failed')
}
