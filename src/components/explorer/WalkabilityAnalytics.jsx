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

const classifyGrade = (grade) => {
  const abs = Math.abs(Number(grade) || 0)
  if (abs < 1) return 'Flat'
  if (abs < 4) return 'Gentle'
  if (abs < 8) return 'Moderate'
  if (abs < 12) return 'Steep'
  return 'Very steep'
}

const formatGrade = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${Math.abs(numeric).toFixed(1)}%` : '—'
}

const directionCopy = (feature) => {
  const props = feature?.properties || feature || {}
  const from = Number(props.uphill_from_elev_m)
  const to = Number(props.uphill_to_elev_m)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'Arrow points uphill'
  return `Arrow points uphill: ${from.toFixed(1)} m to ${to.toFixed(1)} m`
}

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
  networkData,
  transitData,
  roadSteepnessData,
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
  const selectedMonthLabel = walkabilityMonths.find(month => month.key === selectedMonth)?.label || 'All months average'
  const popularRouteStats = useMemo(() => {
    const walkingPopular = (pedestrianData?.features || []).filter(feature => feature.properties?.popular_corridor_flag === 1)
    const cyclingPopular = (cyclingData?.features || []).filter(feature => feature.properties?.popular_corridor_flag === 1)

    return {
      walkingCount: walkingPopular.length,
      cyclingCount: cyclingPopular.length
    }
  }, [pedestrianData, cyclingData])

  const steepnessStats = useMemo(() => {
    const features = roadSteepnessData?.features || []
    const valid = features
      .map((feature) => ({
        feature,
        grade: Number(feature.properties?.net_grade_pct),
        absGrade: Math.abs(Number(feature.properties?.net_grade_pct) || 0)
      }))
      .filter((item) => Number.isFinite(item.grade))
      .sort((a, b) => b.absGrade - a.absGrade)

    const uphill = valid.filter((item) => item.grade > 0.25).length
    const downhill = valid.filter((item) => item.grade < -0.25).length
    const steep = valid.filter((item) => item.absGrade >= 8).length
    const avg = valid.length
      ? valid.reduce((sum, item) => sum + item.absGrade, 0) / valid.length
      : 0

    return {
      total: valid.length,
      uphill,
      downhill,
      steep,
      avg,
      top: valid.slice(0, 8),
      topStreets: Object.values(valid.reduce((acc, item) => {
        const name = item.feature.properties?.street_name || 'Unnamed street'
        if (!acc[name] || item.absGrade > acc[name].absGrade) {
          acc[name] = { ...item, name }
        }
        return acc
      }, {}))
        .sort((a, b) => b.absGrade - a.absGrade)
        .slice(0, 5)
    }
  }, [roadSteepnessData])

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
            <button className={`temporal-pill ${walkabilityMode === 'steepness' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('steepness')}>Steepness</button>
            <button className={`temporal-pill ${walkabilityMode === 'network' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('network')}>Network</button>
            <button className={`temporal-pill ${walkabilityMode === 'transit' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('transit')}>Transit</button>
          </div>
        </div>

        <div className="month-slider-card">
          <div className="month-slider-copy">
            <span className="month-slider-label">Map time window</span>
            <strong>{walkabilityMonths.length ? selectedMonthLabel : 'No month available'}</strong>
          </div>
          <button
            className={`temporal-pill ${!selectedMonth ? 'active' : ''}`}
            onClick={() => onMonthChange?.(null)}
            disabled={!walkabilityMonths.length}
          >
            All Months Avg
          </button>
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
            </div>
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
            <p>
              Orange corridors show walking and running demand. Blue corridors show cycling demand. The map is filtered to the selected month, while route clicks open detailed bottom-panel explanations and stats.
            </p>
            {selectedSegment && (
              <div className="temporal-selection-note">
                <span>Selected edge</span>
                <strong>{selectedSegment.edge_uid}</strong>
              </div>
            )}
          </div>
        )}

        {walkabilityMode === 'steepness' && (
          <div className="temporal-insight-panel">
            <h3>Road Steepness</h3>
            <p>
              Lines are coloured by walking grade. Arrow markers point uphill along each road segment; walking the other way is downhill. Use the table to spot streets that may feel like a climb, a drop, or an easy flat link.
            </p>
            <div className="temporal-summary-grid temporal-summary-grid--compact steepness-summary-grid">
              <div className="temporal-card">
                <span className="temporal-card-label">Segments</span>
                <strong>{steepnessStats.total}</strong>
                <span>Roads with elevation samples</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Avg Grade</span>
                <strong>{steepnessStats.avg.toFixed(1)}%</strong>
                <span>Mean absolute street grade</span>
              </div>
              <div className="temporal-card">
                <span className="temporal-card-label">Steep Links</span>
                <strong>{steepnessStats.steep}</strong>
                <span>Segments at 8% grade or higher</span>
              </div>
            </div>
            <div className="steepness-direction-card">
              <div>
                <span>Uphill direction</span>
                <strong>Follow the arrows</strong>
              </div>
              <div>
                <span>Downhill direction</span>
                <strong>Walk against the arrows</strong>
              </div>
            </div>
            <div className="steepness-top-streets">
              {steepnessStats.topStreets.map(({ feature, grade, name }, index) => (
                <div key={`${name}-${index}`} className="steepness-street-card">
                  <span>#{index + 1}</span>
                  <strong>{name}</strong>
                  <small>{formatGrade(grade)} {classifyGrade(grade).toLowerCase()} grade · {directionCopy(feature)}</small>
                </div>
              ))}
            </div>
            <div className="steepness-table-wrap">
              <table className="steepness-table">
                <thead>
                  <tr>
                    <th>Street</th>
                    <th>Grade</th>
                    <th>Feel</th>
                    <th>Direction</th>
                  </tr>
                </thead>
                <tbody>
                  {steepnessStats.top.map(({ feature, grade }) => {
                    const props = feature.properties || {}
                    return (
                      <tr key={`${props.objectid}-${props.ogc_fid}`}>
                        <td>{props.street_name || 'Unnamed street'}</td>
                        <td>{formatGrade(grade)}</td>
                        <td>{classifyGrade(grade)}</td>
                        <td>{directionCopy(feature)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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
