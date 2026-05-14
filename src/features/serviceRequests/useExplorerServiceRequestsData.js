import { useEffect, useState } from 'react'
import { loadServiceRequestAnalytics, loadServiceRequestStreetSegments } from './data'

export function useExplorerServiceRequestsData({ dashboardMode, lockedLayers }) {
  const [serviceRequests, setServiceRequests] = useState(null)
  const [serviceRequestAnalytics, setServiceRequestAnalytics] = useState(null)
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false)
  const [serviceRequestsError, setServiceRequestsError] = useState(null)

  useEffect(() => {
    const hasLockedServiceRequests = lockedLayers.has('serviceRequests')
    if (dashboardMode !== 'sentiment' && !hasLockedServiceRequests) return

    let cancelled = false

    const loadServiceRequests = async () => {
      try {
        setServiceRequestsLoading(true)
        setServiceRequestsError(null)
        const [streetSegments, analytics] = await Promise.all([
          loadServiceRequestStreetSegments(),
          loadServiceRequestAnalytics()
        ])
        if (cancelled) return
        setServiceRequests(streetSegments)
        setServiceRequestAnalytics(analytics)
      } catch (error) {
        if (cancelled) return
        console.error('Error loading service request data:', error)
        setServiceRequestsError(error)
      } finally {
        if (!cancelled) setServiceRequestsLoading(false)
      }
    }

    loadServiceRequests()
    return () => {
      cancelled = true
    }
  }, [dashboardMode, lockedLayers])

  return {
    serviceRequests,
    serviceRequestAnalytics,
    serviceRequestsLoading,
    serviceRequestsError
  }
}
