import React, { useState, useEffect } from 'react'
import RouteAnalyticsPanel from './RouteAnalyticsPanel'
import './WalkabilityAnalytics.css'

const NETWORK_METRICS = [
  { id: 'betweenness_400', label: 'Betweenness 400m', field: 'cc_betweenness_400' },
  { id: 'betweenness_800', label: 'Betweenness 800m', field: 'cc_betweenness_800' },
  { id: 'betweenness_beta_400', label: 'Beta Betweenness 400m', field: 'cc_betweenness_beta_400' },
  { id: 'betweenness_beta_800', label: 'Beta Betweenness 800m', field: 'cc_betweenness_beta_800' },
  { id: 'harmonic_400', label: 'Closeness 400m', field: 'cc_harmonic_400' },
  { id: 'harmonic_800', label: 'Closeness 800m', field: 'cc_harmonic_800' }
]

// Network Insight Views
const INSIGHT_VIEWS = [
  { id: 'movement', label: 'Movement Potential' },
  { id: 'accessibility', label: 'Accessibility Gap' },
  { id: 'integration', label: 'Network Integration' },
  { id: 'resilience', label: 'Street Resilience' }
]

const WalkabilityAnalytics = ({
  walkabilityMode,
  onWalkabilityModeChange,
  networkMetric,
  onNetworkMetricChange,
  pedestrianData,
  cyclingData,
  networkData,
  hideLayerControls = false,
  selectedSegment = null
}) => {
  const [stats, setStats] = useState(null)
  const [insightView, setInsightView] = useState('movement')
  const [scaleToggle, setScaleToggle] = useState('400') // '400' or '800'
  
  // Calculate statistics based on current mode
  useEffect(() => {
    if (walkabilityMode === 'pedestrian' && pedestrianData?.features) {
      const features = pedestrianData.features
      const tripCounts = features.map(f => f.properties.total_trip_count || 0)
      const total = tripCounts.reduce((sum, v) => sum + v, 0)
      const validTrips = tripCounts.filter(v => v > 0)
      
      setStats({
        totalSegments: features.length,
        totalTrips: total.toLocaleString(),
        avgTripsPerSegment: features.length > 0 ? Math.round(total / features.length) : 0,
        maxTrips: tripCounts.length > 0 ? Math.max(...tripCounts) : 0,
        minTrips: validTrips.length > 0 ? Math.min(...validTrips) : 0
      })
    } else if (walkabilityMode === 'cycling' && cyclingData?.features) {
      const features = cyclingData.features
      const tripCounts = features.map(f => f.properties.total_trip_count || 0)
      const total = tripCounts.reduce((sum, v) => sum + v, 0)
      const validTrips = tripCounts.filter(v => v > 0)
      
      setStats({
        totalSegments: features.length,
        totalTrips: total.toLocaleString(),
        avgTripsPerSegment: features.length > 0 ? Math.round(total / features.length) : 0,
        maxTrips: tripCounts.length > 0 ? Math.max(...tripCounts) : 0,
        minTrips: validTrips.length > 0 ? Math.min(...validTrips) : 0
      })
    } else if (walkabilityMode === 'network' && networkData?.features) {
      const features = networkData.features
      const currentMetric = NETWORK_METRICS.find(m => m.id === networkMetric)
      const fieldName = currentMetric?.field || 'cc_betweenness_800'
      
      const values = features.map(f => f.properties[fieldName] || 0)
      
      const isHarmonic = fieldName.includes('harmonic')
      
      setStats({
        totalSegments: features.length,
        metricName: currentMetric?.label || 'Betweenness 800m',
        avgValue: isHarmonic 
          ? (values.reduce((sum, v) => sum + v, 0) / features.length).toFixed(3)
          : Math.round(values.reduce((sum, v) => sum + v, 0) / features.length),
        maxValue: isHarmonic
          ? Math.max(...values).toFixed(3)
          : Math.round(Math.max(...values)),
        minValue: isHarmonic
          ? Math.min(...values.filter(v => v > 0)).toFixed(3)
          : Math.round(Math.min(...values.filter(v => v > 0)))
      })
    }
  }, [walkabilityMode, pedestrianData, cyclingData, networkData, networkMetric])
  
// Helper function to calculate network insights
const calculateNetworkInsights = () => {
  if (!networkData?.features) return null
  
  const features = networkData.features
  const insights = {}
  
  // Movement Potential (Betweenness)
  const bet400 = features.map(f => f.properties.cc_betweenness_400 || 0)
  const bet800 = features.map(f => f.properties.cc_betweenness_800 || 0)
  insights.movement = {
    pedestrian: { 
      avg: bet400.reduce((a,b) => a+b, 0) / bet400.length,
      max: Math.max(...bet400),
      top10: bet400.sort((a,b) => b-a).slice(0, 10)
    },
    throughTraffic: { 
      avg: bet800.reduce((a,b) => a+b, 0) / bet800.length,
      max: Math.max(...bet800),
      top10: bet800.sort((a,b) => b-a).slice(0, 10)
    }
  }
  
  // Accessibility Gap (Harmonic)
  const harm400 = features.map(f => f.properties.cc_harmonic_400 || 0)
  const harm800 = features.map(f => f.properties.cc_harmonic_800 || 0)
  const gaps = features.map((f, i) => ({
    gap: (harm800[i] - harm400[i]),
    local: harm400[i],
    neighborhood: harm800[i]
  }))
  insights.accessibility = {
    avgGap: gaps.reduce((sum, g) => sum + g.gap, 0) / gaps.length,
    isolatedPockets: gaps.filter(g => g.neighborhood > (harm800.reduce((a,b) => a+b, 0) / harm800.length) && g.local < (harm400.reduce((a,b) => a+b, 0) / harm400.length)).length
  }
  
  // Integration (Hillier)
  const hill400 = features.map(f => f.properties.cc_hillier_400 || 0)
  const hill800 = features.map(f => f.properties.cc_hillier_800 || 0)
  insights.integration = {
    local: { 
      avg: hill400.reduce((a,b) => a+b, 0) / hill400.length,
      max: Math.max(...hill400)
    },
    neighborhood: { 
      avg: hill800.reduce((a,b) => a+b, 0) / hill800.length,
      max: Math.max(...hill800)
    }
  }
  
  // Resilience (Cycles)
  const cycles400 = features.map(f => f.properties.cc_cycles_400 || 0)
  const cycles800 = features.map(f => f.properties.cc_cycles_800 || 0)
  insights.resilience = {
    local: cycles400.reduce((a,b) => a+b, 0) / cycles400.length,
    neighborhood: cycles800.reduce((a,b) => a+b, 0) / cycles800.length,
    highConnectivity: cycles400.filter(c => c > (cycles400.reduce((a,b) => a+b, 0) / cycles400.length)).length
  }
  
  return insights
}

const networkInsights = calculateNetworkInsights()
  
  // Listen for clear selection event
  useEffect(() => {
    const handleClearSelection = () => {
      // We don't have a setter for selectedSegment, so we dispatch an event upward
      // This will be handled by the parent component
    }
    window.addEventListener('clearSegmentSelection', handleClearSelection)
    return () => window.removeEventListener('clearSegmentSelection', handleClearSelection)
  }, [])
  
  return (
    <div className="walkability-analytics">
      <div className="analytics-header">
        <h2>Walkability & Cycling</h2>
        <p className="header-subtitle">Street network usage patterns</p>
      </div>
      
      {/* Mode Selector - hidden when using category selector */}
      {!hideLayerControls && (
      <div className="mode-selector">
        <label className="mode-radio">
          <input
            type="radio"
            name="walkability-mode"
            value="pedestrian"
            checked={walkabilityMode === 'pedestrian'}
            onChange={(e) => onWalkabilityModeChange(e.target.value)}
          />
          <span className="radio-label">Pedestrian Routes</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="walkability-mode"
            value="cycling"
            checked={walkabilityMode === 'cycling'}
            onChange={(e) => onWalkabilityModeChange(e.target.value)}
          />
          <span className="radio-label">Cycling Routes</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="walkability-mode"
            value="network"
            checked={walkabilityMode === 'network'}
            onChange={(e) => onWalkabilityModeChange(e.target.value)}
          />
          <span className="radio-label">Network Analysis</span>
        </label>
      </div>
      )}
      
      {/* Pedestrian Mode */}
      {walkabilityMode === 'pedestrian' && (
        <div className="mode-content">
          <h3>Pedestrian Activity</h3>
          <p className="mode-description">
            Click on any route segment to view its detailed statistics
          </p>

          {selectedSegment ? (
            <>
              <div className="selected-segment-header">
                <h4>Selected Route Segment</h4>
                <button className="clear-selection-btn" onClick={() => window.dispatchEvent(new CustomEvent('clearSegmentSelection'))}>Clear ✕</button>
              </div>
              <div className="stats-summary highlight">
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.total_trip_count ?? 0}</span>
                  <span className="stat-label">Total Trips</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.forward_trip_count ?? 0}</span>
                  <span className="stat-label">Forward</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.reverse_trip_count ?? 0}</span>
                  <span className="stat-label">Reverse</span>
                </div>
              </div>
              <div className="details-section">
                <div className="detail-row">
                  <span className="detail-label">Avg Speed:</span>
                  <span className="detail-value">{(selectedSegment.avg_speed || 0).toFixed(2)} m/s</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Recreation Trips:</span>
                  <span className="detail-value">{selectedSegment.recreation || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Commute Trips:</span>
                  <span className="detail-value">{selectedSegment.commute || 0}</span>
                </div>
              </div>
              <hr style={{borderColor: '#2a3f2d', margin: '1rem 0'}} />
              <h4 style={{fontSize: '0.875rem', color: '#a5d6a7', marginBottom: '0.75rem'}}>All Segments Summary</h4>
            </>
          ) : null}
          
          {stats && (
            <>
              <div className="stats-summary">
                <div className="stat-item">
                  <span className="stat-value">{stats.totalTrips}</span>
                  <span className="stat-label">Total Trips</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.avgTripsPerSegment ?? 0}</span>
                  <span className="stat-label">Avg/Segment</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{(stats.maxTrips ?? 0).toLocaleString()}</span>
                  <span className="stat-label">Max Trips</span>
                </div>
              </div>

              <div className="details-section">
                <div className="detail-row">
                  <span className="detail-label">Total Segments:</span>
                  <span className="detail-value">{stats.totalSegments ?? 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Min Trips:</span>
                  <span className="detail-value">{stats.minTrips ?? 0}</span>
                </div>
              </div>
            </>
          )}

          {/* Legend */}
          <div className="legend-section">
            <h4>Activity Level</h4>
            <div className="route-legend">
              <div className="gradient-legend">
                <div className="gradient-bar" style={{
                  background: 'linear-gradient(to right, #08519c, #6baed6, #fee391, #ec7014, #d62828, #6a040f)'
                }}></div>
                <div className="gradient-labels">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>
              <div className="legend-note">
                Blue: 0-30 trips | Yellow: 30-100 | Orange-Red: 100-500+ trips
              </div>
            </div>
          </div>

          {/* Analytics Panel */}
          {pedestrianData && <RouteAnalyticsPanel data={pedestrianData} mode="pedestrian" />}
        </div>
      )}
      
      {/* Cycling Mode */}
      {walkabilityMode === 'cycling' && (
        <div className="mode-content">
          <h3>Cycling Activity</h3>
          <p className="mode-description">
            Click on any route segment to view its detailed statistics
          </p>

          {selectedSegment ? (
            <>
              <div className="selected-segment-header">
                <h4>Selected Route Segment</h4>
                <button className="clear-selection-btn" onClick={() => window.dispatchEvent(new CustomEvent('clearSegmentSelection'))}>Clear ✕</button>
              </div>
              <div className="stats-summary highlight">
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.total_trip_count ?? 0}</span>
                  <span className="stat-label">Total Trips</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.ebike_ride_count ?? 0}</span>
                  <span className="stat-label">E-Bikes</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{selectedSegment.ride_count ?? 0}</span>
                  <span className="stat-label">Regular</span>
                </div>
              </div>
              <div className="details-section">
                <div className="detail-row">
                  <span className="detail-label">Avg Speed:</span>
                  <span className="detail-value">{(selectedSegment.forward_average_speed_meters_per_second || 0).toFixed(2)} m/s</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Recreation Trips:</span>
                  <span className="detail-value">{selectedSegment.recreation || 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Commute Trips:</span>
                  <span className="detail-value">{selectedSegment.commute || 0}</span>
                </div>
              </div>
              <hr style={{borderColor: '#2a3f2d', margin: '1rem 0'}} />
              <h4 style={{fontSize: '0.875rem', color: '#a5d6a7', marginBottom: '0.75rem'}}>All Segments Summary</h4>
            </>
          ) : null}

          {stats && (
            <>
              <div className="stats-summary">
                <div className="stat-item">
                  <span className="stat-value">{stats.totalTrips}</span>
                  <span className="stat-label">Total Trips</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{stats.avgTripsPerSegment ?? 0}</span>
                  <span className="stat-label">Avg/Segment</span>
                </div>
                <div className="stat-item">
                  <span className="stat-value">{(stats.maxTrips ?? 0).toLocaleString()}</span>
                  <span className="stat-label">Max Trips</span>
                </div>
              </div>

              <div className="details-section">
                <div className="detail-row">
                  <span className="detail-label">Total Segments:</span>
                  <span className="detail-value">{stats.totalSegments ?? 0}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Min Trips:</span>
                  <span className="detail-value">{stats.minTrips ?? 0}</span>
                </div>
              </div>
            </>
          )}

          {/* Legend */}
          <div className="legend-section">
            <h4>Activity Level</h4>
            <div className="route-legend">
              <div className="gradient-legend">
                <div className="gradient-bar" style={{
                  background: 'linear-gradient(to right, #08519c, #6baed6, #fee391, #ec7014, #d62828, #6a040f)'
                }}></div>
                <div className="gradient-labels">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>
              <div className="legend-note">
                Blue: 0-100 trips | Yellow: 100-300 | Orange-Red: 300-1000+ trips
              </div>
            </div>
          </div>

          {/* Analytics Panel */}
          {cyclingData && <RouteAnalyticsPanel data={cyclingData} mode="cycling" />}
        </div>
      )}
      
      {/* Network Analysis Mode */}
      {walkabilityMode === 'network' && (
        <div className="mode-content network-insights">
          <h3>Network Analysis Insights</h3>
          <p className="mode-description">
            Discover hidden patterns in urban movement and connectivity
          </p>
          
          {/* Insight View Selector */}
          <div className="insight-view-selector">
            {INSIGHT_VIEWS.map(view => (
              <button
                key={view.id}
                className={`insight-view-btn ${insightView === view.id ? 'active' : ''}`}
                onClick={() => {
                  setInsightView(view.id)
                  // Update the network metric based on the insight view
                  if (view.id === 'movement') onNetworkMetricChange(scaleToggle === '400' ? 'betweenness_400' : 'betweenness_800')
                  else if (view.id === 'accessibility') onNetworkMetricChange(scaleToggle === '400' ? 'harmonic_400' : 'harmonic_800')
                  else if (view.id === 'integration') onNetworkMetricChange('betweenness_beta_' + scaleToggle)
                }}
              >
                <span className="view-label">{view.label}</span>
              </button>
            ))}
          </div>

          {/* Scale Toggle (400m vs 800m) */}
          <div className="scale-toggle-container">
            <label className="scale-label">Analysis Scale:</label>
            <div className="scale-toggle">
              <button 
                className={`scale-btn ${scaleToggle === '400' ? 'active' : ''}`}
                onClick={() => {
                  setScaleToggle('400')
                  if (insightView === 'movement') onNetworkMetricChange('betweenness_400')
                  else if (insightView === 'accessibility') onNetworkMetricChange('harmonic_400')
                  else if (insightView === 'integration') onNetworkMetricChange('betweenness_beta_400')
                }}
              >
                <span className="scale-text">400m</span>
                <span className="scale-desc">Pedestrian</span>
              </button>
              <button 
                className={`scale-btn ${scaleToggle === '800' ? 'active' : ''}`}
                onClick={() => {
                  setScaleToggle('800')
                  if (insightView === 'movement') onNetworkMetricChange('betweenness_800')
                  else if (insightView === 'accessibility') onNetworkMetricChange('harmonic_800')
                  else if (insightView === 'integration') onNetworkMetricChange('betweenness_beta_800')
                }}
              >
                <span className="scale-text">800m</span>
                <span className="scale-desc">Through-Traffic</span>
              </button>
            </div>
          </div>

          {/* Movement Potential Insight */}
          {insightView === 'movement' && networkInsights && (
            <div className="insight-panel movement-panel">
              <div className="insight-header">
                <h4>Movement Potential Heatmap</h4>
                <p className="insight-subtitle">Betweenness Centrality Analysis</p>
              </div>
              
              <div className="insight-cards">
                <div className="insight-card pedestrian-flow">
                  <div className="card-content">
                    <div className="card-label">Pedestrian Shortcuts (400m)</div>
                    <div className="card-value">{networkInsights.movement.pedestrian.max.toFixed(0)}</div>
                    <div className="card-sublabel">Peak Betweenness</div>
                  </div>
                </div>
                <div className="insight-card traffic-flow">
                  <div className="card-content">
                    <div className="card-label">Main Arteries (800m)</div>
                    <div className="card-value">{networkInsights.movement.throughTraffic.max.toFixed(0)}</div>
                    <div className="card-sublabel">Peak Betweenness</div>
                  </div>
                </div>
              </div>

              <div className="insight-explanation">
                <div className="explanation-text">
                  <strong>Urban Strategy:</strong> {scaleToggle === '400' 
                    ? 'Highlighted streets are popular pedestrian shortcuts and local high streets - ideal for small retail and cafes.'
                    : 'Highlighted streets are main traffic arteries. Where 400m and 800m overlap = prime retail zones!'}
                </div>
              </div>

              <div className="metric-legend movement-legend">
                <div className="legend-title">Intensity Scale</div>
                <div className="gradient-bar-new movement-gradient"></div>
                <div className="gradient-labels-new">
                  <span>Low Flow</span>
                  <span>Moderate</span>
                  <span>High Flow</span>
                </div>
              </div>
            </div>
          )}

          {/* Accessibility Gap Insight */}
          {insightView === 'accessibility' && networkInsights && (
            <div className="insight-panel accessibility-panel">
              <div className="insight-header">
                <h4>Accessibility vs. Cognitive Complexity</h4>
                <p className="insight-subtitle">Harmonic Closeness Comparison</p>
              </div>
              
              <div className="insight-cards">
                <div className="insight-card accessibility-card">
                  <div className="card-content">
                    <div className="card-label">Average Accessibility Gap</div>
                    <div className="card-value">{(networkInsights.accessibility.avgGap * 100).toFixed(1)}%</div>
                    <div className="card-sublabel">800m vs 400m difference</div>
                  </div>
                </div>
                <div className="insight-card isolated-card">
                  <div className="card-content">
                    <div className="card-label">Isolated Pockets</div>
                    <div className="card-value">{networkInsights.accessibility.isolatedPockets}</div>
                    <div className="card-sublabel">Poor local permeability</div>
                  </div>
                </div>
              </div>

              <div className="insight-explanation">
                <div className="explanation-text">
                  <strong>Hidden Insights:</strong> Streets highlighted in deep purple are physically close to the center 
                  but cognitively "far" due to convoluted networks. These areas often struggle with low footfall.
                </div>
              </div>

              <div className="metric-legend accessibility-legend">
                <div className="legend-title">Closeness Index</div>
                <div className="gradient-bar-new accessibility-gradient"></div>
                <div className="gradient-labels-new">
                  <span>Isolated</span>
                  <span>Average</span>
                  <span>Highly Accessible</span>
                </div>
              </div>
            </div>
          )}

          {/* Network Integration Insight */}
          {insightView === 'integration' && networkInsights && (
            <div className="insight-panel integration-panel">
              <div className="insight-header">
                <h4>Network Integration Index</h4>
                <p className="insight-subtitle">Retail Opportunity Scoring (Beta-Weighted)</p>
              </div>
              
              <div className="insight-cards">
                <div className="insight-card integration-card">
                  <div className="card-content">
                    <div className="card-label">Average Integration</div>
                    <div className="card-value">{networkInsights.integration.neighborhood.avg.toFixed(2)}</div>
                    <div className="card-sublabel">Hillier Index (800m)</div>
                  </div>
                </div>
                <div className="insight-card center-card">
                  <div className="card-content">
                    <div className="card-label">Peak Integration</div>
                    <div className="card-value">{networkInsights.integration.neighborhood.max.toFixed(2)}</div>
                    <div className="card-sublabel">Most central location</div>
                  </div>
                </div>
              </div>

              <div className="insight-explanation">
                <div className="explanation-text">
                  <strong>Retail Strategy:</strong> Beta-weighted betweenness accounts for distance decay. 
                  High-scoring streets (bright green) are optimal for retail - they balance flow volume with proximity.
                </div>
              </div>

              <div className="metric-legend integration-legend">
                <div className="legend-title">Integration Score</div>
                <div className="gradient-bar-new integration-gradient"></div>
                <div className="gradient-labels-new">
                  <span>Peripheral</span>
                  <span>Integrated</span>
                  <span>Core</span>
                </div>
              </div>
            </div>
          )}

          {/* Street Resilience Insight */}
          {insightView === 'resilience' && networkInsights && (
            <div className="insight-panel resilience-panel">
              <div className="insight-header">
                <h4>Street Network Resilience</h4>
                <p className="insight-subtitle">Connectivity & Alternative Routes (Cycles)</p>
              </div>
              
              <div className="insight-cards">
                <div className="insight-card resilience-card">
                  <div className="card-content">
                    <div className="card-label">Avg Cycle Count</div>
                    <div className="card-value">{networkInsights.resilience.neighborhood.toFixed(1)}</div>
                    <div className="card-sublabel">Alternative routes (800m)</div>
                  </div>
                </div>
                <div className="insight-card grid-card">
                  <div className="card-content">
                    <div className="card-label">High Connectivity Zones</div>
                    <div className="card-value">{networkInsights.resilience.highConnectivity}</div>
                    <div className="card-sublabel">Grid-like areas</div>
                  </div>
                </div>
              </div>

              <div className="insight-explanation">
                <div className="explanation-text">
                  <strong>Urban Porosity:</strong> High cycle counts (bright blue) indicate grid-like networks with 
                  multiple routes between points. Low counts (red) show bottleneck zones where one closure paralyzes the area.
                </div>
              </div>

              <div className="metric-legend resilience-legend">
                <div className="legend-title">Connectivity Rating</div>
                <div className="gradient-bar-new resilience-gradient"></div>
                <div className="gradient-labels-new">
                  <span>Tree-like</span>
                  <span>Moderate</span>
                  <span>Grid-like</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Stats Summary */}
          <div className="quick-stats-network">
            <h4>Network Summary</h4>
            <div className="quick-stat-row">
              <span className="quick-stat-label">Total Segments:</span>
              <span className="quick-stat-value">{stats?.totalSegments || 0}</span>
            </div>
            <div className="quick-stat-row">
              <span className="quick-stat-label">Current Metric:</span>
              <span className="quick-stat-value">{stats?.metricName || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WalkabilityAnalytics
