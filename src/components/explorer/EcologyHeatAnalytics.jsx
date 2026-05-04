import React, { useMemo } from 'react'
import './EcologyHeatAnalytics.css'

const DEFAULT_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026]
const ECOLOGY_METRICS = [
  {
    id: 'predicted_lst_c_fusion',
    label: 'Modelled LST',
    description: 'Base thermal heat map',
    gradient: 'linear-gradient(90deg, #e0f2fe 0%, #fde68a 36%, #fb923c 65%, #7f1d1d 100%)'
  },
  {
    id: 'urban_heat_score',
    label: 'Heat Islands',
    description: 'Extreme heat hotspots only',
    gradient: 'linear-gradient(90deg, #fff7ed 0%, #fdba74 38%, #f97316 68%, #7f1d1d 100%)'
  },
  {
    id: 'pedestrian_heat_score',
    label: 'Pedestrian Heat',
    description: 'Street exposure and thermal stress',
    gradient: 'linear-gradient(90deg, #dbeafe 0%, #fef3c7 34%, #fb923c 68%, #991b1b 100%)'
  },
  {
    id: 'priority_score',
    label: 'Priority',
    description: 'Intervention targeting score',
    gradient: 'linear-gradient(90deg, #ecfeff 0%, #fef08a 34%, #f97316 68%, #7f1d1d 100%)'
  },
  {
    id: 'retained_heat_score',
    label: 'Retained Heat',
    description: 'Nighttime heat persistence',
    gradient: 'linear-gradient(90deg, #dbeafe 0%, #c084fc 36%, #ef4444 72%, #450a0a 100%)'
  },
  {
    id: 'effective_canopy_pct',
    label: 'Effective Canopy',
    description: 'Shade coverage adjusted for health',
    gradient: 'linear-gradient(90deg, #7f1d1d 0%, #facc15 34%, #86efac 68%, #14532d 100%)'
  },
  {
    id: 'thermal_percentile',
    label: 'Thermal %',
    description: 'Full thermal layer',
    gradient: 'linear-gradient(90deg, #f8fafc 0%, #fde68a 28%, #f59e0b 62%, #991b1b 100%)'
  },
  {
    id: 'cool_island_score',
    label: 'Cool Islands',
    description: 'Strongest cooling refuges only',
    gradient: 'linear-gradient(90deg, #fff7ed 0%, #bfdbfe 24%, #22d3ee 58%, #0f766e 100%)'
  },
  {
    id: 'health_score',
    label: 'Health',
    description: 'Vegetation condition',
    gradient: 'linear-gradient(90deg, #4a2c1c 0%, #a3a334 34%, #22c55e 72%, #14532d 100%)'
  },
  {
    id: 'surface_air_delta_c',
    label: 'Air Delta',
    description: 'Surface minus summer air temp',
    gradient: 'linear-gradient(90deg, #082f49 0%, #0369a1 18%, #38bdf8 38%, #fde68a 58%, #fb923c 78%, #ef4444 90%, #7f1d1d 100%)'
  }
]

const avg = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

const validNumbers = (features, key) => features
  .map((feature) => Number(feature.properties?.[key]))
  .filter(Number.isFinite)

const numberOrNull = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatValue = (value, suffix = '', digits = 1) => {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}${suffix}`
}

const valueFrom = (feature, keys) => {
  const keyList = Array.isArray(keys) ? keys : [keys]
  for (const key of keyList) {
    const value = feature?.[key]
    if (value !== null && value !== undefined && value !== '') return value
  }
  return null
}

const formatText = (value) => (
  value !== null && value !== undefined && value !== '' ? String(value) : '—'
)

const rankMetric = (features, targetFeature, key, direction = 'desc') => {
  const value = numberOrNull(targetFeature?.[key])
  if (!Number.isFinite(value)) return null

  const values = validNumbers(features, key)
  if (!values.length) return null

  const betterCount = values.filter((entry) => (
    direction === 'desc' ? entry > value : entry < value
  )).length

  const percentile = direction === 'desc'
    ? (values.filter((entry) => entry <= value).length / values.length) * 100
    : (values.filter((entry) => entry >= value).length / values.length) * 100

  return {
    rank: betterCount + 1,
    total: values.length,
    percentile
  }
}

const selectionLabel = (feature) => {
  if (!feature) return 'No section selected'
  return feature.segment_label
    ? `Section #${feature.feature_id} · ${feature.segment_label}`
    : `Section #${feature.feature_id}`
}

