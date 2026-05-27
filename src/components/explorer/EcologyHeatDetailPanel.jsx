import React, { useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ReferenceLine
} from 'recharts'

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatValue = (value, suffix = '', digits = 1) => {
  if (!Number.isFinite(value)) return '-'
  return `${value.toFixed(digits)}${suffix}`
}

const formatSigned = (value, suffix = '', digits = 1) => {
  if (!Number.isFinite(value)) return '-'
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
  value !== null && value !== undefined && value !== '' ? String(value) : '-'
)

const sectionLabel = (feature) => {
  if (!feature) return 'Section'
  return feature.segment_label
    ? `Section #${feature.feature_id} - ${feature.segment_label}`
    : `Section #${feature.feature_id}`
}

const reportAreaLabel = (feature) => (
  feature?.feature_id ? `Selected area #${feature.feature_id}` : 'Selected area'
)

const currentEntryForYear = (series, selectedYear) => {
  if (!series.length) return null
  return series.find((entry) => Number(entry.analysis_year) === selectedYear) || series[series.length - 1] || null
}

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const percentileValue = (values, percentile) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((percentile / 100) * (sorted.length - 1))))
  return sorted[index]
}

const rankMetric = (features, targetFeature, metric, direction = 'desc') => {
  const targetValue = numberOrNull(valueFrom(targetFeature, metric.keys))
  if (!Number.isFinite(targetValue)) return null

  const values = features
    .map((feature) => numberOrNull(valueFrom(feature.properties, metric.keys)))
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

const metricDefs = [
  { id: 'lst', label: 'Modelled LST', unit: 'C', suffix: '°C', keys: ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'], color: '#f59e0b', chart: true, comfort: 30, comfortLabel: '<=30°C' },
  { id: 'urbanHeat', label: 'Heat Island', unit: 'score', keys: ['urban_heat_score'], color: '#f97316', chart: true, comfort: 35, comfortLabel: '<=35' },
  { id: 'pedHeat', label: 'Pedestrian Heat', unit: 'score', keys: ['pedestrian_heat_score'], color: '#ef4444', chart: true, comfort: 35, comfortLabel: '<=35' },
  { id: 'priority', label: 'Priority', unit: 'score', keys: ['priority_score'], color: '#facc15', chart: true, comfort: 35, comfortLabel: '<=35' },
  { id: 'retention', label: 'Night Retention', unit: 'C', suffix: '°C', keys: ['night_heat_retention_c', 'retained_heat_score'], color: '#c084fc', chart: true, comfort: 2, comfortLabel: '<=2°C' },
  { id: 'canopy', label: 'Effective Canopy', unit: '%', suffix: '%', keys: ['effective_canopy_pct'], color: '#22c55e', chart: true, higherIsCooler: true, comfort: 30, comfortLabel: '>=30%' },
  { id: 'coolIsland', label: 'Cool Island', unit: 'score', keys: ['cool_island_score'], color: '#22d3ee', chart: true, higherIsCooler: true, comfort: 60, comfortLabel: '>=60' },
  { id: 'health', label: 'Vegetation Health', unit: 'score', keys: ['health_score'], color: '#86efac', chart: true, higherIsCooler: true, comfort: 60, comfortLabel: '>=60' },
  { id: 'thermal', label: 'Thermal Percentile', unit: '%', suffix: '%', keys: ['thermal_percentile'], color: '#fb7185', chart: true, comfort: 40, comfortLabel: '<=40%' }
]

const scoreMetrics = metricDefs.filter((metric) => ['urbanHeat', 'pedHeat', 'priority', 'canopy', 'coolIsland', 'health'].includes(metric.id))

const chartTooltipStyle = {
  backgroundColor: '#101826',
  border: '1px solid #233047',
  borderRadius: 10,
  fontSize: 11,
  color: '#e2e8f0'
}

const metricDiff = (feature, keys, baseline) => {
  const value = numberOrNull(valueFrom(feature, keys))
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return null
  return value - baseline
}

const comfortGap = (value, metric) => {
  if (!Number.isFinite(value) || !Number.isFinite(metric.comfort)) return null
  return metric.higherIsCooler ? value - metric.comfort : metric.comfort - value
}

const comfortStatus = (value, metric) => {
  const gap = comfortGap(value, metric)
  if (!Number.isFinite(gap)) return { label: 'No data', tone: 'neutral', gap: null }
  if (gap >= 0) return { label: 'Comfort range', tone: 'good', gap }
  const magnitude = Math.abs(gap)
  if (magnitude <= 10) return { label: 'Near comfort', tone: 'watch', gap }
  return { label: 'Heat stress', tone: 'hot', gap }
}

const comfortGapText = (value, metric) => {
  const gap = comfortGap(value, metric)
  if (!Number.isFinite(gap)) return 'No comfort comparison available'
  const amount = formatValue(Math.abs(gap), metric.suffix || '')
  if (gap >= 0) {
    return metric.higherIsCooler
      ? `${amount} above comfort target`
      : `${amount} below comfort limit`
  }
  return metric.higherIsCooler
    ? `${amount} below comfort target`
    : `${amount} above comfort limit`
}

const publicComfortGapText = (value, metric) => {
  const gap = comfortGap(value, metric)
  if (!Number.isFinite(gap)) return 'No comparison available'
  const amount = formatValue(Math.abs(gap), metric.suffix || '')
  if (gap >= 0) {
    return metric.higherIsCooler
      ? `${amount} better than the comfort benchmark`
      : `${amount} below the comfort limit`
  }
  return metric.higherIsCooler
    ? `${amount} below what would be comfortable`
    : `${amount} above what would be comfortable`
}

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const downloadTextFile = (filename, content, type = 'text/html;charset=utf-8') => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const EcologyHeatDetailPanel = ({
  featureSeries = [],
  currentFeature,
  cityTimeline = [],
  currentYearData,
  selectedYear,
  sidebarWidth,
  panelRef,
  minimized,
  onToggleMinimized,
  onClose
}) => {
  const currentPrimary = useMemo(() => currentEntryForYear(featureSeries, selectedYear), [featureSeries, selectedYear])
  const cityFeatures = currentYearData?.features || []

  const cityStats = useMemo(() => {
    const stats = {}
    metricDefs.forEach((metric) => {
      const values = cityFeatures
        .map((feature) => numberOrNull(valueFrom(feature.properties, metric.keys)))
        .filter(Number.isFinite)

      stats[metric.id] = {
        average: average(values),
        median: median(values),
        p10: percentileValue(values, 10),
        p90: percentileValue(values, 90),
        min: values.length ? Math.min(...values) : null,
        max: values.length ? Math.max(...values) : null,
        values
      }
    })
    return stats
  }, [cityFeatures])

  const cityMetricValue = (metricId, field = 'average') => cityStats[metricId]?.[field] ?? null

  const comparisonBars = useMemo(() => metricDefs
    .filter((metric) => metric.chart)
    .map((metric) => {
      const selected = numberOrNull(valueFrom(currentPrimary, metric.keys))
      const city = cityMetricValue(metric.id, 'average')
      return {
        metric: metric.label,
        selected,
        city,
        comfort: metric.comfort,
        delta: Number.isFinite(selected) && Number.isFinite(city) ? selected - city : null,
        suffix: metric.suffix || '',
        color: metric.color
      }
    }), [currentPrimary, cityStats])

  const radarData = useMemo(() => scoreMetrics.map((metric) => ({
    metric: metric.label,
    selected: numberOrNull(valueFrom(currentPrimary, metric.keys)) ?? 0,
    city: cityMetricValue(metric.id, 'average') ?? 0
  })), [currentPrimary, cityStats])

  const coreComparisonData = useMemo(() => {
    return [
      metricDefs.find((metric) => metric.id === 'urbanHeat'),
      metricDefs.find((metric) => metric.id === 'coolIsland'),
      metricDefs.find((metric) => metric.id === 'canopy')
    ].filter(Boolean).map((metric) => ({
      metric: metric.label,
      selected: numberOrNull(valueFrom(currentPrimary, metric.keys)),
      city: cityMetricValue(metric.id, 'average'),
      comfort: metric.comfort
    }))
  }, [currentPrimary, cityStats])

  const heatHistogram = useMemo(() => {
    const values = cityStats.urbanHeat?.values || []
    const selectedValue = numberOrNull(valueFrom(currentPrimary, ['urban_heat_score']))
    if (!values.length) return []

    const min = Math.min(...values)
    const max = Math.max(...values)
    const bucketCount = 8
    const width = max === min ? 1 : (max - min) / bucketCount

    return Array.from({ length: bucketCount }, (_, index) => {
      const start = min + (index * width)
      const end = index === bucketCount - 1 ? max : start + width
      const count = values.filter((value) => (
        index === bucketCount - 1 ? value >= start && value <= end : value >= start && value < end
      )).length
      const containsSelected = Number.isFinite(selectedValue) && selectedValue >= start && selectedValue <= end
      return {
        range: `${start.toFixed(0)}-${end.toFixed(0)}`,
        count,
        selected: containsSelected
      }
    })
  }, [cityStats, currentPrimary])

  const scatterData = useMemo(() => {
    return cityFeatures
      .map((feature) => ({
        canopy: numberOrNull(valueFrom(feature.properties, ['effective_canopy_pct'])),
        heat: numberOrNull(valueFrom(feature.properties, ['urban_heat_score'])),
        id: String(feature.properties?.feature_id ?? '')
      }))
      .filter((item) => Number.isFinite(item.canopy) && Number.isFinite(item.heat))
  }, [cityFeatures])

  const selectedScatter = useMemo(() => {
    const canopy = numberOrNull(valueFrom(currentPrimary, ['effective_canopy_pct']))
    const heat = numberOrNull(valueFrom(currentPrimary, ['urban_heat_score']))
    if (!Number.isFinite(canopy) || !Number.isFinite(heat)) return []
    return [{ canopy, heat, id: sectionLabel(currentFeature) }]
  }, [currentFeature, currentPrimary])

  const rankSummary = useMemo(() => {
    if (!cityFeatures.length || !currentPrimary) return null
    return {
      heat: rankMetric(cityFeatures, currentPrimary, metricDefs.find((metric) => metric.id === 'urbanHeat'), 'desc'),
      pedestrian: rankMetric(cityFeatures, currentPrimary, metricDefs.find((metric) => metric.id === 'pedHeat'), 'desc'),
      coolIsland: rankMetric(cityFeatures, currentPrimary, metricDefs.find((metric) => metric.id === 'coolIsland'), 'desc'),
      canopy: rankMetric(cityFeatures, currentPrimary, metricDefs.find((metric) => metric.id === 'canopy'), 'desc')
    }
  }, [cityFeatures, currentPrimary])

  const comfortRows = useMemo(() => {
    return metricDefs
      .filter((metric) => ['lst', 'urbanHeat', 'pedHeat', 'retention', 'canopy', 'coolIsland'].includes(metric.id))
      .map((metric) => {
        const selected = numberOrNull(valueFrom(currentPrimary, metric.keys))
        const city = cityMetricValue(metric.id, 'average')
        const selectedStatus = comfortStatus(selected, metric)
        const cityStatus = comfortStatus(city, metric)
        return {
          ...metric,
          selected,
          city,
          selectedStatus,
          cityStatus,
          selectedGapText: comfortGapText(selected, metric),
          cityGapText: comfortGapText(city, metric)
        }
      })
  }, [currentPrimary, cityStats])

  const comfortSummary = useMemo(() => {
    const scored = comfortRows.filter((row) => Number.isFinite(row.selected))
    const comfortable = scored.filter((row) => row.selectedStatus.tone === 'good').length
    const near = scored.filter((row) => row.selectedStatus.tone === 'watch').length
    const heatStress = scored.filter((row) => row.selectedStatus.tone === 'hot').length
    return { scored: scored.length, comfortable, near, heatStress }
  }, [comfortRows])

  const callout = useMemo(() => {
    if (!currentPrimary) return 'Select a section to inspect its heat-island profile against the city.'
    const heatDelta = metricDiff(currentPrimary, ['urban_heat_score'], cityMetricValue('urbanHeat'))
    const canopyDelta = metricDiff(currentPrimary, ['effective_canopy_pct'], cityMetricValue('canopy'))
    const coolDelta = metricDiff(currentPrimary, ['cool_island_score'], cityMetricValue('coolIsland'))
    return `${sectionLabel(currentFeature)} is ${formatSigned(heatDelta)} heat-island points versus the city average, with ${formatSigned(canopyDelta, '%')} effective canopy and ${formatSigned(coolDelta)} cool-island score compared with the city baseline.`
  }, [currentFeature, currentPrimary, cityStats])

  const changeSummary = useMemo(() => {
    if (featureSeries.length < 2) return null
    const first = featureSeries[0]
    const last = featureSeries[featureSeries.length - 1]
    return {
      startYear: first.analysis_year,
      endYear: last.analysis_year,
      heat: (numberOrNull(last.urban_heat_score) ?? 0) - (numberOrNull(first.urban_heat_score) ?? 0),
      cool: (numberOrNull(last.cool_island_score) ?? 0) - (numberOrNull(first.cool_island_score) ?? 0),
      canopy: (numberOrNull(last.effective_canopy_pct) ?? 0) - (numberOrNull(first.effective_canopy_pct) ?? 0)
    }
  }, [featureSeries])

  const reportContent = useMemo(() => {
    const rows = comfortRows.map((row) => (
      `<tr><td>${escapeHtml(row.label)}</td><td>${escapeHtml(formatValue(row.selected, row.suffix || ''))}</td><td>${escapeHtml(row.comfortLabel)}</td><td>${escapeHtml(publicComfortGapText(row.selected, row))}</td><td>${escapeHtml(formatValue(row.city, row.suffix || ''))}</td></tr>`
    )).join('\n')

    const metricRows = comparisonBars.map((row) => (
      `<tr><td>${escapeHtml(row.metric)}</td><td>${escapeHtml(formatValue(row.selected, row.suffix))}</td><td>${escapeHtml(formatValue(row.city, row.suffix))}</td><td>${escapeHtml(formatSigned(row.delta, row.suffix))}</td></tr>`
    )).join('\n')

    const areaLabel = reportAreaLabel(currentFeature)
    const heatPercentile = rankSummary?.heat?.percentile
    const pedestrianPercentile = rankSummary?.pedestrian?.percentile
    const coolPercentile = rankSummary?.coolIsland?.percentile
    const lstRow = comfortRows.find((row) => row.id === 'lst')
    const heatRow = comfortRows.find((row) => row.id === 'urbanHeat')
    const canopyRow = comfortRows.find((row) => row.id === 'canopy')
    const headlineStats = [
      Number.isFinite(heatPercentile) ? `This area is hotter than ${formatValue(heatPercentile, '%', 0)} of the city areas in this dataset.` : null,
      Number.isFinite(pedestrianPercentile) ? `For people walking, it has more heat exposure than ${formatValue(pedestrianPercentile, '%', 0)} of the city.` : null,
      lstRow ? `Its modelled surface temperature is ${publicComfortGapText(lstRow.selected, lstRow)}.` : null,
      canopyRow ? `Its effective canopy is ${publicComfortGapText(canopyRow.selected, canopyRow)}.` : null
    ].filter(Boolean)

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Heat Comfort Report - ${escapeHtml(areaLabel)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 36px; color: #172033; line-height: 1.45; background: #ffffff; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 28px 0 10px; font-size: 18px; }
    .meta, .note { color: #56657a; }
    .summary { margin: 22px 0; padding: 18px; border-left: 5px solid #f97316; background: #fff7ed; }
    .plain-list { margin: 16px 0 22px; padding-left: 20px; }
    .plain-list li { margin: 8px 0; }
    .score-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .score { padding: 14px; border: 1px solid #d7dde7; border-radius: 10px; background: #f8fafc; }
    .score span { display: block; color: #56657a; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    .score strong { display: block; margin-top: 6px; font-size: 22px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #d7dde7; text-align: left; }
    th { background: #f1f5f9; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #475569; }
    td:not(:first-child), th:not(:first-child) { text-align: right; }
    footer { margin-top: 36px; color: #64748b; font-size: 12px; }
    @media print { body { margin: 18mm; } .score-grid { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <h1>Heat Comfort Report</h1>
  <div class="meta">${escapeHtml(areaLabel)} | ${escapeHtml(selectedYear)} | compared with ${cityFeatures.length} mapped city areas</div>
  <ul class="plain-list">
    ${headlineStats.map((item) => `<li>${escapeHtml(item)}</li>`).join('\n')}
  </ul>
  <div class="score-grid">
    <div class="score"><span>Comfort range</span><strong>${comfortSummary.comfortable}/${comfortSummary.scored}</strong></div>
    <div class="score"><span>Near comfort</span><strong>${comfortSummary.near}</strong></div>
    <div class="score"><span>Heat-stress flags</span><strong>${comfortSummary.heatStress}</strong></div>
    <div class="score"><span>Hotter than</span><strong>${Number.isFinite(heatPercentile) ? formatValue(heatPercentile, '%', 0) : '-'}</strong></div>
  </div>
  <p class="note">Comfort thresholds are planning benchmarks used by this dashboard. Lower heat, pedestrian heat, night retention, priority, and thermal percentile are better; higher shade, cooling, and vegetation health are better.</p>
  <h2>Comfort Benchmarks</h2>
  <table>
    <thead><tr><th>Measure</th><th>This area</th><th>Comfort benchmark</th><th>What it means</th><th>City average</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>City Comparison</h2>
  <table>
    <thead><tr><th>Measure</th><th>This area</th><th>City average</th><th>Difference from city average</th></tr></thead>
    <tbody>${metricRows}</tbody>
  </table>
  <h2>Rankings</h2>
  <p>Heat: ${escapeHtml(Number.isFinite(heatPercentile) ? `hotter than ${formatValue(heatPercentile, '%', 0)} of mapped city areas` : '-')}</p>
  <p>Cooling: ${escapeHtml(Number.isFinite(coolPercentile) ? `stronger cooling than ${formatValue(coolPercentile, '%', 0)} of mapped city areas` : '-')}</p>
  <p>Walking heat exposure: ${escapeHtml(Number.isFinite(pedestrianPercentile) ? `higher than ${formatValue(pedestrianPercentile, '%', 0)} of mapped city areas` : '-')}</p>
  <footer>Generated by Mission Urban Lab.</footer>
</body>
</html>`
  }, [callout, cityFeatures.length, comfortRows, comfortSummary, comparisonBars, currentFeature, rankSummary, selectedYear])

  const handleDownloadReport = () => {
    const safeId = String(currentFeature.feature_id ?? 'section').replace(/[^a-z0-9_-]+/gi, '-')
    downloadTextFile(`heat-comfort-report-${safeId}-${selectedYear}.html`, reportContent)
  }

  if (!currentPrimary || !currentFeature) return null

  return (
    <div
      ref={panelRef}
      className={`bottom-panel env-bottom-panel ecology-bottom-panel ${minimized ? 'env-minimized' : ''}`}
      style={{ right: sidebarWidth + 32 }}
    >
      <div className="panel-header ecology-panel-header">
        <div className="ecology-panel-headline">
          <div className="ecology-panel-score">{formatValue(numberOrNull(valueFrom(currentPrimary, ['urban_heat_score'])))}</div>
          <div>
            <h3>{sectionLabel(currentFeature)}</h3>
            <span className="ecology-panel-subtitle">
              Heat island and cool island profile - {selectedYear} - {cityFeatures.length} city sections in comparison
            </span>
          </div>
        </div>
        <div className="panel-header-actions">
          <button onClick={handleDownloadReport} className="ecology-download-btn" title="Download heat comfort report">Download report</button>
          <button onClick={onToggleMinimized} className="close-btn" title={minimized ? 'Expand' : 'Minimize'}>{minimized ? '^' : 'v'}</button>
          <button onClick={onClose} className="close-btn" title="Close">x</button>
        </div>
      </div>

      {!minimized && (
        <div className="charts-container ecology-charts-container">
          <div className="env-detail-summary-row ecology-summary-row">
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Modelled LST</span>
              <strong>{formatValue(numberOrNull(valueFrom(currentPrimary, ['predicted_lst_c_fusion', 'heat_model_lst_c', 'mean_lst_c'])), '°C')}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">City Heat Delta</span>
              <strong>{formatSigned(metricDiff(currentPrimary, ['urban_heat_score'], cityMetricValue('urbanHeat')))}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Cool Island Delta</span>
              <strong>{formatSigned(metricDiff(currentPrimary, ['cool_island_score'], cityMetricValue('coolIsland')))}</strong>
            </div>
            <div className="env-detail-stat">
              <span className="env-detail-stat-label">Priority</span>
              <strong>{formatText(currentPrimary.priority_class)} {currentPrimary.priority_score != null ? formatValue(numberOrNull(currentPrimary.priority_score)) : ''}</strong>
            </div>
          </div>

          <div className="ecology-detail-callout">
            <p>{callout}</p>
          </div>

          <div className="ecology-comfort-panel">
            <div className="ecology-chart-head">
              <span>Comfort Benchmarks</span>
              <strong>{comfortSummary.comfortable}/{comfortSummary.scored} in comfort range</strong>
            </div>
            <p>
              Comfort benchmarks are dashboard planning targets: lower heat, pedestrian heat, night retention, priority, and thermal percentile are better; higher canopy, cooling, and vegetation health are better.
            </p>
            <div className="ecology-comfort-grid">
              {comfortRows.map((row) => (
                <div key={row.id} className={`ecology-comfort-card ${row.selectedStatus.tone}`}>
                  <span>{row.label}</span>
                  <strong>{formatValue(row.selected, row.suffix || '')}</strong>
                  <small>Comfort target {row.comfortLabel}</small>
                  <em>Selected is {row.selectedGapText} - {row.selectedStatus.label}</em>
                  <em>City avg {formatValue(row.city, row.suffix || '')}: {row.cityGapText}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="ecology-detail-layout ecology-detail-layout--wide">
            <div className="ecology-detail-column">
              <div className="ecology-driver-grid ecology-primary-grid">
                {metricDefs.slice(0, 8).map((metric) => {
                  const selected = numberOrNull(valueFrom(currentPrimary, metric.keys))
                  const city = cityMetricValue(metric.id, 'average')
                  return (
                    <div key={metric.id} className="ecology-driver-card">
                      <span>{metric.label}</span>
                      <strong>{formatValue(selected, metric.suffix || '')}</strong>
                      <small>City avg {formatValue(city, metric.suffix || '')}</small>
                    </div>
                  )
                })}
              </div>

              <div className="ecology-chart-card ecology-chart-card--large">
                <div className="ecology-chart-head">
                  <span>Selected Section vs City Average</span>
                  <strong>Metric bars</strong>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonBars} margin={{ top: 8, right: 12, left: -18, bottom: 52 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="metric" angle={-35} textAnchor="end" interval={0} height={72} stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => Number.isFinite(value) ? Number(value).toFixed(1) : '-'} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    <Bar dataKey="selected" name="Selected section" fill="#f97316" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="city" name="City average" fill="#38bdf8" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="comfort" name="Comfort target" fill="#22c55e" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Heat Island Distribution</span>
                  <strong>City histogram</strong>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={heatHistogram} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="range" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="count" name="Sections" radius={[5, 5, 0, 0]}>
                      {heatHistogram.map((entry) => (
                        <Cell key={entry.range} fill={entry.selected ? '#f97316' : 'rgba(148, 163, 184, 0.62)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="ecology-detail-column">
              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Core Comfort Comparison</span>
                  <strong>Selected, city, target</strong>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={coreComparisonData} layout="vertical" margin={{ top: 8, right: 18, left: 28, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="metric" stroke="#64748b" tick={{ fontSize: 10 }} width={98} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value) => Number.isFinite(value) ? Number(value).toFixed(1) : '-'} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                    <Bar dataKey="selected" name="Selected section" fill="#f97316" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="city" name="City average" fill="#38bdf8" radius={[0, 5, 5, 0]} />
                    <Bar dataKey="comfort" name="Comfort target" fill="#22c55e" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Score Shape</span>
                  <strong>Radar comparison</strong>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,0.12)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: '#cbd5e1', fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Radar name="Selected section" dataKey="selected" stroke="#f97316" fill="#f97316" fillOpacity={0.28} />
                    <Radar name="City average" dataKey="city" stroke="#67e8f9" fill="#67e8f9" fillOpacity={0.12} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-chart-card">
                <div className="ecology-chart-head">
                  <span>Canopy vs Heat</span>
                  <strong>City scatter</strong>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  <ScatterChart margin={{ top: 8, right: 12, left: -20, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" dataKey="canopy" name="Effective canopy" unit="%" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis type="number" dataKey="heat" name="Heat island" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={chartTooltipStyle} />
                    {Number.isFinite(cityMetricValue('canopy')) && <ReferenceLine x={cityMetricValue('canopy')} stroke="#22c55e" strokeDasharray="4 3" />}
                    {Number.isFinite(cityMetricValue('urbanHeat')) && <ReferenceLine y={cityMetricValue('urbanHeat')} stroke="#f97316" strokeDasharray="4 3" />}
                    <Scatter name="City sections" data={scatterData} fill="rgba(148, 163, 184, 0.52)" />
                    <Scatter name="Selected section" data={selectedScatter} fill="#f97316" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div className="ecology-rank-grid">
                <div className="ecology-rank-card">
                  <span>Heat Standing</span>
                  <strong>{rankSummary?.heat ? `Rank ${rankSummary.heat.rank} / ${rankSummary.heat.total}` : '-'}</strong>
                  <p>Hotter than {formatValue(rankSummary?.heat?.percentile, '%', 0)} of city sections.</p>
                </div>
                <div className="ecology-rank-card cool">
                  <span>Cooling Standing</span>
                  <strong>{rankSummary?.coolIsland ? `Rank ${rankSummary.coolIsland.rank} / ${rankSummary.coolIsland.total}` : '-'}</strong>
                  <p>Cool-island score is {formatSigned(metricDiff(currentPrimary, ['cool_island_score'], cityMetricValue('coolIsland')))} versus average.</p>
                </div>
                <div className="ecology-rank-card">
                  <span>Pedestrian Heat</span>
                  <strong>{rankSummary?.pedestrian ? `Rank ${rankSummary.pedestrian.rank} / ${rankSummary.pedestrian.total}` : '-'}</strong>
                  <p>Street-level exposure compared with the mapped city section set.</p>
                </div>
                <div className="ecology-rank-card cool">
                  <span>{changeSummary ? `${changeSummary.startYear}-${changeSummary.endYear}` : 'Timeline'}</span>
                  <strong>{changeSummary ? formatSigned(changeSummary.heat) : '-'}</strong>
                  <p>Heat change over the available series. Cool island {changeSummary ? formatSigned(changeSummary.cool) : '-'}, canopy {changeSummary ? formatSigned(changeSummary.canopy, '%') : '-'}.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EcologyHeatDetailPanel
