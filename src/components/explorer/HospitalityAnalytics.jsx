import React from 'react'
import './HospitalityAnalytics.css'

const SCOPES = [
  { id: 'cbd', label: 'CBD' },
  { id: 'ccid', label: 'CCID' },
  { id: 'all', label: 'Cape Town' }
]

const MAP_MODES = [
  { id: 'points', label: 'Listings' },
  { id: 'zones', label: 'Value Zones' }
]

const formatNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '-'
}

const formatRand = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '-'
  if (Math.abs(numeric) >= 1000000000) return `R ${(numeric / 1000000000).toFixed(1)}B`
  if (Math.abs(numeric) >= 1000000) return `R ${(numeric / 1000000).toFixed(1)}M`
  if (Math.abs(numeric) >= 1000) return `R ${Math.round(numeric / 1000)}k`
  return `R ${Math.round(numeric).toLocaleString()}`
}

const formatPercent = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(1)}%` : '-'
}

const formatMonth = (value) => {
  if (!value) return '-'
  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short' })
}

const normalizeShare = (value, fallback = 0) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return numeric <= 1 ? numeric * 100 : numeric
}

const HospitalityAnalytics = ({
  analytics,
  listingsData,
  loading,
  error,
  scope,
  onScopeChange,
  mapMode,
  onMapModeChange,
  zoneMetric,
  onZoneMetricChange
}) => {
  const stats = analytics?.stats || {}
  const seasonality = analytics?.seasonality || {}
  const inventory = analytics?.inventory || {}
  const hosts = analytics?.hosts || []
  const propertyTypes = inventory.propertyTypes || []
  const maxHostGross = Math.max(...hosts.map((host) => Number(host.annual_gross) || 0), 1)
  const maxPropertyCount = Math.max(...propertyTypes.map((item) => Number(item.count) || 0), 1)

  return (
    <div className="hospitality-analytics">
      <div className="hospitality-hero">
        <span>Short-term rental market</span>
        <h2>Hospitality</h2>
        <p>Inside Airbnb snapshot {analytics?.metadata?.snapshot_date || 'loading'}</p>
      </div>

      <div className="hospitality-segmented" role="tablist" aria-label="Hospitality geography">
        {SCOPES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={scope === item.id ? 'active' : ''}
            onClick={() => onScopeChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="hospitality-section">
        <div className="hospitality-section-head">
          <span>Map Paint</span>
          <strong>{mapMode === 'zones' ? 'Relative zone performance' : `${formatNumber(listingsData?.features?.length || 0)} listings`}</strong>
        </div>
        <div className="hospitality-map-modes">
          {MAP_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mapMode === item.id ? 'active' : ''}
              onClick={() => onMapModeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {mapMode === 'zones' && (
          <div className="hospitality-zone-metrics">
            <button type="button" className={zoneMetric === 'revenue' ? 'active' : ''} onClick={() => onZoneMetricChange('revenue')}>Revenue</button>
            <button type="button" className={zoneMetric === 'adr' ? 'active' : ''} onClick={() => onZoneMetricChange('adr')}>ADR</button>
            <button type="button" className={zoneMetric === 'occupancy' ? 'active' : ''} onClick={() => onZoneMetricChange('occupancy')}>Occupancy</button>
            <button type="button" className={zoneMetric === 'rating' ? 'active' : ''} onClick={() => onZoneMetricChange('rating')}>Ratings</button>
          </div>
        )}
        {mapMode === 'zones' && (
          <div className="hospitality-zone-legend" aria-label="Airbnb zone colour legend">
            <div>
              <i style={{ background: '#b91c1c' }} />
              <span>Bottom 10%</span>
            </div>
            <div>
              <i style={{ background: '#ef4444' }} />
              <span>Bottom 25%</span>
            </div>
            <div>
              <i style={{ background: '#fb923c' }} />
              <span>Lower-mid</span>
            </div>
            <div>
              <i style={{ background: '#facc15' }} />
              <span>Middle</span>
            </div>
            <div>
              <i style={{ background: '#a3e635' }} />
              <span>Upper-mid</span>
            </div>
            <div>
              <i style={{ background: '#22c55e' }} />
              <span>Top 25%</span>
            </div>
            <div>
              <i style={{ background: '#047857' }} />
              <span>Top 10%</span>
            </div>
          </div>
        )}
      </div>

      {error && <div className="hospitality-error">{error}</div>}
      {loading && <div className="hospitality-loading">Loading hospitality market...</div>}

      <div className="hospitality-stats-grid">
        <div><span>Active units</span><strong>{formatNumber(stats.active_units)}</strong></div>
        <div><span>Total floor area</span><strong>{formatNumber(stats.total_floor_area)} m²</strong></div>
        <div><span>Median ADR</span><strong>{formatRand(stats.median_adr)}</strong></div>
        <div><span>Annual NOI</span><strong>{formatRand(stats.annual_noi)}</strong></div>
      </div>

      <div className="hospitality-section">
        <div className="hospitality-section-head">
          <span>Seasonality</span>
          <strong>{formatPercent(seasonality.annualMean)} annual mean</strong>
        </div>
        <div className="hospitality-month-bars">
          {(seasonality.monthly || []).map((month) => {
            const occupancy = normalizeShare(month.occupancy)
            const isPeak = month.month === seasonality.peakMonth?.month
            const isLow = month.month === seasonality.lowMonth?.month
            return (
              <div key={month.month} className={`hospitality-month ${isPeak ? 'peak' : ''} ${isLow ? 'low' : ''}`}>
                <div className="hospitality-month-bar" style={{ height: `${Math.max(6, occupancy)}%` }} />
                <span>{formatMonth(month.month)}</span>
              </div>
            )
          })}
        </div>
        <div className="hospitality-season-cards">
          <div><span>Peak</span><strong>{formatMonth(seasonality.peakMonth?.month)}</strong><small>{formatPercent(seasonality.peakMonth?.occupancy)} occupied</small></div>
          <div><span>Low</span><strong>{formatMonth(seasonality.lowMonth?.month)}</strong><small>{formatPercent(seasonality.lowMonth?.occupancy)} occupied</small></div>
        </div>
      </div>

      <div className="hospitality-section">
        <div className="hospitality-section-head">
          <span>Inventory</span>
          <strong>{formatNumber(stats.active_units)} listings</strong>
        </div>
        <div className="hospitality-mix">
          <span>Bedrooms</span>
          <div>
            {(inventory.bedrooms || []).map((item) => (
              <i key={item.label} style={{ flexGrow: Math.max(1, item.count) }}>{item.label}</i>
            ))}
          </div>
        </div>
        <div className="hospitality-mix">
          <span>Room Type</span>
          <div>
            {(inventory.roomTypes || []).map((item) => (
              <i key={item.label} style={{ flexGrow: Math.max(1, item.count) }}>{item.label}</i>
            ))}
          </div>
        </div>
        <div className="hospitality-bars">
          {propertyTypes.map((item) => (
            <div key={item.label} className="hospitality-bar-row">
              <span>{item.label}</span>
              <div><i style={{ width: `${(item.count / maxPropertyCount) * 100}%` }} /></div>
              <strong>{formatNumber(item.count)}</strong>
            </div>
          ))}
        </div>
        <div className="hospitality-mini-stats">
          <div><span>Avg unit size</span><strong>{formatNumber(stats.median_unit_size)} m²</strong></div>
          <div><span>Avg bedrooms</span><strong>{Number.isFinite(Number(stats.avg_bedrooms)) ? Number(stats.avg_bedrooms).toFixed(2) : '-'}</strong></div>
          <div><span>Avg rating</span><strong>{Number.isFinite(Number(stats.avg_rating)) ? Number(stats.avg_rating).toFixed(2) : '-'}</strong></div>
        </div>
      </div>

      <div className="hospitality-section">
        <div className="hospitality-section-head">
          <span>Host concentration</span>
          <strong>Top earners</strong>
        </div>
        <div className="hospitality-hosts">
          {hosts.map((host, index) => (
            <div key={host.host_id} className="hospitality-host-row">
              <span>{index + 1}</span>
              <strong>{host.host_name || `host #${host.host_id}`}</strong>
              <div><i style={{ width: `${((Number(host.annual_gross) || 0) / maxHostGross) * 100}%` }} /></div>
              <em>{formatRand(host.annual_gross)}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="hospitality-section hospitality-method">
        <div className="hospitality-section-head">
          <span>Methodology</span>
          <strong>{analytics?.metadata?.scopeLabel || 'CBD'}</strong>
        </div>
        <p>Zones compare nearby Airbnb listings using H3 cells. High and low outlines are relative to the current scope, so weak performers and strong clusters stand out on the same map.</p>
      </div>
    </div>
  )
}

export default HospitalityAnalytics
