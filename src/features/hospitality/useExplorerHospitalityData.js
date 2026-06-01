import { useEffect, useState } from 'react'
import { loadHospitalityAnalytics, loadHospitalityListings } from './data'

export function useExplorerHospitalityData({ dashboardMode, lockedLayers, scope }) {
  const [airbnbListings, setAirbnbListings] = useState(null)
  const [airbnbAnalytics, setAirbnbAnalytics] = useState(null)
  const [hospitalityLoading, setHospitalityLoading] = useState(false)
  const [hospitalityError, setHospitalityError] = useState(null)

  useEffect(() => {
    const hasLockedHospitalityLayer = ['airbnbListings', 'airbnbZones'].some((id) => lockedLayers.has(id))
    if (dashboardMode !== 'hospitality' && !hasLockedHospitalityLayer) return

    let cancelled = false
    setHospitalityLoading(true)
    setHospitalityError(null)

    Promise.all([
      loadHospitalityListings(scope),
      loadHospitalityAnalytics(scope)
    ])
      .then(([listings, analytics]) => {
        if (cancelled) return
        setAirbnbListings(listings)
        setAirbnbAnalytics(analytics)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Error loading hospitality data:', error)
        setHospitalityError(error.message)
      })
      .finally(() => {
        if (!cancelled) setHospitalityLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [dashboardMode, lockedLayers, scope])

  return {
    airbnbListings,
    airbnbAnalytics,
    hospitalityLoading,
    hospitalityError
  }
}
