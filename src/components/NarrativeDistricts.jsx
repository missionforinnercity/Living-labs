import React, { useMemo, useState, useCallback, useEffect } from 'react'
import {
  DISTRICT_DEFINITIONS,
  generateDistricts,
  getDistrictBounds
} from '../utils/districtEngine'
import { loadBusinessData, loadLightingData, loadWalkabilityData } from '../utils/dataLoader'
import { GaugeDial } from './charts'
import './NarrativeDistricts.css'

// ─────────────────────────────────────────────────────────────────────────────
// Methodology & Data Sources
// ─────────────────────────────────────────────────────────────────────────────

const METHODOLOGY = [
  { attr: 'Business Density', formula: 'POI count per ha', detail: 'Total points of interest within each DBSCAN cluster boundary divided by the convex-hull area in hectares.' },
  { attr: 'Business Diversity', formula: 'Shannon entropy', detail: "Shannon's H index computed across the Google Places category distribution within each cluster." },
  { attr: 'Lighting Score', formula: '% segments above 5 lux', detail: 'Road segments within the cluster intersected with CoCT lighting KPI data. Score = percentage above 5 lux threshold.' },
  { attr: 'Connectivity Score', formula: 'Normalised betweenness', detail: 'Network betweenness centrality (400 m radius) averaged across all nodes within the cluster, normalised 0-100.' },
  { attr: 'Overall Score', formula: '35% Density, 20% Diversity, 25% Lighting, 20% Connect.', detail: 'Weighted linear combination of the four sub-scores.' },
]

const DATA_SOURCES = [
  { label: 'Business POI', usedFor: 'District clustering and scoring' },
  { label: 'Network Connectivity', usedFor: 'Connectivity score' },
  { label: 'Street Lighting', usedFor: 'Lighting score' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const NarrativeDistricts = ({ selectedDistrictId, onDistrictSelect, onLayersChange }) => {
  const [tab,          setTab]          = useState('districts')
  const [districtFC,   setDistrictFC]   = useState(null)
  const [status,       setStatus]       = useState('idle')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [activeTypeId, setActiveTypeId] = useState(DISTRICT_DEFINITIONS[0].id)
  const [clusterIdx,   setClusterIdx]   = useState({})

  const allClusters = districtFC?.features ?? []

  const clustersByType = useMemo(() => {
    const map = {}
    DISTRICT_DEFINITIONS.forEach(d => { map[d.id] = [] })
    allClusters.forEach(f => {
      const tid = f.properties.districtId
      if (map[tid]) map[tid].push(f)
    })
    return map
  }, [allClusters])

  const activeDef      = DISTRICT_DEFINITIONS.find(d => d.id === activeTypeId)
  const typeClusters   = clustersByType[activeTypeId] ?? []
  const currentIdx     = clusterIdx[activeTypeId] ?? 0
  const currentFeature = typeClusters[currentIdx] ?? null

  const handleGenerate = useCallback(async () => {
    setStatus('loading')
    setErrorMsg('')
    try {
      const [bizResult, lightResult, walkResult] = await Promise.all([
        loadBusinessData(),
        loadLightingData().catch(() => null),
        loadWalkabilityData().catch(() => null),
      ])
      const poi = bizResult?.poi ?? null
      if (!poi?.features?.length) throw new Error('POI data unavailable.')
      const lighting    = lightResult?.roadSegments ?? null
      const walkability = walkResult?.network ?? null
      const fc = generateDistricts({ poi, lighting, walkability })
      setDistrictFC(fc)
      setStatus('done')

      if (fc.features.length > 0) {
        const first  = fc.features[0]
        const bounds = getDistrictBounds(first)
        const typeId = first.properties.districtId
        onDistrictSelect(typeId, first, bounds, { type: 'FeatureCollection', features: fc.features.filter(f => f.properties.districtId === typeId) })
      }
    } catch (err) {
      console.error('District generation error:', err)
      setErrorMsg(err.message)
      setStatus('error')
    }
  }, [onDistrictSelect])

  useEffect(() => {
    if (status === 'idle') handleGenerate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const goToCluster = useCallback((typeId, idx) => {
    const clusters = clustersByType[typeId] ?? []
    const clamped  = Math.max(0, Math.min(clusters.length - 1, idx))
    setClusterIdx(prev => ({ ...prev, [typeId]: clamped }))
    const feat = clusters[clamped]
    if (!feat) return
    const bounds = getDistrictBounds(feat)
    onDistrictSelect(feat.properties.districtId, feat, bounds, filterFC(districtFC, typeId))
  }, [clustersByType, districtFC, onDistrictSelect]) // eslint-disable-line

  const selectType = useCallback((typeId) => {
    setActiveTypeId(typeId)
    const clusters = clustersByType[typeId] ?? []
    const idx  = clusterIdx[typeId] ?? 0
    const feat = clusters[idx]
    if (!feat) return
    const bounds = getDistrictBounds(feat)
    onDistrictSelect(feat.properties.districtId, feat, bounds, filterFC(districtFC, typeId))
  }, [clustersByType, clusterIdx, districtFC, onDistrictSelect]) // eslint-disable-line

  const filterFC = (fc, typeId) => ({
    type: 'FeatureCollection',
    features: (fc?.features ?? []).filter(f => f.properties.districtId === typeId)
  })

  const parseTopCats = (raw) => { try { return JSON.parse(raw) } catch { return [] } }

  return (
    <div className="nd-root">

      {/* Header */}
      <div className="nd-header">
        <h2 className="nd-title">District Narrative Engine</h2>
        <p className="nd-subtitle">Business character districts from spatial clustering</p>
      </div>

      {/* Tabs */}
      <div className="nd-tabs">
        <button className={`nd-tab ${tab === 'districts' ? 'active' : ''}`} onClick={() => setTab('districts')}>Districts</button>
        <button className={`nd-tab ${tab === 'methodology' ? 'active' : ''}`} onClick={() => setTab('methodology')}>Methodology</button>
        <button className={`nd-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>Sources</button>
      </div>

      {/* ── Districts tab ───────────────────────────────────────── */}
      {tab === 'districts' && (
        <div className="nd-districts-pane">
          {status === 'loading' && (
            <div className="nd-loading">
              <div className="nd-spinner" />
              <p>Clustering businesses</p>
              <p className="nd-loading-sub">DBSCAN · 4 000+ POIs · 5 district types</p>
            </div>
          )}

          {status === 'error' && (
            <div className="nd-error">
              <p>{errorMsg || 'Failed to generate districts.'}</p>
              <button className="nd-btn-retry" onClick={handleGenerate}>Retry</button>
            </div>
          )}

          {status === 'done' && allClusters.length === 0 && (
            <div className="nd-empty">No districts found in data.</div>
          )}

          {status === 'done' && allClusters.length > 0 && (
            <>
              {/* Type selector — horizontal chips */}
              <div className="nd-types">
                {DISTRICT_DEFINITIONS.map(def => {
                  const count = (clustersByType[def.id] ?? []).length
                  const on = activeTypeId === def.id
                  return (
                    <button
                      key={def.id}
                      className={`nd-type ${on ? 'nd-type--on' : ''}`}
                      style={{ '--t-color': def.color }}
                      onClick={() => selectType(def.id)}
                    >
                      <span className="nd-type-dot" style={{ background: def.color }} />
                      <span className="nd-type-name">{def.name}</span>
                      <span className="nd-type-count">{count}</span>
                    </button>
                  )
                })}
              </div>

              {/* Cluster navigation */}
              {typeClusters.length > 0 && (
                <div className="nd-nav">
                  <button className="nd-nav-btn" disabled={currentIdx === 0} onClick={() => goToCluster(activeTypeId, currentIdx - 1)}>‹</button>
                  <div className="nd-nav-dots">
                    {typeClusters.map((_, i) => (
                      <button
                        key={i}
                        className={`nd-nav-dot ${i === currentIdx ? 'nd-nav-dot--on' : ''}`}
                        style={{ '--d-color': activeDef.color }}
                        onClick={() => goToCluster(activeTypeId, i)}
                      />
                    ))}
                  </div>
                  <button className="nd-nav-btn" disabled={currentIdx === typeClusters.length - 1} onClick={() => goToCluster(activeTypeId, currentIdx + 1)}>›</button>
                </div>
              )}

              {/* District card */}
              {currentFeature && activeDef && (() => {
                const p       = currentFeature.properties
                const topCats = parseTopCats(p.topCategories)
                const score   = p.overallScore ?? 0

                return (
                  <div className="nd-card" style={{ '--c-color': activeDef.color }}>
                    {/* Top row: name + score */}
                    <div className="nd-card-top">
                      <div className="nd-card-info">
                        <h3 className="nd-card-name">{p.name}</h3>
                        <p className="nd-card-label">{p.clusterLabel} — {p.poiCount} businesses</p>
                      </div>
                      <div className="nd-card-gauge">
                        <GaugeDial themeKey="districts" score={score / 100} active color={activeDef.color} />
                      </div>
                    </div>

                    {/* KPI row */}
                    <div className="nd-kpis">
                      {[
                        { k: 'densityScore', l: 'Density' },
                        { k: 'lightingScore', l: 'Lighting' },
                        { k: 'diversityScore', l: 'Diversity' },
                        { k: 'connectivityScore', l: 'Connect.' },
                      ].map(({ k, l }) => (
                        <div key={k} className="nd-kpi">
                          <span className="nd-kpi-val">{p[k] ?? '—'}</span>
                          <span className="nd-kpi-label">{l}</span>
                          <div className="nd-kpi-bar"><div className="nd-kpi-fill" style={{ width: `${p[k] ?? 0}%`, background: activeDef.color }} /></div>
                        </div>
                      ))}
                    </div>

                    {/* Narrative */}
                    <p className="nd-card-narrative">{activeDef.narrative}</p>

                    {/* Categories */}
                    {topCats.length > 0 && (
                      <div className="nd-cats">
                        {topCats.slice(0, 5).map(c => (
                          <span key={c.type} className="nd-cat">{c.type.replace(/_/g, ' ')} <em>{c.count}</em></span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              <button className="nd-btn-regen" onClick={handleGenerate}>Regenerate</button>
            </>
          )}
        </div>
      )}

      {/* ── Methodology tab ─────────────────────────────────────── */}
      {tab === 'methodology' && (
        <div className="nd-meth-pane">
          <p>Each attribute is computed at cluster level then combined with the weights below.</p>
          {METHODOLOGY.map(m => (
            <div key={m.attr} className="nd-meth-row">
              <div className="nd-meth-title">
                <span className="nd-meth-name">{m.attr}</span>
                <span className="nd-meth-formula">{m.formula}</span>
              </div>
              <p className="nd-meth-detail">{m.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Sources tab ─────────────────────────────────────────── */}
      {tab === 'sources' && (
        <div className="nd-src-pane">
          <p>The datasets below were used to compute district scores.</p>
          {DATA_SOURCES.map(s => (
            <div key={s.label} className="nd-src-row">
              <div className="nd-src-name">{s.label}</div>
              <div className="nd-src-explorer">{s.usedFor}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NarrativeDistricts
