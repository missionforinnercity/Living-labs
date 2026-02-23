import React, { useState, useRef, useEffect } from 'react'
import { DISTRICT_DEFINITIONS } from '../utils/districtEngine'
import './DistrictStatsPanel.css'

// ─────────────────────────────────────────────────────────────────────────────
// Spider axes config
// ─────────────────────────────────────────────────────────────────────────────
const SPIDER_AXES = [
  { key: 'densityScore',      label: 'Density',      angle: -90 },
  { key: 'lightingScore',     label: 'Lighting',     angle:   0 },
  { key: 'diversityScore',    label: 'Diversity',    angle:  90 },
  { key: 'connectivityScore', label: 'Connectivity', angle: 180 },
]

// ─────────────────────────────────────────────────────────────────────────────
// Animated radar chart — values morph via requestAnimationFrame
// ─────────────────────────────────────────────────────────────────────────────
function SpiderChart ({ scores, color, glowColor }) {
  const getVals = (s) => {
    const v = {}
    SPIDER_AXES.forEach(a => { v[a.key] = parseFloat(s?.[a.key] ?? 0) || 0 })
    return v
  }

  const [anim, setAnim]   = useState(() => getVals(scores))
  const prevRef           = useRef(getVals(scores))
  const rafRef            = useRef(null)
  const t0Ref             = useRef(null)

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const from     = { ...prevRef.current }
    const to       = getVals(scores)
    const DURATION = 600
    t0Ref.current  = null

    const tick = (ts) => {
      if (!t0Ref.current) t0Ref.current = ts
      const raw = Math.min((ts - t0Ref.current) / DURATION, 1)
      // easeInOutCubic
      const ease = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2
      const interp = {}
      SPIDER_AXES.forEach(a => {
        interp[a.key] = from[a.key] + (to[a.key] - from[a.key]) * ease
      })
      setAnim(interp)
      if (raw < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
        t0Ref.current   = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [scores.densityScore, scores.lightingScore, scores.diversityScore, scores.connectivityScore]) // eslint-disable-line

  const SIZE = 320
  const CX   = SIZE / 2
  const CY   = SIZE / 2
  const R    = 95

  const pt = (angleDeg, pct) => {
    const rad = angleDeg * Math.PI / 180
    const s = Math.max(0, Math.min(100, pct)) / 100
    return [CX + R * Math.cos(rad) * s, CY + R * Math.sin(rad) * s]
  }

  const dataPoints = SPIDER_AXES.map(a => pt(a.angle, anim[a.key]))
  const polygonPts = dataPoints.map(p => p.join(',')).join(' ')
  const axisEnds   = SPIDER_AXES.map(a => {
    const rad = a.angle * Math.PI / 180
    return { ...a, ex: CX + R * Math.cos(rad), ey: CY + R * Math.sin(rad) }
  })
  const fillColor  = glowColor ? glowColor.replace(/[\d.]+\)$/, '0.15)') : 'rgba(255,255,255,0.05)'

  return (
    <svg
      className="dsp-spider-svg"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ filter: `drop-shadow(0 0 12px ${glowColor})`, overflow: 'visible' }}
    >
      {/* Grid rings */}
      {[25, 50, 75, 100].map(pct => (
        <polygon
          key={pct}
          points={SPIDER_AXES.map(a => pt(a.angle, pct)).map(p => p.join(',')).join(' ')}
          fill="none"
          stroke={pct === 50 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}
          strokeWidth={pct === 50 ? '1' : '0.6'}
          strokeDasharray={pct === 50 ? '3 4' : undefined}
        />
      ))}

      {/* Axis lines */}
      {axisEnds.map(a => (
        <line key={a.key}
          x1={CX} y1={CY} x2={a.ex} y2={a.ey}
          stroke="rgba(255,255,255,0.1)" strokeWidth="0.8"
        />
      ))}

      {/* Pulsing data polygon */}
      <polygon
        points={polygonPts}
        fill={fillColor}
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="4" fill={color}
          style={{ filter: `drop-shadow(0 0 5px ${glowColor})` }}
        />
      ))}

      {/* Axis labels */}
      {axisEnds.map(a => {
        const rad = a.angle * Math.PI / 180
        const lr  = R + 20
        return (
          <text key={a.key + 'l'}
            x={CX + lr * Math.cos(rad)} y={CY + lr * Math.sin(rad)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9.5" fill="rgba(255,255,255,0.45)"
            fontFamily="'Inter', system-ui, sans-serif"
            fontWeight="600" letterSpacing="0.8"
          >
            {a.label.toUpperCase()}
          </text>
        )
      })}

      {/* Score values near tips */}
      {SPIDER_AXES.map((a) => {
        const val = Math.round(anim[a.key])
        if (val < 8) return null
        const rad = a.angle * Math.PI / 180
        const vr  = R * (val / 100) * 0.60
        return (
          <text key={a.key + 'v'}
            x={CX + vr * Math.cos(rad)} y={CY + vr * Math.sin(rad)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fontWeight="800" fill={color}
            fontFamily="'Inter', system-ui, sans-serif"
          >
            {val}
          </text>
        )
      })}
    </svg>
  )
}

