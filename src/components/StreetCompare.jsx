import React, { useState } from 'react'
import { RADAR_AXES } from '../utils/walkabilityEngine'
import { StreetViewSnippet } from './StreetViewSnippet'
import './StreetCompare.css'

// ─── KPI bar with value ──────────────────────────────────────────────────────

function KpiRow ({ label, a, b, hasTwo, format = v => v, invert = false }) {
  const aNum = parseFloat(a) || 0
  const bNum = parseFloat(b) || 0
  const aWin = hasTwo && (invert ? aNum < bNum : aNum > bNum)
  const bWin = hasTwo && (invert ? bNum < aNum : bNum > aNum)

  return (
    <div className="sc-kpi">
      <span className="sc-kpi-label">{label}</span>
      <div className="sc-kpi-vals">
        <span className={`sc-kpi-val ${aWin ? 'sc-kpi-val--win' : ''}`}>{format(a)}</span>
        {hasTwo && <span className={`sc-kpi-val ${bWin ? 'sc-kpi-val--win' : ''}`}>{format(b)}</span>}
      </div>
    </div>
  )
}

// ─── Segment card ────────────────────────────────────────────────────────────

function SegmentCard ({ props, color, tag, feature, svOpen, onToggleSv, onCloseSv }) {
  const dayPct   = Math.round((props.kpi_day ?? 0) * 100)
  const nightPct = Math.round((props.kpi_night ?? 0) * 100)

  return (
    <div className="sc-card">
      <div className="sc-card-head">
        <span className="sc-card-tag" style={{ background: color }}>{tag}</span>
        <span className="sc-card-name">{(props.street_name || '—').toLowerCase()}</span>
      </div>

      <div className="sc-card-scores">
        <div className="sc-card-score">
          <span className="sc-card-score-val">{dayPct}</span>
          <span className="sc-card-score-label">Day</span>
          <div className="sc-card-bar"><div className="sc-card-fill sc-card-fill--day" style={{ width: `${dayPct}%` }} /></div>
        </div>
        <div className="sc-card-score">
          <span className="sc-card-score-val">{nightPct}</span>
          <span className="sc-card-score-label">Night</span>
          <div className="sc-card-bar"><div className="sc-card-fill sc-card-fill--night" style={{ width: `${nightPct}%` }} /></div>
        </div>
      </div>

      {/* Radar axes as mini bars */}
      <div className="sc-card-axes">
        {RADAR_AXES.map(a => {
          const val = Math.round((props[a.key] ?? 0) * 100)
          return (
            <div key={a.key} className="sc-card-axis">
              <span className="sc-card-axis-label">{a.label}</span>
              <div className="sc-card-axis-bar"><div className="sc-card-axis-fill" style={{ width: `${val}%`, background: color }} /></div>
              <span className="sc-card-axis-val">{val}</span>
            </div>
          )
        })}
      </div>

      <button className="sc-sv-toggle" onClick={onToggleSv}>
        {svOpen ? 'Hide Street View' : 'Street View'}
      </button>

      {svOpen && (
        <div className="sc-sv-wrap">
          <StreetViewSnippet feature={feature} compact onClose={onCloseSv} />
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

const COLORS = ['#5EC2A0', '#7B93FF']

const StreetCompare = ({ segments, onClose, onClear }) => {
  const [svOpen, setSvOpen] = useState({})

  if (!segments || segments.length === 0) return null

  const [a, b] = segments
  const aProps = a?.properties || {}
  const bProps = b?.properties || {}
  const hasTwo = segments.length >= 2

  const fmt1 = v => Math.round((v ?? 0) * 100)
  const fmtC = v => `${(v ?? 0).toFixed(1)}°C`
  const fmtL = v => `${(v ?? 0).toFixed(0)} lx`

  return (
    <div className="sc-panel">
      {/* Header */}
      <div className="sc-header">
        <span className="sc-title">Street Comparison</span>
        {!hasTwo && <span className="sc-hint">Select a second street on the map</span>}
        <div className="sc-actions">
          {hasTwo && <button className="sc-btn" onClick={onClear}>Clear</button>}
          <button className="sc-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className={`sc-cards ${hasTwo ? 'sc-cards--two' : ''}`}>
        <SegmentCard
          props={aProps} color={COLORS[0]} tag="A" feature={a}
          svOpen={svOpen[0]}
          onToggleSv={() => setSvOpen(p => ({ ...p, 0: !p[0] }))}
          onCloseSv={() => setSvOpen(p => ({ ...p, 0: false }))}
        />
        {hasTwo && (
          <SegmentCard
            props={bProps} color={COLORS[1]} tag="B" feature={b}
            svOpen={svOpen[1]}
            onToggleSv={() => setSvOpen(p => ({ ...p, 1: !p[1] }))}
            onCloseSv={() => setSvOpen(p => ({ ...p, 1: false }))}
          />
        )}
      </div>

      {/* Side-by-side KPI comparison */}
      {hasTwo && (
        <div className="sc-compare">
          <div className="sc-compare-head">
            <span style={{ color: COLORS[0] }}>{aProps.street_name || 'A'}</span>
            <span className="sc-compare-mid">vs</span>
            <span style={{ color: COLORS[1] }}>{bProps.street_name || 'B'}</span>
          </div>
          <KpiRow label="Day Score"    a={fmt1(aProps.kpi_day)}      b={fmt1(bProps.kpi_day)} hasTwo={hasTwo} />
          <KpiRow label="Night Score"  a={fmt1(aProps.kpi_night)}    b={fmt1(bProps.kpi_night)} hasTwo={hasTwo} />
          <KpiRow label="Shade"        a={fmt1(aProps.canopy_cover)} b={fmt1(bProps.canopy_cover)} hasTwo={hasTwo} />
          <KpiRow label="Temperature"  a={fmtC(aProps.surface_temp)} b={fmtC(bProps.surface_temp)} hasTwo={hasTwo} invert />
          <KpiRow label="Min Lighting" a={fmtL(aProps.min_lux)}      b={fmtL(bProps.min_lux)} hasTwo={hasTwo} />
          <KpiRow label="Night Venues" a={aProps.night_poi ?? 0}      b={bProps.night_poi ?? 0} hasTwo={hasTwo} />
        </div>
      )}
    </div>
  )
}

export default StreetCompare
