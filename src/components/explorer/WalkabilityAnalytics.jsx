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

const WALKABILITY_SECTION_META = {
  activity: {
    kicker: 'Active Mobility',
    title: 'Walking, Running & Cycling',
    intro: 'Follow observed movement patterns over time and compare walking demand with cycling demand.'
  },
  steepness: {
    kicker: 'Terrain',
    title: 'Road Steepness',
    intro: 'Inspect climb intensity, uphill direction, and which streets may feel hardest on foot.'
  },
  network: {
    kicker: 'Street Network',
    title: 'Network Analysis',
    intro: 'Review centrality metrics to see which corridors matter most to movement through the inner city.'
  },
  transit: {
    kicker: 'Public Transport',
    title: 'Transit Accessibility',
    intro: 'Compare walking access to bus stops and train stations across the mapped street network.'
  }
}

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

const formatCompact = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: numeric >= 1000 ? 1 : 0
  }).format(numeric)
}

const formatPercent = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : '—'
}

const formatSpeed = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)} m/s` : '—'
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
  const sectionMeta = WALKABILITY_SECTION_META[walkabilityMode] || WALKABILITY_SECTION_META.activity

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

  const activityStats = useMemo(() => {
    const pedestrianFeatures = pedestrianData?.features || []
    const cyclingFeatures = cyclingData?.features || []
    const walkingTrips = pedestrianFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.total_trip_count) || 0), 0)
    const cyclingTrips = cyclingFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.total_trip_count) || 0), 0)
    const walkingPeople = pedestrianFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.total_people_count) || 0), 0)
    const cyclingPeople = cyclingFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.total_people_count) || 0), 0)
    const totalTrips = walkingTrips + cyclingTrips
    const totalPeople = walkingPeople + cyclingPeople
    const activeSegments = new Set([
      ...pedestrianFeatures.map((feature) => feature.properties?.edge_uid),
      ...cyclingFeatures.map((feature) => feature.properties?.edge_uid)
    ].filter((value) => value != null)).size
    const walkingShare = totalTrips > 0 ? (walkingTrips / totalTrips) * 100 : 0
    const cyclingShare = totalTrips > 0 ? (cyclingTrips / totalTrips) * 100 : 0
    const walkingCommute = pedestrianFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.commute) || 0), 0)
    const cyclingCommute = cyclingFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.commute) || 0), 0)
    const totalCommute = walkingCommute + cyclingCommute
    const walkingLeisure = pedestrianFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.recreation) || 0), 0)
    const cyclingLeisure = cyclingFeatures.reduce((sum, feature) => sum + (Number(feature.properties?.recreation) || 0), 0)
    const totalLeisure = walkingLeisure + cyclingLeisure
    const weightedWalkSpeed = pedestrianFeatures.reduce((sum, feature) => sum + ((Number(feature.properties?.avg_speed) || 0) * (Number(feature.properties?.total_trip_count) || 0)), 0)
    const weightedCycleSpeed = cyclingFeatures.reduce((sum, feature) => sum + ((Number(feature.properties?.forward_average_speed_meters_per_second) || Number(feature.properties?.avg_speed) || 0) * (Number(feature.properties?.total_trip_count) || 0)), 0)
    const avgWalkSpeed = walkingTrips > 0 ? weightedWalkSpeed / walkingTrips : 0
    const avgCycleSpeed = cyclingTrips > 0 ? weightedCycleSpeed / cyclingTrips : 0

    return {
      totalTrips,
      totalPeople,
      activeSegments,
      avgTripsPerSegment: activeSegments > 0 ? totalTrips / activeSegments : 0,
      walkingShare,
      cyclingShare,
      totalCommute,
      totalLeisure,
      avgWalkSpeed,
      avgCycleSpeed
    }
  }, [cyclingData, pedestrianData])

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
            <p className="walkability-kicker">{sectionMeta.kicker}</p>
            <h2>{sectionMeta.title}</h2>
            <p className="walkability-header-copy">{sectionMeta.intro}</p>
          </div>
          <div className="temporal-mode-pills">
            <button className={`temporal-pill ${walkabilityMode === 'activity' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('activity')}>Routes</button>
            <button className={`temporal-pill ${walkabilityMode === 'steepness' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('steepness')}>Steepness</button>
            <button className={`temporal-pill ${walkabilityMode === 'network' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('network')}>Network</button>
            <button className={`temporal-pill ${walkabilityMode === 'transit' ? 'active' : ''}`} onClick={() => onWalkabilityModeChange('transit')}>Transit</button>
          </div>
        </div>

        {walkabilityMode === 'activity' && (
          <div className="walkability-activity-shell">
            <div className="walkability-activity-metrics">
              <div className="walkability-activity-card">
                <span className="walkability-activity-label">Active Corridors</span>
                <strong>{formatCompact(activityStats.activeSegments)}</strong>
                <small>Mapped walking and cycling links</small>
              </div>
              <div className="walkability-activity-card">
                <span className="walkability-activity-label">Observed Trips</span>
                <strong>{formatCompact(activityStats.totalTrips)}</strong>
                <small>{formatCompact(activityStats.totalPeople)} people observed</small>
              </div>
              <div className="walkability-activity-card walkability-activity-card--accent">
                <span className="walkability-activity-label">Walking / Running Share</span>
                <strong>{formatPercent(activityStats.walkingShare)}</strong>
                <small>{formatSpeed(activityStats.avgWalkSpeed)} typical pace</small>
              </div>
              <div className="walkability-activity-card walkability-activity-card--accent-alt">
                <span className="walkability-activity-label">Cycling Share</span>
                <strong>{formatPercent(activityStats.cyclingShare)}</strong>
                <small>{formatSpeed(activityStats.avgCycleSpeed)} typical pace</small>
              </div>
            </div>

            <div className="month-slider-card month-slider-card--mobility">
              <div className="month-slider-copy">
                <span className="month-slider-label">Study window</span>
                <strong>{walkabilityMonths.length ? selectedMonthLabel : 'No month available'}</strong>
              </div>
              <div className="walkability-activity-kpis">
                <div>
                  <span>Popular walk corridors</span>
                  <strong>{popularRouteStats.walkingCount}</strong>
                </div>
                <div>
                  <span>Popular cycle corridors</span>
                  <strong>{popularRouteStats.cyclingCount}</strong>
                </div>
                <div>
                  <span>Trips per corridor</span>
                  <strong>{formatCompact(activityStats.avgTripsPerSegment)}</strong>
                </div>
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
          </div>
        )}

        {walkabilityMode === 'activity' && (
          <div className="temporal-insight-panel temporal-insight-panel--mobility">
            <div className="temporal-insight-topline">
              <h3>Study Area Snapshot</h3>
              <span>{activityStats.totalCommute > activityStats.totalLeisure ? 'Commute-led movement' : 'Leisure-led movement'}</span>
            </div>
            <div className="temporal-mode-pills temporal-mode-pills--secondary walkability-segmented">
              <button className={`temporal-pill ${routeLayerMode === 'combined' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('combined')}>Both Modes</button>
              <button className={`temporal-pill ${routeLayerMode === 'walking' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('walking')}>Walking Only</button>
              <button className={`temporal-pill ${routeLayerMode === 'cycling' ? 'active' : ''}`} onClick={() => onRouteLayerModeChange?.('cycling')}>Cycling Only</button>
            </div>
            <div className="temporal-mode-pills temporal-mode-pills--secondary temporal-mode-pills--top-routes walkability-top-routes-toggle">
              <button
                className={`temporal-pill ${showPopularRoutesOnly ? 'active' : ''}`}
                onClick={() => onShowPopularRoutesOnlyChange?.(!showPopularRoutesOnly)}
              >
                {showPopularRoutesOnly ? 'Showing High-Use Routes' : 'Highlight High-Use Routes'}
              </button>
            </div>
            <div className="walkability-route-insight-grid">
              <div className="walkability-route-insight">
                <span>Trip purpose</span>
                <strong>{activityStats.totalCommute >= activityStats.totalLeisure ? 'Commute' : 'Leisure'} dominant</strong>
                <small>{formatCompact(Math.max(activityStats.totalCommute, activityStats.totalLeisure))} observed trips in the leading purpose group</small>
              </div>
              <div className="walkability-route-insight">
                <span>Walking demand</span>
                <strong>{formatCompact(activityStats.totalTrips * (activityStats.walkingShare / 100))}</strong>
                <small>{formatPercent(activityStats.walkingShare)} of all active mobility trips</small>
              </div>
              <div className="walkability-route-insight">
                <span>Cycling demand</span>
                <strong>{formatCompact(activityStats.totalTrips * (activityStats.cyclingShare / 100))}</strong>
                <small>{formatPercent(activityStats.cyclingShare)} of all active mobility trips</small>
              </div>
            </div>
            <p>
              The map uses soft gradient corridors instead of hard classes. The bottom panel opens with study-area insights by default and switches to corridor-specific detail when you click a segment.
            </p>
            {selectedSegment && (
              <div className="temporal-selection-note temporal-selection-note--mobility">
                <span>Selected corridor</span>
                <strong>Edge {selectedSegment.edge_uid}</strong>
                <small>Detailed route behaviour is now focused on one segment at a time.</small>
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
