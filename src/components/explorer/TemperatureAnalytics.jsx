import React, { useState, useEffect } from 'react'
import './TemperatureAnalytics.css'

const TemperatureAnalytics = ({
  temperatureData,
  hideLayerControls = false
}) => {
  const [stats, setStats] = useState(null)
  const [categoryStats, setCategoryStats] = useState(null)
  
  // Calculate heat-street statistics from climate.heat_streets
  useEffect(() => {
    if (temperatureData?.features) {
      const features = temperatureData.features
      const heatFeatures = features.filter(f => f.properties.mean_pedestrian_heat_score !== undefined)
      
      if (heatFeatures.length > 0) {
        const hotScores = heatFeatures.map(f => Number(f.properties.hot_street_score)).filter(Number.isFinite)
        const lstValues = heatFeatures.map(f => Number(f.properties.mean_heat_model_lst_c)).filter(Number.isFinite)
        const pedestrianScores = heatFeatures.map(f => Number(f.properties.mean_pedestrian_heat_score)).filter(Number.isFinite)
        const pedestrianPercentiles = heatFeatures.map(f => Number(f.properties.pedestrian_heat_percentile)).filter(Number.isFinite)
        if (!pedestrianScores.length) return
        
        const maxPedestrianScore = Math.max(...pedestrianScores)
        const minPedestrianScore = Math.min(...pedestrianScores)
        const avgHotScore = hotScores.length ? hotScores.reduce((sum, v) => sum + v, 0) / hotScores.length : 0
        const avgLst = lstValues.length ? lstValues.reduce((sum, v) => sum + v, 0) / lstValues.length : 0
        const avgPedestrian = pedestrianScores.length ? pedestrianScores.reduce((sum, v) => sum + v, 0) / pedestrianScores.length : 0
        
        const categories = {
          bottom20: heatFeatures.filter(f => f.properties.pedestrian_heat_band === 'bottom_20').length,
          middle: heatFeatures.filter(f => f.properties.pedestrian_heat_band === 'middle').length,
          top20: heatFeatures.filter(f => f.properties.pedestrian_heat_band === 'top_20').length,
          top10: heatFeatures.filter(f => f.properties.pedestrian_heat_band === 'top_10').length
        }
        
        setStats({
          totalSegments: features.length,
          analyzedSegments: heatFeatures.length,
          overallMax: maxPedestrianScore.toFixed(1),
          overallMin: minPedestrianScore.toFixed(1),
          avgOfMaxes: avgHotScore.toFixed(1),
          avgOfAvgs: avgLst.toFixed(1),
          avgPedestrian: avgPedestrian.toFixed(1),
          rankedSegments: pedestrianPercentiles.length
        })
        
        setCategoryStats(categories)
      }
    }
  }, [temperatureData])
  
  return (
    <aside className="temperature-analytics">
      <div className="analytics-header">
        <h2>Heat Streets</h2>
        <p className="header-subtitle">DB-backed street heat analysis from climate.heat_streets</p>
      </div>
      
      {/* Statistics */}
      {stats && (
        <div className="stats-container">
          <h3>Heat Street Metrics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Peak Pedestrian Heat</span>
              <span className="stat-value">{stats.overallMax}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Lowest Pedestrian Heat</span>
              <span className="stat-value">{stats.overallMin}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Avg Hot Score</span>
              <span className="stat-value">{stats.avgOfMaxes}</span>
            </div>
          </div>
          
          <h3>Environmental Metrics</h3>
          <div className="metrics-list">
            <div className="metric-item">
              <span className="metric-label">Total Segments:</span>
              <span className="metric-value">{stats.totalSegments}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Avg Heat Model LST:</span>
              <span className="metric-value">{stats.avgOfAvgs}°C</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Avg Pedestrian Heat:</span>
              <span className="metric-value">{stats.avgPedestrian}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Analyzed Segments:</span>
              <span className="metric-value">{stats.analyzedSegments}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Percentile Ranked:</span>
              <span className="metric-value">{stats.rankedSegments}</span>
            </div>
          </div>
          
          {/* Info about analysis */}
          <div className="info-box">
            <h4>About This Analysis</h4>
            <p>
              Streets are ranked by the DB pedestrian heat score from climate.heat_streets. Dark red marks the hottest 10%, red marks the rest of the top 20%, and blue marks the coolest bottom 20%. Click any street to inspect modelled heat, canopy, shade deficit, and pedestrian heat pressure.
            </p>
          </div>
        </div>
      )}
      
      {/* Legend */}
      <div className="legend-section">
        <h4>Pedestrian Heat Percentile</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#991b1b' }}></div>
            <span>Top 10% hottest{categoryStats ? ` (${categoryStats.top10})` : ''}</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#ef4444' }}></div>
            <span>Top 20% hottest{categoryStats ? ` (${categoryStats.top20})` : ''}</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#f97316' }}></div>
            <span>Above middle</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#22c55e' }}></div>
            <span>Middle streets{categoryStats ? ` (${categoryStats.middle})` : ''}</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#2563eb' }}></div>
            <span>Bottom 20% coolest{categoryStats ? ` (${categoryStats.bottom20})` : ''}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default TemperatureAnalytics
