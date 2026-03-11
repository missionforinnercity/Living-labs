import React, { useMemo, useState } from 'react'
import './EnvironmentAnalytics.css'

// ─── Index definitions ────────────────────────────────────────────────────────

const ENV_INDICES = [
  { id: 'uaqi',             label: 'UAQI',    icon: '🌡', group: 'air' },
  { id: 'poll_o3_value',    label: 'O₃',      icon: '🌫', group: 'air' },
  { id: 'poll_no2_value',   label: 'NO₂',     icon: '🏭', group: 'air' },
  { id: 'poll_pm10_value',  label: 'PM10',    icon: '💨', group: 'air' },
  { id: 'poll_co_value',    label: 'CO',      icon: '🚗', group: 'air' },
  { id: 'poll_so2_value',   label: 'SO₂',    icon: '⚗️', group: 'air' },
  { id: 'avg',              label: 'Avg',     icon: '📊', group: 'air' },
]

const INDEX_FIELD_MAP = Object.fromEntries(ENV_INDICES.map(i => [i.id, i.id]))

// ─── Colour helpers ─────────────────────────────────────────────────────────

const AQI_BANDS = [
  { max: 25,  label: 'Excellent',   color: '#00e676', bg: 'rgba(0,230,118,0.12)' },
  { max: 50,  label: 'Good',        color: '#69f0ae', bg: 'rgba(105,240,174,0.12)' },
  { max: 75,  label: 'Moderate',    color: '#ffd740', bg: 'rgba(255,215,64,0.12)' },
  { max: 100, label: 'Poor',        color: '#ff6d00', bg: 'rgba(255,109,0,0.12)' },
  { max: Infinity, label: 'Very Poor', color: '#f44336', bg: 'rgba(244,67,54,0.12)' }
]



const POLLUTANT_META = {
  poll_o3_value:    { label: 'O₃',    unit: 'µg/m³', maxSafe: 100, color: '#4fc3f7', icon: '🌫', desc: 'Ground-level ozone — respiratory irritant' },
  poll_no2_value:   { label: 'NO₂',   unit: 'µg/m³', maxSafe: 40,  color: '#ce93d8', icon: '🏭', desc: 'Vehicle & industrial exhaust — lung inflammation' },
  poll_pm10_value:  { label: 'PM10',  unit: 'µg/m³', maxSafe: 50,  color: '#ffcc80', icon: '💨', desc: 'Coarse dust & construction particles' },
  poll_co_value:    { label: 'CO',    unit: 'µg/m³', maxSafe: 500, color: '#a5d6a7', icon: '🚗', desc: 'Carbon monoxide — reduces blood oxygen' },
  poll_so2_value:   { label: 'SO₂',   unit: 'µg/m³', maxSafe: 20,  color: '#fff176', icon: '⚗️', desc: 'Fossil fuel emissions — throat irritation' }
}

function aqiBand(uaqi) {
  return AQI_BANDS.find(b => (uaqi ?? 0) <= b.max) || AQI_BANDS.at(-1)
}



// ─── Radial gauge ────────────────────────────────────────────────────────────

