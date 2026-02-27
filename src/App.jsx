import React, { useState, useCallback } from 'react'
import Map from './components/Map'
import ModeToggle from './components/ModeToggle'
import NarrativeDistricts from './components/NarrativeDistricts'
import DistrictStatsPanel from './components/DistrictStatsPanel'
import DistrictCompare from './components/DistrictCompare'
import WalkabilityPanel from './components/WalkabilityPanel'
import StreetCompare from './components/StreetCompare'
import DataExplorer from './components/DataExplorer'
import WardExplorer from './components/WardExplorer'
import './App.css'

function App() {
  const [showLanding, setShowLanding] = useState(true)
  const [mode, setMode] = useState('narrative') // 'narrative' or 'explorer'
  const [narrativeTab, setNarrativeTab] = useState('districts') // 'districts' | 'walkability'
  const [activeLayers, setActiveLayers] = useState({
    shade: false,
    lighting: false,
    walkability: false,
    business: false,
    publicArt: false
  })

  const [explorerFilters, setExplorerFilters] = useState({
    metric: 'betweenness',
    sortOrder: 'desc',
    limit: 10
  })

  // District Narrative Engine state
  const [selectedDistrictId,      setSelectedDistrictId]      = useState(null)
  const [selectedDistrictFeature, setSelectedDistrictFeature] = useState(null)
  const [districtGeoJSON,         setDistrictGeoJSON]         = useState(null)
  const [districtBounds,          setDistrictBounds]          = useState(null)

  // Walkability Index state
  const [walkabilityData, setWalkabilityData] = useState(null)
  const [compareSegments, setCompareSegments] = useState([])
  const [focusedSegment,  setFocusedSegment]  = useState(null)

  // District comparison state
  const [compareDistricts, setCompareDistricts] = useState([])

  const handleDistrictSelect = useCallback((districtId, feature, bounds, fc) => {
    setSelectedDistrictId(districtId)
    setSelectedDistrictFeature(feature)
    setDistrictBounds(bounds)
    if (fc) setDistrictGeoJSON(fc)
  }, [])

  const handleDistrictClick = useCallback((feat) => {
    setSelectedDistrictFeature(feat)
    setSelectedDistrictId(feat.properties.districtId)
    setCompareDistricts(prev => {
      const key = f => f.properties.clusterId
      const exists = prev.findIndex(d => key(d) === key(feat))
      if (exists >= 0) return prev.filter((_, i) => i !== exists)
      if (prev.length >= 2) return [prev[1], feat]
      return [...prev, feat]
    })
  }, [])

  // Switch narrative tab — clear stale map data from previous tab
  const handleNarrativeTab = useCallback((tab) => {
    setNarrativeTab(tab)
    if (tab === 'districts') {
      setWalkabilityData(null)
      setCompareSegments([])
    }
    if (tab === 'walkability') {
      // Don't clear districtGeoJSON — the district click handler (and compare)
      // depend on it being present when the user navigates back to this tab.
      setSelectedDistrictFeature(null)
      setSelectedDistrictId(null)
      setCompareDistricts([])
    }
  }, [])

  const handleSegmentClick = useCallback((segment) => {
    setFocusedSegment(segment)
    setCompareSegments(prev => {
      const key = seg => `${seg.properties.street_name}|${seg.properties.min_lux}`
      const exists = prev.findIndex(s => key(s) === key(segment))
      if (exists >= 0) return prev.filter((_, i) => i !== exists)
      if (prev.length >= 2) return [prev[1], segment]
      return [...prev, segment]
    })
  }, [])

  if (showLanding) {
    return <WardExplorer onEnterDashboard={() => setShowLanding(false)} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <button className="app-back-btn" onClick={() => setShowLanding(true)}>
            ← Neighbourhood View
          </button>
          <h1>Urban Analytics Lab</h1>
        </div>
        <ModeToggle mode={mode} onModeChange={setMode} />
      </header>

      <div className="app-content">
        {mode === 'narrative' ? (
          <>
            <aside className="sidebar sidebar--dark">

              {/* Narrative sub-tab switcher */}
              <div className="narrative-tabs">
                <button
                  className={`narrative-tab ${narrativeTab === 'districts' ? 'narrative-tab--active' : ''}`}
                  onClick={() => handleNarrativeTab('districts')}
                >
                  District Explorer
                </button>
                <button
                  className={`narrative-tab ${narrativeTab === 'walkability' ? 'narrative-tab--active' : ''}`}
                  onClick={() => handleNarrativeTab('walkability')}
                >
                  Walkability
                </button>
              </div>

              {narrativeTab === 'districts' ? (
                <NarrativeDistricts
                  selectedDistrictId={selectedDistrictId}
                  onDistrictSelect={handleDistrictSelect}
                  onLayersChange={setActiveLayers}

                />
              ) : (
                <WalkabilityPanel
                  onWalkabilityChange={setWalkabilityData}
                  compareCount={compareSegments.length}
                  onSegmentClick={handleSegmentClick}
                />
              )}
            </aside>

            <main className="map-container">
              <Map
                mode={mode}
                activeLayers={activeLayers}
                temporalState={{ season: 'summer', timeOfDay: '1400', hour: 14 }}
                explorerFilters={explorerFilters}
                selectedTour={null}
                districtGeoJSON={districtGeoJSON}
                selectedDistrictId={selectedDistrictId}
                districtBounds={districtBounds}
                onDistrictClick={handleDistrictClick}
                compareDistricts={compareDistricts}
                showDistricts={narrativeTab === 'districts'}
                walkabilityData={walkabilityData}
                onSegmentClick={handleSegmentClick}
                compareSegments={compareSegments}
                focusedSegment={focusedSegment}
              />
              {narrativeTab === 'districts' && (
                <DistrictStatsPanel
                  feature={selectedDistrictFeature}
                  onClose={() => setSelectedDistrictFeature(null)}
                />
              )}
              {narrativeTab === 'districts' && compareDistricts.length > 0 && (
                <DistrictCompare
                  districts={compareDistricts}
                  onClose={() => setCompareDistricts([])}
                  onClear={() => setCompareDistricts([])}
                />
              )}
              {narrativeTab === 'walkability' && compareSegments.length > 0 && (
                <StreetCompare
                  segments={compareSegments}
                  onClose={() => setCompareSegments([])}
                  onClear={() => setCompareSegments([])}
                />
              )}
            </main>
          </>
        ) : (
          <DataExplorer
            filters={explorerFilters}
            onFiltersChange={setExplorerFilters}
            activeLayers={activeLayers}
            onLayersChange={setActiveLayers}
          />
        )}
      </div>
    </div>
  )
}

export default App