const metricCards = (feature) => [
  { label: 'Modelled LST', value: formatValue(numberOrNull(valueFrom(feature, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'])), '°C') },
  { label: 'Urban Heat', value: formatValue(numberOrNull(feature?.urban_heat_score)) },
  { label: 'Pedestrian Heat', value: formatValue(numberOrNull(feature?.pedestrian_heat_score)) },
  { label: 'Priority', value: `${formatText(feature?.priority_class)}${feature?.priority_score != null ? ` · ${formatValue(numberOrNull(feature.priority_score))}` : ''}` },
  { label: 'Retained Heat', value: formatValue(numberOrNull(feature?.retained_heat_score)) },
  { label: 'Effective Canopy', value: formatValue(numberOrNull(feature?.effective_canopy_pct), '%') },
  { label: 'Confidence', value: formatText(feature?.thermal_confidence_class) }
]

const EcologyHeatAnalytics = ({
  currentData,
  ecologyYear,
  onEcologyYearChange,
  ecologyMetric = 'urban_heat_score',
  onEcologyMetricChange,
  selectedFeature,
  selectedSeries = [],
  comparisonFeature,
  comparisonSeries = [],
  availableYears = DEFAULT_YEARS
}) => {
  const features = currentData?.features || []
  const years = availableYears.length ? availableYears : DEFAULT_YEARS
  const activeMetric = ECOLOGY_METRICS.find((metric) => metric.id === ecologyMetric) || ECOLOGY_METRICS[0]

  const summary = useMemo(() => {
    if (!features.length) return null

    const avgUrbanHeat = avg(validNumbers(features, 'urban_heat_score'))
    const avgThermalPercentile = avg(validNumbers(features, 'thermal_percentile'))
    const avgCoolIsland = avg(validNumbers(features, 'cool_island_score'))
    const avgHealthScore = avg(validNumbers(features, 'health_score'))
    const avgPedestrianHeat = avg(validNumbers(features, 'pedestrian_heat_score'))
    const avgRetainedHeat = avg(validNumbers(features, 'retained_heat_score'))
    const avgEffectiveCanopy = avg(validNumbers(features, 'effective_canopy_pct'))
    const hotspotCount = features.filter((feature) => {
      const urbanHeat = numberOrNull(feature.properties?.urban_heat_score)
      const thermalPercentile = numberOrNull(feature.properties?.thermal_percentile)
      return (urbanHeat ?? 0) >= 70 || (thermalPercentile ?? 0) >= 80
    }).length
    const refugeCount = features.filter((feature) => (numberOrNull(feature.properties?.cool_island_score) ?? 0) >= 70).length

    const hottestFeature = [...features].sort((a, b) => (numberOrNull(b.properties?.urban_heat_score) ?? -Infinity) - (numberOrNull(a.properties?.urban_heat_score) ?? -Infinity))[0]
    const coolestFeature = [...features].sort((a, b) => (numberOrNull(b.properties?.cool_island_score) ?? -Infinity) - (numberOrNull(a.properties?.cool_island_score) ?? -Infinity))[0]

    return {
      avgUrbanHeat,
      avgThermalPercentile,
      avgCoolIsland,
      avgHealthScore,
      avgPedestrianHeat,
      avgRetainedHeat,
      avgEffectiveCanopy,
      hotspotCount,
      refugeCount,
      hottestFeature: hottestFeature?.properties || null,
      coolestFeature: coolestFeature?.properties || null
    }
  }, [features])

  const selectedDelta = useMemo(() => {
    if (selectedSeries.length < 2) return null
    const first = selectedSeries[0]
    const last = selectedSeries[selectedSeries.length - 1]
    return {
      urbanHeat: (last.urban_heat_score ?? 0) - (first.urban_heat_score ?? 0),
      thermalPercentile: (last.thermal_percentile ?? 0) - (first.thermal_percentile ?? 0),
      coolIsland: (last.cool_island_score ?? 0) - (first.cool_island_score ?? 0)
    }
  }, [selectedSeries])

  const comparisonDelta = useMemo(() => {
    if (comparisonSeries.length < 2) return null
    const first = comparisonSeries[0]
    const last = comparisonSeries[comparisonSeries.length - 1]
    return {
      urbanHeat: (last.urban_heat_score ?? 0) - (first.urban_heat_score ?? 0),
      thermalPercentile: (last.thermal_percentile ?? 0) - (first.thermal_percentile ?? 0),
      coolIsland: (last.cool_island_score ?? 0) - (first.cool_island_score ?? 0)
    }
  }, [comparisonSeries])

  const selectedRanking = useMemo(() => {
    if (!selectedFeature || !features.length) return null
    return {
      urbanHeat: rankMetric(features, selectedFeature, 'urban_heat_score', 'desc'),
      thermalPercentile: rankMetric(features, selectedFeature, 'thermal_percentile', 'desc'),
      coolIsland: rankMetric(features, selectedFeature, 'cool_island_score', 'desc'),
      health: rankMetric(features, selectedFeature, 'health_score', 'desc')
    }
  }, [features, selectedFeature])

  return (
    <aside className="ecology-heat-analytics">
      <div className="eco-hero">
        <div>
          <div className="eco-kicker">Heat Atlas</div>
          <h3>Overall Heat Analysis</h3>
          <p>Heat zones are ranked against the CBD so the hottest streets, persistent concrete heat, canopy gaps, and intervention priorities read as one microclimate picture.</p>
        </div>
        <div className="eco-year-badge">Live view</div>
      </div>

      {summary && (
        <div className="eco-summary-grid">
          <article className="warm">
            <span>Average Heat Islands</span>
            <strong>{formatValue(summary.avgUrbanHeat)}</strong>
            <p>Combined heat priority across all mapped sections.</p>
          </article>
          <article className="warm">
            <span>Average Pedestrian Heat</span>
            <strong>{formatValue(summary.avgPedestrianHeat)}</strong>
            <p>Street exposure and thermal stress pressure.</p>
          </article>
          <article className="cool">
            <span>Average Effective Canopy</span>
            <strong>{formatValue(summary.avgEffectiveCanopy, '%')}</strong>
            <p>Cooling capacity adjusted for canopy health.</p>
          </article>
          <article>
            <span>Average Retained Heat</span>
            <strong>{formatValue(summary.avgRetainedHeat)}</strong>
            <p>{summary.hotspotCount} sections currently rank as high heat areas.</p>
          </article>
        </div>
      )}

      <div className="eco-legend-card">
        <div className="eco-section-head">
          <span>Map Layer</span>
          <strong>{activeMetric.label}</strong>
        </div>
        <div className="eco-metric-toggle-grid">
          {ECOLOGY_METRICS.map((metric) => (
            <button
              key={metric.id}
              type="button"
              className={`eco-metric-toggle ${metric.id === ecologyMetric ? 'active' : ''}`}
              onClick={() => onEcologyMetricChange?.(metric.id)}
            >
              <span>{metric.label}</span>
              <strong>{metric.description}</strong>
            </button>
          ))}
        </div>
        <div className="eco-legend-scale" style={{ background: activeMetric.gradient }} />
        <div className="eco-legend-labels">
          <span>Lower values</span>
          <span>Higher values</span>
        </div>
        <div className="eco-legend-notes">
          <div><strong>Active layer:</strong> {activeMetric.description}.</div>
          <div><strong>Colour ramp:</strong> Each layer now uses its own clearer gradient instead of a heavy blur.</div>
          <div><strong>Interaction:</strong> Click one section to inspect it, then click another to compare both over time.</div>
        </div>
      </div>

      <div className="eco-insight-strip">
        <div>
          <span>Hottest This Year</span>
          <strong>{summary?.hottestFeature ? `#${summary.hottestFeature.feature_id}` : '—'}</strong>
          <p>{formatValue(numberOrNull(summary?.hottestFeature?.urban_heat_score))} heat island score</p>
        </div>
        <div>
          <span>Strongest Refuge</span>
          <strong>{summary?.coolestFeature ? `#${summary.coolestFeature.feature_id}` : '—'}</strong>
          <p>{formatValue(numberOrNull(summary?.coolestFeature?.cool_island_score))} cool island score</p>
        </div>
      </div>

      <div className="eco-selection-card">
        <div className="eco-section-head">
          <span>Selection</span>
          <strong>{comparisonFeature ? 'Compare mode' : selectedFeature ? 'Single section' : 'None yet'}</strong>
        </div>

        {selectedFeature ? (
          <>
            <div className="eco-selection-columns">
              <div className="eco-selection-panel primary">
                <div className="eco-selection-heading">
                  <span className="eco-role-badge warm">A</span>
                  <div className="eco-selection-label">Primary Segment</div>
                </div>
                <h4>{selectionLabel(selectedFeature)}</h4>
                <p>
                  Hotter than {formatValue(selectedRanking?.thermalPercentile?.percentile, '%', 0)} of mapped sections.
                </p>
                <div className="eco-pill-grid">
                  {metricCards(selectedFeature).map((metric) => (
                    <div key={metric.label} className="eco-pill">
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </div>
                  ))}
                </div>
                {selectedDelta && (
                  <div className="eco-selection-delta">
                    <span>Since {selectedSeries[0]?.analysis_year}</span>
                    <strong>{selectedDelta.urbanHeat >= 0 ? '+' : ''}{selectedDelta.urbanHeat.toFixed(1)} heat score</strong>
                  </div>
                )}
              </div>

              {comparisonFeature && (
                <div className="eco-selection-panel compare">
                  <div className="eco-selection-heading">
                    <span className="eco-role-badge cool">B</span>
                    <div className="eco-selection-label">Compare Segment</div>
                  </div>
                  <h4>{selectionLabel(comparisonFeature)}</h4>
                  <p>Overlay charts below to contrast heat pressure, refuge, and vegetation condition.</p>
                  <div className="eco-pill-grid">
                    {metricCards(comparisonFeature).map((metric) => (
                      <div key={metric.label} className="eco-pill">
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                      </div>
                    ))}
                  </div>
                  {comparisonDelta && (
                    <div className="eco-selection-delta">
                      <span>Since {comparisonSeries[0]?.analysis_year}</span>
                      <strong>{comparisonDelta.urbanHeat >= 0 ? '+' : ''}{comparisonDelta.urbanHeat.toFixed(1)} heat score</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
            {!comparisonFeature && (
              <div className="eco-selection-hint">
                Click a second section on the map to overlay its charts against {selectionLabel(selectedFeature)}.
              </div>
            )}
          </>
        ) : (
          <p>Click a section in the heat haze to open its thermal profile and compare it against another part of the CBD.</p>
        )}
      </div>
    </aside>
  )
}

export default EcologyHeatAnalytics
