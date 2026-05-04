import React, { useMemo } from 'react'

const CLIMATE_LAYERS = [
  { id: 'urbanHeatConcrete', label: 'Heat Zones', detail: 'Adaptive zone ranking' },
  { id: 'heatGrid', label: 'Heat Grid', detail: 'Adaptive cell ranking' },
  { id: 'climateShade', label: 'Shade', detail: 'DB time slice' },
  { id: 'estimatedWind', label: 'Wind', detail: 'DB wind scenario' },
  { id: 'heatStreets', label: 'Heat Streets', detail: 'Pedestrian exposure' },
  { id: 'airQuality', label: 'Air Quality', detail: 'Current AQ layer' }
]

const MONTHS = [
  ['1', 'January'],
  ['2', 'February'],
  ['3', 'March'],
  ['4', 'April'],
  ['5', 'May'],
  ['6', 'June'],
  ['7', 'July'],
  ['8', 'August'],
  ['9', 'September'],
  ['10', 'October'],
  ['11', 'November'],
  ['12', 'December']
]

const WIND_DIRECTIONS = [
  ['se', 'South easterly'],
  ['cape_doctor', 'Cape Doctor'],
  ['n', 'Northerly'],
  ['ne', 'North easterly'],
  ['e', 'Easterly'],
  ['s', 'Southerly'],
  ['sw', 'South westerly'],
  ['w', 'Westerly'],
  ['nw', 'North westerly']
]

const WIND_BEARINGS = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  cape_doctor: 150,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315
}

const HEAT_METRIC_OPTIONS = [
  ['predicted_lst_c_fusion', 'LST'],
  ['urban_heat_score', 'Urban'],
  ['pedestrian_heat_score', 'Pedestrian'],
  ['priority_score', 'Priority'],
  ['retained_heat_score', 'Retained'],
  ['effective_canopy_pct', 'Canopy']
]

const numberOrNull = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

