import React from 'react'
import './TemporalControls.css'

const SEASONS = [
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
  { id: 'spring', label: 'Spring' }
]

const TIMES_OF_DAY = [
  { id: '0800', label: '8 AM' },
  { id: '1400', label: '2 PM' },
  { id: '1700', label: '5 PM' },
  { id: '1900', label: '7 PM' }
]

const TemporalControls = ({ state, onChange, mode }) => {
  const handleSeasonChange = (season) => {
    onChange({ ...state, season })
  }

  const handleTimeChange = (timeOfDay) => {
    const hour = parseInt(timeOfDay.substring(0, 2))
    onChange({ ...state, timeOfDay, hour })
  }

  const handleHourChange = (e) => {
    const hour = parseInt(e.target.value)
    const timeOfDay = hour.toString().padStart(2, '0') + '00'
    onChange({ ...state, hour, timeOfDay })
  }

  return (
    <div className="temporal-controls">
      <h2>Temporal Controls</h2>
      
      <div className="control-group">
        <label className="control-label">Season</label>
        <div className="season-buttons">
          {SEASONS.map(season => (
            <button
              key={season.id}
              className={`season-button ${state.season === season.id ? 'active' : ''}`}
              onClick={() => handleSeasonChange(season.id)}
              title={season.label}
            >
              <span className="season-label">{season.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">Time of Day</label>
        <div className="time-buttons">
          {TIMES_OF_DAY.map(time => (
            <button
              key={time.id}
              className={`time-button ${state.timeOfDay === time.id ? 'active' : ''}`}
              onClick={() => handleTimeChange(time.id)}
            >
              <span className="time-label">{time.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <label className="control-label">
          Hour: {state.hour}:00
        </label>
        <input
          type="range"
          min="0"
          max="23"
          value={state.hour}
          onChange={handleHourChange}
          className="hour-slider"
        />
        <div className="hour-labels">
          <span>0:00</span>
          <span>6:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </div>

      <div className="current-time-display">
        <div className="time-display-item">
          <span className="time-display-label">Season:</span>
          <span className="time-display-value">{state.season}</span>
        </div>
        <div className="time-display-item">
          <span className="time-display-label">Time:</span>
          <span className="time-display-value">{state.timeOfDay}</span>
        </div>
        <div className="time-display-item">
          <span className="time-display-label">Hour:</span>
          <span className="time-display-value">{state.hour}:00</span>
        </div>
      </div>
    </div>
  )
}

export default TemporalControls
