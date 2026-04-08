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

function LeaderRow ({ feature, rank, mode, isBottom, onSegmentClick, isActive }) {
  const p   = feature.properties
  const kpi = mode === 'day' ? p.kpi_day : p.kpi_night
  const pct = Math.round((kpi ?? 0) * 100)

  return (
    <div
      className={`wlk-row ${isActive ? 'wlk-row--active' : ''}`}
      onClick={() => onSegmentClick?.(feature)}
    >
      <span className={`wlk-row-rank ${isBottom ? 'wlk-row-rank--low' : ''}`}>{rank}</span>
      <span className="wlk-row-name">{(p.street_name || '—').toLowerCase()}</span>
      <div className="wlk-row-bar">
        <div
          className={`wlk-row-fill wlk-row-fill--${mode}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="wlk-row-score">{pct}</span>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

const WalkabilityPanel = ({ onWalkabilityChange, compareCount, onSegmentClick }) => {
  const [fc,         setFc]         = useState(null)
  const [status,     setStatus]     = useState('loading')
  const [mode,       setMode]       = useState('day')
  const [activeTour, setActiveTour] = useState(null)
  const [tab,        setTab]        = useState('tours') // 'tours' | 'ranking'
  const [svSegment,  setSvSegment]  = useState(null)

  useEffect(() => {
    loadWalkabilityRanked()
      .then(data => { setFc(data); setStatus('ready') })
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

  const handleSegmentClick = useCallback(feature => {
    onSegmentClick?.(feature)
    setSvSegment(prev => prev?.properties === feature.properties ? null : feature)
  }, [onSegmentClick])

  if (status === 'loading') return (
    <div className="wlk-panel">
      <div className="wlk-empty"><div className="wlk-spinner" /><span>Loading walkability data...</span></div>
    </div>
  )
  if (status === 'error') return (
    <div className="wlk-panel"><div className="wlk-empty">Failed to load data.</div></div>
  )
  if (!stats) return null

  const meanPct = stats.mean

  return (
    <div className="wlk-panel">

      {/* ── Hero score ──────────────────────────────────────────── */}
      <div className="wlk-hero">
        <div className="wlk-hero-score">
          <span className="wlk-hero-num">{meanPct}</span>
          <span className="wlk-hero-unit">/ 100</span>
        </div>
        <div className="wlk-hero-meta">
          <span className="wlk-hero-label">City Average</span>
          <span className="wlk-hero-sub">{effectiveMode === 'day' ? 'Daytime' : 'Nighttime'} Walkability</span>
        </div>
      </div>

      {/* ── Mode toggle ─────────────────────────────────────────── */}
      <div className="wlk-toggle">
        <button
          className={`wlk-toggle-btn ${effectiveMode === 'day' ? 'wlk-toggle-btn--on' : ''}`}
          onClick={() => { setMode('day'); setActiveTour(null) }}
        >Day</button>
        <button
          className={`wlk-toggle-btn ${effectiveMode === 'night' ? 'wlk-toggle-btn--on' : ''}`}
          onClick={() => { setMode('night'); setActiveTour(null) }}
        >Night</button>
      </div>

      {/* ── Quick stats row ─────────────────────────────────────── */}
      <div className="wlk-chips">
        <div className="wlk-chip">
          <span className="wlk-chip-val wlk-chip-val--good">{stats.bands.top20}</span>
          <span className="wlk-chip-key">Top 20%</span>
        </div>
        <div className="wlk-chip">
          <span className="wlk-chip-val">{features.length}</span>
          <span className="wlk-chip-key">Segments</span>
        </div>
        <div className="wlk-chip">
          <span className="wlk-chip-val wlk-chip-val--poor">{stats.bands.bottom20}</span>
          <span className="wlk-chip-key">Bottom 20%</span>
        </div>
      </div>

      {/* ── Colour legend ───────────────────────────────────────── */}
      <div className="wlk-gradient">
        <div className="wlk-gradient-bar" style={{
          background: effectiveMode === 'day'
            ? 'linear-gradient(90deg, #333333, #5C6B4A, #5EC2A0, #7CC715)'
            : 'linear-gradient(90deg, #333333, #2E4A66, #5B9FCC, #88D4F0)'
        }} />
        <div className="wlk-gradient-labels">
          <span>Low</span>
          <span>{effectiveMode === 'day' ? 'Thermal W\u2090' : 'Safety W\u2099'}</span>
          <span>High</span>
        </div>
      </div>

      {/* ── Tab switcher ────────────────────────────────────────── */}
      <div className="wlk-tabs">
        <button className={`wlk-tab ${tab === 'tours' ? 'wlk-tab--on' : ''}`} onClick={() => setTab('tours')}>Tours</button>
        <button className={`wlk-tab ${tab === 'ranking' ? 'wlk-tab--on' : ''}`} onClick={() => setTab('ranking')}>Ranking</button>
      </div>

      {/* ── Tours tab ───────────────────────────────────────────── */}
      {tab === 'tours' && (
        <div className="wlk-tours">
          {STORY_TOURS.map(tour => {
            const on = activeTour === tour.id
            return (
              <button
                key={tour.id}
                className={`wlk-tour ${on ? 'wlk-tour--on' : ''}`}
                onClick={() => setActiveTour(prev => prev === tour.id ? null : tour.id)}
              >
                <div className="wlk-tour-head">
                  <span className="wlk-tour-name">{tour.title}</span>
                  <span className={`wlk-tour-badge wlk-tour-badge--${tour.mode}`}>{tour.mode === 'day' ? '☀' : '☾'}</span>
                </div>
                <p className="wlk-tour-quote">{tour.tagline}</p>
                {on && (
                  <>
                    <p className="wlk-tour-body">{tour.description}</p>
                    <span className="wlk-tour-count" style={{ color: tour.highlightColor }}>
                      {tour.filterFn(features).length} segments
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Ranking tab ─────────────────────────────────────────── */}
      {tab === 'ranking' && leaderboard && (
        <div className="wlk-ranking">
          <span className="wlk-ranking-head wlk-ranking-head--top">Best</span>
          {leaderboard.top.map((f, i) => (
            <LeaderRow key={`t${i}`} feature={f} rank={i + 1} mode={effectiveMode} onSegmentClick={handleSegmentClick} isActive={svSegment?.properties === f.properties} />
          ))}
          <span className="wlk-ranking-head wlk-ranking-head--low">Worst</span>
          {leaderboard.bottom.map((f, i) => (
            <LeaderRow key={`b${i}`} feature={f} rank={leaderboard.bottom.length - i} mode={effectiveMode} isBottom onSegmentClick={handleSegmentClick} isActive={svSegment?.properties === f.properties} />
          ))}
        </div>
      )}

      {/* ── Street View ─────────────────────────────────────────── */}
      {svSegment && (
        <div className="wlk-sv">
          <StreetViewSnippet feature={svSegment} onClose={() => setSvSegment(null)} />
        </div>
      )}

      {/* ── Formula ─────────────────────────────────────────────── */}
      <div className="wlk-formula">
        {effectiveMode === 'day'
          ? 'W\u2090 = 35% Slope \xb7 25% Shade \xb7 15% Temp\u207b\xb9 \xb7 25% Retail \xd7 calm'
          : 'W\u2099 = 45% Min-Lux \xb7 30% Night-Activity \xb7 25% Slope'}
      </div>
    </div>
  )
}

export default WalkabilityPanel
