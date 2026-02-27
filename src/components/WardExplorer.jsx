import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import './WardExplorer.css'

mapboxgl.accessToken = 'pk.eyJ1IjoiYW5lZXNvbWFyIiwiYSI6ImNtN3lnYXhveTA5NmsyanM2Z2NmaHhrcncifQ.xIzrc87ZIEJZE1vpB2gFfw'

// ─── Tab / Metric Configuration ──────────────────────────────────────────────
// pct: [lo, hi] clips the colour range to those percentiles (0–100)
// omit pct to use full min–max
const TABS = [
  {
    id: 'greenblue',
    label: 'Nature Access',
    description: 'Green spaces, parks and blue water features scored per neighbourhood.',
    metrics: [
      { key: 'GreenBlue_Score', label: 'Combined Score', low: [10, 26, 20],  high: [0, 230, 118] },
      { key: 'Green_Score',     label: 'Green Score',    low: [10, 30, 15],  high: [105, 240, 174] },
      { key: 'Blue_Score',      label: 'Blue Score',     low: [10, 20, 40],  high: [64, 196, 255] },
    ],
    statFields: [
      { key: 'GreenBlue_Score', label: 'Green-Blue Score', fmt: v => v.toFixed(3) },
      { key: 'Green_Score',     label: 'Green Score',      fmt: v => v.toFixed(3) },
      { key: 'Blue_Score',      label: 'Blue Score',       fmt: v => v.toFixed(3) },
      { key: 'park_area_sqm',   label: 'Park Area',        fmt: v => (v / 1e6).toFixed(3) + ' km²', skipZero: true },
      { key: 'water_area_sqm',  label: 'Water Area',       fmt: v => (v / 1e6).toFixed(3) + ' km²', skipZero: true },
    ],
  },
  {
    id: 'demographic',
    label: 'Demographics',
    description: 'Population size, income and economic activity by neighbourhood.',
    metrics: [
      { key: 'avg_income', label: 'Avg. Income',      low: [20, 10, 40], high: [224, 64, 251], pct: [5, 95] },
      { key: 'pop_total',  label: 'Total Population', low: [10, 25, 45], high: [255, 110, 64], pct: [5, 95] },
      { key: 'employed',   label: 'Employed Count',   low: [10, 26, 35], high: [0, 188, 212],  pct: [5, 95] },
    ],
    statFields: [
      { key: 'pop_total',  label: 'Total Population',   fmt: v => Math.round(v).toLocaleString() },
      { key: 'pop_18plus', label: 'Adults (18+)',        fmt: v => Math.round(v).toLocaleString() },
      { key: 'pop_18_6',   label: 'Working Age (18–65)', fmt: v => Math.round(v).toLocaleString() },
      { key: 'avg_income', label: 'Avg. Income (R/yr)', fmt: v => 'R ' + Math.round(v).toLocaleString() },
      { key: 'edu_total',  label: 'Educated (est.)',    fmt: v => Math.round(v).toLocaleString() },
      { key: 'employed',   label: 'Employed',           fmt: v => Math.round(v).toLocaleString() },
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    description: 'Street lighting density and wattage infrastructure per neighbourhood.',
    metrics: [
      { key: 'lights_per_sqkm',   label: 'Lights / km²',      low: [20, 15, 0],  high: [255, 215, 64], pct: [5, 95] },
      { key: '_wattage_per_sqkm', label: 'Wattage / km²',     low: [18, 10, 0],  high: [255, 145, 0],  pct: [5, 95] },
      { key: '_avg_wattage',      label: 'Avg. Watts / Light', low: [10, 10, 10], high: [255, 241, 118], pct: [5, 95] },
    ],
    statFields: [
      { key: 'total_lights',      label: 'Total Lights',       fmt: v => Math.round(v).toLocaleString() },
      { key: 'total_wattage',     label: 'Total Wattage',      fmt: v => Math.round(v).toLocaleString() + ' W' },
      { key: 'lights_per_sqkm',   label: 'Lights / km²',       fmt: v => v.toFixed(1) },
      { key: '_wattage_per_sqkm', label: 'Wattage / km²',      fmt: v => Math.round(v).toLocaleString() + ' W' },
      { key: '_avg_wattage',      label: 'Avg. Watts / Light', fmt: v => v.toFixed(1) + ' W' },
    ],
  },
  {
    id: 'density',
    label: 'Density',
    description: 'Population density relative to neighbourhood size.',
    metrics: [
      { key: '_pop_density', label: 'Pop. / km²', low: [10, 10, 10], high: [255, 64, 129], pct: [5, 90] },
    ],
    statFields: [
      { key: 'pop_total',    label: 'Total Population',   fmt: v => Math.round(v).toLocaleString() },
      { key: '_pop_density', label: 'Pop. Density',       fmt: v => Math.round(v).toLocaleString() + ' /km²' },
      { key: 'nb_area_sqm',  label: 'Neighbourhood Area', fmt: v => (v / 1e6).toFixed(3) + ' km²' },
      { key: 'pop_18plus',   label: 'Adults (18+)',        fmt: v => Math.round(v).toLocaleString() },
      { key: 'pop_18_6',     label: 'Working Age',        fmt: v => Math.round(v).toLocaleString() },
      { key: 'WardID',       label: 'Ward',               fmt: v => '#' + v },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Returns [min, max] optionally clipped to percentiles [loP, hiP]
function computeRange(features, key, pct) {
  const vals = features
    .map(f => f.properties[key])
    .filter(v => v != null && isFinite(v) && v > 0) // exclude zeros/nulls from range
    .sort((a, b) => a - b)
  if (!vals.length) return [0, 1]
  if (!pct) return [vals[0], vals[vals.length - 1]]
  const lo = vals[Math.floor((pct[0] / 100) * (vals.length - 1))]
  const hi = vals[Math.floor((pct[1] / 100) * (vals.length - 1))]
  return [lo, hi]
}

function makeColorExpression(key, min, max, low, high) {
  const mid = rgbToHex(low.map((c, i) => Math.round(c * 0.25 + high[i] * 0.75)))
  return [
    'interpolate', ['linear'],
    ['max', min, ['min', max, ['get', key]]], // clamp to range
    min, rgbToHex(low),
    min + (max - min) * 0.5, mid,
    max, rgbToHex(high),
  ]
}

// Injects computed fields into the feature properties
function enrichFeatures(features) {
  return features.map(f => {
    const p = f.properties
    const area_sqkm = (p.nb_area_sqm || 0) / 1e6
    return {
      ...f,
      properties: {
        ...p,
        _pop_density:      area_sqkm > 0 ? p.pop_total / area_sqkm : 0,
        _wattage_per_sqkm: area_sqkm > 0 ? p.total_wattage / area_sqkm : 0,
        _avg_wattage:      p.total_lights > 0 ? p.total_wattage / p.total_lights : 0,
      }
    }
  })
}

// City-wide aggregate stats for the bottom bar
function computeCityStats(features) {
  const pop    = features.reduce((s, f) => s + (f.properties.pop_total || 0), 0)
  const area   = features.reduce((s, f) => s + (f.properties.nb_area_sqm || 0), 0)
  const lights = features.reduce((s, f) => s + (f.properties.total_lights || 0), 0)
  const parks  = features.reduce((s, f) => s + (f.properties.park_area_sqm || 0), 0)
  const incomes = features.map(f => f.properties.avg_income).filter(Boolean)
  const avgIncome = incomes.length ? incomes.reduce((s, v) => s + v, 0) / incomes.length : 0
  return {
    count:     features.length,
    pop:       Math.round(pop),
    areaSqkm:  (area / 1e6).toFixed(0),
    lights:    Math.round(lights),
    parksSqkm: (parks / 1e6).toFixed(1),
    avgIncome: Math.round(avgIncome),
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function WardExplorer({ onEnterDashboard }) {
  const mapRef = useRef(null)
  const mapEl  = useRef(null)
  const hoveredIdRef = useRef(null)  // avoids stale closure in mapbox handlers

  const [rawGeoJSON,     setRawGeoJSON]     = useState(null)
  const [mapLoaded,      setMapLoaded]      = useState(false)
  const [activeTab,      setActiveTab]      = useState(0)
  const [activeMetricIdx,setActiveMetricIdx]= useState(0)
  const [selectedWard,   setSelectedWard]   = useState(null)
  const [hoveredWardId,  setHoveredWardId]  = useState(null)

  // Fetch neighbourhood data once
  useEffect(() => {
    fetch('/data/CPT/master_neighbourhoods_enriched.geojson')
      .then(r => r.json())
      .then(data => setRawGeoJSON(data))
      .catch(err => console.error('Failed to load neighbourhoods:', err))
  }, [])

  // Enrich and memoize data
  const geojson = useMemo(() => {
    if (!rawGeoJSON) return null
    return { ...rawGeoJSON, features: enrichFeatures(rawGeoJSON.features) }
  }, [rawGeoJSON])

  const cityStats = useMemo(() => geojson ? computeCityStats(geojson.features) : null, [geojson])

  // Pre-compute per-metric ranges once (respecting pct clipping)
  const metricRanges = useMemo(() => {
    if (!geojson) return {}
    const ranges = {}
    TABS.forEach(tab => tab.metrics.forEach(m => {
      ranges[m.key] = computeRange(geojson.features, m.key, m.pct)
    }))
    return ranges
  }, [geojson])

  const tab    = TABS[activeTab]
  const metric = tab.metrics[activeMetricIdx]

  // ── Init map (waits for geojson) ──────────────────────────────────────────
  useEffect(() => {
    if (!geojson) return
    if (mapRef.current) {
      // Map already exists — just update the source data
      if (mapRef.current.getSource('wards')) {
        mapRef.current.getSource('wards').setData(geojson)
      }
      return
    }
    mapRef.current = new mapboxgl.Map({
      container: mapEl.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [18.63, -33.93],
      zoom: 9.8,
      pitch: 28,
      bearing: -8,
      attributionControl: false,
    })

    mapRef.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
    mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    mapRef.current.on('load', () => {
      const m = mapRef.current

      m.addSource('wards', { type: 'geojson', data: geojson, promoteId: 'neighbourhood', generateId: false })

      // Fill layer — colour driven by metric
      m.addLayer({
        id: 'wards-fill',
        type: 'fill',
        source: 'wards',
        paint: {
          'fill-color': '#1a8a5a',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.92, 0.72],
        }
      })

      // Outline
      m.addLayer({
        id: 'wards-outline',
        type: 'line',
        source: 'wards',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ffffff', 'rgba(255,255,255,0.18)'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 0.6],
        }
      })

      // Neighbourhood label
      m.addLayer({
        id: 'wards-label',
        type: 'symbol',
        source: 'wards',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'neighbourhood'],
          'text-size': 9,
          'text-max-width': 8,
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': 'rgba(255,255,255,0.55)',
          'text-halo-color': 'rgba(0,0,0,0.5)',
          'text-halo-width': 1,
        }
      })

      // Hover interaction
      m.on('mousemove', 'wards-fill', e => {
        if (!e.features.length) return
        const id = e.features[0].properties.neighbourhood
        if (id !== hoveredIdRef.current) {
          if (hoveredIdRef.current) m.setFeatureState({ source: 'wards', id: hoveredIdRef.current }, { hover: false })
          m.setFeatureState({ source: 'wards', id }, { hover: true })
          hoveredIdRef.current = id
          setHoveredWardId(id)
        }
        m.getCanvas().style.cursor = 'pointer'
      })

      m.on('mouseleave', 'wards-fill', () => {
        if (hoveredIdRef.current) m.setFeatureState({ source: 'wards', id: hoveredIdRef.current }, { hover: false })
        hoveredIdRef.current = null
        setHoveredWardId(null)
        m.getCanvas().style.cursor = ''
      })

      // Click interaction
      m.on('click', 'wards-fill', e => {
        if (!e.features.length) return
        const feat = e.features[0]
        const id = feat.properties.neighbourhood
        // deselect previous
        m.querySourceFeatures('wards').forEach(f => {
          m.setFeatureState({ source: 'wards', id: f.properties.neighbourhood }, { selected: false })
        })
        m.setFeatureState({ source: 'wards', id }, { selected: true })
        // get full enriched feature so we have computed props
        const fullFeat = geojson.features.find(f => f.properties.neighbourhood === id) || feat
        setSelectedWard(fullFeat.properties)
        m.easeTo({ center: e.lngLat, duration: 400 })
      })

      setMapLoaded(true)
    })

    return () => { mapRef.current?.remove(); mapRef.current = null }
  }, [geojson]) // eslint-disable-line

  // ── Update fill colour when tab or metric changes ─────────────────────────
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const m = mapRef.current
    if (!m.getLayer('wards-fill')) return
    const [min, max] = metricRanges[metric.key] ?? [0, 1]
    m.setPaintProperty('wards-fill', 'fill-color',
      makeColorExpression(metric.key, min, max, metric.low, metric.high))
  }, [mapLoaded, activeTab, activeMetricIdx, metric, metricRanges])

  // Reset metric index when tab changes
  const handleTabChange = useCallback(idx => {
    setActiveTab(idx)
    setActiveMetricIdx(0)
  }, [])

  const closePanel = useCallback(() => {
    setSelectedWard(null)
    if (mapRef.current) {
      mapRef.current.querySourceFeatures('wards').forEach(f => {
        mapRef.current.setFeatureState({ source: 'wards', id: f.properties.neighbourhood }, { selected: false })
      })
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────
  if (!geojson) {
    return (
      <div className="we-root">
        <div ref={mapEl} className="we-map" style={{ opacity: 0 }} />
        <div className="we-loading">
          <div className="we-loading-spinner" />
          <p>Loading neighbourhood data…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="we-root">
      {/* MAP */}
      <div ref={mapEl} className="we-map" />

      {/* ── HEADER ── */}
      <div className="we-header">
        <div className="we-brand">
          <span className="we-brand-icon">◉</span>
          <div>
            <h1 className="we-brand-title">Cape Town Urban Intelligence</h1>
            <p className="we-brand-sub">Neighbourhood-level analysis across {cityStats.count} areas</p>
          </div>
        </div>

        <button className="we-enter-btn" onClick={onEnterDashboard}>
          Enter Dashboard
          <span className="we-enter-arrow">→</span>
        </button>
      </div>

      {/* ── TAB BAR ── */}
      <div className="we-tabbar">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            className={`we-tab ${i === activeTab ? 'we-tab--active' : ''}`}
            onClick={() => handleTabChange(i)}
          >
            <span className="we-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── LEFT PANEL ── */}
      <div className="we-panel">
        <div className="we-panel-section">
          <p className="we-panel-desc">{tab.description}</p>
          <div className="we-metric-pills">
            {tab.metrics.map((m, i) => (
              <button
                key={m.key}
                className={`we-metric-pill ${i === activeMetricIdx ? 'we-metric-pill--active' : ''}`}
                style={i === activeMetricIdx ? { background: `rgba(${metric.high.join(',')},0.22)`, borderColor: `rgba(${metric.high.join(',')},0.7)`, color: rgbToHex(metric.high) } : {}}
                onClick={() => setActiveMetricIdx(i)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Colour legend */}
        <div className="we-legend">
          <div className="we-legend-bar" style={{
            background: `linear-gradient(to right, ${rgbToHex(metric.low)}, ${rgbToHex(metric.high)})`
          }} />
          <div className="we-legend-labels">
            <span>Low</span>
            <span style={{ color: rgbToHex(metric.high) }}>{metric.label}</span>
            <span>High</span>
          </div>
        </div>

        <div className="we-panel-hint">
          {selectedWard ? null : <span>Click a neighbourhood to explore data ↗</span>}
        </div>
      </div>

      {/* ── WARD DETAIL PANEL ── */}
      {selectedWard && (
        <div className="we-detail">
          <div className="we-detail-header">
            <div>
              <div className="we-detail-badge">Neighbourhood</div>
              <h2 className="we-detail-ward">{selectedWard.neighbourhood}</h2>
              <div className="we-detail-sub">Ward #{selectedWard.WardID}</div>
            </div>
            <button className="we-detail-close" onClick={closePanel}>✕</button>
          </div>

          <div className="we-detail-stats">
            {tab.statFields.map(sf => {
              const val = selectedWard[sf.key]
              if (val == null) return null
              if (sf.skipZero && val === 0) return null
              return (
                <div key={sf.key} className="we-stat-row">
                  <span className="we-stat-label">{sf.label}</span>
                  <span className="we-stat-value">{sf.fmt(val)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── CITY STATS BAR ── */}
      {cityStats && (
        <div className="we-statsbar">
          <StatChip label="Neighbourhoods" value={cityStats.count} />
          <StatChip label="Population"     value={cityStats.pop.toLocaleString()} />
          <StatChip label="Total Area"     value={`${Number(cityStats.areaSqkm).toLocaleString()} km²`} />
          <StatChip label="Streetlights"   value={cityStats.lights.toLocaleString()} />
          <StatChip label="Park Area"      value={`${cityStats.parksSqkm} km²`} />
          <StatChip label="Avg. Income"    value={`R ${cityStats.avgIncome.toLocaleString()}`} />
        </div>
      )}
    </div>
  )
}

function StatChip({ label, value }) {
  return (
    <div className="we-stat-chip">
      <div>
        <div className="we-stat-chip-value">{value}</div>
        <div className="we-stat-chip-label">{label}</div>
      </div>
    </div>
  )
}
