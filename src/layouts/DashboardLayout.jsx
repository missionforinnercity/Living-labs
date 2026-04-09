import React from 'react'
import './DashboardLayout.css'

export default function DashboardLayout({
  header,
  subnav,
  map,
  rightPanel,
  bottomBar,
  rightPanelWidth,
}) {
  const style = rightPanelWidth
    ? { '--right-panel-width': `${rightPanelWidth}px` }
    : undefined

  return (
    <div className="dashboard-layout" style={style}>
      <div className="layout-header">{header}</div>
      <div className="layout-subnav">{subnav}</div>
      <div className="layout-map">{map}</div>
      <div className="layout-right">{rightPanel}</div>
      <div className="layout-bottom">{bottomBar}</div>
    </div>
  )
}
