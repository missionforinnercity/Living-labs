import { useEffect, useState } from 'react'
import { loadExplorerSentimentAnalytics, loadExplorerSentimentData } from './data'

export function useExplorerSentimentData({ dashboardMode, lockedLayers, selectedMonth, sourceMode = 'public' }) {
  const [sentimentSegments, setSentimentSegments] = useState(null)
  const [sentimentAnalytics, setSentimentAnalytics] = useState(null)
  const [sentimentLoading, setSentimentLoading] = useState(false)
  const [sentimentError, setSentimentError] = useState(null)

  useEffect(() => {
    const hasLockedSentimentLayer = lockedLayers.has('streetSentiment')
    if (dashboardMode !== 'sentiment' && !hasLockedSentimentLayer) return

    let cancelled = false

    const loadSentimentExplorerState = async () => {
      try {
        setSentimentLoading(true)
        setSentimentError(null)
        const [segments, analytics] = await Promise.all([
          loadExplorerSentimentData(selectedMonth || 'all', sourceMode),
          loadExplorerSentimentAnalytics(sourceMode)
        ])
        if (cancelled) return
        setSentimentSegments(segments)
        setSentimentAnalytics(analytics)
      } catch (error) {
        if (cancelled) return
        console.error('Error loading sentiment data:', error)
        setSentimentError(error)
      } finally {
        if (!cancelled) setSentimentLoading(false)
      }
    }

    loadSentimentExplorerState()
    return () => {
      cancelled = true
    }
  }, [dashboardMode, lockedLayers, selectedMonth, sourceMode])

  return {
    sentimentSegments,
    sentimentAnalytics,
    sentimentLoading,
    sentimentError
  }
}