/**
 * Full-width bottom panel showing rich stats for the selected district.
 * Slides up from the bottom of the map container when a district is selected.
 */
const DistrictStatsPanel = ({ feature, onClose }) => {
  const [expanded, setExpanded] = useState(false)

  if (!feature) return null

  const p = feature.properties
  const def = DISTRICT_DEFINITIONS.find(d => d.id === p.districtId)
  if (!def) return null

  let topCats = []
  try { topCats = JSON.parse(p.topCategories || '[]') } catch {}

  const scores = [
    { label: 'Density',      sub: 'POI cluster count (power-law)',        value: p.densityScore      },
    { label: 'Diversity',    sub: 'Unique business type mix vs palette',   value: p.diversityScore    },
    { label: 'Lighting',     sub: 'Brightness − dark-spot penalty (lux)',   value: p.lightingScore     },
    { label: 'Connectivity', sub: 'Pedestrian betweenness 400m (normed)',  value: p.connectivityScore },
  ]

  return (
    <div className={`dsp-root ${expanded ? 'expanded' : ''}`}>
      {/* Drag handle / collapse toggle */}
      <div className="dsp-handle" onClick={() => setExpanded(e => !e)}>
        <div className="dsp-handle-bar" />
      </div>

      {/* Header strip */}
      <div className="dsp-header" style={{ '--dsp-color': def.color, '--dsp-glow': def.glowColor }}>
        <div className="dsp-title-block">
          <h2 className="dsp-name">{p.name}</h2>
          <p className="dsp-cluster-label">{p.clusterLabel} &mdash; {p.poiCount} businesses</p>
          <p className="dsp-tagline">{p.tagline}</p>
        </div>
        <div className="dsp-overall">
          <span className="dsp-overall-value" style={{ color: def.color }}>{p.overallScore}</span>
          <span className="dsp-overall-label">overall</span>
        </div>
        <button className="dsp-close" onClick={onClose}>✕</button>
      </div>

      {/* Spider chart — always visible */}
      <div className="dsp-spider-section">
        <div className="dsp-spider-wrap">
          <SpiderChart scores={p} color={def.color} glowColor={def.glowColor} />
        </div>
        <div className="dsp-spider-legend">
          {scores.map(s => (
            <div key={s.label} className="dsp-sleg-row">
              <div className="dsp-sleg-label-group">
                <span className="dsp-sleg-label">{s.label}</span>
                <span className="dsp-sleg-sub">{s.sub}</span>
              </div>
              <div className="dsp-sleg-track">
                <div
                  className="dsp-sleg-fill"
                  style={{ width: `${s.value ?? 0}%`, background: def.color,
                    boxShadow: `0 0 6px ${def.glowColor}` }}
                />
              </div>
              <span className="dsp-sleg-val" style={{ color: def.color }}>{s.value ?? '–'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expanded detail — narrative + categories + extra stats */}
      {expanded && (
        <div className="dsp-detail">
          <div className="dsp-narrative-block">
            <p className="dsp-narrative">{p.narrative}</p>
          </div>

          <div className="dsp-extra">
            {/* Key stats */}
            <div className="dsp-kpi-row">
              <div className="dsp-kpi">
                <span className="dsp-kpi-value">{p.poiCount}</span>
                <span className="dsp-kpi-label">Businesses</span>
              </div>
              <div className="dsp-kpi">
                <span className="dsp-kpi-value">{p.vitalityScore}/100</span>
                <span className="dsp-kpi-label">Density Score</span>
              </div>
              <div className="dsp-kpi">
                <span className="dsp-kpi-value">{p.overallScore}/100</span>
                <span className="dsp-kpi-label">Overall Score</span>
              </div>
              <div className="dsp-kpi">
                <span className="dsp-kpi-value">{topCats.length}</span>
                <span className="dsp-kpi-label">Business Types</span>
              </div>
            </div>

            {/* Top categories */}
            {topCats.length > 0 && (
              <div className="dsp-cats">
                <p className="dsp-cats-title">Top Business Categories</p>
                <div className="dsp-cats-bars">
                  {topCats.map((c, i) => {
                    const pct = Math.round((c.count / topCats[0].count) * 100)
                    return (
                      <div key={c.type} className="dsp-cat-row">
                        <span className="dsp-cat-rank">{i + 1}</span>
                        <span className="dsp-cat-name">{c.type.replace(/_/g, ' ')}</span>
                        <div className="dsp-cat-track">
                          <div
                            className="dsp-cat-fill"
                            style={{ width: `${pct}%`, background: def.color }}
                          />
                        </div>
                        <span className="dsp-cat-count">{c.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DistrictStatsPanel
