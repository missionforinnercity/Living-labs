import React from 'react'
import './NarrativeTours.css'

const TOURS = [
  {
    id: 'evening-walk',
    title: 'Perfect Evening Walk',
    description: 'Discover well-lit, connected streets with active businesses after 6 PM',
    layers: { walkability: true, lighting: true, business: true },
    temporal: { season: 'summer', timeOfDay: '1900', hour: 19 }
  },
  {
    id: 'outdoor-dining',
    title: 'Outdoor Dining Finder',
    description: 'Find shaded, comfortable spots with outdoor seating',
    layers: { shade: true, business: true },
    temporal: { season: 'summer', timeOfDay: '1400', hour: 14 }
  },
  {
    id: 'cultural-circuit',
    title: 'Cultural Circuit',
    description: 'Explore galleries, lighting projects, and event venues',
    layers: { publicArt: true, lighting: true, business: true },
    temporal: { season: 'autumn', timeOfDay: '1700', hour: 17 }
  },
  {
    id: 'cool-summer-route',
    title: 'Cool Summer Route',
    description: 'Navigate the coolest, most shaded paths during hot days',
    layers: { shade: true, walkability: true },
    temporal: { season: 'summer', timeOfDay: '1400', hour: 14 }
  },
  {
    id: 'retail-vibrancy',
    title: 'Retail Vibrancy Tour',
    description: 'Discover bustling streets with high-rated businesses',
    layers: { business: true, walkability: true },
    temporal: { season: 'autumn', timeOfDay: '1400', hour: 14 }
  }
]

const THEMES = [
  {
    id: 'seating-greening',
    title: 'Seating & Greening',
    color: '#4caf50',
    layers: ['shade']
  },
  {
    id: 'lighting',
    title: 'Lighting',
    color: '#ff9800',
    layers: ['lighting']
  },
  {
    id: 'walking-wayfinding',
    title: 'Walking & Wayfinding',
    color: '#2196f3',
    layers: ['walkability']
  },
  {
    id: 'retail-curation',
    title: 'Retail Curation',
    color: '#e91e63',
    layers: ['business']
  },
  {
    id: 'public-art',
    title: 'Public Art & Events',
    color: '#9c27b0',
    layers: ['publicArt']
  }
]

const NarrativeTours = ({ selectedTour, onTourSelect, onLayersChange, onTemporalChange }) => {
  const handleTourClick = (tour) => {
    onTourSelect(tour.id)
    onLayersChange(tour.layers)
    onTemporalChange(prev => ({ ...prev, ...tour.temporal }))
  }

  const handleThemeClick = (theme) => {
    const newLayers = {}
    theme.layers.forEach(layer => {
      newLayers[layer] = true
    })
    onLayersChange(newLayers)
  }

  return (
    <div className="narrative-tours">
      <section className="tours-section">
        <h2>Curated Tours</h2>
        <div className="tours-list">
          {TOURS.map(tour => (
            <button
              key={tour.id}
              className={`tour-card ${selectedTour === tour.id ? 'active' : ''}`}
              onClick={() => handleTourClick(tour)}
            >
              <div className="tour-content">
                <h3>{tour.title}</h3>
                <p>{tour.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="themes-section">
        <h2>Thematic Layers</h2>
        <div className="themes-list">
          {THEMES.map(theme => (
            <button
              key={theme.id}
              className="theme-card"
              style={{ borderLeft: `4px solid ${theme.color}` }}
              onClick={() => handleThemeClick(theme)}
            >
              <span className="theme-title">{theme.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export default NarrativeTours
