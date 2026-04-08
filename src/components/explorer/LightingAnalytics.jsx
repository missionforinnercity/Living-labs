import React, { useState, useEffect } from 'react'
import { GaugeDial } from '../charts'
import { GlowDistributionChart } from '../charts'
import './LightingAnalytics.css'

const LightingAnalytics = ({
  segmentsData,
  projectsData,
  streetLightsData,
  hideLayerControls = false
}) => {
  const [stats, setStats] = useState(null)
  const [categoryStats, setCategoryStats] = useState(null)
  const [lightStats, setLightStats] = useState(null)
  
  // Calculate street light statistics
  useEffect(() => {
    if (streetLightsData?.features) {
      const features = streetLightsData.features
      
      // Calculate operational status
      const operational = features.filter(f => f.properties.operational === true).length
      const nonOperational = features.filter(f => f.properties.operational === false).length
      const total = features.length
      const uptime = ((operational / total) * 100).toFixed(1)
      
      // Calculate wattage distribution
      const wattages = features
        .map(f => f.properties.wattage)
        .filter(w => w > 0) // Filter out invalid wattage values like -2
      
      const avgWattage = wattages.length > 0 
        ? (wattages.reduce((sum, w) => sum + w, 0) / wattages.length).toFixed(0)
        : 0
      
      // Calculate total light count (some poles have multiple lights)
      const totalLightCount = features.reduce((sum, f) => sum + (f.properties.lightcount || 1), 0)
      
      // Group by lamp type
      const lampTypes = {}
      features.forEach(f => {
        const type = f.properties.lamptype || 'Unknown'
        if (type !== '-2') { // Filter out invalid types
          lampTypes[type] = (lampTypes[type] || 0) + 1
        }
      })
      
      // Get most common lamp type
      const mostCommonType = Object.entries(lampTypes)
        .sort((a, b) => b[1] - a[1])[0]
      
      // Calculate total energy consumption (operational lights only)
      const totalWattage = features
        .filter(f => f.properties.operational === true && f.properties.wattage > 0)
        .reduce((sum, f) => sum + (f.properties.wattage * (f.properties.lightcount || 1)), 0)
      
      const totalKW = (totalWattage / 1000).toFixed(1)
      
      setLightStats({
        total,
        totalLightCount,
        operational,
        nonOperational,
        uptime,
        avgWattage,
        lampTypes,
        mostCommonType,
        totalKW
      })
    }
  }, [streetLightsData])
  
  // Calculate lighting statistics from road segments
  useEffect(() => {
    if (segmentsData?.features) {
      const features = segmentsData.features
      
      // Filter segments with valid lux data
      const validSegments = features.filter(f => 
        f.properties.mean_lux !== null && 
        f.properties.mean_lux !== undefined &&
        f.properties.mean_lux > 0
      )
      
      if (validSegments.length > 0) {
        const luxValues = validSegments.map(f => f.properties.mean_lux)
        const total = luxValues.reduce((sum, v) => sum + v, 0)
        const avg = total / luxValues.length
        const max = Math.max(...luxValues)
        const min = Math.min(...luxValues)
        
        // Calculate total nearby lights count (sum of all lights affecting all segments)
        const totalNearbyLights = validSegments.reduce((sum, f) => 
          sum + (f.properties.nearby_lights_count || 0), 0)
        
        // Average lights per segment
        const avgLightsPerSegment = (totalNearbyLights / validSegments.length).toFixed(1)
        
        // Calculate average percentage above 5 lux
        const pctAbove5Values = validSegments
          .map(f => f.properties.pct_above_5lux)
          .filter(v => v !== null && v !== undefined)
        
        const avgPctAbove5 = pctAbove5Values.length > 0
          ? (pctAbove5Values.reduce((sum, v) => sum + v, 0) / pctAbove5Values.length).toFixed(1)
          : 0
        
        // Calculate percentile-based categories
        // Sort lux values to find percentiles
        const sortedLuxValues = [...luxValues].sort((a, b) => a - b)
        const percentile20Index = Math.floor(sortedLuxValues.length * 0.20)
        const percentile80Index = Math.floor(sortedLuxValues.length * 0.80)
        
        const bottom20Threshold = sortedLuxValues[percentile20Index]
        const top20Threshold = sortedLuxValues[percentile80Index]
        
        // Categorize by percentile-based lighting quality
        const categories = {
          bottom20: validSegments.filter(f => f.properties.mean_lux <= bottom20Threshold).length,
          moderate: validSegments.filter(f => f.properties.mean_lux > bottom20Threshold && f.properties.mean_lux < top20Threshold).length,
          top20: validSegments.filter(f => f.properties.mean_lux >= top20Threshold).length
        }
        
        const thresholds = {
          bottom20: bottom20Threshold.toFixed(2),
          top20: top20Threshold.toFixed(2)
        }
        
        setStats({
          totalSegments: features.length,
          analyzedSegments: validSegments.length,
          avgLux: avg.toFixed(2),
          maxLux: max.toFixed(2),
          minLux: min.toFixed(2),
          avgLightsPerSegment,
          avgPctAbove5,
          thresholds
        })
        
        setCategoryStats(categories)
      }
    }
  }, [segmentsData])
  
  // Project statistics
  const [projectStats, setProjectStats] = useState(null)
  
  useEffect(() => {
    if (projectsData?.features) {
      setProjectStats({
        totalProjects: projectsData.features.length
      })
    }
  }, [projectsData])
  
  return (
    <div className="lighting-analytics">
      {/* Analytics Section */}
      <div className="analytics-section">
        <div className="section-header">
          <h3>Street Lighting Analysis</h3>
          <span className="data-date">Analysis Date: Feb 18, 2026</span>
        </div>
        
        {/* Street Light Infrastructure Stats */}
        {lightStats && (
          <>
            <div className="subsection-header">
              <h4>🔦 Infrastructure Status</h4>
            </div>
            <div className="lighting-aurora-row">
              <div className="lighting-gauge-cell">
                <GaugeDial themeKey="lighting" score={parseFloat(lightStats.uptime) / 100} active />
                <span className="lighting-gauge-label">Uptime</span>
              </div>
              <div className="stats-grid" style={{ flex: 1 }}>
                <div className="stat-card primary">
                  <div className="stat-value">{lightStats.total}</div>
                  <div className="stat-label">Total Light Poles</div>
                  <div className="stat-sublabel">{lightStats.totalLightCount} individual lights</div>
                </div>
                <div className="stat-card success">
                  <div className="stat-value">{lightStats.operational}</div>
                  <div className="stat-label">Operational</div>
                  <div className="stat-sublabel">{lightStats.uptime}% uptime</div>
                </div>
                <div className="stat-card warning">
                  <div className="stat-value">{lightStats.nonOperational}</div>
                  <div className="stat-label">Non-Operational</div>
                  <div className="stat-sublabel">
                    {((lightStats.nonOperational / lightStats.total) * 100).toFixed(1)}% need repair
                  </div>
                </div>
              </div>
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{lightStats.avgWattage}W</div>
                <div className="stat-label">Avg Wattage</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{lightStats.totalKW} kW</div>
                <div className="stat-label">Total Power Draw</div>
                <div className="stat-sublabel">Operational lights only</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{lightStats.mostCommonType ? lightStats.mostCommonType[0] : 'N/A'}</div>
                <div className="stat-label">Most Common Type</div>
                {lightStats.mostCommonType && (
                  <div className="stat-sublabel">{lightStats.mostCommonType[1]} units</div>
                )}
              </div>
            </div>
            
            {/* Lamp Type Distribution */}
            <div className="info-section">
              <h5>Lamp Type Distribution</h5>
              {Object.entries(lightStats.lampTypes)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => (
                  <div key={type} className="info-item">
                    <span className="info-label">{type}:</span>
                    <span className="info-value">
                      {count} ({((count / lightStats.total) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}
        
        {/* Road Segment Lighting Quality Stats */}
        {stats && (
          <>
            <div className="subsection-header">
              <h4>💡 Lighting Quality Metrics</h4>
            </div>
            <div className="stats-grid">
              <div className="stat-card primary">
                <div className="stat-value">{stats.avgLux}</div>
                <div className="stat-label">Avg Lux Level</div>
                <div className="stat-sublabel">Across all road segments</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{stats.avgLightsPerSegment}</div>
                <div className="stat-label">Avg Lights/Segment</div>
                <div className="stat-sublabel">Light density indicator</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{stats.avgPctAbove5}%</div>
                <div className="stat-label">Avg Coverage</div>
                <div className="stat-sublabel">Area above 5 lux threshold</div>
              </div>
            </div>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.maxLux}</div>
                <div className="stat-label">Max Lux</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{stats.minLux}</div>
                <div className="stat-label">Min Lux</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{stats.analyzedSegments}</div>
                <div className="stat-label">Analyzed Segments</div>
              </div>
            </div>
            
            <div className="info-section">
              <div className="info-item">
                <span className="info-label">Total Road Segments:</span>
                <span className="info-value">{stats.totalSegments}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Coverage:</span>
                <span className="info-value">
                  {((stats.analyzedSegments / stats.totalSegments) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </>
        )}
        
        {/* Aurora glow distribution chart */}
        {categoryStats && stats && (
          <div className="lighting-glow-dist">
            <GlowDistributionChart
              distribution={[categoryStats.bottom20, categoryStats.moderate, categoryStats.top20]}
              themeKey="lighting"
              title="Lighting Quality Distribution"
            />
          </div>
        )}

        {/* Category Breakdown - Percentile Based */}
        {categoryStats && stats?.thresholds && (
          <div className="category-section">
            <h4>Percentile Breakdown</h4>
            <div className="category-list">
              <div className="category-item bottom20">
                <div className="category-header">
                  <span className="category-name">🔴 Bottom 20% - Poorly Lit</span>
                  <span className="category-count">{categoryStats.bottom20}</span>
                </div>
                <div className="category-description">
                  ≤ {stats.thresholds.bottom20} lux (needs improvement)
                </div>
                <div className="category-bar">
                  <div 
                    className="category-bar-fill"
                    style={{ 
                      width: `${(categoryStats.bottom20 / stats.analyzedSegments) * 100}%`,
                      background: '#A78BFA'
                    }}
                  />
                </div>
                <div className="category-percentage">
                  {((categoryStats.bottom20 / stats.analyzedSegments) * 100).toFixed(1)}%
                </div>
              </div>
              
              <div className="category-item moderate">
                <div className="category-header">
                  <span className="category-name">🟡 Middle 60% - Moderate</span>
                  <span className="category-count">{categoryStats.moderate}</span>
                </div>
                <div className="category-description">
                  {stats.thresholds.bottom20} - {stats.thresholds.top20} lux (adequate)
                </div>
                <div className="category-bar">
                  <div 
                    className="category-bar-fill"
                    style={{ 
                      width: `${(categoryStats.moderate / stats.analyzedSegments) * 100}%`,
                      background: '#7B93FF'
                    }}
                  />
                </div>
                <div className="category-percentage">
                  {((categoryStats.moderate / stats.analyzedSegments) * 100).toFixed(1)}%
                </div>
              </div>
              
              <div className="category-item top20">
                <div className="category-header">
                  <span className="category-name">🟢 Top 20% - Well Lit</span>
                  <span className="category-count">{categoryStats.top20}</span>
                </div>
                <div className="category-description">
                  ≥ {stats.thresholds.top20} lux (excellent)
                </div>
                <div className="category-bar">
                  <div 
                    className="category-bar-fill"
                    style={{ 
                      width: `${(categoryStats.top20 / stats.analyzedSegments) * 100}%`,
                      background: '#5EC2A0'
                    }}
                  />
                </div>
                <div className="category-percentage">
                  {((categoryStats.top20 / stats.analyzedSegments) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            <div className="info-section" style={{ marginTop: '1rem' }}>
              <h5>Distribution Insights</h5>
              <div className="info-item">
                <span className="info-label">Areas needing improvement:</span>
                <span className="info-value">{categoryStats.bottom20} segments</span>
              </div>
              <div className="info-item">
                <span className="info-label">Well-performing areas:</span>
                <span className="info-value">{categoryStats.top20} segments</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Project Info */}
        {projectStats && (
          <div className="info-section">
            <div className="info-item">
              <span className="info-label">Lighting Projects:</span>
              <span className="info-value">{projectStats.totalProjects}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Layer Controls - hidden when using category selector */}
      {!hideLayerControls && (
        <div className="layer-controls">
          <h4>Visible Layers</h4>
          <div className="layer-toggles">
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={false}
                onChange={() => {}}
              />
              <span>Street Segments</span>
            </label>
            
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={false}
                onChange={() => {}}
              />
              <span>Street Lights</span>
            </label>
          </div>
        </div>
      )}
      
      {/* Legend */}
      <div className="legend-section">
        <h4>Percentile-Based Quality Scale</h4>
        <div className="legend-items">
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#A78BFA' }}></div>
            <span>Bottom 20% - Priority improvement areas</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#7B93FF' }}></div>
            <span>Middle 60% - Moderate/adequate lighting</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ background: '#5EC2A0' }}></div>
            <span>Top 20% - Best-performing areas</span>
          </div>
        </div>
        
        <div className="info-section" style={{ marginTop: '1rem' }}>
          <h5>About Percentile Analysis</h5>
          <p style={{ color: '#a5d6a7', fontSize: '0.75rem', margin: '0.5rem 0' }}>
            This distribution shows relative lighting quality across your area. The bottom 20% 
            represents streets that need the most improvement, while the top 20% shows your 
            best-lit areas. Thresholds are calculated from your actual data.
          </p>
          <div className="info-item">
            <span className="info-label">Street Lighting Standards:</span>
            <span className="info-value">5-50+ lux (varies by area type)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LightingAnalytics
