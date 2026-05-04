import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts'

const numberOrNull = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatValue = (value, suffix = '', digits = 1) => {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(digits)}${suffix}`
}

const formatSigned = (value, suffix = '', digits = 1) => {
  if (!Number.isFinite(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${suffix}`
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

const sectionLabel = (feature) => {
  if (!feature) return 'Section'
  return feature.segment_label
    ? `Section #${feature.feature_id} · ${feature.segment_label}`
    : `Section #${feature.feature_id}`
}

const currentEntryForYear = (series, selectedYear) => {
  if (!series.length) return null
  return series.find((entry) => Number(entry.analysis_year) === selectedYear) || series[series.length - 1] || null
}

const rankMetric = (features, targetFeature, key, direction = 'desc') => {
  const targetValue = numberOrNull(targetFeature?.[key])
  if (!Number.isFinite(targetValue)) return null

  const values = features
    .map((feature) => numberOrNull(feature.properties?.[key]))
    .filter(Number.isFinite)

  if (!values.length) return null

  const betterCount = values.filter((entry) => (
    direction === 'desc' ? entry > targetValue : entry < targetValue
  )).length

  const percentile = direction === 'desc'
    ? (values.filter((entry) => entry <= targetValue).length / values.length) * 100
    : (values.filter((entry) => entry >= targetValue).length / values.length) * 100

  return {
    rank: betterCount + 1,
    total: values.length,
    percentile
  }
}

const metricMeta = {
  urban_heat_score: { label: 'Heat Islands', color: '#f97316' },
  thermal_percentile: { label: 'Thermal Percentile', color: '#ef4444' },
  cool_island_score: { label: 'Cool Islands', color: '#67e8f9' },
  health_score: { label: 'Health Score', color: '#86efac' }
}

