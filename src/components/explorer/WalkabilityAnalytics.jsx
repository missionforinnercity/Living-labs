import React, { useMemo, useState } from 'react'
import './WalkabilityAnalytics.css'

const NETWORK_METRICS = [
  { id: 'betweenness_400', label: 'Betweenness 400m', field: 'cc_betweenness_400' },
  { id: 'betweenness_800', label: 'Betweenness 800m', field: 'cc_betweenness_800' },
  { id: 'betweenness_beta_400', label: 'Beta Betweenness 400m', field: 'cc_betweenness_beta_400' },
  { id: 'betweenness_beta_800', label: 'Beta Betweenness 800m', field: 'cc_betweenness_beta_800' },
  { id: 'harmonic_400', label: 'Closeness 400m', field: 'cc_harmonic_400' },
  { id: 'harmonic_800', label: 'Closeness 800m', field: 'cc_harmonic_800' }
]

const WalkabilityAnalytics = ({
  walkabilityMode,
  onWalkabilityModeChange,
  networkMetric,
  onNetworkMetricChange,
  transitView,
  onTransitViewChange,
  routeLayerMode = 'combined',
  onRouteLayerModeChange,
  showPopularRoutesOnly = false,
  onShowPopularRoutesOnlyChange,
  walkabilityMonths = [],
  selectedMonth,
  onMonthChange,
  pedestrianData,
  cyclingData,
  anomaliesData,
  networkData,
  transitData,
  selectedSegment = null
}) => {
  const [localTransitView, setLocalTransitView] = useState(transitView || 'combined')

  const networkStats = useMemo(() => {
    if (!networkData?.features?.length) return null
    const metric = NETWORK_METRICS.find(item => item.id === networkMetric) || NETWORK_METRICS[1]
    const values = networkData.features.map(feature => feature.properties?.[metric.field] || 0)
    return {
      label: metric.label,
      totalSegments: networkData.features.length,
      avg: values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(metric.field.includes('harmonic') ? 3 : 0) : 0,
      max: values.length ? Math.max(...values).toFixed(metric.field.includes('harmonic') ? 3 : 0) : 0
    }
  }, [networkData, networkMetric])

  const transitStats = useMemo(() => {
    if (!transitData?.features?.length) return null
    const busTimes = transitData.features.map(feature => feature.properties.walk_time_bus || 0).filter(Boolean)
    const trainTimes = transitData.features.map(feature => feature.properties.walk_time_train || 0).filter(Boolean)
    return {
      totalSegments: transitData.features.length,
      avgBus: busTimes.length ? (busTimes.reduce((sum, value) => sum + value, 0) / busTimes.length).toFixed(1) : '0.0',
      avgTrain: trainTimes.length ? (trainTimes.reduce((sum, value) => sum + value, 0) / trainTimes.length).toFixed(1) : '0.0'
    }
  }, [transitData])

  const selectedMonthIndex = Math.max(0, walkabilityMonths.findIndex(month => month.key === selectedMonth))
  const anomalyStats = useMemo(() => {
    const features = anomaliesData?.features || []
    const topReasons = Object.entries(features.reduce((acc, feature) => {
      const reason = feature.properties?.likely_reason || 'Unknown'
      acc[reason] = (acc[reason] || 0) + 1
      return acc
    }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
    return {
      total: features.length,
      highConfidence: features.filter(feature => feature.properties?.confidence === 'high').length,
      eventLinked: features.filter(feature => feature.properties?.event_name && feature.properties.event_name !== 'unknown').length,
      topReasons
    }
  }, [anomaliesData])

  const popularRouteStats = useMemo(() => {
    const walkingPopular = (pedestrianData?.features || []).filter(feature => feature.properties?.popular_corridor_flag === 1)
    const cyclingPopular = (cyclingData?.features || []).filter(feature => feature.properties?.popular_corridor_flag === 1)

    return {
      walkingCount: walkingPopular.length,
      cyclingCount: cyclingPopular.length
    }
  }, [pedestrianData, cyclingData])

  return (
    <div className="walkability-analytics">
      <div className="walkability-temporal-shell">
        <div className="walkability-temporal-header">
          <div>
            <p className="walkability-kicker">Active Mobility Timeline</p>
            <h2>Temporal Route Explorer</h2>
          </div>
          <div className="temporal-mode-pills">
            <button className={`temporal-pill ${walkabilityMode === 'activity' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('activity')}>Routes</button>
            <button className={`temporal-pill ${walkabilityMode === 'network' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('network')}>Network</button>
            <button className={`temporal-pill ${walkabilityMode === 'transit' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('transit')}>Transit</button>
          </div>
        </div>

        <div className="month-slider-card">
          <div className="month-slider-copy">
            <span className="month-slider-label">Selected month</span>
            <strong>{walkabilityMonths.find(month => month.key === selectedMonth)?.label || 'No month available'}</strong>
          </div>
          <input
            className="month-slider"
            type="range"
            min="0"
            max={Math.max(0, walkabilityMonths.length - 1)}
            step="1"
            value={selectedMonthIndex}
            onChange={(event) => onMonthChange?.(walkabilityMonths[Number(event.target.value)]?.key || null)}
            disabled={walkabilityMonths.length <= 1}
          />
          <div className="month-slider-stops">
            {walkabilityMonths.map((month, index) => (
              <button
                key={month.key}
                className={`month-stop ${month.key === selectedMonth ? 'active' : ''}`}
                onClick={() => onMonthChange?.(month.key)}
                style={{ left: `${walkabilityMonths.length === 1 ? 0 : (index / (walkabilityMonths.length - 1)) * 100}%` }}
              >
                <span>{month.label}</span>
              </button>
            ))}
          </div>
        </div>

        {walkabilityMode === 'activity' && (
          <div className="temporal-insight-panel">
            <h3>Routes Panel</h3>
            <div className="temporal-mode-pills temporal-mode-pills--secondary">
              <button className={`temporal-pill ${routeLayerMode === 'combined' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('combined')}>Both Modes</button>
              <button className={`temporal-pill ${routeLayerMode === 'walking' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('walking')}>Walking Only</button>
              <button className={`temporal-pill ${routeLayerMode === 'cycling' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('cycling')}>Cycling Only</button>
              <button className={`temporal-pill ${routeLayerMode === 'anomalies' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('anomalies')}>Anomalies</button>
            </div>
            {routeLayerMode !== 'anomalies' && (
              <div className="temporal-mode-pills temporal-mode-pills--secondary temporal-mode-pills--top-routes">
                <button
                  className={`temporal-pill ${showPopularRoutesOnly ? 'active' : ''}`}
                  onClick={() => onShowPopularRoutesOnlyChange?.(!showPopularRoutesOnly)}
                >
                  {showPopularRoutesOnly ? 'Showing High-Use Routes' : 'Highlight High-Use Routes'}
                </button>
                <span className="temporal-top-routes-note">
                  Walking: {popularRouteStats.walkingCount} highlighted corridors. Cycling: {popularRouteStats.cyclingCount}. Visually thick, light routes stay included, plus tied cutoff routes.
                </span>
              </div>
            )}
            <p>
              Orange corridors show walking and running demand. Blue corridors show cycling demand. Pink-violet dashed corridors show anomalies. The map is filtered to the selected month, while route and anomaly clicks open detailed bottom-panel explanations and stats.
            </p>
            {selectedSegment && (
              <div className="temporal-selection-note">
                <span>Selected edge</span>
                <strong>{selectedSegment.edge_uid}</strong>
              </div>
            )}
            <div className="temporal-anomaly-band">
              <div className="temporal-anomaly-stat">
                <span>Anomalies This Month</span>
                <strong>{anomalyStats.total}</strong>
              </div>
              <div className="temporal-anomaly-stat">
                <span>High Confidence</span>
                <strong>{anomalyStats.highConfidence}</strong>
              </div>
              <div className="temporal-anomaly-stat">
                <span>Event-Linked</span>
                <strong>{anomalyStats.eventLinked}</strong>
              </div>
            </div>
            {anomalyStats.topReasons.length > 0 && (
              <div className="temporal-anomaly-reasons">
                {anomalyStats.topReasons.map(([reason, count]) => (
                  <div key={reason} className="temporal-anomaly-chip">
                    <span>{count}</span>
                    <strong>{reason}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {walkabilityMode === 'network' && (
          <div className="temporal-insight-panel">
            <h3>Network Analysis</h3>
            <div className="temporal-select-wrap">
              <label htmlFor="networkMetric">Metric</label>
              <select id="networkMetric" value={networkMetric} onChange={(event) => onNetworkMetricChange(event.target.value)}>
                {NETWORK_METRICS.map(metric => (
                  <option key={metric.id} value={metric.id}>{metric.label}</option>
                ))}
              </select>
            </div>
            <div className="temporal-summary-grid temporal-summary-grid--compact">
              <div className="temporal-card">
                <span className="temporal-card-label">Segments</span>
                <strong>{networkStats?.totalSegments ?? 0}</strong>
                <span>Street network records</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Average</span>
                <strong>{networkStats?.avg ?? '0'}</strong>
                <span>{networkStats?.label ?? 'Metric'}</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Peak</span>
                <strong>{networkStats?.max ?? '0'}</strong>
                <span>Strongest corridor</span>
              </div>
            </div>
          </div>
        )}

        {walkabilityMode === 'transit' && (
          <div className="temporal-insight-panel">
            <h3>Transit Accessibility</h3>
            <div className="temporal-mode-pills temporal-mode-pills--secondary">
              <button className={`temporal-pill ${(transitView || localTransitView) === 'combined' ? 'active' : ''}`} onClick={() => { setLocalTransitView('combined'); onTransitViewChange?.('combined') }}>Combined</button>
              <button className={`temporal-pill ${(transitView || localTransitView) === 'bus' ? 'active' : ''}`} onClick={() => { setLocalTransitView('bus'); onTransitViewChange?.('bus') }}>Bus</button>
              <button className={`temporal-pill ${(transitView || localTransitView) === 'train' ? 'active' : ''}`} onClick={() => { setLocalTransitView('train'); onTransitViewChange?.('train') }}>Train</button>
            </div>
            <div className="temporal-summary-grid temporal-summary-grid--compact">
              <div className="temporal-card">
                <span className="temporal-card-label">Street Segments</span>
                <strong>{transitStats?.totalSegments ?? 0}</strong>
                <span>Accessible links</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Avg Bus Walk</span>
                <strong>{transitStats?.avgBus ?? '0.0'} min</strong>
                <span>To nearest stop</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Avg Train Walk</span>
                <strong>{transitStats?.avgTrain ?? '0.0'} min</strong>
                <span>To nearest station</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WalkabilityAnalytics
