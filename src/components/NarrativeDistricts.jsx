import React, { useMemo, useState, useCallback, useEffect } from 'react'
import {
  DISTRICT_DEFINITIONS,
  generateDistricts,
  getDistrictBounds
} from '../utils/districtEngine'
import { loadBusinessData, loadLightingData, loadWalkabilityData } from '../utils/dataLoader'
import { GlowCircle } from './charts'
import { GaugeDial } from './charts'
import './NarrativeDistricts.css'

// ─────────────────────────────────────────────────────────────────────────────
// Methodology catalogue
// ─────────────────────────────────────────────────────────────────────────────

const METHODOLOGY = [
  {
    attr: 'Business Density',
    formula: 'POI count per ha',
    detail: 'Total points of interest within each DBSCAN cluster boundary divided by the convex-hull area in hectares. Higher density indicates a more compact commercial district.'
  },
  {
    attr: 'Business Diversity',
    formula: 'Shannon entropy of categories',
    detail: 'Shannon’s H index computed across the Google Places category distribution within each cluster. A higher score means a broader mix of business types.'
  },
  {
    attr: 'Lighting Score',
    formula: '% segments ≥ 5 lux',
    detail: 'Road segments within or adjacent to the cluster are intersected with CoCT lighting KPI data. Score = percentage of segments whose mean lux value exceeds the 5 lux safety threshold.'
  },
  {
    attr: 'Connectivity Score',
    formula: 'Normalised betweenness centrality',
    detail: 'Network betweenness centrality (400 m radius) averaged across all street-network nodes within the cluster boundary, normalised 0–100 city-wide.'
  },
  {
    attr: 'Overall Score',
    formula: '35% Density · 20% Diversity · 25% Lighting · 20% Connect.',
    detail: 'Weighted linear combination of the four sub-scores. Weights reflect the relative importance of commercial vitality (density + diversity) and public-realm quality (lighting + connectivity).'
  },
  {
    attr: 'Clustering Method',
    formula: 'DBSCAN ε=80 m, minPts=4',
    detail: 'Density-Based Spatial Clustering of Applications with Noise. Parameters: 80 m neighbourhood radius, minimum 4 POIs to form a core point. Noise points (isolated POIs) are excluded from districts.'
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Data sources catalogue
// ─────────────────────────────────────────────────────────────────────────────

const DATA_SOURCES = [
  { label: 'Business POI',         usedFor: 'District clustering and scoring' },
  { label: 'Network Connectivity', usedFor: 'Connectivity score'               },
  { label: 'Street Lighting',      usedFor: 'Lighting score'                   },
]

// ─────────────────────────────────────────────────────────────────────────────
// Category badge
// ─────────────────────────────────────────────────────────────────────────────

function CategoryBadge ({ type, count }) {
  return (
    <span className="nd-category-badge">
      {type.replace(/_/g, ' ')} <em>{count}</em>
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const NarrativeDistricts = ({ selectedDistrictId, onDistrictSelect, onLayersChange }) => {
  const [tab,          setTab]          = useState('districts')
  const [districtFC,   setDistrictFC]   = useState(null)
  const [status,       setStatus]       = useState('idle')
  const [errorMsg,     setErrorMsg]     = useState('')
  // which district TYPE is selected
  const [activeTypeId, setActiveTypeId] = useState(DISTRICT_DEFINITIONS[0].id)
  // per-type cluster cursor  {typeId: index}
  const [clusterIdx,   setClusterIdx]   = useState({})

  // ── Derived ───────────────────────────────────────────────────────────────
  const allClusters = districtFC?.features ?? []

  // Map typeId → array of cluster features, ordered
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

  // ── Load & generate ───────────────────────────────────────────────────────
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
      // Pass road segments for lighting + network nodes for connectivity
      const lighting    = lightResult?.roadSegments ?? null
      const walkability = walkResult?.network ?? null
      const fc = generateDistricts({ poi, lighting, walkability })
      setDistrictFC(fc)
      setStatus('done')

      // Auto-select first cluster of first type
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

  // ── Navigation helpers ────────────────────────────────────────────────────
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
    // trigger map fly-to on the current cluster for that type
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="nd-root">

      {/* Header */}
      <div className="nd-header">
        <h2 className="nd-title">District Narrative Engine</h2>
        <p className="nd-subtitle">Business character districts from spatial clustering</p>
      </div>

      {/* Tabs */}
      <div className="nd-tabs">
        <button className={`nd-tab ${tab === 'districts' ? 'active' : ''}`} onClick={() => setTab('districts')}>
          Districts
        </button>
        <button className={`nd-tab ${tab === 'methodology' ? 'active' : ''}`} onClick={() => setTab('methodology')}>
          Methodology
        </button>
        <button className={`nd-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>
          Data Sources
        </button>
      </div>

      {/* ── DISTRICTS TAB ──────────────────────────────────────────── */}
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
              {/* ── TYPE SELECTOR PILLS ───────────────────────────── */}
              <div className="nd-type-pills">
                {DISTRICT_DEFINITIONS.map(def => {
                  const count = (clustersByType[def.id] ?? []).length
                  return (
                    <button
                      key={def.id}
                      className={`nd-type-pill ${activeTypeId === def.id ? 'active' : ''}`}
                      style={{ '--pill-color': def.color, '--pill-glow': def.glowColor }}
                      onClick={() => selectType(def.id)}
                    >
                      <span className="nd-pill-swatch" style={{ background: def.color }} />
                      <span className="nd-pill-name">{def.name.replace(' & ', '\u00a0&\u00a0')}</span>
                      {count > 0 && <span className="nd-pill-count">{count}</span>}
                    </button>
                  )
                })}
              </div>

              {/* ── CLUSTER NAV ───────────────────────────────────── */}
              {typeClusters.length > 0 && (
                <div className="nd-cluster-nav">
                  <button
                    className="nd-cnav-btn"
                    disabled={currentIdx === 0}
                    onClick={() => goToCluster(activeTypeId, currentIdx - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="nd-cnav-label">
                    Cluster {currentIdx + 1} of {typeClusters.length}
                  </span>
                  <button
                    className="nd-cnav-btn"
                    disabled={currentIdx === typeClusters.length - 1}
                    onClick={() => goToCluster(activeTypeId, currentIdx + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}

              {/* ── CLUSTER DOTS ──────────────────────────────────── */}
              {typeClusters.length > 1 && (
                <div className="nd-cluster-dots">
                  {typeClusters.map((f, i) => (
                    <button
                      key={f.properties.clusterId}
                      className={`nd-cdot ${i === currentIdx ? 'active' : ''}`}
                      style={{ '--dot-color': activeDef.color }}
                      onClick={() => goToCluster(activeTypeId, i)}
                      title={f.properties.clusterLabel}
                    />
                  ))}
                </div>
              )}

              {/* ── DISTRICT CARD ─────────────────────────────────── */}
              {currentFeature && activeDef && (() => {
                const p       = currentFeature.properties
                const topCats = parseTopCats(p.topCategories)
                return (
                  <div
                    className="nd-card"
                    style={{ '--card-color': activeDef.color, '--card-glow': activeDef.glowColor }}
                    key={p.clusterId}
                  >
                    {/* Aurora glow background */}
                    <div className="nd-card-glow-bg">
                      <GlowCircle themeKey="districts" score={Math.max(0.15, (p.overallScore ?? 0) / 100)} />
                    </div>

                    <div className="nd-card-accent" style={{ background: activeDef.color }} />

                    {/* Card header */}
                    <div className="nd-card-header">
                      <div className="nd-card-meta">
                        <h3 className="nd-card-name">{p.name}</h3>
                        <p className="nd-card-cluster-label">{p.clusterLabel} &mdash; {p.poiCount} businesses</p>
                        <p className="nd-card-tagline">{activeDef.tagline}</p>
                      </div>
                      <div className="nd-card-gauge">
                        <GaugeDial themeKey="districts" score={(p.overallScore ?? 0) / 100} active color={activeDef.color} />
                      </div>
                    </div>

                    <p className="nd-card-narrative">{activeDef.narrative}</p>

                    {/* Top categories */}
                    {topCats.length > 0 && (
                      <div className="nd-categories-section">
                        <p className="nd-categories-heading">Top Business Types</p>
                        <div className="nd-categories-list">
                          {topCats.map(c => <CategoryBadge key={c.type} type={c.type} count={c.count} />)}
                        </div>
                      </div>
                    )}

                    {/* Compare by clicking districts on the map */}
                  </div>
                )
              })()}

              <button className="nd-btn-regen" onClick={handleGenerate}>Regenerate</button>
            </>
          )}
        </div>
      )}

      {/* ── METHODOLOGY TAB ────────────────────────────────────────── */}
      {tab === 'methodology' && (
        <div className="nd-sources-pane">
          <p className="nd-sources-intro">
            How each district score is computed from the underlying data.
          </p>
          {METHODOLOGY.map(m => (
            <div key={m.attr} className="nd-meth-row">
              <div className="nd-meth-header">
                <span className="nd-meth-name">{m.attr}</span>
                <span className="nd-meth-formula">{m.formula}</span>
              </div>
              <p className="nd-meth-detail">{m.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── DATA SOURCES TAB ───────────────────────────────────────── */}
      {tab === 'sources' && (
        <div className="nd-sources-pane">
          <p className="nd-sources-intro">
            Datasets powering the District Narrative Engine.
          </p>
          {DATA_SOURCES.map(s => (
            <div key={s.label} className="nd-source-card active">
              <div className="nd-source-header">
                <span className="nd-source-label">{s.label}</span>
                <span className="nd-source-status used">Used</span>
              </div>
              <p className="nd-source-used-for">{s.usedFor}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NarrativeDistricts
