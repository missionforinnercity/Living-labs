import React, { useState, useEffect } from 'react'
import './GreeneryAnalytics.css'

const GreeneryAnalytics = ({
  shadeData,
  greeneryAndSkyview,
  treeCanopyData,
  parksData,
  visibleLayers,
  onLayerToggle
}) => {
  const [stats, setStats] = useState(null)
  const [categoryStats, setCategoryStats] = useState(null)
  
  // Calculate greenery/vegetation statistics
  useEffect(() => {
    if (greeneryAndSkyview?.features) {
      const features = greeneryAndSkyview.features
      
      // Filter segments with valid vegetation data
      const validSegments = features.filter(f => 
        f.properties.vegetation_index !== null && 
        f.properties.vegetation_index !== undefined
      )
      
      if (validSegments.length > 0) {
        const vegetationIndices = validSegments.map(f => f.properties.vegetation_index)
        const skyViewFactors = validSegments.map(f => f.properties.sky_view_factor || 0)
        
        const totalVeg = vegetationIndices.reduce((sum, v) => sum + v, 0)
        const avgVeg = totalVeg / vegetationIndices.length
        const maxVeg = Math.max(...vegetationIndices)
        const minVeg = Math.min(...vegetationIndices)
        
        const avgSkyView = skyViewFactors.reduce((sum, v) => sum + v, 0) / skyViewFactors.length
        
        // Count tree canopy polygons
        const treeCanopyCount = treeCanopyData?.features?.length || 0
        
        // Count parks
        const parksCount = parksData?.features?.length || 0
        
        // Categorize by vegetation density
        const categories = {
          noVegetation: validSegments.filter(f => f.properties.vegetation_index < 0.1).length,
          sparse: validSegments.filter(f => f.properties.vegetation_index >= 0.1 && f.properties.vegetation_index < 0.3).length,
          moderate: validSegments.filter(f => f.properties.vegetation_index >= 0.3 && f.properties.vegetation_index < 0.5).length,
          dense: validSegments.filter(f => f.properties.vegetation_index >= 0.5 && f.properties.vegetation_index < 0.7).length,
          veryDense: validSegments.filter(f => f.properties.vegetation_index >= 0.7).length
        }
        
        setStats({
          totalSegments: features.length,
          analyzedSegments: validSegments.length,
          avgVegetation: avgVeg.toFixed(3),
          maxVegetation: maxVeg.toFixed(3),
          minVegetation: minVeg.toFixed(3),
          avgSkyView: avgSkyView.toFixed(3),
          treeCanopyCount,
          parksCount
        })
        
        setCategoryStats(categories)
      }
    }
  }, [greeneryAndSkyview, treeCanopyData, parksData])
  
  return (
    <aside className="greenery-analytics">
      <div className="analytics-header">
        <h2>Greenery Analysis</h2>
        <p className="header-subtitle">Vegetation coverage metrics</p>
      </div>
      
      {/* Statistics */}
      {stats && (
        <div className="stats-container">
          <h3>Vegetation Index</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Average</span>
              <span className="stat-value">{stats.avgVegetation}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Maximum</span>
              <span className="stat-value">{stats.maxVegetation}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Minimum</span>
              <span className="stat-value">{stats.minVegetation}</span>
            </div>
          </div>
          
          <h3>Related Metrics</h3>
          <div className="metrics-list">
            <div className="metric-item">
              <span className="metric-label">Avg Sky View Factor:</span>
              <span className="metric-value">{stats.avgSkyView}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Tree Canopy Areas:</span>
              <span className="metric-value">{stats.treeCanopyCount}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Parks Nearby:</span>
              <span className="metric-value">{stats.parksCount}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Total Segments:</span>
              <span className="metric-value">{stats.totalSegments}</span>
            </div>
          </div>
          
          {/* Vegetation Distribution */}
          {categoryStats && (
            <div className="distribution-section">
              <h4>Vegetation Density Distribution</h4>
              <div className="category-bars">
                <div className="category-bar">
                  <span className="category-label">No Vegetation (&lt;0.1)</span>
                  <div className="bar-container">
                    <div 
                      className="bar no-veg"
                      style={{ 
                        width: `${(categoryStats.noVegetation / stats.analyzedSegments) * 100}%`
                      }}
                    />
                  </div>
                  <span className="category-count">{categoryStats.noVegetation}</span>
                </div>
                
                <div className="category-bar">
                  <span className="category-label">Sparse (0.1-0.3)</span>
                  <div className="bar-container">
                    <div 
                      className="bar sparse-veg"
                      style={{ 
                        width: `${(categoryStats.sparse / stats.analyzedSegments) * 100}%`
                      }}
                    />
                  </div>
                  <span className="category-count">{categoryStats.sparse}</span>
                </div>
                
                <div className="category-bar">
                  <span className="category-label">Moderate (0.3-0.5)</span>
                  <div className="bar-container">
                    <div 
                      className="bar moderate-veg"
                      style={{ 
                        width: `${(categoryStats.moderate / stats.analyzedSegments) * 100}%`
                      }}
                    />
                  </div>
                  <span className="category-count">{categoryStats.moderate}</span>
                </div>
                
                <div className="category-bar">
                  <span className="category-label">Dense (0.5-0.7)</span>
                  <div className="bar-container">
                    <div 
                      className="bar dense-veg"
                      style={{ 
                        width: `${(categoryStats.dense / stats.analyzedSegments) * 100}%`
                      }}
                    />
                  </div>
                  <span className="category-count">{categoryStats.dense}</span>
                </div>
                
                <div className="category-bar">
                  <span className="category-label">Very Dense (&gt;0.7)</span>
                  <div className="bar-container">
                    <div 
                      className="bar very-dense-veg"
                      style={{ 
                        width: `${(categoryStats.veryDense / stats.analyzedSegments) * 100}%`
                      }}
                    />
                  </div>
                  <span className="category-count">{categoryStats.veryDense}</span>
                </div>
              </div>
            </div>
          )}
          
          <div className="info-box">
            <h4>About Vegetation Index</h4>
            <p>
              The vegetation index (NDVI) measures the presence and health of vegetation. 
              Higher values indicate denser, healthier vegetation which contributes to:
            </p>
            <ul>
              <li>Increased shade coverage</li>
              <li>Lower surface temperatures</li>
              <li>Improved air quality</li>
              <li>Enhanced pedestrian comfort</li>
            </ul>
          </div>
        </div>
      )}
      
      {/* Layer Controls */}
      <div className="layer-controls">
        <h4>Visible Layers</h4>
        <div className="layer-toggles">
          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={visibleLayers.greenerySegments}
              onChange={() => onLayerToggle('greenerySegments')}
            />
            <span>Greenery & Sky View Factor</span>
          </label>
          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={visibleLayers.treeCanopy}
              onChange={() => onLayerToggle('treeCanopy')}
            />
            <span>Tree Canopy</span>
          </label>
          <label className="layer-toggle">
            <input
              type="checkbox"
              checked={visibleLayers.parksNearby}
              onChange={() => onLayerToggle('parksNearby')}
            />
            <span>Parks Nearby</span>
          </label>
        </div>
      </div>
      
      {/* Legend */}
      <div className="legend-section">
        <h4>Vegetation Density</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#8b4513' }}></div>
            <span>No Vegetation (&lt;0.1)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#d4b896' }}></div>
            <span>Sparse (0.1-0.3)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#bde69c' }}></div>
            <span>Moderate (0.3-0.5)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#6ab04c' }}></div>
            <span>Dense (0.5-0.7)</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#2d7a2e' }}></div>
            <span>Very Dense (&gt;0.7)</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

export default GreeneryAnalytics
