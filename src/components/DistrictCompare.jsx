import React, { useMemo } from 'react'
import './DistrictCompare.css'

// ─── Radar config ─────────────────────────────────────────────────────────────

const COLORS = ['#e8a020', '#3d80c0']   // A = amber, B = steel blue

const RADAR_AXES = [
  { key: 'densityScore',      label: 'Density'      },
  { key: 'diversityScore',    label: 'Diversity'    },
  { key: 'lightingScore',     label: 'Lighting'     },
  { key: 'connectivityScore', label: 'Connectivity' },
  { key: 'overallScore',      label: 'Overall'      },
]

const CX = 110
const CY = 110
const R  = 82
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

// ─── Overlay radar (both polygons on one SVG) ─────────────────────────────────

function OverlayRadar ({ aProps, bProps, hasTwo }) {
  const aVals = useMemo(
    () => RADAR_AXES.map(a => Math.max(0.02, Math.min(1, (aProps[a.key] ?? 0) / 100))),
    [aProps]
  )
  const bVals = useMemo(
    () => RADAR_AXES.map(a => Math.max(0.02, Math.min(1, (bProps[a.key] ?? 0) / 100))),
    [bProps]
  )

  const aPts  = polygonPoints(aVals)
  const bPts  = polygonPoints(bVals)

  return (
    <svg viewBox="0 0 220 220" className="dc-radar-svg">
      {/* Concentric grid rings */}
      {LEVELS.map(level => (
        <polygon
          key={level}
          points={formatPt(RADAR_AXES.map((_, i) => axisPoint(i, level * R)))}
          className="dc-radar-ring"
        />
      ))}

      {/* Axis spokes */}
      {RADAR_AXES.map((axis, i) => {
        const [x, y] = axisPoint(i, R)
        return (
          <line key={axis.key} x1={CX} y1={CY} x2={x} y2={y} className="dc-radar-spoke" />
        )
      })}

      {/* Polygon A */}
      <polygon
        points={formatPt(aPts)}
        fill={COLORS[0]}
        fillOpacity={0.18}
        stroke={COLORS[0]}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {aPts.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r={3} fill={COLORS[0]} opacity={0.9} />
      ))}

      {/* Polygon B (only when 2nd district selected) */}
      {hasTwo && (
        <>
          <polygon
            points={formatPt(bPts)}
            fill={COLORS[1]}
            fillOpacity={0.18}
            stroke={COLORS[1]}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          {bPts.map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r={3} fill={COLORS[1]} opacity={0.9} />
          ))}
        </>
      )}

      {/* Axis labels */}
      {RADAR_AXES.map((axis, i) => {
        const [x, y] = axisPoint(i, R + 18)
        return (
          <text
            key={axis.key}
            x={x} y={y}
            textAnchor="middle"
            dominantBaseline="central"
            className="dc-radar-label"
          >
            {axis.label}
          </text>
        )
      })}

      <circle cx={CX} cy={CY} r={2} fill="rgba(255,255,255,0.3)" />
    </svg>
  )
}

// ─── Comparison row ───────────────────────────────────────────────────────────

function CompareRow ({ label, aVal, bVal }) {
  const a = aVal ?? 0
  const b = bVal ?? 0
  const aWins = a > b
  const bWins = b > a
  return (
    <div className="dc-row">
      <span className={`dc-row-val ${aWins ? 'dc-row-val--win' : bWins ? 'dc-row-val--lose' : ''}`}>
        {Math.round(a)}
      </span>
      <span className="dc-row-label">{label}</span>
      <span className={`dc-row-val dc-row-val--right ${bWins ? 'dc-row-val--win' : aWins ? 'dc-row-val--lose' : ''}`}>
        {Math.round(b)}
      </span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const DistrictCompare = ({ districts, onClose, onClear }) => {
  if (!districts || districts.length === 0) return null

  const [a, b]  = districts
  const aProps  = a?.properties || {}
  const bProps  = b?.properties || {}
  const hasTwo  = districts.length >= 2

  return (
    <div className="dc-panel">
      {/* Header */}
      <div className="dc-header">
        <div className="dc-header-left">
          <span className="dc-title">District Comparison</span>
          {!hasTwo && (
            <span className="dc-hint">Click a second district on the map</span>
          )}
        </div>
        <div className="dc-header-actions">
          {hasTwo && (
            <button className="dc-btn dc-btn--ghost" onClick={onClear}>Clear</button>
          )}
          <button className="dc-btn dc-btn--close" onClick={onClose} aria-label="Close">&#x2715;</button>
        </div>
      </div>

      {/* District name headers */}
      <div className="dc-names">
        <div className="dc-name" style={{ borderColor: COLORS[0] }}>
          <span className="dc-name-tag" style={{ background: COLORS[0] }}>A</span>
          <div className="dc-name-info">
            <span className="dc-name-text">{aProps.name || 'District A'}</span>
            <span className="dc-name-sub">{aProps.clusterLabel} &middot; {aProps.poiCount} businesses</span>
          </div>
        </div>
        {hasTwo && (
          <div className="dc-name" style={{ borderColor: COLORS[1] }}>
            <span className="dc-name-tag" style={{ background: COLORS[1] }}>B</span>
            <div className="dc-name-info">
              <span className="dc-name-text">{bProps.name || 'District B'}</span>
              <span className="dc-name-sub">{bProps.clusterLabel} &middot; {bProps.poiCount} businesses</span>
            </div>
          </div>
        )}
      </div>

      {/* Overlay radar chart */}
      <div className="dc-radar-wrap">
        <OverlayRadar aProps={aProps} bProps={bProps} hasTwo={hasTwo} />
      </div>

      {/* Score comparison rows (only when 2 districts selected) */}
      {hasTwo && (
        <div className="dc-rows">
          {RADAR_AXES.map(axis => (
            <CompareRow
              key={axis.key}
              label={axis.label}
              aVal={aProps[axis.key]}
              bVal={bProps[axis.key]}
            />
          ))}
          <CompareRow label="Businesses" aVal={aProps.poiCount} bVal={bProps.poiCount} />
        </div>
      )}
    </div>
  )
}

export default DistrictCompare
