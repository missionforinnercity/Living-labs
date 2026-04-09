import React, { useState, useCallback, lazy, Suspense, useEffect } from 'react'
import NavRail from './components/NavRail'
import DashboardLayout from './layouts/DashboardLayout'
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
    return { showLanding: true, mode: 'narrative', narrativeTab: 'districts' }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    showLanding: params.get('view') !== 'dashboard',
    mode: params.get('mode') === 'explorer' ? 'explorer' : 'narrative',
    narrativeTab: params.get('tab') === 'walkability' ? 'walkability' : 'districts',
  }
}

applyGradientCssVars()

function App() {
  const initial = getAppUrlState()
  const [showLanding, setShowLanding] = useState(initial.showLanding)
  const [hasMountedLanding, setHasMountedLanding] = useState(initial.showLanding)
  const [mode, setMode] = useState(initial.mode)
  const [narrativeTab, setNarrativeTab] = useState(initial.narrativeTab)
  const [navExpanded, setNavExpanded] = useState(false)
  const [activeLayers, setActiveLayers] = useState({ shade: false, lighting: false, walkability: false, business: false, publicArt: false })
  const [explorerFilters] = useState({ metric: 'betweenness', sortOrder: 'desc', limit: 10 })

  // District state
  const [selectedDistrictId, setSelectedDistrictId] = useState(null)
  const [selectedDistrictFeature, setSelectedDistrictFeature] = useState(null)
  const [districtGeoJSON, setDistrictGeoJSON] = useState(null)
  const [districtBounds, setDistrictBounds] = useState(null)
  const [compareDistricts, setCompareDistricts] = useState([])

  // Walkability state
  const [walkabilityData, setWalkabilityData] = useState(null)
  const [compareSegments, setCompareSegments] = useState([])
  const [focusedSegment, setFocusedSegment] = useState(null)

  // URL sync
  useEffect(() => {
    const sync = () => { const s = getAppUrlState(); setShowLanding(s.showLanding); setMode(s.mode); setNarrativeTab(s.narrativeTab) }
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (showLanding) { params.delete('view'); params.delete('mode'); params.delete('tab') }
    else { params.set('view', 'dashboard'); params.set('mode', mode); mode === 'narrative' ? params.set('tab', narrativeTab) : params.delete('tab') }
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`)
  }, [mode, narrativeTab, showLanding])

  useEffect(() => { if (showLanding) setHasMountedLanding(true) }, [showLanding])

  // Handlers
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

  const handleNarrativeTab = useCallback((tab) => {
    setNarrativeTab(tab)
    if (tab === 'districts') { setWalkabilityData(null); setCompareSegments([]) }
    if (tab === 'walkability') { setSelectedDistrictFeature(null); setSelectedDistrictId(null); setCompareDistricts([]) }
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
    if (mode === 'explorer') { window.location.assign(`${window.location.pathname}${window.location.hash}`); return }
    setMode('narrative'); setNarrativeTab('districts'); setShowLanding(true)
  }, [mode])

  // ── Header content ─────────────────────────────────────────────────────
  const headerContent = (
    <>
      <div className="layout-brand">
        <div className="layout-brand-mark" />
        <div>
          <h1 className="layout-brand-title">Mission Urban Lab</h1>
          <p className="layout-brand-sub">Cape Town Metro</p>
        </div>
      </div>
      <div className="layout-header-sep" />
      <span className="layout-header-context">
        {mode === 'explorer' ? 'Data Explorer' : narrativeTab === 'districts' ? 'District Explorer' : 'Walkability Index'}
      </span>
      <div className="layout-header-spacer" />
    </>
  )

  // ── Right panel content ────────────────────────────────────────────────
  const rightPanelContent = (
    <>
      <div className="layout-tabs">
        <button className={`layout-tab ${narrativeTab === 'districts' ? 'layout-tab--on' : ''}`} onClick={() => handleNarrativeTab('districts')}>Districts</button>
        <button className={`layout-tab ${narrativeTab === 'walkability' ? 'layout-tab--on' : ''}`} onClick={() => handleNarrativeTab('walkability')}>Walkability</button>
      </div>

      {narrativeTab === 'districts' ? (
        <Suspense fallback={<div className="app-panel-loading">Loading districts...</div>}>
          <NarrativeDistricts
            selectedDistrictId={selectedDistrictId}
            onDistrictSelect={handleDistrictSelect}
            onLayersChange={setActiveLayers}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<div className="app-panel-loading">Loading walkability...</div>}>
          <WalkabilityPanel
            onWalkabilityChange={setWalkabilityData}
            compareCount={compareSegments.length}
            onSegmentClick={handleSegmentClick}
          />
        </Suspense>
      )}
    </>
  )

  // ── Map content ────────────────────────────────────────────────────────
  const mapContent = mode === 'narrative' ? (
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
    </Suspense>
  ) : null // Explorer has its own map inside DataExplorer for now

  // ── Bottom bar content ─────────────────────────────────────────────────
  let bottomContent = null
  if (mode === 'narrative') {
    if (narrativeTab === 'districts' && selectedDistrictFeature) {
      bottomContent = (
        <Suspense fallback={null}>
          <DistrictStatsPanel feature={selectedDistrictFeature} onClose={() => setSelectedDistrictFeature(null)} />
        </Suspense>
      )
    }
    if (narrativeTab === 'districts' && compareDistricts.length > 0) {
      bottomContent = (
        <Suspense fallback={null}>
          <DistrictCompare districts={compareDistricts} onClose={() => setCompareDistricts([])} onClear={() => setCompareDistricts([])} />
        </Suspense>
      )
    }
    if (narrativeTab === 'walkability' && compareSegments.length > 0) {
      bottomContent = (
        <Suspense fallback={null}>
          <StreetCompare segments={compareSegments} onClose={() => setCompareSegments([])} onClear={() => setCompareSegments([])} />
        </Suspense>
      )
    }
  }

  return (
    <>
      {/* Landing page */}
      {hasMountedLanding && (showLanding || mode !== 'explorer') ? (
        <div style={{ opacity: showLanding ? 1 : 0, visibility: showLanding ? 'visible' : 'hidden', pointerEvents: showLanding ? 'auto' : 'none' }}>
          <Suspense fallback={<div className="app-loading-screen">Loading neighbourhood view...</div>}>
            <WardExplorer onEnterDashboard={() => setShowLanding(false)} isVisible={showLanding} />
          </Suspense>
        </div>
      ) : null}

      {/* Dashboard */}
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
          {mode === 'narrative' ? (
            <DashboardLayout
              header={headerContent}
              subnav={null}
              map={mapContent}
              rightPanel={rightPanelContent}
              bottomBar={bottomContent}
              rightPanelWidth={340}
            />
          ) : (
            <Suspense fallback={<div className="app-loading-screen">Loading data explorer...</div>}>
              <DataExplorer />
            </Suspense>
          )}
        </div>
      ) : null}
    </>
  )
}

export default App
