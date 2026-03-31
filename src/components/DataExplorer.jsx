import React, { lazy, Suspense } from 'react'
import './DataExplorer.css'

const UnifiedDataExplorer = lazy(() => import('./explorer/UnifiedDataExplorer'))

const DataExplorer = () => {
  return (
    <div className="data-explorer">
      <Suspense fallback={<div className="app-loading-screen">Loading explorer analytics...</div>}>
        <UnifiedDataExplorer />
      </Suspense>
    </div>
  )
}

export default DataExplorer