const formatValue = (value, suffix = '', digits = 1) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${parsed.toFixed(digits)}${suffix}` : '—'
}

const metricValue = (feature, keys) => {
  const properties = feature?.properties || {}
  for (const key of keys) {
    const value = numberOrNull(properties[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

const bandCounts = (features, bandKey = 'heat_relative_band') => {
  const counts = { top_10: 0, top_20: 0, warm: 0, middle: 0, coolest_20: 0 }
  features.forEach((feature) => {
    const band = feature.properties?.[bandKey]
    if (counts[band] !== undefined) counts[band] += 1
  })
  return counts
}

const windDirectionLabel = (direction) => (
  WIND_DIRECTIONS.find(([value]) => value === direction)?.[1] || 'South easterly'
)

const MicroclimateControlPanel = ({
  activeCategory,
  onCategorySelect,
  heatGridData,
  ecologyCurrentData,
  shadeData,
  estimatedWindData,
  temperatureData,
  ecologyMetric,
  onEcologyMetricChange,
  shadeMonth,
  onShadeMonthChange,
  timeOfDay,
  onTimeOfDayChange,
  windDirection,
  onWindDirectionChange,
  windSpeedKmh,
  onWindSpeedKmhChange,
  selectedFeature,
  comparisonFeature
}) => {
  const heatSummary = useMemo(() => {
    const heatFeatures = ecologyCurrentData?.features?.length
      ? ecologyCurrentData.features
      : heatGridData?.features || []
    const gridFeatures = heatGridData?.features || []
    const zoneFeatures = ecologyCurrentData?.features || []
    const lstValues = heatFeatures
      .map((feature) => metricValue(feature, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c']))
      .filter(Number.isFinite)
    const pedestrianValues = heatFeatures
      .map((feature) => metricValue(feature, ['pedestrian_heat_score', 'mean_pedestrian_heat_score']))
      .filter(Number.isFinite)
    const canopyValues = heatFeatures
      .map((feature) => metricValue(feature, ['effective_canopy_pct', 'mean_effective_canopy_pct']))
      .filter(Number.isFinite)
    const counts = bandCounts(gridFeatures.length ? gridFeatures : heatFeatures)

    return {
      zones: zoneFeatures.length,
      gridCells: gridFeatures.length,
      streets: temperatureData?.features?.length || 0,
      avgLst: avg(lstValues),
      avgPedestrian: avg(pedestrianValues),
      avgCanopy: avg(canopyValues),
      counts
    }
  }, [ecologyCurrentData, heatGridData, temperatureData])

  const shadeSummary = useMemo(() => {
    const features = shadeData?.features || []
    const areaValues = features.map((feature) => numberOrNull(feature.properties?.area_m2)).filter(Number.isFinite)
    return {
      count: features.length,
      avgArea: avg(areaValues)
    }
  }, [shadeData])

  const windSummary = useMemo(() => {
    const features = estimatedWindData?.features || []
    const speedValues = features.map((feature) => numberOrNull(feature.properties?.estimated_speed_kmh)).filter(Number.isFinite)
    return {
      count: features.length,
      avgSpeed: avg(speedValues)
    }
  }, [estimatedWindData])

  const activeMonthName = MONTHS.find(([value]) => value === String(shadeMonth))?.[1] || 'All months'

  return (
    <aside className="microclimate-panel">
      <div className="microclimate-hero">
        <div>
          <span>Microclimate</span>
          <h2>Cape Town CBD</h2>
        </div>
        <strong>{formatValue(heatSummary.avgLst, '°C')}</strong>
      </div>

      <div className="microclimate-section">
        <div className="microclimate-section-head">
          <span>Layer</span>
          <strong>{CLIMATE_LAYERS.find((layer) => layer.id === activeCategory)?.label || 'Overview'}</strong>
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

      <div className="microclimate-section">
        <div className="microclimate-section-head">
          <span>Heat Analysis</span>
          <strong>Relative ranking</strong>
        </div>
        <div className="microclimate-segmented">
          {HEAT_METRIC_OPTIONS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={ecologyMetric === id ? 'active' : ''}
              onClick={() => {
                onEcologyMetricChange?.(id)
                onCategorySelect?.('urbanHeatConcrete')
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="microclimate-legend-scale">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="microclimate-legend-labels">
          <span>Cooler 20%</span>
          <span>Top 10% hottest</span>
        </div>
        <div className="microclimate-band-bars">
          {[
            ['Top 10%', heatSummary.counts.top_10, '#7f1d1d'],
            ['Top 20%', heatSummary.counts.top_20, '#dc2626'],
            ['Warm', heatSummary.counts.warm, '#f97316'],
            ['Middle', heatSummary.counts.middle, '#facc15'],
            ['Coolest 20%', heatSummary.counts.coolest_20, '#22c55e']
          ].map(([label, count, color]) => (
            <div className="microclimate-band-row" key={label}>
              <span>{label}</span>
              <div><i style={{ width: `${Math.min(100, (count / Math.max(1, heatSummary.gridCells || heatSummary.zones)) * 100)}%`, background: color }} /></div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="microclimate-section">
        <div className="microclimate-section-head">
          <span>Shade</span>
          <strong>{activeMonthName} · {String(timeOfDay).padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')}</strong>
        </div>
        <select value={shadeMonth || ''} onChange={(event) => onShadeMonthChange?.(event.target.value)}>
          <option value="">All months</option>
          {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          type="range"
          min={600}
          max={1900}
          step={100}
          value={Number(timeOfDay) || 1400}
          onChange={(event) => onTimeOfDayChange?.(String(event.target.value).padStart(4, '0'))}
        />
        <div className="microclimate-control-meta">
          <span>{shadeSummary.count.toLocaleString()} shade polygons</span>
          <span>{formatValue(shadeSummary.avgArea, ' m²')} avg patch</span>
        </div>
      </div>

      <div className="microclimate-section">
        <div className="microclimate-section-head">
          <span>Wind</span>
          <strong>{windDirectionLabel(windDirection)} · {windSpeedKmh} km/h</strong>
        </div>
        <div className="microclimate-wind-row">
          <div className="microclimate-wind-rose">
            <span>N</span><span>E</span><span>S</span><span>W</span>
            <i style={{ transform: `rotate(${WIND_BEARINGS[windDirection] ?? 135}deg)` }} />
          </div>
          <div className="microclimate-wind-controls">
            <select
              value={windDirection}
              onChange={(event) => {
                onWindDirectionChange?.(event.target.value)
                onCategorySelect?.('estimatedWind')
              }}
            >
              {WIND_DIRECTIONS.map(([direction, label]) => <option key={direction} value={direction}>{label}</option>)}
            </select>
            <input
              type="range"
              min={0}
              max={35}
              step={1}
              value={windSpeedKmh}
              onChange={(event) => {
                onWindSpeedKmhChange?.(Number(event.target.value))
                onCategorySelect?.('estimatedWind')
              }}
            />
          </div>
        </div>
        <div className="microclimate-wind-scale">
          <i />
        </div>
        <div className="microclimate-legend-labels">
          <span>Low speed</span>
          <span>High speed</span>
        </div>
        <div className="microclimate-control-meta">
          <span>{windSummary.count.toLocaleString()} wind polygons</span>
          <span>{formatValue(windSummary.avgSpeed, ' km/h')} avg speed</span>
        </div>
      </div>

      {selectedFeature && (
        <div className="microclimate-selection">
          <span>Selected Zone</span>
          <strong>#{selectedFeature.feature_id || selectedFeature.feature_id_key}</strong>
          <p>{formatValue(metricValue({ properties: selectedFeature }, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c']), '°C')} modelled LST · {formatValue(selectedFeature.urban_heat_score)} urban heat</p>
          {comparisonFeature && <p>Comparing against #{comparisonFeature.feature_id || comparisonFeature.feature_id_key}</p>}
        </div>
      )}
    </aside>
  )
}

export default MicroclimateControlPanel
