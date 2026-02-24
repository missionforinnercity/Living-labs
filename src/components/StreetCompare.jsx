import React, { useMemo } from 'react'
import { RADAR_AXES } from '../utils/walkabilityEngine'
import './StreetCompare.css'

// ─── SVG Radar Chart ──────────────────────────────────────────────────────────

const CX = 110
const CY = 110
const R  = 85
const N  = RADAR_AXES.length
const LEVELS = [0.25, 0.5, 0.75, 1.0]

function axisPoint (i, r) {
  const angle = (i / N) * 2 * Math.PI - Math.PI / 2
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)]
}

function polygonPoints (values) {
  return values.map((v, i) => axisPoint(i, v * R))
}

function formatPt (pts) {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

function RadarChart ({ segment, color, label }) {
  const values = useMemo(
    () => RADAR_AXES.map(a => Math.max(0.02, Math.min(1, segment[a.key] ?? 0))),
    [segment]
  )

  const dataPts  = polygonPoints(values)
  const dataPath = formatPt(dataPts)

  return (
    <div className="sc-radar-wrap">
      <svg viewBox="0 0 220 220" className="sc-radar-svg">
        {/* Concentric grid rings */}
        {LEVELS.map(level => (
          <polygon
            key={level}
            points={formatPt(RADAR_AXES.map((_, i) => axisPoint(i, level * R)))}
            className="sc-radar-ring"
          />
        ))}

        {/* Axis spokes */}
        {RADAR_AXES.map((axis, i) => {
          const [x, y] = axisPoint(i, R)
          return (
            <line
              key={axis.key}
              x1={CX} y1={CY}
              x2={x}  y2={y}
              className="sc-radar-spoke"
            />
          )
        })}

        {/* Data polygon — filled */}
        <polygon
          points={dataPath}
          fill={color}
          fillOpacity={0.2}
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {dataPts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x} cy={y} r={3}
            fill={color}
            opacity={0.9}
          />
        ))}

        {/* Axis labels */}
        {RADAR_AXES.map((axis, i) => {
          const [x, y] = axisPoint(i, R + 18)
          return (
            <text
              key={axis.key}
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className="sc-radar-label"
            >
              {axis.label}
            </text>
          )
        })}

        {/* Centre ring reference */}
        <circle cx={CX} cy={CY} r={2} fill="rgba(255,255,255,0.3)" />
      </svg>

      {/* Score summary below chart */}
      <div className="sc-radar-scores">
        <div className="sc-radar-kpi">
          <span className="sc-radar-kpi-val" style={{ color }}>
            {Math.round((segment.kpi_day ?? 0) * 100)}
          </span>
          <span className="sc-radar-kpi-label">Day</span>
        </div>
        <div className="sc-radar-divider" />
        <div className="sc-radar-kpi">
          <span className="sc-radar-kpi-val" style={{ color }}>
            {Math.round((segment.kpi_night ?? 0) * 100)}
          </span>
          <span className="sc-radar-kpi-label">Night</span>
        </div>
      </div>
    </div>
  )
}

// ─── Value comparison row ─────────────────────────────────────────────────────

function CompareRow ({ label, a, b, format = v => v, invert = false }) {
  const aNum = parseFloat(a) || 0
  const bNum = parseFloat(b) || 0
  const aWins = invert ? aNum < bNum : aNum > bNum
  const bWins = invert ? bNum < aNum : bNum > aNum
  return (
    <div className="sc-row">
      <span className={`sc-row-val ${aWins ? 'sc-row-val--win' : bWins ? 'sc-row-val--lose' : ''}`}>
        {format(a)}
      </span>
      <span className="sc-row-label">{label}</span>
      <span className={`sc-row-val sc-row-val--right ${bWins ? 'sc-row-val--win' : aWins ? 'sc-row-val--lose' : ''}`}>
        {format(b)}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const COLORS = ['#e8a020', '#3d80c0']   // Segment A = amber, Segment B = steel blue

const StreetCompare = ({ segments, onClose, onClear }) => {
  if (!segments || segments.length === 0) return null

  const [a, b] = segments
  const aProps  = a?.properties || {}
  const bProps  = b?.properties || {}
  const hasTwo  = segments.length >= 2

  const fmt1 = v => Math.round((v ?? 0) * 100)
  const fmtC = v => `${(v ?? 0).toFixed(1)}\u00b0C`
  const fmtL = v => `${(v ?? 0).toFixed(0)} lx`

  return (
    <div className="sc-panel">
      {/* Header */}
      <div className="sc-header">
        <div className="sc-header-left">
          <span className="sc-panel-title">Street Comparison</span>
          {!hasTwo && (
            <span className="sc-hint">Select a second street on the map to compare</span>
          )}
        </div>
        <div className="sc-header-actions">
          {hasTwo && (
            <button className="sc-btn sc-btn--ghost" onClick={onClear}>
              Clear
            </button>
          )}
          <button className="sc-btn sc-btn--close" onClick={onClose} aria-label="Close">
            &#x2715;
          </button>
        </div>
      </div>

      {/* Street name headers */}
      <div className="sc-names">
        <div className="sc-name" style={{ borderColor: COLORS[0] }}>
          <span className="sc-name-tag" style={{ background: COLORS[0] }}>A</span>
          <span className="sc-name-text">{aProps.street_name || 'Street A'}</span>
        </div>
        {hasTwo && (
          <div className="sc-name" style={{ borderColor: COLORS[1] }}>
            <span className="sc-name-tag" style={{ background: COLORS[1] }}>B</span>
            <span className="sc-name-text">{bProps.street_name || 'Street B'}</span>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className={`sc-charts ${hasTwo ? 'sc-charts--two' : ''}`}>
        <div className="sc-chart-col">
          <RadarChart segment={aProps} color={COLORS[0]} label="A" />
        </div>
        {hasTwo && (
          <div className="sc-chart-col">
            <RadarChart segment={bProps} color={COLORS[1]} label="B" />
          </div>
        )}
      </div>

      {/* Side-by-side KPI table (only when two selected) */}
      {hasTwo && (
        <div className="sc-table">
          <div className="sc-table-header">
            <span style={{ color: COLORS[0] }}>{aProps.street_name || 'A'}</span>
            <span className="sc-table-metric">Metric</span>
            <span style={{ color: COLORS[1] }}>{bProps.street_name || 'B'}</span>
          </div>

          <CompareRow label="Day Score"        a={fmt1(aProps.kpi_day)}      b={fmt1(bProps.kpi_day)} />
          <CompareRow label="Night Score"      a={fmt1(aProps.kpi_night)}    b={fmt1(bProps.kpi_night)} />
          <CompareRow label="Slope Penalty"    a={fmt1(aProps.slope_penalty)} b={fmt1(bProps.slope_penalty)} />
          <CompareRow label="Shade Cover"      a={fmt1(aProps.canopy_cover)}  b={fmt1(bProps.canopy_cover)} />
          <CompareRow label="Surface Temp"     a={fmtC(aProps.surface_temp)}  b={fmtC(bProps.surface_temp)} invert />
          <CompareRow label="Min Lighting"     a={fmtL(aProps.min_lux)}       b={fmtL(bProps.min_lux)} />
          <CompareRow label="Night Venues"     a={aProps.night_poi ?? 0}       b={bProps.night_poi ?? 0} />
        </div>
      )}

      {/* Axis legend */}
      <div className="sc-axes-legend">
        {RADAR_AXES.map(a => (
          <div key={a.key} className="sc-axis-item">
            <span className="sc-axis-name">{a.label}</span>
            <span className="sc-axis-desc">{a.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StreetCompare
