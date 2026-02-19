import React from 'react'
import './TrafficAnalytics.css'

export const TRAFFIC_SCENARIOS = [
  {
    id: 'WORK_MORNING',
    field: 'kpi_work_morning',
    label: 'Work Morning',
    date: 'Wed 25 Feb 2026',
    time: '07:30',
    category: 'Working City',
    categoryColor: '#3b82f6',
    description: 'Weekday morning commute — offices, schools and markets coming alive.'
  },
  {
    id: 'WORK_SCHOOL_RUN',
    field: 'kpi_work_school_run',
    label: 'School / Lunch Run',
    date: 'Wed 25 Feb 2026',
    time: '14:30',
    category: 'Working City',
    categoryColor: '#3b82f6',
    description: 'School pickup and midday retail traffic converge in the CBD.'
  },
  {
    id: 'WORK_EVENING',
    field: 'kpi_work_evening',
    label: 'Evening Rush',
    date: 'Wed 25 Feb 2026',
    time: '17:00',
    category: 'Working City',
    categoryColor: '#3b82f6',
    description: 'Peak outbound commute — heaviest pressure on arterial routes.'
  },
  {
    id: 'MISSION_FEB_EVENT',
    field: 'kpi_mission_feb_event',
    label: 'Inner City Saturday',
    date: 'Sat 28 Feb 2026',
    time: '11:00',
    category: 'Mission Events',
    categoryColor: '#f97316',
    description: 'Last Saturday of the month — Mission for Inner City placemaking event. Traffic pattern is consistent across all Inner City Saturday events.'
  },
  {
    id: 'FIRST_THURSDAY',
    field: 'kpi_first_thursday',
    label: 'First Thursday',
    date: 'Thu 5 Mar 2026',
    time: '19:00',
    category: 'Nightlife & Art',
    categoryColor: '#a855f7',
    description: 'Monthly art walk and gallery openings — foot traffic surges on De Waterkant.'
  },
  {
    id: 'NIGHTLIFE_SAT',
    field: 'kpi_nightlife_peak',
    label: 'Nightlife Peak',
    date: 'Sat 7 Mar 2026',
    time: '22:30',
    category: 'Nightlife & Art',
    categoryColor: '#a855f7',
    description: 'Saturday late-night entertainment peak across bars and clubs.'
  },
  {
    id: 'BASELINE',
    field: 'kpi_baseline',
    label: 'Baseline',
    date: 'Sun 22 Feb 2026',
    time: '03:00',
    category: 'Baseline',
    categoryColor: '#6b7280',
    description: 'Quiet early Sunday morning — near-zero activity reference state.'
  }
]

const CATEGORY_GROUPS = [
  { id: 'Working City', color: '#3b82f6', bgColor: 'rgba(59,130,246,0.08)' },
  { id: 'Mission Events', color: '#f97316', bgColor: 'rgba(249,115,22,0.08)' },
  { id: 'Nightlife & Art', color: '#a855f7', bgColor: 'rgba(168,85,247,0.08)' },
  { id: 'Baseline', color: '#6b7280', bgColor: 'rgba(107,114,128,0.08)' }
]

