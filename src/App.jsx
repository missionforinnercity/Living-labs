import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react'
import NavRail from './components/NavRail'
import { applyGradientCssVars } from './lib/colorPalette'
import './App.css'

const Map = lazy(() => import('./components/Map'))
const NarrativeDistricts = lazy(() => import('./components/NarrativeDistricts'))
const DistrictStatsPanel = lazy(() => import('./components/DistrictStatsPanel'))
const DistrictCompare = lazy(() => import('./components/DistrictCompare'))
const WalkabilityPanel = lazy(() => import('./components/WalkabilityPanel'))
const StreetCompare = lazy(() => import('./components/StreetCompare'))
const DataExplorer = lazy(() => import('./components/DataExplorer'))
const WardExplorer = lazy(() => import('./components/WardExplorer'))

function getAppUrlState() {
  if (typeof window === 'undefined') {
    return {
      showLanding: true,
      mode: 'narrative',
      narrativeTab: 'districts'
    }
  }

  const params = new URLSearchParams(window.location.search)
  const view = params.get('view')
  const mode = params.get('mode') === 'explorer' ? 'explorer' : 'narrative'
  const narrativeTab = params.get('tab') === 'walkability' ? 'walkability' : 'districts'

  return {
    showLanding: view !== 'dashboard',
    mode,
    narrativeTab
  }
}

// Inject CityPulse gradient CSS vars on load
applyGradientCssVars()

function App() {
  const initialUrlState = getAppUrlState()
  const [showLanding, setShowLanding] = useState(initialUrlState.showLanding)
  const [hasMountedLanding, setHasMountedLanding] = useState(initialUrlState.showLanding)
  const [mode, setMode] = useState(initialUrlState.mode) // 'narrative' | 'explorer'
  const [narrativeTab, setNarrativeTab] = useState(initialUrlState.narrativeTab) // 'districts' | 'walkability'
  const [navExpanded, setNavExpanded] = useState(false)
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

  useEffect(() => {
    if (typeof window === 'undefined') return

    const syncFromUrl = () => {
      const nextState = getAppUrlState()
      setShowLanding(nextState.showLanding)
      setMode(nextState.mode)
      setNarrativeTab(nextState.narrativeTab)
    }

    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    if (showLanding) {
      params.delete('view')
      params.delete('mode')
      params.delete('tab')
    } else {
      params.set('view', 'dashboard')
      params.set('mode', mode)
      if (mode === 'narrative') {
        params.set('tab', narrativeTab)
      } else {
        params.delete('tab')
      }
    }

    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  }, [mode, narrativeTab, showLanding])

  useEffect(() => {
    if (showLanding) {
      setHasMountedLanding(true)
    }
  }, [showLanding])

  const handleDistrictSelect = useCallback((districtId, feature, bounds, fc) => {
    setSelectedDistrictId(feature?.properties?.clusterId || districtId)
    setSelectedDistrictFeature(feature)
    setDistrictBounds(bounds)
    if (fc) setDistrictGeoJSON(fc)
  }, [])

  const handleDistrictClick = useCallback((feat) => {
    setSelectedDistrictFeature(feat)
    setSelectedDistrictId(feat.properties.clusterId || feat.properties.districtId)
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

  const handleReturnToLanding = useCallback(() => {
    if (mode === 'explorer') {
      const nextUrl = `${window.location.pathname}${window.location.hash}`
      window.location.assign(nextUrl)
      return
    }

    setMode('narrative')
    setNarrativeTab('districts')
    setShowLanding(true)
  }, [mode])

  return (
    <>
      {hasMountedLanding && (showLanding || mode !== 'explorer') ? (
        <div
          style={{
            opacity: showLanding ? 1 : 0,
            visibility: showLanding ? 'visible' : 'hidden',
            pointerEvents: showLanding ? 'auto' : 'none'
          }}
        >
          <Suspense fallback={<div className="app-loading-screen">Loading neighbourhood view...</div>}>
            <WardExplorer
              onEnterDashboard={() => setShowLanding(false)}
              isVisible={showLanding}
            />
          </Suspense>
        </div>
      ) : null}

      {!showLanding ? (
        <div className={`app-shell ${navExpanded ? 'nav-expanded' : ''}`}>
          <NavRail
            mode={mode}
            narrativeTab={narrativeTab}
            onModeChange={setMode}
            onNarrativeTab={handleNarrativeTab}
            onReturnToLanding={handleReturnToLanding}
            onExpandedChange={setNavExpanded}
          />

          <div className="app-content">
            <header className="app-header">
              <div className="app-brand">
                <div className="app-brand-mark" />
                <div>
                  <h1 className="app-brand-title">Mission Urban Lab</h1>
                  <p className="app-brand-sub">District intelligence · Cape Town Metro</p>
                </div>
              </div>
            </header>

            <div className="app-main">
              {mode === 'narrative' ? (
                <>
                  <aside className="sidebar sidebar--dark">
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
                      <Suspense fallback={<div className="app-panel-loading">Loading district explorer...</div>}>
                        <NarrativeDistricts
                          selectedDistrictId={selectedDistrictId}
                          onDistrictSelect={handleDistrictSelect}
                          onLayersChange={setActiveLayers}
                        />
                      </Suspense>
                    ) : (
                      <Suspense fallback={<div className="app-panel-loading">Loading walkability tools...</div>}>
                        <WalkabilityPanel
                          onWalkabilityChange={setWalkabilityData}
                          compareCount={compareSegments.length}
                          onSegmentClick={handleSegmentClick}
                        />
                      </Suspense>
                    )}
                  </aside>

                  <main className="map-container">
                    <Suspense fallback={<div className="app-map-loading">Loading map...</div>}>
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
                    </Suspense>
                  </main>
                </>
              ) : (
                <Suspense fallback={<div className="app-loading-screen">Loading data explorer...</div>}>
                  <DataExplorer />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default App
