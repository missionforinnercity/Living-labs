import React, { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import './GreeneryAnalytics.css'

const ACCESS_BANDS = [
  { key: 'excellent', label: '< 2 min', max: 2, color: '#166534' },
  { key: 'good', label: '2-5 min', max: 5, color: '#22c55e' },
  { key: 'moderate', label: '5-8 min', max: 8, color: '#84cc16' },
  { key: 'stretched', label: '8-12 min', max: 12, color: '#d9f99d' },
  { key: 'poor', label: '12+ min', max: Infinity, color: '#f59e0b' }
]

const QUALITY_COLORS = {
  very_high: '#14532d',
  high: '#22c55e',
  medium: '#a3e635',
  low: '#facc15',
  very_low: '#f97316',
  unknown: '#64748b'
}

const DESTINATION_COLORS = {
  park: '#22c55e',
  garden: '#84cc16',
  beach: '#38bdf8',
  other: '#94a3b8'
}

const formatMinutes = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)} min` : '—'
}

const formatPercent = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : '—'
}

const formatStreet = (value) => {
  if (!value) return 'Unnamed street'
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

const GreeneryAnalytics = ({
  greeneryAndSkyview,
  parksData,
  allLayersActive = false,
  showGreenDestinations = true,
  onToggleGreenDestinations,
  insightsExpanded = false,
  onInsightsExpandedChange,
  greeneryMapMode = 'percentile',
  onGreeneryMapModeChange,
  showUnderservedGreenery = true,
  onShowUnderservedGreeneryChange
}) => {
  const analytics = useMemo(() => {
    const segmentFeatures = greeneryAndSkyview?.features || []
    const destinationFeatures = parksData?.features || []
    if (!segmentFeatures.length) return null

    const validSegments = segmentFeatures.filter((feature) => {
      const value = Number(feature?.properties?.quality_adjusted_park_minutes)
      return Number.isFinite(value)
    })
    if (!validSegments.length) return null

    const accessBands = ACCESS_BANDS.map((band, index) => {
      const min = index === 0 ? -Infinity : ACCESS_BANDS[index - 1].max
      const count = validSegments.filter((feature) => {
        const value = Number(feature.properties.quality_adjusted_park_minutes)
        return value > min && value <= band.max
      }).length
      return {
        ...band,
        count,
        share: (count / validSegments.length) * 100
      }
    })

    const streetMap = new Map()
    validSegments.forEach((feature) => {
      const props = feature.properties || {}
      const streetKey = props.str_name || props.str_name_mdf || props.segment_id || 'Unknown'
      if (!streetMap.has(streetKey)) {
        streetMap.set(streetKey, {
          street: streetKey,
          segments: 0,
          adjusted: [],
          walk: [],
          quality: [],
          gaps: 0
        })
      }
      const bucket = streetMap.get(streetKey)
      bucket.segments += 1
      bucket.adjusted.push(Number(props.quality_adjusted_park_minutes))
      bucket.walk.push(Number(props.walk_time_minutes))
      bucket.quality.push(Number(props.park_quality_score))
      if (props.residential_access_gap) bucket.gaps += 1
    })

    const streets = [...streetMap.values()]
      .map((street) => ({
        street: formatStreet(street.street),
        rawStreet: street.street,
        segments: street.segments,
        avgAdjusted: street.adjusted.reduce((sum, value) => sum + value, 0) / street.adjusted.length,
        avgWalk: street.walk.reduce((sum, value) => sum + value, 0) / street.walk.length,
        avgQuality: street.quality.reduce((sum, value) => sum + value, 0) / street.quality.length,
        gapShare: (street.gaps / street.segments) * 100
      }))
      .filter((street) => street.segments >= 3)

    const topStreets = [...streets]
      .sort((a, b) => a.avgAdjusted - b.avgAdjusted)
      .slice(0, 5)

    const underservedStreets = [...streets]
      .sort((a, b) => b.avgAdjusted - a.avgAdjusted)
      .slice(0, 5)

    const qualityMixMap = new Map()
    validSegments.forEach((feature) => {
      const qualityClass = feature?.properties?.park_quality_class || 'unknown'
      qualityMixMap.set(qualityClass, (qualityMixMap.get(qualityClass) || 0) + 1)
    })
    const qualityMix = [...qualityMixMap.entries()]
      .map(([qualityClass, count]) => ({
        qualityClass,
        label: qualityClass.replace(/_/g, ' '),
        count,
        color: QUALITY_COLORS[qualityClass] || QUALITY_COLORS.unknown
      }))
      .sort((a, b) => b.count - a.count)

    const destinationMixMap = new Map()
    destinationFeatures.forEach((feature) => {
      const type = feature?.properties?.destination_type || 'other'
      destinationMixMap.set(type, (destinationMixMap.get(type) || 0) + 1)
    })
    const destinationMix = [...destinationMixMap.entries()]
      .map(([type, count]) => ({
        type,
        label: type.replace(/_/g, ' '),
        count,
        color: DESTINATION_COLORS[type] || DESTINATION_COLORS.other
      }))
      .sort((a, b) => b.count - a.count)

    const adjustedValues = validSegments.map((feature) => Number(feature.properties.quality_adjusted_park_minutes))
    const walkValues = validSegments.map((feature) => Number(feature.properties.walk_time_minutes))
    const qualityValues = validSegments
      .map((feature) => Number(feature.properties.park_quality_score))
      .filter((value) => Number.isFinite(value))

    const accessGapCount = validSegments.filter((feature) => feature?.properties?.residential_access_gap).length
    const residentialSegments = validSegments.filter((feature) => feature?.properties?.is_residential_proxy).length
    const underserved15Count = validSegments.filter((feature) => feature?.properties?.underserved_15_min).length

    return {
      headline: {
        segments: validSegments.length,
        streets: streetMap.size,
        destinations: destinationFeatures.length,
        avgAdjusted: adjustedValues.reduce((sum, value) => sum + value, 0) / adjustedValues.length,
        avgWalk: walkValues.reduce((sum, value) => sum + value, 0) / walkValues.length,
        avgQuality: qualityValues.length ? qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length : null,
        accessGapCount,
        accessGapShare: (accessGapCount / validSegments.length) * 100,
        residentialSegments,
        underserved15Count,
        underserved15Share: (underserved15Count / validSegments.length) * 100
      },
      accessBands,
      qualityMix,
      destinationMix,
      topStreets,
      underservedStreets
    }
  }, [greeneryAndSkyview, parksData])

  if (!analytics) {
    return (
      <aside className="greenery-analytics">
        <div className="greenery-empty">Loading green access analytics…</div>
      </aside>
    )
  }

  const { headline, accessBands, qualityMix, destinationMix, topStreets, underservedStreets } = analytics

  return (
    <aside className="greenery-analytics">
      <div className="greenery-hero">
        <div>
          <span className="greenery-kicker">Green Access Explorer</span>
          <h2>Street-to-park access, destination quality, and gap detection</h2>
          <p>
            Streets are coloured by quality-adjusted walk time to greenery. Click one street for a deep dive, then click a second to compare.
          </p>
        </div>
        <div className="greenery-hero-score">
          <span>{formatMinutes(headline.avgAdjusted)}</span>
          <small>citywide adjusted access time</small>
        </div>
      </div>

      <div className="greenery-toolbar">
        <div className="greenery-toggle-group">
          <label className="greenery-toggle">
            <input
              type="checkbox"
              checked={showGreenDestinations}
              onChange={() => onToggleGreenDestinations?.()}
            />
            <span>Show Green Destinations</span>
          </label>
          <label className="greenery-toggle">
            <input
              type="checkbox"
              checked={showUnderservedGreenery}
              onChange={() => onShowUnderservedGreeneryChange?.(!showUnderservedGreenery)}
            />
            <span>Highlight 15+ Min Streets</span>
          </label>
        </div>
        <div className="greenery-mode-switch" role="tablist" aria-label="Greenery map mode">
          <button
            className={`greenery-mode-btn ${greeneryMapMode === 'percentile' ? 'active' : ''}`}
            onClick={() => onGreeneryMapModeChange?.('percentile')}
          >
            Relative Rank
          </button>
          <button
            className={`greenery-mode-btn ${greeneryMapMode === 'minutes' ? 'active' : ''}`}
            onClick={() => onGreeneryMapModeChange?.('minutes')}
          >
            Actual Minutes
          </button>
        </div>
        <button
          className="greenery-insights-btn"
          onClick={() => onInsightsExpandedChange?.(!insightsExpanded)}
        >
          {insightsExpanded ? 'Close Extra Insights' : 'Open Extra Insights'}
        </button>
      </div>

      <div className="greenery-stat-grid">
        <div className="greenery-stat-card">
          <span>Mapped street segments</span>
          <strong>{headline.segments.toLocaleString()}</strong>
        </div>
        <div className="greenery-stat-card">
          <span>Named streets</span>
          <strong>{headline.streets.toLocaleString()}</strong>
        </div>
        <div className="greenery-stat-card">
          <span>Green destinations</span>
          <strong>{headline.destinations.toLocaleString()}</strong>
        </div>
        <div className="greenery-stat-card">
          <span>15+ min streets</span>
          <strong>{formatPercent(headline.underserved15Share)}</strong>
        </div>
      </div>

      <div className="greenery-insight-strip">
        <div>
          <span>Average walk time</span>
          <strong>{formatMinutes(headline.avgWalk)}</strong>
        </div>
        <div>
          <span>Average destination quality</span>
          <strong>{headline.avgQuality != null ? `${headline.avgQuality.toFixed(0)}/100` : '—'}</strong>
        </div>
        <div>
          <span>Residential segments screened</span>
          <strong>{headline.residentialSegments.toLocaleString()}</strong>
        </div>
        <div>
          <span>15+ min segments</span>
          <strong>{headline.underserved15Count.toLocaleString()}</strong>
        </div>
      </div>

      <div className="greenery-definitions">
        <div className="greenery-definition-card">
          <strong>Relative Rank</strong>
          <p>Shows how each street compares with the rest of the city, from the best access streets to the weakest.</p>
        </div>
        <div className="greenery-definition-card">
          <strong>15+ Min Streets</strong>
          <p>Street segments whose quality-adjusted walk to green space is longer than 15 minutes.</p>
        </div>
        <div className="greenery-definition-card">
          <strong>Residential Buildings</strong>
          <p>The average count of residential buildings within 250 m of a street segment used to estimate who is affected.</p>
        </div>
        <div className="greenery-definition-card">
          <strong>Residential Gap Share</strong>
          <p>The share of mapped residential street segments flagged by the access-gap logic, separate from the 15+ minute threshold.</p>
        </div>
      </div>

      {insightsExpanded && (
        <>
          <div className="greenery-chart-grid">
            <section className="greenery-panel">
              <div className="greenery-panel-head">
                <span>Access Distribution</span>
                <strong>Quality-adjusted minutes to greenery</strong>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={accessBands} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                    formatter={(value, name) => [name === 'share' ? `${Number(value).toFixed(1)}%` : Number(value).toLocaleString(), name === 'share' ? 'Share' : 'Segments']}
                  />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                    {accessBands.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="greenery-panel">
              <div className="greenery-panel-head">
                <span>Destination Mix</span>
                <strong>Green nodes by type</strong>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={destinationMix} layout="vertical" margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" stroke="#94a3b8" tick={{ fontSize: 11 }} width={64} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                    formatter={(value) => [Number(value).toLocaleString(), 'Destinations']}
                  />
                  <Bar dataKey="count" radius={[0, 10, 10, 0]}>
                    {destinationMix.map((entry) => (
                      <Cell key={entry.type} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </section>

            <section className="greenery-panel">
              <div className="greenery-panel-head">
                <span>Quality Mix</span>
                <strong>Nearest destination quality class</strong>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={qualityMix}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {qualityMix.map((entry) => (
                      <Cell key={entry.qualityClass} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10 }}
                    formatter={(value) => [Number(value).toLocaleString(), 'Segments']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="greenery-legend">
                {qualityMix.map((entry) => (
                  <div key={entry.qualityClass} className="greenery-legend-item">
                    <span style={{ backgroundColor: entry.color }} />
                    <small>{entry.label}</small>
                    <strong>{entry.count}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="greenery-panel greenery-panel--story">
              <div className="greenery-panel-head">
                <span>Read This Map</span>
                <strong>What stands out</strong>
              </div>
              <div className="greenery-story-list">
                <p>
                  <strong>{formatPercent(100 - headline.accessGapShare)}</strong> of mapped segments are not flagged as residential access gaps, which means the shortfall is concentrated rather than universal.
                </p>
                <p>
                  The typical street reaches usable greenery in <strong>{formatMinutes(headline.avgWalk)}</strong>, but quality adjustments stretch the citywide average to <strong>{formatMinutes(headline.avgAdjusted)}</strong>.
                </p>
                <p>
                  Destination supply is dominated by <strong>{destinationMix[0]?.label || 'park'}</strong>, so quality and placement matter more than raw variety in most areas.
                </p>
                {allLayersActive && (
                  <p>
                    With all environment layers active, you can read greenery access alongside canopy, heat, and air quality to spot streets that need both cooling and better park reach.
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="greenery-ranking-grid">
            <section className="greenery-ranking-card">
              <div className="greenery-panel-head">
                <span>Best Performing Streets</span>
                <strong>Lowest adjusted access times</strong>
              </div>
              {topStreets.map((street) => (
                <div key={street.rawStreet} className="greenery-ranking-row">
                  <div>
                    <strong>{street.street}</strong>
                    <small>{street.segments} segments · quality {street.avgQuality.toFixed(0)}/100</small>
                  </div>
                  <span>{formatMinutes(street.avgAdjusted)}</span>
                </div>
              ))}
            </section>

            <section className="greenery-ranking-card greenery-ranking-card--warning">
              <div className="greenery-panel-head">
                <span>Most Underserved Streets</span>
                <strong>Highest adjusted access times</strong>
              </div>
              {underservedStreets.map((street) => (
                <div key={street.rawStreet} className="greenery-ranking-row">
                  <div>
                    <strong>{street.street}</strong>
                    <small>{street.segments} segments · gap share {street.gapShare.toFixed(0)}%</small>
                  </div>
                  <span>{formatMinutes(street.avgAdjusted)}</span>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </aside>
  )
}

export default GreeneryAnalytics