const TrafficAnalytics = ({
  trafficData,
  activeScenario,
  onScenarioChange,
  hideLayerControls = false
}) => {
  // Compute summary stats for active scenario
  const activeConfig = TRAFFIC_SCENARIOS.find(s => s.id === activeScenario)

  const stats = React.useMemo(() => {
    if (!trafficData?.features || !activeConfig) return null
    const features = trafficData.features
    const kpiField = activeConfig.field
    const values = features
      .map(f => f.properties[kpiField])
      .filter(v => v !== null && v !== undefined && v > 0)

    if (values.length === 0) return null

    const avg = values.reduce((s, v) => s + v, 0) / values.length
    const max = Math.max(...values)

    const quiet = values.filter(v => v < 0.6).length
    const moderate = values.filter(v => v >= 0.6 && v < 1.0).length
    const busy = values.filter(v => v >= 1.0 && v < 1.4).length
    const congested = values.filter(v => v >= 1.4).length

    const congLevels = {}
    features.forEach(f => {
      const cl = f.properties.congestion_level || 'Unknown'
      congLevels[cl] = (congLevels[cl] || 0) + 1
    })

    return {
      total: features.length,
      analyzed: values.length,
      avg: avg.toFixed(2),
      max: max.toFixed(2),
      quiet,
      moderate,
      busy,
      congested,
      congLevels
    }
  }, [trafficData, activeConfig])

  return (
    <div className="traffic-analytics">
      {/* Section header */}
      <div className="analytics-section">
        <div className="section-header">
          <h3>Traffic Analysis</h3>
          <span className="data-date">Predicted: Feb–Dec 2026</span>
        </div>

        <p className="traffic-intro">
          Street-level traffic KPIs predicted for 7 real-world scenarios across working hours,
          Mission events and nightlife peaks. Select a scenario to visualise relative busyness
          on every road segment.
        </p>

        {/* Scenario selector grouped by category */}
        <div className="subsection-header">
          <h4>Select Scenario</h4>
        </div>

        {CATEGORY_GROUPS.map(group => (
          <div
            key={group.id}
            className="scenario-group"
            style={{ borderColor: group.color, background: group.bgColor }}
          >
            <div
              className="scenario-group-label"
              style={{ color: group.color }}
            >
              {group.id}
            </div>
            {TRAFFIC_SCENARIOS.filter(s => s.category === group.id).map(scenario => (
              <button
                key={scenario.id}
                className={`scenario-btn ${activeScenario === scenario.id ? 'active' : ''}`}
                style={activeScenario === scenario.id ? {
                  borderColor: group.color,
                  background: group.bgColor,
                  boxShadow: `0 0 0 1px ${group.color}`
                } : {}}
                onClick={() => onScenarioChange(scenario.id)}
              >
                <div className="scenario-text">
                  <span className="scenario-label">{scenario.label}</span>
                  <span className="scenario-datetime">{scenario.date} · {scenario.time}</span>
                </div>
                {activeScenario === scenario.id && (
                  <span className="scenario-active-dot" style={{ background: group.color }}></span>
                )}
              </button>
            ))}
          </div>
        ))}

        {/* Active scenario description */}
        {activeConfig && (
          <div className="scenario-description">
            <div>
              <strong style={{ color: activeConfig.categoryColor }}>{activeConfig.label}</strong>
              <p>{activeConfig.description}</p>
            </div>
          </div>
        )}
      </div>

      {/* Summary stats for active scenario */}
      {stats && (
        <div className="analytics-section">
          <div className="subsection-header">
            <h4>Scenario Summary</h4>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Segments</div>
            </div>
            <div className="stat-card primary">
              <div className="stat-value">{stats.avg}</div>
              <div className="stat-label">Avg Traffic KPI</div>
              <div className="stat-sublabel">1.0 = average flow</div>
            </div>
            <div className="stat-card warning">
              <div className="stat-value">{stats.max}</div>
              <div className="stat-label">Peak KPI</div>
              <div className="stat-sublabel">Busiest segment</div>
            </div>
          </div>

          {/* Traffic distribution bar */}
          <div className="subsection-header" style={{ marginTop: '1rem' }}>
            <h4>Traffic Distribution</h4>
          </div>
          <div className="traffic-distribution">
            <div className="dist-bar">
              <div
                className="dist-segment"
                style={{
                  width: `${(stats.quiet / stats.analyzed) * 100}%`,
                  background: '#3b82f6'
                }}
                title={`Quiet: ${stats.quiet} segments`}
              />
              <div
                className="dist-segment"
                style={{
                  width: `${(stats.moderate / stats.analyzed) * 100}%`,
                  background: '#10b981'
                }}
                title={`Moderate: ${stats.moderate} segments`}
              />
              <div
                className="dist-segment"
                style={{
                  width: `${(stats.busy / stats.analyzed) * 100}%`,
                  background: '#f59e0b'
                }}
                title={`Busy: ${stats.busy} segments`}
              />
              <div
                className="dist-segment"
                style={{
                  width: `${(stats.congested / stats.analyzed) * 100}%`,
                  background: '#ef4444'
                }}
                title={`Congested: ${stats.congested} segments`}
              />
            </div>
            <div className="dist-legend">
              <span className="dist-item"><span className="dot" style={{ background: '#3b82f6' }}></span>Quiet ({stats.quiet})</span>
              <span className="dist-item"><span className="dot" style={{ background: '#10b981' }}></span>Moderate ({stats.moderate})</span>
              <span className="dist-item"><span className="dot" style={{ background: '#f59e0b' }}></span>Busy ({stats.busy})</span>
              <span className="dist-item"><span className="dot" style={{ background: '#ef4444' }}></span>Congested ({stats.congested})</span>
            </div>
          </div>
        </div>
      )}

      {/* Map legend */}
      <div className="analytics-section">
        <div className="subsection-header">
          <h4>Map Legend</h4>
        </div>
        <div className="traffic-legend">
          <div className="legend-row">
            <div className="legend-swatch" style={{ background: 'linear-gradient(to right, #1e3a8a, #3b82f6, #10b981, #fbbf24, #f59e0b, #ef4444, #991b1b)' }}></div>
            <div className="legend-labels">
              <span>Quiet</span>
              <span>↔</span>
              <span>Congested</span>
            </div>
          </div>
          <div className="legend-detail">
            <span className="ld-item"><span style={{ color: '#3b82f6' }}>●</span> KPI &lt; 0.6 — quiet</span>
            <span className="ld-item"><span style={{ color: '#10b981' }}>●</span> 0.6–1.0 — moderate</span>
            <span className="ld-item"><span style={{ color: '#fbbf24' }}>●</span> 1.0–1.3 — busy</span>
            <span className="ld-item"><span style={{ color: '#ef4444' }}>●</span> 1.3+ — congested</span>
          </div>
          <p className="legend-note">
            KPI is a relative traffic index: 1.0 represents average flow. Values above 1.0 indicate
            higher-than-average activity; below 1.0 is quieter.
          </p>
        </div>
      </div>
    </div>
  )
}

export default TrafficAnalytics
