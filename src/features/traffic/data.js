import { fetchJson } from '../shared/http'

export async function loadExplorerTrafficData() {
  return fetchJson('/data/Traffic/traffic_analysis.geojson', 'Traffic data load failed')
}
