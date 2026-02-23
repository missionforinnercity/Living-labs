import React, { useState, useCallback } from 'react'
import Map from './components/Map'
import ModeToggle from './components/ModeToggle'
import NarrativeDistricts from './components/NarrativeDistricts'
import DistrictStatsPanel from './components/DistrictStatsPanel'
import DataExplorer from './components/DataExplorer'
import './App.css'

function App() {
  const [mode, setMode] = useState('narrative') // 'narrative' or 'explorer'
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

  const handleDistrictSelect = useCallback((districtId, feature, bounds, fc) => {
    setSelectedDistrictId(districtId)
    setSelectedDistrictFeature(feature)
    setDistrictBounds(bounds)
    if (fc) setDistrictGeoJSON(fc)
  }, [])

  const handleDistrictClick = useCallback((feat) => {
    setSelectedDistrictFeature(feat)
    setSelectedDistrictId(feat.properties.districtId)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>District Narrative Engine</h1>
        <ModeToggle mode={mode} onModeChange={setMode} />
      </header>

      <div className="app-content">
        {mode === 'narrative' ? (
          <>
            <aside className="sidebar sidebar--dark">
              <NarrativeDistricts
                selectedDistrictId={selectedDistrictId}
                onDistrictSelect={handleDistrictSelect}
                onLayersChange={setActiveLayers}
              />
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
              />
              <DistrictStatsPanel
                feature={selectedDistrictFeature}
                onClose={() => setSelectedDistrictFeature(null)}
              />
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
