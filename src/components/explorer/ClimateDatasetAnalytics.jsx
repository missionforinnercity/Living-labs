import React, { useMemo } from 'react'
import './TemperatureAnalytics.css'

const numberOrNull = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null

const formatValue = (value, suffix = '') => {
  if (!Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}${suffix}`
}

const ClimateDatasetAnalytics = ({
  title,
  source,
  subtitle,
  data,
  metrics = []
}) => {
  const summary = useMemo(() => {
    const features = data?.features || []
    const metricSummaries = metrics.map((metric) => {
      const values = features
        .map((feature) => numberOrNull(feature.properties?.[metric.key]))
        .filter(Number.isFinite)

      return {
        ...metric,
        value: average(values)
      }
    })

    const classCounts = {}
    features.forEach((feature) => {
      const label = feature.properties?.ventilation_class || feature.properties?.zone_type || feature.properties?.land_type
      if (!label) return
      classCounts[label] = (classCounts[label] || 0) + 1
    })

    return {
      totalFeatures: features.length,
      metricSummaries,
      classCounts: Object.entries(classCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    }
  }, [data, metrics])

  return (
    <aside className="temperature-analytics">
      <div className="analytics-header">
        <h2>{title}</h2>
        <p className="header-subtitle">{subtitle || `DB-backed climate layer from ${source}`}</p>
      </div>

      <div className="stats-container">
        <h3>Dataset Summary</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Features</span>
            <span className="stat-value">{summary.totalFeatures.toLocaleString()}</span>
          </div>
          {summary.metricSummaries.slice(0, 2).map((metric) => (
            <div className="stat-card" key={metric.key}>
              <span className="stat-label">{metric.label}</span>
              <span className="stat-value">{formatValue(metric.value, metric.suffix || '')}</span>
            </div>
          ))}
        </div>

        {summary.metricSummaries.length > 2 && (
          <div className="metrics-list">
            {summary.metricSummaries.slice(2).map((metric) => (
              <div className="metric-item" key={metric.key}>
                <span className="metric-label">{metric.label}:</span>
                <span className="metric-value">{formatValue(metric.value, metric.suffix || '')}</span>
              </div>
            ))}
          </div>
        )}

        {!!summary.classCounts.length && (
          <div className="metrics-list">
            {summary.classCounts.map(([label, count]) => (
              <div className="metric-item" key={label}>
                <span className="metric-label">{label}:</span>
                <span className="metric-value">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        <div className="info-box">
          <h4>Source</h4>
          <p>{source}</p>
        </div>
      </div>
    </aside>
  )
}

export default ClimateDatasetAnalytics
