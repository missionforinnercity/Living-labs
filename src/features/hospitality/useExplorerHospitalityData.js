import { useEffect, useState } from 'react'
import { loadHospitalityAnalytics, loadHospitalityListings } from './data'

export function useExplorerHospitalityData({ dashboardMode, activeCategory, lockedLayers, scope }) {
  const [airbnbListings, setAirbnbListings] = useState(null)
  const [airbnbAnalytics, setAirbnbAnalytics] = useState(null)
  const [hospitalityLoading, setHospitalityLoading] = useState(false)
  const [hospitalityError, setHospitalityError] = useState(null)

  useEffect(() => {
    const hasLockedHospitalityLayer = ['airbnbListings', 'airbnbZones'].some((id) => lockedLayers.has(id))
    const isActiveHospitalityLayer = activeCategory === 'airbnbListings' || activeCategory === 'airbnbZones'
    if (dashboardMode !== 'hospitality' && !hasLockedHospitalityLayer) return
    if (dashboardMode === 'hospitality' && activeCategory && !isActiveHospitalityLayer && !hasLockedHospitalityLayer) return

    let cancelled = false
    setHospitalityLoading(true)
    setHospitalityError(null)

    const includeListings = isActiveHospitalityLayer || hasLockedHospitalityLayer || !activeCategory

    Promise.all([
      includeListings ? loadHospitalityListings(scope) : Promise.resolve(null),
      loadHospitalityAnalytics(scope)
    ])
      .then(([listings, analytics]) => {
        if (cancelled) return
        if (includeListings) setAirbnbListings(listings)
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
  }, [activeCategory, dashboardMode, lockedLayers, scope])

  return {
    airbnbListings,
    airbnbAnalytics,
    hospitalityLoading,
    hospitalityError
  }
}
