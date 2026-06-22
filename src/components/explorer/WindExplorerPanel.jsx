import React, { useMemo } from 'react'

const CLIMATE_LAYERS = [
  { id: 'urbanHeatConcrete', label: 'Heat Zones', detail: 'Adaptive zone ranking' },
  { id: 'climateShade', label: 'Shade', detail: 'DB time slice' },
  { id: 'estimatedWind', label: 'Wind', detail: 'Directional explorer' },
  { id: 'heatStreets', label: 'Heat Streets', detail: 'Pedestrian exposure' }
]

const WIND_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
const WIND_PRESETS = ['annual', 'summer', 'winter']

const directionShortLabel = {
  n: 'N',
  ne: 'NE',
  e: 'E',
  se: 'SE',
  s: 'S',
  sw: 'SW',
  w: 'W',
  nw: 'NW'
}

const directionColors = {
  n: '#69cde3',
  ne: '#7fb4f4',
  e: '#9fb6c6',
  se: '#d6a45d',
  s: '#e5bd65',
  sw: '#c99255',
  w: '#91a0af',
  nw: '#8ea2bd'
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : '—'
}

function formatPercent(value, digits = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${(numeric * 100).toFixed(digits)}%` : '—'
}

function formatSpeedKmh(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return `${numeric.toFixed(0)} km/h`
}

const WindExplorerPanel = ({
  activeCategory,
  onCategorySelect,
  windSummaryData,
  estimatedWindData,
  windDirection,
  onWindDirectionChange,
  windSpeedKmh,
  onWindSpeedKmhChange,
  windSeasonPreset,
  onWindSeasonPresetChange,
  windOverlayOpacity,
  onWindOverlayOpacityChange
}) => {
  const directions = windSummaryData?.directions || []
  const presets = windSummaryData?.presets || []
  const selectedDirection = directions.find((item) => item.id === windDirection) || directions[0] || null
  const mapMetadata = estimatedWindData?.metadata || {}

  const summaryCards = useMemo(() => {
    const classCounts = mapMetadata.class_counts || {}
    const total = Math.max(1, Number(mapMetadata.totalFeatures || estimatedWindData?.features?.length || 0))
    const windTunnelShare = Number(classCounts['Wind Tunnel'] || 0) / total
    const shelteredShare = Number(classCounts.Sheltered || 0) / total
    const dominantClassShare = Number(classCounts[mapMetadata.dominant_class] || 0) / total

    return [
      {
        label: 'Inflow',
        value: formatSpeedKmh(windSpeedKmh),
        meta: `${directionShortLabel[windDirection] || 'SE'} ${formatNumber(selectedDirection?.azimuth_deg, 0)}°`
      },
      {
        label: 'Local Avg',
        value: formatSpeedKmh(mapMetadata.avg_estimated_speed_kmh),
        meta: `${formatNumber(mapMetadata.avg_wind_speed_factor, 2)}x factor`
      },
      {
        label: 'Wind Tunnel',
        value: formatPercent(windTunnelShare),
        meta: `${Number(classCounts['Wind Tunnel'] || 0).toLocaleString()} polygons`
      },
      {
        label: 'Sheltered',
        value: formatPercent(shelteredShare),
        meta: `${Number(classCounts.Sheltered || 0).toLocaleString()} polygons`
      },
      {
        label: 'Dominant Class',
        value: mapMetadata.dominant_class || '—',
        meta: formatPercent(dominantClassShare)
      },
      {
        label: 'Coverage',
        value: Number(mapMetadata.totalFeatures || 0).toLocaleString(),
        meta: `${formatNumber(mapMetadata.avg_area_m2, 0)} m² avg patch`
      }
    ]
  }, [estimatedWindData?.features?.length, mapMetadata, selectedDirection?.azimuth_deg, windDirection, windSpeedKmh])

  const roseMaxProbability = Math.max(
    ...directions.map((item) => Number(item.annual_probability || 0)),
    0.01
  )

  const roseItems = directions.map((direction) => {
    const probability = Number(direction.annual_probability || 0)
    const angle = Number(direction.azimuth_deg || 0)
    const radians = angle * Math.PI / 180
    const length = 44 + (probability / roseMaxProbability) * 46
    const innerRadius = 38
    const labelRadius = 100
    const x1 = 116 + Math.sin(radians) * innerRadius
    const y1 = 116 - Math.cos(radians) * innerRadius
    const x2 = 116 + Math.sin(radians) * length
    const y2 = 116 - Math.cos(radians) * length
    const labelX = 116 + Math.sin(radians) * labelRadius
    const labelY = 116 - Math.cos(radians) * labelRadius

    return {
      ...direction,
      angle,
      x1,
      y1,
      x2,
      y2,
      labelX,
      labelY,
      color: directionColors[direction.id] || '#9ca3af'
    }
  })

  const handlePresetClick = (preset) => {
    onWindSeasonPresetChange?.(preset.id)
    onWindDirectionChange?.(preset.direction)
    if (Number.isFinite(Number(preset.speed_kmh))) {
      onWindSpeedKmhChange?.(Math.round(Number(preset.speed_kmh)))
    }
  }

  return (
    <aside className="wind-explorer-panel">
      <div className="wind-explorer-layer-card">
        <div className="microclimate-section-head">
          <span>Layer</span>
          <strong>{CLIMATE_LAYERS.find((layer) => layer.id === activeCategory)?.label || 'Climate'}</strong>
        </div>
        <div className="microclimate-layer-grid">
          {CLIMATE_LAYERS.map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={`microclimate-layer-btn ${activeCategory === layer.id ? 'active' : ''}`}
              onClick={() => onCategorySelect?.(layer.id)}
            >
              <span>{layer.label}</span>
              <small>{layer.detail}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="wind-explorer-hero">
        <div>
          <span className="wind-explorer-kicker">Wind Explorer</span>
          <h2>Cape Town airflow</h2>
          <p>Pick a direction, tune the inflow, and see where streets accelerate, soften, or stagnate.</p>
        </div>
        <div className="wind-explorer-hero-badge">
          <strong>{directionShortLabel[windDirection] || 'SE'} {formatNumber(selectedDirection?.azimuth_deg, 0)}°</strong>
          <span>{mapMetadata.dominant_class || selectedDirection?.dominant_class || 'Ventilation pattern'}</span>
        </div>
      </div>

      <div className="wind-explorer-chip-row">
        {WIND_PRESETS.map((presetId) => {
          const preset = presets.find((entry) => entry.id === presetId)
          if (!preset) return null
          return (
            <button
              key={preset.id}
              type="button"
              className={`wind-chip ${windSeasonPreset === preset.id ? 'active' : ''}`}
              onClick={() => handlePresetClick(preset)}
            >
              <strong>{preset.label}</strong>
              <span>{directionShortLabel[preset.direction]} · {formatSpeedKmh(preset.speed_kmh)}</span>
            </button>
          )
        })}
      </div>

      <div className="wind-explorer-card">
        <div className="microclimate-section-head">
          <span>Direction</span>
          <strong>{selectedDirection?.label || 'South-easterly'} · {formatPercent(selectedDirection?.annual_probability)}</strong>
        </div>
        <div className="wind-rose">
          <svg className="wind-rose-svg" viewBox="0 0 232 232" role="img" aria-label="Wind direction compass">
            <circle className="wind-rose-ring outer" cx="116" cy="116" r="100" />
            <circle className="wind-rose-ring middle" cx="116" cy="116" r="74" />
            <circle className="wind-rose-ring inner" cx="116" cy="116" r="38" />
            <line className="wind-rose-axis" x1="116" y1="20" x2="116" y2="212" />
            <line className="wind-rose-axis" x1="20" y1="116" x2="212" y2="116" />
            <text className="wind-rose-cardinal" x="116" y="18" textAnchor="middle">N</text>
            <text className="wind-rose-cardinal" x="216" y="120" textAnchor="middle">E</text>
            <text className="wind-rose-cardinal" x="116" y="225" textAnchor="middle">S</text>
            <text className="wind-rose-cardinal" x="16" y="120" textAnchor="middle">W</text>
            {roseItems.map((direction) => (
              <g
                key={direction.id}
                className={`wind-rose-spoke ${windDirection === direction.id ? 'active' : ''}`}
                role="button"
                tabIndex="0"
                onClick={() => onWindDirectionChange?.(direction.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onWindDirectionChange?.(direction.id)
                }}
              >
                <line
                  x1={direction.x1}
                  y1={direction.y1}
                  x2={direction.x2}
                  y2={direction.y2}
                  stroke={direction.color}
                />
                <circle cx={direction.x2} cy={direction.y2} r={windDirection === direction.id ? 5 : 3.5} fill={direction.color} />
                <text x={direction.labelX} y={direction.labelY + 4} textAnchor="middle">
                  {directionShortLabel[direction.id]}
                </text>
              </g>
            ))}
            <circle className="wind-rose-core-disc" cx="116" cy="116" r="30" />
            <text className="wind-rose-core-direction" x="116" y="112" textAnchor="middle">{directionShortLabel[windDirection] || 'SE'}</text>
            <text className="wind-rose-core-speed" x="116" y="132" textAnchor="middle">{formatSpeedKmh(windSpeedKmh)}</text>
          </svg>
        </div>
        <div className="wind-rose-legend">
          <span>Bar length = annual occurrence</span>
          <span>Colour = direction family</span>
        </div>
      </div>

      <div className="wind-explorer-card">
        <div className="microclimate-section-head">
          <span>Scenario Speed</span>
          <strong>{formatSpeedKmh(windSpeedKmh)}</strong>
        </div>
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={windSpeedKmh}
          onChange={(event) => onWindSpeedKmhChange?.(Number(event.target.value))}
        />
        <div className="microclimate-control-meta">
          <span>Reference {formatSpeedKmh(selectedDirection?.reference_speed_kmh)}</span>
          <span>{formatPercent(selectedDirection?.annual_energy_weight)} energy weight</span>
        </div>
      </div>

      <div className="wind-explorer-card">
        <div className="microclimate-section-head">
          <span>Overlay Opacity</span>
          <strong>{Math.round(Number(windOverlayOpacity || 0) * 100)}%</strong>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={windOverlayOpacity}
          onChange={(event) => onWindOverlayOpacityChange?.(Number(event.target.value))}
        />
      </div>

      <div className="wind-summary-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="wind-summary-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.meta}</small>
          </article>
        ))}
      </div>

      <div className="wind-explorer-legend wind-explorer-card">
        <div className="microclimate-section-head">
          <span>Wind Power Legend</span>
          <strong>Factor based</strong>
        </div>
        <div className="wind-ramp-bar" aria-hidden="true">
          <span style={{ background: '#7dd3fc' }} />
          <span style={{ background: '#67e8f9' }} />
          <span style={{ background: '#86efac' }} />
          <span style={{ background: '#bef264' }} />
          <span style={{ background: '#fde047' }} />
          <span style={{ background: '#fb923c' }} />
          <span style={{ background: '#ef4444' }} />
          <span style={{ background: '#7f1d1d' }} />
        </div>
        <div className="wind-ramp-labels">
          <span>low factor</span>
          <span>high factor</span>
        </div>
        <div className="wind-ramp-ticks">
          <span>0.1x</span>
          <span>0.5x</span>
          <span>1.0x</span>
          <span>1.5x+</span>
        </div>
        <div className="wind-legend-rows">
          <span><i style={{ background: '#7dd3fc' }} /> sheltered</span>
          <span><i style={{ background: '#bef264' }} /> moderate</span>
          <span><i style={{ background: '#fb923c' }} /> accelerated</span>
          <span><i style={{ background: '#ef4444' }} /> strongest</span>
        </div>
      </div>
    </aside>
  )
}

export default WindExplorerPanel