function RadialGauge({ value, max, color, label, unit }) {
  const pct = Math.min((value ?? 0) / max, 1)
  const r = 28
  const c = 2 * Math.PI * r
  const dash = pct * c
  const gap  = c - dash
  return (
    <div className="env-gauge">
      <svg viewBox="0 0 72 72" width="72" height="72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${gap}`}
          transform="rotate(-90 36 36)"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x="36" y="38" textAnchor="middle" dominantBaseline="middle"
              fontSize="12" fontWeight="700" fill="#fff">
          {value != null ? Math.round(value) : '—'}
        </text>
      </svg>
      <span className="env-gauge-label">{label}</span>
      <span className="env-gauge-unit">{unit}</span>
    </div>
  )
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null
  const w = 140, h = 36
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const xs = data.map((_, i) => (i / (data.length - 1)) * w)
  const ys = data.map(v => h - ((v - min) / range) * h)
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="env-sparkline">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const EnvironmentAnalytics = ({ currentData, historyData, envIndex = 'uaqi', onEnvIndexChange }) => {
  const [selectedLocation, setSelectedLocation] = useState(null)

  // Aggregate stats across all monitoring points
  const stats = useMemo(() => {
    const rows = currentData?.rows
    if (!rows || rows.length === 0) return null

    const valid = rows.filter(r => r.uaqi != null)
    if (valid.length === 0) return null

    const avgUaqi = Math.round(valid.reduce((s, r) => s + r.uaqi, 0) / valid.length)
    const maxUaqi = Math.max(...valid.map(r => r.uaqi))
    const minUaqi = Math.min(...valid.map(r => r.uaqi))

    // Dominant pollutant distribution
    const dominants = {}
    valid.forEach(r => {
      if (r.uaqi_dominant) {
        dominants[r.uaqi_dominant] = (dominants[r.uaqi_dominant] || 0) + 1
      }
    })
    const topDominant = Object.entries(dominants).sort((a, b) => b[1] - a[1])[0]?.[0]

    // Average pollutants
    const avgPoll = {}
    Object.keys(POLLUTANT_META).forEach(key => {
      const vals = valid.map(r => r[key]).filter(v => v != null)
      avgPoll[key] = vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
    })

    // Updated at
    const updatedAt = valid[0]?.updated_at

    return { avgUaqi, maxUaqi, minUaqi, topDominant, avgPoll, updatedAt, count: valid.length }
  }, [currentData])

  // UAQI history sparkline per location (for selected location)
  const historyByLocation = useMemo(() => {
    const rows = historyData?.rows
    if (!rows) return {}
    const map = {}
    rows.forEach(r => {
      if (!map[r.grid_id]) map[r.grid_id] = []
      map[r.grid_id].push({ hour: r.hour_utc, uaqi: r.uaqi, poll_o3: r.poll_o3, poll_no2: r.poll_no2, poll_pm10: r.poll_pm10, poll_co: r.poll_co, poll_so2: r.poll_so2 })
    })
    return map
  }, [historyData])

  const selectedRow = useMemo(() => {
    if (!selectedLocation || !currentData?.rows) return null
    return currentData.rows.find(r => r.grid_id === selectedLocation)
  }, [selectedLocation, currentData])

  const selectedHistory = selectedLocation ? historyByLocation[selectedLocation] : null

  // Format timestamp
  const fmtTime = (ts) => {
    if (!ts) return '—'
    try { return new Date(ts).toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' }) }
    catch { return ts }
  }

  const band = stats ? aqiBand(stats.avgUaqi) : null

  if (!currentData) {
    return (
      <aside className="env-analytics env-loading">
        <div className="env-loading-pulse">
          <div className="env-loading-ring" />
          <p>Loading environment data…</p>
        </div>
      </aside>
    )
  }

  if (!stats) {
    return (
      <aside className="env-analytics">
        <div className="env-empty">No environment data available</div>
      </aside>
    )
  }

  return (
    <aside className="env-analytics">
      {/* ── Header ── */}
      <div className="env-header">
        <div className="env-header-badges">
          <span className="env-live-dot" title="Live data" />
          <span className="env-header-title">Air Quality</span>
        </div>
        <span className="env-updated">Updated {fmtTime(stats.updatedAt)}</span>
      </div>

      {/* ── Index selector ── */}
      <div className="env-index-selector">
        <div className="env-index-group">
          <span className="env-index-group-label">Metric</span>
          <div className="env-index-btns">
            {ENV_INDICES.map(idx => (
              <button
                key={idx.id}
                className={`env-idx-btn ${envIndex === idx.id ? 'active' : ''}`}
                onClick={() => onEnvIndexChange?.(idx.id)}
                title={idx.label}
              >
                <span className="env-idx-icon">{idx.icon}</span>
                <span className="env-idx-label">{idx.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Color legend bar */}
        <div className="env-legend">
          <div className="env-legend-bar">
            <span style={{ background: '#2563eb' }} />
            <span style={{ background: '#0891b2' }} />
            <span style={{ background: '#059669' }} />
            <span style={{ background: '#65a30d' }} />
            <span style={{ background: '#ca8a04' }} />
            <span style={{ background: '#ea580c' }} />
            <span style={{ background: '#dc2626' }} />
          </div>
          <div className="env-legend-labels">
            <span>Low</span><span>High</span>
          </div>
        </div>
      </div>

      {/* ── Overall AQI Hero ── */}
      <div className="env-hero" style={{ borderColor: band.color, background: band.bg }}>
        <div className="env-hero-left">
          <div className="env-aqi-score" style={{ color: band.color }}>{stats.avgUaqi}</div>
          <div className="env-aqi-label" style={{ color: band.color }}>{band.label}</div>
        </div>
        <div className="env-hero-right">
          <div className="env-hero-stat">
            <span className="env-hs-val">{stats.count}</span>
            <span className="env-hs-lbl">Grid Cells</span>
          </div>
          <div className="env-hero-stat">
            <span className="env-hs-val">{stats.minUaqi}–{stats.maxUaqi}</span>
            <span className="env-hs-lbl">Range</span>
          </div>
          <div className="env-hero-stat">
            <span className="env-hs-val" style={{ textTransform: 'uppercase', fontSize: '0.85em' }}>
              {stats.topDominant ?? '—'}
            </span>
            <span className="env-hs-lbl">Dominant Pollutant</span>
          </div>
        </div>
      </div>

      {/* ── Pollutant gauges ── */}
      {envIndex === 'uaqi' && (
        <div className="env-section">
          <h4 className="env-section-title">Pollutant Levels <span className="env-section-sub">(city average)</span></h4>
          <div className="env-gauges-grid">
            {Object.entries(POLLUTANT_META).map(([key, meta]) => {
              const val = stats.avgPoll[key]
              return (
                <RadialGauge
                  key={key}
                  value={val != null ? Math.round(val * 10) / 10 : null}
                  max={meta.maxSafe * 2}
                  color={meta.color}
                  label={meta.label}
                  unit={meta.unit}
                />
              )
            })}
          </div>
          {/* Pollutant health bar */}
          <div className="env-pollutant-bars">
            {Object.entries(POLLUTANT_META).map(([key, meta]) => {
              const val = stats.avgPoll[key]
              if (val == null) return null
              const pct = Math.min((val / (meta.maxSafe * 2)) * 100, 100)
              const safe = val <= meta.maxSafe
              return (
                <div key={key} className="env-poll-bar-row">
                  <span className="env-poll-bar-name">{meta.icon} {meta.label}</span>
                  <div className="env-poll-bar-track">
                    <div
                      className="env-poll-bar-fill"
                      style={{ width: `${pct}%`, background: safe ? meta.color : '#f44336' }}
                    />
                    <div className="env-poll-bar-threshold" style={{ left: '50%' }} title={`Safe: ${meta.maxSafe} ${meta.unit}`} />
                  </div>
                  <span className="env-poll-bar-val" style={{ color: safe ? meta.color : '#f44336' }}>
                    {Math.round(val * 10) / 10}
                  </span>
                  <span className="env-poll-bar-desc">{meta.desc}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Grid cell drill-down ── */}
      <div className="env-section">
        <h4 className="env-section-title">Grid Cells</h4>
        <div className="env-locations-list">
          {(currentData?.rows || []).map(row => {
            const b = aqiBand(row.uaqi)
            const isSelected = selectedLocation === row.grid_id
            return (
              <button
                key={row.grid_id}
                className={`env-loc-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedLocation(isSelected ? null : row.grid_id)}
              >
                <span className="env-loc-dot" style={{ background: b.color }} />
                <span className="env-loc-name">{row.grid_id.replace(/_/g, ' ')}</span>
                <span className="env-loc-type">500m cell</span>
                <span className="env-loc-uaqi" style={{ color: b.color }}>{row.uaqi}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Selected grid cell detail ── */}
      {selectedRow && (
        <div className="env-detail-panel">
          <div className="env-detail-header">
            <span className="env-detail-title">{selectedRow.grid_id.replace(/_/g, ' ')}</span>
            <button className="env-detail-close" onClick={() => setSelectedLocation(null)}>✕</button>
          </div>

          <div className="env-detail-aqi">
            <span className="env-detail-aqi-val" style={{ color: aqiBand(selectedRow.uaqi).color }}>
              {selectedRow.uaqi}
            </span>
            <div className="env-detail-meta">
              <span style={{ color: aqiBand(selectedRow.uaqi).color }}>{selectedRow.uaqi_category}</span>
              {selectedRow.uaqi_dominant && (
                <span className="env-detail-dominant">
                  Dominant: <strong>{selectedRow.uaqi_dominant?.toUpperCase()}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Pollutants with inline history sparklines */}
          <div className="env-detail-polls">
            {Object.entries(POLLUTANT_META).map(([key, meta]) => {
              const val = selectedRow[key]
              if (val == null) return null
              const pct = Math.min((val / (meta.maxSafe * 2)) * 100, 100)
              const safe = val <= meta.maxSafe
              const hKey = { poll_o3_value: 'poll_o3', poll_no2_value: 'poll_no2', poll_pm10_value: 'poll_pm10', poll_co_value: 'poll_co', poll_so2_value: 'poll_so2' }[key]
              const hVals = selectedHistory ? selectedHistory.map(h => parseFloat(h[hKey])).filter(v => !isNaN(v)) : []
              return (
                <div key={key}>
                  <div className="env-detail-poll-row">
                    <span className="env-detail-poll-name">{meta.icon} {meta.label}</span>
                    <div className="env-detail-poll-track">
                      <div className="env-detail-poll-fill" style={{ width: `${pct}%`, background: safe ? meta.color : '#f44336' }} />
                    </div>
                    <span className="env-detail-poll-val" style={{ color: safe ? meta.color : '#f44336' }}>{Math.round(val * 10) / 10}</span>
                  </div>
                  {hVals.length > 2 && (
                    <div className="env-detail-poll-sparkline">
                      <Sparkline data={hVals} color={safe ? meta.color : '#f44336'} />
                      <span className="env-detail-poll-range">{Math.round(Math.min(...hVals))}–{Math.round(Math.max(...hVals))}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Health advice */}
          {selectedRow.health_general && (
            <div className="env-detail-advice">
              <span className="env-detail-advice-icon">ℹ</span>
              <p>{selectedRow.health_general}</p>
            </div>
          )}

          {/* History — multi-metric */}
          {selectedHistory && selectedHistory.length > 0 && (
            <div className="env-detail-history">
              <span className="env-detail-history-label">UAQI History</span>
              <div className="env-detail-history-stats">
                <span>Min: {Math.min(...selectedHistory.map(h => h.uaqi).filter(v => v != null))}</span>
                <span>Max: {Math.max(...selectedHistory.map(h => h.uaqi).filter(v => v != null))}</span>
              </div>
              <Sparkline
                data={selectedHistory.map(h => h.uaqi)}
                color={aqiBand(selectedRow.uaqi).color}
              />
            </div>
          )}
        </div>
      )}
    </aside>
  )
}

export default EnvironmentAnalytics
