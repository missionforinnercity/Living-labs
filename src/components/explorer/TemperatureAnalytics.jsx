import React, { useState, useEffect } from 'react'
import './TemperatureAnalytics.css'

const TemperatureAnalytics = ({
  temperatureData,
  visibleLayers,
  onLayerToggle
}) => {
  const [stats, setStats] = useState(null)
  const [categoryStats, setCategoryStats] = useState(null)
  
  // Calculate overall temperature statistics across all seasons
  useEffect(() => {
    if (temperatureData?.features) {
      const features = temperatureData.features
      
      // Collect overall max temps
      const segmentsWithTemp = features.filter(f => f.properties.overall_max_temp !== undefined)
      
      if (segmentsWithTemp.length > 0) {
        const maxTemps = segmentsWithTemp.map(f => f.properties.overall_max_temp)
        const avgTemps = segmentsWithTemp.map(f => f.properties.overall_avg_temp)
        
        const overallMax = Math.max(...maxTemps)
        const overallMin = Math.min(...maxTemps)
        const avgOfMaxes = maxTemps.reduce((sum, v) => sum + v, 0) / maxTemps.length
        const avgOfAvgs = avgTemps.reduce((sum, v) => sum + v, 0) / avgTemps.length
        
        // Categorize by percentile (relative heat ranking)
        const categories = {
          coolest: segmentsWithTemp.filter(f => f.properties.temp_percentile < 20).length,
          cool: segmentsWithTemp.filter(f => f.properties.temp_percentile >= 20 && f.properties.temp_percentile < 40).length,
          average: segmentsWithTemp.filter(f => f.properties.temp_percentile >= 40 && f.properties.temp_percentile < 60).length,
          warm: segmentsWithTemp.filter(f => f.properties.temp_percentile >= 60 && f.properties.temp_percentile < 80).length,
          hottest: segmentsWithTemp.filter(f => f.properties.temp_percentile >= 80).length
        }
        
        setStats({
          totalSegments: features.length,
          analyzedSegments: segmentsWithTemp.length,
          overallMax: overallMax.toFixed(1),
          overallMin: overallMin.toFixed(1),
          avgOfMaxes: avgOfMaxes.toFixed(1),
          avgOfAvgs: avgOfAvgs.toFixed(1)
        })
        
        setCategoryStats(categories)
      }
    }
  }, [temperatureData])
  
  return (
    <aside className="temperature-analytics">
      <div className="analytics-header">
        <h2>Surface Temperature</h2>
        <p className="header-subtitle">Relative heat analysis across all seasons</p>
      </div>
      
      {/* Statistics */}
      {stats && (
        <div className="stats-container">
          <h3>Temperature Metrics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Hottest Street</span>
              <span className="stat-value">{stats.overallMax}°C</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Coolest Street</span>
              <span className="stat-value">{stats.overallMin}°C</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Avg Max Temp</span>
              <span className="stat-value">{stats.avgOfMaxes}°C</span>
            </div>
          </div>
          
          <h3>Environmental Metrics</h3>
          <div className="metrics-list">
            <div className="metric-item">
              <span className="metric-label">Total Segments:</span>
              <span className="metric-value">{stats.totalSegments}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Analyzed Segments:</span>
              <span className="metric-value">{stats.analyzedSegments}</span>
            </div>
          </div>
          
          {/* Info about analysis */}
          <div className="info-box">
            <h4>About This Analysis</h4>
            <p>
              Streets are ranked by their maximum recorded temperature across all four seasons. Colors show relative heat - comparing streets to each other rather than absolute temperature thresholds. Click any street to see seasonal temperature trends.
            </p>
          </div>
        </div>
      )}
      
      {/* Legend */}
      <div className="legend-section">
        <h4>Heat Ranking</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#3b82f6' }}></div>
            <span>Coolest 20%</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#10b981' }}></div>
            <span>Below Average</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#fbbf24' }}></div>
            <span>Average</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#f59e0b' }}></div>
            <span>Above Average</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#ef4444' }}></div>
            <span>Hottest 20%</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default TemperatureAnalytics