const EcologyHeatDetailPanel = ({
  featureSeries = [],
  currentFeature,
  compareFeature,
  compareSeries = [],
  currentYearData,
  selectedYear,
  sidebarWidth,
  panelRef,
  minimized,
  onToggleMinimized,
  onClose
}) => {
  const primaryTimeline = useMemo(() => featureSeries
    .map((item) => ({
      year: Number(item.analysis_year),
      urban_heat_score: numberOrNull(item.urban_heat_score),
      thermal_percentile: numberOrNull(item.thermal_percentile),
      cool_island_score: numberOrNull(item.cool_island_score),
      health_score: numberOrNull(item.health_score)
    }))
    .sort((a, b) => a.year - b.year), [featureSeries])

  const compareTimeline = useMemo(() => compareSeries
    .map((item) => ({
      year: Number(item.analysis_year),
      urban_heat_score: numberOrNull(item.urban_heat_score),
      thermal_percentile: numberOrNull(item.thermal_percentile),
      cool_island_score: numberOrNull(item.cool_island_score),
      health_score: numberOrNull(item.health_score)
    }))
    .sort((a, b) => a.year - b.year), [compareSeries])

  const currentPrimary = useMemo(() => currentEntryForYear(featureSeries, selectedYear), [featureSeries, selectedYear])
  const currentCompare = useMemo(() => currentEntryForYear(compareSeries, selectedYear), [compareSeries, selectedYear])

  const mergedTimeline = useMemo(() => {
    const years = [...new Set([
      ...primaryTimeline.map((entry) => entry.year),
      ...compareTimeline.map((entry) => entry.year)
    ])].sort((a, b) => a - b)

    return years.map((year) => {
      const primary = primaryTimeline.find((entry) => entry.year === year)
      const compare = compareTimeline.find((entry) => entry.year === year)
      return {
        year: String(year),
        primaryUrbanHeat: primary?.urban_heat_score ?? null,
        compareUrbanHeat: compare?.urban_heat_score ?? null,
        primaryThermal: primary?.thermal_percentile ?? null,
        compareThermal: compare?.thermal_percentile ?? null,
        primaryCoolIsland: primary?.cool_island_score ?? null,
        compareCoolIsland: compare?.cool_island_score ?? null,
        primaryHealth: primary?.health_score ?? null,
        compareHealth: compare?.health_score ?? null
      }
    })
  }, [primaryTimeline, compareTimeline])

  const rankSummary = useMemo(() => {
    const features = currentYearData?.features || []
    if (!features.length || !currentPrimary) return null

    return {
      primary: {
        urbanHeat: rankMetric(features, currentPrimary, 'urban_heat_score', 'desc'),
        thermal: rankMetric(features, currentPrimary, 'thermal_percentile', 'desc'),
        coolIsland: rankMetric(features, currentPrimary, 'cool_island_score', 'desc'),
        health: rankMetric(features, currentPrimary, 'health_score', 'desc')
      },
      compare: currentCompare ? {
        urbanHeat: rankMetric(features, currentCompare, 'urban_heat_score', 'desc'),
        thermal: rankMetric(features, currentCompare, 'thermal_percentile', 'desc'),
        coolIsland: rankMetric(features, currentCompare, 'cool_island_score', 'desc'),
        health: rankMetric(features, currentCompare, 'health_score', 'desc')
      } : null
    }
  }, [currentYearData, currentPrimary, currentCompare])

  const currentSnapshot = useMemo(() => ([
    { metric: 'Urban Heat', primary: currentPrimary?.urban_heat_score ?? 0, compare: currentCompare?.urban_heat_score ?? 0 },
    { metric: 'Pedestrian', primary: currentPrimary?.pedestrian_heat_score ?? 0, compare: currentCompare?.pedestrian_heat_score ?? 0 },
    { metric: 'Priority', primary: currentPrimary?.priority_score ?? 0, compare: currentCompare?.priority_score ?? 0 },
    { metric: 'Retained', primary: currentPrimary?.retained_heat_score ?? 0, compare: currentCompare?.retained_heat_score ?? 0 },
    { metric: 'Canopy', primary: currentPrimary?.effective_canopy_pct ?? 0, compare: currentCompare?.effective_canopy_pct ?? 0 }
  ]), [currentPrimary, currentCompare])

  const changeSummary = useMemo(() => {
    if (!primaryTimeline.length) return null
    const first = primaryTimeline[0]
    const last = primaryTimeline[primaryTimeline.length - 1]
    return {
      urbanHeat: (last.urban_heat_score ?? 0) - (first.urban_heat_score ?? 0),
      thermal: (last.thermal_percentile ?? 0) - (first.thermal_percentile ?? 0),
      coolIsland: (last.cool_island_score ?? 0) - (first.cool_island_score ?? 0)
    }
  }, [primaryTimeline])

  const comparisonStory = useMemo(() => {
    if (!currentPrimary) return 'Select a section to inspect the CBD heat profile.'
    if (currentCompare) {
      const heatGap = (currentPrimary.urban_heat_score ?? 0) - (currentCompare.urban_heat_score ?? 0)
      const coolGap = (currentPrimary.cool_island_score ?? 0) - (currentCompare.cool_island_score ?? 0)
      if (heatGap >= 0) {
        return `${sectionLabel(currentFeature)} is running ${formatValue(Math.abs(heatGap))} points hotter than ${sectionLabel(compareFeature)}, while the cool-island gap sits at ${formatSigned(coolGap)}.`
      }
      return `${sectionLabel(compareFeature)} currently carries stronger heat pressure by ${formatValue(Math.abs(heatGap))} points, so the comparison below shows what is keeping ${sectionLabel(currentFeature)} relatively cooler.`
    }
    return `${sectionLabel(currentFeature)} sits at ${formatValue(currentPrimary.thermal_percentile, '%')} thermal percentile. Use a second click on the map to overlay another section and compare both profiles.`
  }, [compareFeature, currentCompare, currentFeature, currentPrimary, selectedYear])

  if (!currentPrimary || !currentFeature) return null

  return (
    <div
      ref={panelRef}
      className={`bottom-panel env-bottom-panel ecology-bottom-panel ${minimized ? 'env-minimized' : ''}`}
      style={{ marginRight: sidebarWidth + 32 }}
    >
      <div className="panel-header ecology-panel-header">
        <div className="ecology-panel-headline">
          <div className="ecology-panel-score">{formatValue(currentPrimary.urban_heat_score)}</div>
          <div>
            <h3>{sectionLabel(currentFeature)}{currentCompare ? ` vs ${sectionLabel(compareFeature)}` : ''}</h3>
            <span className="ecology-panel-subtitle">
              Overall heat analysis · thermal percentile {formatValue(currentPrimary.thermal_percentile, '%')} · confidence {formatText(currentPrimary.thermal_confidence_class)}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={onToggleMinimized} className="close-btn" title={minimized ? 'Expand' : 'Minimize'}>{minimized ? '▲' : '▼'}</button>
          <button onClick={onClose} className="close-btn">✕</button>
        </div>
      </div>

      {!minimized && (
        <div className="charts-container ecology-charts-container">
          <div className="ecology-comparison-key">
            <div className="ecology-comparison-key-item">
              <span className="ecology-role-badge warm">A</span>
              <span>{sectionLabel(currentFeature)}</span>
            </div>
            {currentCompare && (
              <div className="ecology-comparison-key-item">
                <span className="ecology-role-badge cool">B</span>
                <span>{sectionLabel(compareFeature)}</span>
              </div>
            )}
          </div>

          <div className="env-detail-summary-row ecology-summary-row">
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Modelled LST</span>
              <strong>{formatValue(numberOrNull(valueFrom(currentPrimary, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'])), '°C')}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Pedestrian Heat</span>
              <strong>{formatValue(numberOrNull(currentPrimary.pedestrian_heat_score))}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Intervention Priority</span>
              <strong>{formatText(currentPrimary.priority_class)}{currentPrimary.priority_score != null ? ` · ${formatValue(numberOrNull(currentPrimary.priority_score))}` : ''}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Thermal Confidence</span>
              <strong>{formatText(currentPrimary.thermal_confidence_class)}</strong>
            </div>
          </div>

          <div className="ecology-detail-callout">
            <p>{comparisonStory}</p>
          </div>

          <div className="ecology-detail-layout">
            <div className="ecology-detail-column">
              <div className="ecology-driver-grid ecology-primary-grid">
                <div className="ecology-driver-card">
                  <span>Modelled LST</span>
                  <strong>{formatValue(numberOrNull(valueFrom(currentPrimary, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'])), '°C')}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Urban Heat Score</span>
                  <strong>{formatValue(currentPrimary.urban_heat_score)}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Pedestrian Heat Score</span>
                  <strong>{formatValue(numberOrNull(currentPrimary.pedestrian_heat_score))}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Priority Class & Score</span>
                  <strong>{formatText(currentPrimary.priority_class)}{currentPrimary.priority_score != null ? ` · ${formatValue(numberOrNull(currentPrimary.priority_score))}` : ''}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Retained Heat Score</span>
                  <strong>{formatValue(numberOrNull(currentPrimary.retained_heat_score))}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Effective Canopy</span>
                  <strong>{formatValue(numberOrNull(currentPrimary.effective_canopy_pct), '%')}</strong>
                </div>
                <div className="ecology-driver-card">
                  <span>Thermal Confidence</span>
                  <strong>{formatText(currentPrimary.thermal_confidence_class)}</strong>
                </div>
              </div>

              {currentCompare && (
                <div className="ecology-compare-strip">
                  <div className="ecology-compare-header">
                    <span>Compare Section</span>
                    <strong>{sectionLabel(compareFeature)}</strong>
                  </div>
                  <div className="ecology-compare-grid">
                    <div className="ecology-compare-chip">
                      <span>Modelled LST</span>
                      <strong>{formatValue(numberOrNull(valueFrom(currentCompare, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'])), '°C')}</strong>
                    </div>
                    <div className="ecology-compare-chip">
                      <span>Urban Heat</span>
                      <strong>{formatValue(currentCompare.urban_heat_score)}</strong>
                    </div>
                    <div className="ecology-compare-chip">
                      <span>Pedestrian Heat</span>
                      <strong>{formatValue(numberOrNull(currentCompare.pedestrian_heat_score))}</strong>
                    </div>
                    <div className="ecology-compare-chip">
                      <span>Priority</span>
                      <strong>{formatText(currentCompare.priority_class)}{currentCompare.priority_score != null ? ` · ${formatValue(numberOrNull(currentCompare.priority_score))}` : ''}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Heat Pressure Over Time</span>
                  <strong>Heat islands only</strong>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={mergedTimeline} margin={{ top: 6, right: 14, left: -16, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#101826', border: '1px solid #233047', borderRadius: 10, fontSize: 11, color: '#e2e8f0' }}
                      formatter={(value, key) => {
                        const labelMap = {
                          primaryUrbanHeat: 'A heat islands',
                          compareUrbanHeat: 'B heat islands'
                        }
                        return [value != null ? Number(value).toFixed(1) : '—', labelMap[key] || key]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    <Line type="monotone" dataKey="primaryUrbanHeat" name="A heat islands" stroke={metricMeta.urban_heat_score.color} strokeWidth={2.8} dot={{ r: 3 }} connectNulls />
                    {currentCompare && (
                      <>
                        <Line type="monotone" dataKey="compareUrbanHeat" name="B heat islands" stroke="#67e8f9" strokeWidth={2.8} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ecology-detail-column">
              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Refuge Balance</span>
                  <strong>Thermal percentile, cool island, health</strong>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={mergedTimeline} margin={{ top: 6, right: 14, left: -16, bottom: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#101826', border: '1px solid #233047', borderRadius: 10, fontSize: 11, color: '#e2e8f0' }}
                      formatter={(value, key) => {
                        const labelMap = {
                          primaryThermal: `A thermal percentile`,
                          compareThermal: `B thermal percentile`,
                          primaryCoolIsland: 'A cool islands',
                          compareCoolIsland: 'B cool islands',
                          primaryHealth: `A health`,
                          compareHealth: `B health`
                        }
                        return [value != null ? Number(value).toFixed(1) : '—', labelMap[key] || key]
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    <Line type="monotone" dataKey="primaryThermal" name="A thermal" stroke={metricMeta.thermal_percentile.color} strokeWidth={2.4} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="primaryCoolIsland" name="A cool islands" stroke={metricMeta.cool_island_score.color} strokeWidth={2.4} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="primaryHealth" name="A health" stroke={metricMeta.health_score.color} strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    {currentCompare && (
                      <>
                        <Line type="monotone" dataKey="compareThermal" name="B thermal" stroke="#fb7185" strokeWidth={2.2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="compareCoolIsland" name="B cool islands" stroke="#a5f3fc" strokeWidth={2.2} strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                        <Line type="monotone" dataKey="compareHealth" name="B health" stroke="#bbf7d0" strokeWidth={1.8} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Current Year Snapshot</span>
                  <strong>0 to 100 comparison radar</strong>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={currentSnapshot} outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Radar name="A segment" dataKey="primary" stroke={metricMeta.urban_heat_score.color} fill={metricMeta.urban_heat_score.color} fillOpacity={0.32} />
                    {currentCompare && (
                      <Radar name="B segment" dataKey="compare" stroke="#67e8f9" fill="#67e8f9" fillOpacity={0.16} />
                    )}
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-rank-grid">
                <div className="ecology-rank-card">
                  <span>Primary Heat Standing</span>
                  <strong>{rankSummary?.primary?.urbanHeat ? `Rank ${rankSummary.primary.urbanHeat.rank} / ${rankSummary.primary.urbanHeat.total}` : '—'}</strong>
                  <p>{sectionLabel(currentFeature)} is hotter than {formatValue(rankSummary?.primary?.thermal?.percentile, '%', 0)} of sections this year.</p>
                </div>
                {currentCompare && (
                  <div className="ecology-rank-card cool">
                    <span>Compare Refuge Standing</span>
                    <strong>{rankSummary?.compare?.coolIsland ? `Rank ${rankSummary.compare.coolIsland.rank} / ${rankSummary.compare.coolIsland.total}` : '—'}</strong>
                    <p>{sectionLabel(compareFeature)} sits at {formatValue(currentCompare.cool_island_score)} cool island score in the selected year.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcologyHeatDetailPanel
