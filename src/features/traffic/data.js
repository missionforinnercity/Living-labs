async function fetchJson(path, errorLabel) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

export async function loadExplorerTrafficData() {
  return fetchJson('/data/Traffic/traffic_analysis.geojson', 'Traffic data load failed')
}
