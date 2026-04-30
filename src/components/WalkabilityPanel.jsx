import React, { useState, useEffect, useRef, useCallback } from 'react'
import { loadWalkabilityRanked } from '../utils/dataLoader'
import {
  STORY_TOURS,
  getLeaderboard,
  getStats,
  quintileLabel,
} from '../utils/walkabilityEngine'
import { StreetViewSnippet } from './StreetViewSnippet'
import './WalkabilityPanel.css'


// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiBar ({ value, mode }) {
  const pct = Math.round((value ?? 0) * 100)
  return (
    <div className="wlk-kpibar">
      <div className={`wlk-kpibar-fill wlk-kpibar-fill--${mode}`} style={{ width: `${pct}%` }} />
      <span className="wlk-kpibar-num">{pct}</span>
    </div>
  )
}

function LeaderboardRow ({ feature, rank, mode, isBottom, stats, onSegmentClick, isActive }) {
  const p    = feature.properties
  const kpi  = mode === 'day' ? p.kpi_day : p.kpi_night
  const band = stats ? quintileLabel(kpi, stats) : ''

  // sub-label: relevant raw values
  const sub = mode === 'day'
    ? `${p.retail_poi ?? 0} retail \u00b7 ${Math.round((p._s_shade ?? 0) * 100)}% shade${p.traffic_calm ? ' \u00b7 \u26d4 calm' : ''}`
    : `${p.min_lux} lux \u00b7 ${p.night_poi} venues`

  return (
    <div
      className={`wlk-lb-row wlk-lb-row--clickable ${isBottom ? 'wlk-lb-row--bottom' : 'wlk-lb-row--top'} ${isActive ? 'wlk-lb-row--active' : ''}`}
      onClick={() => onSegmentClick && onSegmentClick(feature)}
      title="Click to open Street View for this segment"
    >
      <span className="wlk-lb-rank">{isBottom ? '\u2193' : rank}</span>
      <div className="wlk-lb-info">
        <span className="wlk-lb-name">
          {(p.street_name || 'Unknown').toLowerCase()}
          <span className="wlk-lb-seg-tag">seg</span>
        </span>
        <span className="wlk-lb-sub">{band} &middot; {sub}</span>
      </div>
      <KpiBar value={kpi} mode={mode} />
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

// ─── Static content ───────────────────────────────────────────────────────────

const METHODOLOGY = [
  {
    attr: 'Slope Penalty',
    formula: 'Tobler hiking function × retail buffer',
    detail: 'Elevation change extracted from a 5 m digital terrain model (EPSG:32734). Speed penalty applied per Tobler: v = 6·e^(−3.5·|tan(θ)+0.05|). In retail-rich corridors (≥5 curated POIs within 150 m) the slope penalty is halved — people will walk uphill for a good destination.'
  },
  {
    attr: 'Shade: Urban Enclosure',
    formula: 'sqrt(Max(canopy, 1−SVF))',
    detail: 'Each road segment is buffered 20 m. Canopy fraction is computed against 1 873 CoCT tree polygons. Sky View Factor (SVF) captures how much sky is blocked by buildings. Using Max(canopy, 1−SVF) recognises that in a CBD, tall buildings provide \u201carchitectural shade\u201d just as effectively as trees (e.g. Bree Street\'s high-rise corridor). A sqrt transform ensures partial shade scores well — a pedestrian can walk on the shaded side even if coverage isn\'t total.'
  },
  {
    attr: 'Heat Streets',
    formula: 'Modelled heat LST (°C) — weight 15%',
    detail: 'Nearest climate.heat_streets segment matched by centroid distance (≤500 m). The score uses the DB-backed modelled street heat value. Weight remains 15% because Cape Town pedestrians compensate by walking on the shady side of streets (captured by the shade score), not by staying indoors.'
  },
  {
    attr: 'Retail Curation',
    formula: 'sqrt(curated POI / max) — weight 25%',
    detail: 'Counts quality retail/dining/culture destinations within 150 m: restaurants, bakeries, cafés, galleries, clothing, bookshops. Normalised 0–1 with sqrt so even a few good shops materially raise the score. Offices, banks, and doctors are excluded — they are not destinations that make a walk desirable.'
  },
  {
    attr: 'Traffic Calm Multiplier',
    formula: '1.3× on low-traffic segments',
    detail: 'Segments matched to City of Cape Town traffic analysis data. Streets classified as \u201cLow\u201d congestion or unmatched (likely pedestrian malls / service alleys) receive a 1.3× multiplier on the daytime composite, capped at 1.0. A narrow street with no cars is more walkable than a wide street with heavy traffic.'
  },
  {
    attr: 'Min Lux',
    formula: 'Minimum measured lux',
    detail: 'Worst-case illuminance from CoCT road-segment lighting KPI inspections. A floor of 0 lux is applied where no fixture is recorded. Higher lux → higher nighttime score.'
  },
  {
    attr: 'Night Activity',
    formula: 'POI count within 150 m',
    detail: 'All Google Places results tagged as nighttime-active (bars, restaurants, entertainment, transit) within a 150 m radius of the segment centroid. Grid-indexed for fast lookup.'
  },
  {
    attr: 'KPI — Daytime (Wₐ)',
    formula: '35% Slope · 25% Shade · 15% Temp⁻¹ · 25% Retail × calm',
    detail: 'All sub-scores are min-max normalised 0–1 across 1 057 segments. Slope is Tobler-based with a retail buffer; shade uses Max(canopy, urban enclosure); temperature is inverted; retail curation measures destination quality. The product is then boosted 1.3× on traffic-calmed streets (capped at 1.0). Quintile bands applied city-wide.'
  },
  {
    attr: 'KPI — Nighttime (Wₙ)',
    formula: '45% Min-Lux · 30% Night-Activity · 25% Slope',
    detail: 'Min-Lux is the dominant driver. Nighttime activity rewards proximity to active venues. Slope is weighted higher than daytime because inclines are riskier after dark.'
  }
]

const DATA_SOURCES = [
  { layer: 'Road Lighting KPIs',    explorer: 'Street Lighting › Street Lighting KPIs',          provider: 'City of Cape Town' },
  { layer: 'Heat Streets',          explorer: 'Climate › Heat Streets',                            provider: 'City of Cape Town' },
  { layer: 'Tree Canopy',           explorer: 'Greenery › Tree Canopy',                          provider: 'City of Cape Town' },
  { layer: 'Sky View Factor (SVF)', explorer: 'Greenery › Greenery & Sky View',                  provider: 'City of Cape Town' },
  { layer: 'Digital Terrain Model', explorer: 'Slope — used in index only',                      provider: 'City of Cape Town' },
  { layer: 'Points of Interest',    explorer: 'Business Analytics › Business Liveliness',        provider: 'Google Places' },
  { layer: 'Traffic Congestion',    explorer: 'Traffic › Traffic Analysis',                      provider: 'City of Cape Town' },
]

function Accordion ({ title, badge, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="wlk-accordion">
      <button className="wlk-accordion-hd" onClick={() => setOpen(o => !o)}>
        <span className="wlk-accordion-title">{title}</span>
        {badge && <span className="wlk-accordion-badge">{badge}</span>}
        <span className={`wlk-accordion-chevron ${open ? 'wlk-accordion-chevron--open' : ''}`}>▾</span>
      </button>
      {open && <div className="wlk-accordion-body">{children}</div>}
    </div>
  )
}

const WalkabilityPanel = ({ onWalkabilityChange, compareCount, onSegmentClick }) => {
  const [fc,              setFc]              = useState(null)
  const [status,          setStatus]          = useState('loading')
  const [mode,            setMode]            = useState('day')
  const [activeTour,      setActiveTour]      = useState(null)
  const [svSegment,       setSvSegment]       = useState(null)   // street-view preview
  const fcRef = useRef(null)

  useEffect(() => {
    loadWalkabilityRanked()
      .then(data => { setFc(data); fcRef.current = data; setStatus('ready') })
      .catch(() => setStatus('error'))
  }, [])

  useEffect(() => {
    if (!fc || !onWalkabilityChange) return
    const tour          = STORY_TOURS.find(t => t.id === activeTour) || null
    const effectiveMode = tour ? tour.mode : mode
    const storyFeatures = tour ? tour.filterFn(fc.features) : null
    const liveStats     = getStats(fc.features, effectiveMode)
    const thresholds    = [liveStats.q20, liveStats.q40, liveStats.q60, liveStats.q80]
    onWalkabilityChange({ fc, mode: effectiveMode, activeTour: tour, storyFeatures, thresholds })
  }, [fc, mode, activeTour, onWalkabilityChange])

  const features      = fc?.features || []
  const tourDef       = STORY_TOURS.find(t => t.id === activeTour)
  const effectiveMode = tourDef ? tourDef.mode : mode
  const stats         = features.length > 0 ? getStats(features, effectiveMode) : null
  const leaderboard   = features.length > 0 ? getLeaderboard(features, effectiveMode, 5) : null

  const handleTourClick = useCallback(id => {
    setActiveTour(prev => prev === id ? null : id)
  }, [])

  const handleModeSwitch = useCallback(m => {
    setMode(m)
    setActiveTour(null)
  }, [])

  const handleSegmentClick = useCallback(feature => {
    onSegmentClick && onSegmentClick(feature)
    setSvSegment(prev => prev?.properties === feature.properties ? null : feature)
  }, [onSegmentClick])

  return (
    <div className="wlk-panel">

      {/* Header */}
      <div className="wlk-header">
        <div>
          <h2 className="wlk-title">Walkability Index</h2>
          <p className="wlk-subtitle">Dual-State &middot; Tobler &middot; Retail-Curated &middot; 1 056 Segments</p>
        </div>
        <span className="wlk-badge">KPI</span>
      </div>

      {/* Mode toggle */}
      <div className="wlk-toggle">
        <button
          className={`wlk-toggle-btn ${effectiveMode === 'day'   ? 'wlk-toggle-btn--active wlk-toggle-btn--day'   : ''}`}
          onClick={() => handleModeSwitch('day')}
        >
          Daytime
        </button>
        <button
          className={`wlk-toggle-btn ${effectiveMode === 'night' ? 'wlk-toggle-btn--active wlk-toggle-btn--night' : ''}`}
          onClick={() => handleModeSwitch('night')}
        >
          Nighttime
        </button>
      </div>

      {status === 'loading' && (
        <div className="wlk-loading">
          <div className="wlk-spinner" />
          <span>Loading data&hellip;</span>
        </div>
      )}
      {status === 'error' && (
        <div className="wlk-error">Failed to load walkability data.</div>
      )}

      {status === 'ready' && stats && (
        <>
          {/* Stats strip */}
          <div className="wlk-stats">
            <div className="wlk-stat">
              <span className="wlk-stat-val">{stats.mean}<span className="wlk-stat-unit">%</span></span>
              <span className="wlk-stat-key">city avg</span>
            </div>
            <div className="wlk-stat wlk-stat--good">
              <span className="wlk-stat-val">{stats.bands.top20}</span>
              <span className="wlk-stat-key">top 20%</span>
            </div>
            <div className="wlk-stat wlk-stat--poor">
              <span className="wlk-stat-val">{stats.bands.bottom20}</span>
              <span className="wlk-stat-key">bottom 20%</span>
            </div>
          </div>

          {/* 5-band distribution bar */}
          <div className="wlk-dist">
            <div className="wlk-dist-track">
              <div className="wlk-dist-b20"      style={{ width: `${stats.pctBottom20}%` }}  title={`Bottom 20%: ${stats.bands.bottom20}`} />
              <div className="wlk-dist-below"    style={{ width: `${stats.pctBelowAvg}%` }}  title={`Below Avg: ${stats.bands.belowAvg}`} />
              <div className="wlk-dist-avg"      style={{ width: `${stats.pctAvg}%` }}        title={`Average: ${stats.bands.avg}`} />
              <div className="wlk-dist-above"    style={{ width: `${stats.pctAboveAvg}%` }}  title={`Above Avg: ${stats.bands.aboveAvg}`} />
              <div className="wlk-dist-t20"      style={{ width: `${stats.pctTop20}%` }}      title={`Top 20%: ${stats.bands.top20}`} />
            </div>
            <div className="wlk-dist-legend">
              <span>Bot 20%</span>
              <span>Below</span>
              <span>Avg</span>
              <span>Above</span>
              <span>Top 20%</span>
            </div>
          </div>

          {/* Section: Story Tours */}
          <div className="wlk-section">Story Tours</div>

          <div className="wlk-tours">
            {STORY_TOURS.map(tour => {
              const isActive = activeTour === tour.id
              return (
                <button
                  key={tour.id}
                  className={`wlk-tour ${isActive ? `wlk-tour--active wlk-tour--${tour.id}` : ''}`}
                  onClick={() => handleTourClick(tour.id)}
                >
                  <div className="wlk-tour-top">
                    <span className="wlk-tour-title">{tour.title}</span>
                    <span className={`wlk-tour-tag wlk-tour-tag--${tour.mode}`}>{tour.label}</span>
                  </div>
                  <p className="wlk-tour-tagline">&ldquo;{tour.tagline}&rdquo;</p>
                  {isActive && (
                    <>
                      <p className="wlk-tour-desc">{tour.description}</p>
                      <div className="wlk-tour-count">
                        <span
                          className="wlk-tour-dot"
                          style={{ background: tour.highlightColor }}
                        />
                        {tour.filterFn(features).length} segments highlighted
                      </div>
                    </>
                  )}
                </button>
              )
            })}
          </div>

          {/* Section: Leaderboard */}
          <div className="wlk-section" style={{ marginTop: '0.75rem' }}>
            Leaderboard &mdash; {effectiveMode === 'day' ? 'Daytime' : 'Nighttime'}
          </div>

          <div className="wlk-lb-group">
            <div className="wlk-lb-head wlk-lb-head--top">Most Walkable</div>
            {leaderboard.top.map((f, i) => (
              <LeaderboardRow key={`t${i}`} feature={f} rank={i + 1} mode={effectiveMode} isBottom={false} stats={stats} onSegmentClick={handleSegmentClick} isActive={svSegment?.properties === f.properties} />
            ))}
          </div>

          <div className="wlk-lb-group" style={{ marginTop: '0.5rem' }}>
            <div className="wlk-lb-head wlk-lb-head--bottom">Least Walkable</div>
            {leaderboard.bottom.map((f, i) => (
              <LeaderboardRow key={`b${i}`} feature={f} rank={leaderboard.bottom.length - i} mode={effectiveMode} isBottom stats={stats} onSegmentClick={handleSegmentClick} isActive={svSegment?.properties === f.properties} />
            ))}
          </div>

          {/* Colour scale */}
          {(() => {
            const colors = effectiveMode === 'day'
              ? ['#9c2a2a','#c06828','#b89428','#3a8a68','#1a5878']
              : ['#0a1520','#152850','#245888','#3290b8','#52c0d4']
            const labels = ['Bot 20%','Below','Avg','Above','Top 20%']
            return (
              <div className="wlk-legend">
                <span className="wlk-legend-label">
                  {effectiveMode === 'day' ? 'Thermal scale — W\u2090' : 'Safety scale — W\u2099'}
                </span>
                <div className="wlk-legend-swatches">
                  {colors.map((c, i) => (
                    <div key={i} className="wlk-legend-swatch" style={{ background: c }} title={labels[i]} />
                  ))}
                </div>
                <div className="wlk-legend-ends">
                  {labels.map((l, i) => <span key={i}>{l}</span>)}
                </div>
              </div>
            )
          })()}

          {/* Formula */}
          <div className="wlk-formula">
            {effectiveMode === 'day'
              ? 'W\u2090 = 35% Slope \xb7 25% Shade \xb7 15% Temp\u207b\xb9 \xb7 25% Retail \xd7 calm'
              : 'W\u2099 = 45% Min-Lux \xb7 30% Night-Activity \xb7 25% Slope'}
          </div>

          {/* Click hint */}
          <div className="wlk-click-hint">
            Click any leaderboard row to preview Street View &middot; click map segments to compare KPIs.
          </div>
        </>
      )}

      {/* ── Street View tab (bottom, persistent when a segment is selected) ── */}
      {svSegment && (
        <div className="wlk-sv-tab">
          <div className="wlk-sv-tab-label-row">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Street View Preview
          </div>
          <StreetViewSnippet feature={svSegment} onClose={() => setSvSegment(null)} />
        </div>
      )}

      {/* ── Methodology ─────────────────────────────────────────────────── */}
      <Accordion title="Methodology" badge={`${METHODOLOGY.length} attributes`}>
        <p className="wlk-acc-intro">
          Each of the {METHODOLOGY.length} attributes is computed at segment level, normalised
          0–1 across all 1 056 segments, then combined with the weights below.
        </p>
        {METHODOLOGY.map(m => (
          <div key={m.attr} className="wlk-meth-row">
            <div className="wlk-meth-title">
              <span className="wlk-meth-name">{m.attr}</span>
              <span className="wlk-meth-formula">{m.formula}</span>
            </div>
            <p className="wlk-meth-detail">{m.detail}</p>
          </div>
        ))}
      </Accordion>

      {/* ── Data Sources ────────────────────────────────────────────────── */}
      <Accordion title="Data Sources" badge={`${DATA_SOURCES.length} layers used`}>
        <p className="wlk-acc-intro">
          The five datasets below were used exclusively to compute the walkability KPIs.
        </p>
        {DATA_SOURCES.map(s => (
          <div key={s.layer} className="wlk-src-row">
            <div className="wlk-src-name">{s.layer}</div>
            <div className="wlk-src-explorer">{s.explorer}</div>
            <div className="wlk-src-provider">{s.provider}</div>
          </div>
        ))}
      </Accordion>
    </div>
  )
}

export default WalkabilityPanel
