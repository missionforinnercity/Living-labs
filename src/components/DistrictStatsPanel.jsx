import React, { useState } from 'react'
import { DISTRICT_DEFINITIONS } from '../utils/districtEngine'
import { GaugeDial } from './charts'
import { ScoreBar } from './charts'
import './DistrictStatsPanel.css'

const AXES = [
  { key: 'densityScore',      label: 'Density',      sub: 'POI cluster count' },
  { key: 'lightingScore',     label: 'Lighting',     sub: 'Brightness quality' },
  { key: 'diversityScore',    label: 'Diversity',    sub: 'Business type mix' },
  { key: 'connectivityScore', label: 'Connectivity', sub: 'Pedestrian network' },
]

const DistrictStatsPanel = ({ feature, onClose }) => {
  const [expanded, setExpanded] = useState(false)

  if (!feature) return null

  const p = feature.properties
  const def = DISTRICT_DEFINITIONS.find(d => d.id === p.districtId)
  if (!def) return null

  let topCats = []
  try { topCats = JSON.parse(p.topCategories || '[]') } catch {}

  return (
    <div className={`dsp ${expanded ? 'dsp--expanded' : ''}`}>
      {/* Handle */}
      <button className="dsp-handle" onClick={() => setExpanded(e => !e)}>
        <div className="dsp-handle-pill" />
      </button>

      <div className="dsp-grid">
        {/* Left: Gauge + meta */}
        <div className="dsp-identity">
          <div className="dsp-gauge">
            <GaugeDial themeKey="districts" score={(p.overallScore ?? 0) / 100} active color={def.color} />
          </div>
          <div className="dsp-meta">
            <h2 className="dsp-name">{p.name}</h2>
            <p className="dsp-label" style={{ color: def.color }}>{p.clusterLabel} &mdash; {p.poiCount} businesses</p>
            <p className="dsp-tagline">{p.tagline}</p>
          </div>
        </div>

        {/* Middle: Score bars */}
        <div className="dsp-scores">
          {AXES.map(a => (
            <div key={a.key} className="dsp-score-row">
              <div className="dsp-score-info">
                <span className="dsp-score-label">{a.label}</span>
                <span className="dsp-score-sub">{a.sub}</span>
              </div>
              <div className="dsp-score-bar">
                <ScoreBar themeKey="districts" score={(p[a.key] ?? 0) / 100} active color={def.color} />
              </div>
            </div>
          ))}
        </div>

        {/* Right: Quick stats */}
        <div className="dsp-quick">
          <div className="dsp-stat">
            <span className="dsp-stat-val">{p.poiCount}</span>
            <span className="dsp-stat-key">Businesses</span>
          </div>
          <div className="dsp-stat">
            <span className="dsp-stat-val">{topCats.length}</span>
            <span className="dsp-stat-key">Types</span>
          </div>
        </div>

        {/* Close */}
        <button className="dsp-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="dsp-detail">
          {p.narrative && (
            <p className="dsp-narrative" style={{ borderLeftColor: def.color + '60' }}>{p.narrative}</p>
          )}

          {topCats.length > 0 && (
            <div className="dsp-categories">
              <span className="dsp-detail-heading">Top Categories</span>
              <div className="dsp-cat-list">
                {topCats.slice(0, 6).map((c, i) => {
                  const pct = Math.round((c.count / topCats[0].count) * 100)
                  return (
                    <div key={c.type} className="dsp-cat">
                      <span className="dsp-cat-rank">{i + 1}</span>
                      <span className="dsp-cat-name">{c.type.replace(/_/g, ' ')}</span>
                      <div className="dsp-cat-track">
                        <div className="dsp-cat-fill" style={{ width: `${pct}%`, background: def.color }} />
                      </div>
                      <span className="dsp-cat-count">{c.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DistrictStatsPanel
