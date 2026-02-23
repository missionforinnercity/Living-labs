import React, { useMemo, useState, useCallback, useEffect } from 'react'
import {
  DISTRICT_DEFINITIONS,
  generateDistricts,
  getDistrictBounds
} from '../utils/districtEngine'
import { loadBusinessData, loadLightingData, loadWalkabilityData } from '../utils/dataLoader'
import './NarrativeDistricts.css'

// ─────────────────────────────────────────────────────────────────────────────
// Data sources catalogue
// ─────────────────────────────────────────────────────────────────────────────

const DATA_SOURCES = [
  {
    label: 'Business POI',
    file: 'POI_simplified.geojson',
    desc: '4 100+ Google Places points of interest across the Cape Town CBD.',
    usedFor: 'All district clustering and scoring',
    active: true
  },
  {
    label: 'Pedestrian Activity',
    file: 'pedestrian_month_all.geojson',
    desc: 'Strava Metro monthly pedestrian trip counts per street segment.',
    usedFor: 'Data Explorer only',
    active: false
  },
  {
    label: 'Network Connectivity',
    file: 'network_connectivity.geojson',
    desc: 'Space syntax network — Hillier integration and betweenness centrality.',
    usedFor: 'Connectivity score (pedestrian flow)',
    active: true
  },
  {
    label: 'Street Lighting',
    file: 'road_segments_lighting_kpis_all.geojson',
    desc: 'Road segments with average lux values and coverage above 5 lux threshold.',
    usedFor: 'Lighting score (% above 5 lux)',
    active: true
  },
  {
    label: 'Greenery & Sky View',
    file: 'greenryandSkyview.geojson',
    desc: 'Street-level vegetation index and sky view factor per network node.',
    usedFor: 'Data Explorer only',
    active: false
  },
  {
    label: 'Surface Temperature',
    file: 'annual_surface_temp.geojson',
    desc: 'Seasonal surface temperatures per road segment from satellite imagery.',
    usedFor: 'Data Explorer only',
    active: false
  }
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

const NarrativeDistricts = ({ selectedDistrictId, onDistrictSelect }) => {
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
                    <div className="nd-card-accent" style={{ background: activeDef.color }} />

                    {/* Card header */}
                    <div className="nd-card-header">
                      <div className="nd-card-meta">
                        <h3 className="nd-card-name">{p.name}</h3>
                        <p className="nd-card-cluster-label">{p.clusterLabel} &mdash; {p.poiCount} businesses</p>
                        <p className="nd-card-tagline">{activeDef.tagline}</p>
                      </div>
                      <div className="nd-card-overall">
                        <span className="nd-overall-value">{p.overallScore}</span>
                        <span className="nd-overall-label">/100</span>
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
                  </div>
                )
              })()}

              <button className="nd-btn-regen" onClick={handleGenerate}>Regenerate</button>
            </>
          )}
        </div>
      )}

      {/* ── DATA SOURCES TAB ───────────────────────────────────────── */}
      {tab === 'sources' && (
        <div className="nd-sources-pane">
          <p className="nd-sources-intro">
            Datasets powering the District Narrative Engine.
            Inactive datasets are available in the Data Explorer.
          </p>
          {DATA_SOURCES.map(s => (
            <div key={s.file} className={`nd-source-card ${s.active ? 'active' : ''}`}>
              <div className="nd-source-header">
                <span className="nd-source-label">{s.label}</span>
                <span className={`nd-source-status ${s.active ? 'used' : ''}`}>
                  {s.active ? 'Used' : 'Explorer'}
                </span>
              </div>
              <p className="nd-source-file">{s.file}</p>
              <p className="nd-source-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default NarrativeDistricts
