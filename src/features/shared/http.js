export async function fetchJson(path, errorLabel) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`${errorLabel}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}
