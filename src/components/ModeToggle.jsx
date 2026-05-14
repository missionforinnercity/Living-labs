import React from 'react'
import './ModeToggle.css'

const ModeToggle = ({ mode, onModeChange }) => {
  return (
    <div className="mode-toggle">
      <button
        className={`mode-button ${mode === 'narrative' ? 'active' : ''}`}
        onClick={() => onModeChange('narrative')}
      >
        Narrative Tours
      </button>
      <button
        className={`mode-button ${mode === 'explorer' ? 'active' : ''}`}
        onClick={() => onModeChange('explorer')}
      >
        Data Explorer
      </button>
    </div>
  )
}
serviceReq.sh

export default ModeToggle
