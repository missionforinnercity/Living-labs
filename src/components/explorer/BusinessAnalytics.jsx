import React, { useState, useEffect } from 'react'
import { getDayName, formatHour, isBusinessOpen, getBusinessStats, BUSINESS_LIVELINESS_HEATMAP_STOPS } from '../../utils/timeUtils'
import { getOpinionStats, OPINION_THEMES } from '../../utils/opinionUtils'
import EventInsightsPanel from './EventInsightsPanel'
import './BusinessAnalytics.css'

export const AMENITY_GROUPS = [
  {
    id: 'service',
    label: 'Service Model',
    items: [
      { id: 'dineIn', label: 'Dine-in' },
      { id: 'takeout', label: 'Takeout' },
      { id: 'delivery', label: 'Delivery' },
      { id: 'reservable', label: 'Reservations' }
    ]
  },
  {
    id: 'meals',
    label: 'Meal Times',
    items: [
      { id: 'servesBreakfast', label: 'Breakfast' },
      { id: 'servesBrunch', label: 'Brunch' },
      { id: 'servesLunch', label: 'Lunch' },
      { id: 'servesDinner', label: 'Dinner' }
    ]
  },
  {
    id: 'beverages',
    label: 'Beverages',
    items: [
      { id: 'servesCoffee', label: 'Coffee' },
      { id: 'servesBeer', label: 'Beer' },
      { id: 'servesWine', label: 'Wine' },
      { id: 'servesCocktails', label: 'Cocktails' }
    ]
  },
  {
    id: 'experience',
    label: 'Experience',
    items: [
      { id: 'outdoorSeating', label: 'Outdoor seating' },
      { id: 'liveMusic', label: 'Live music' },
      { id: 'allowsDogs', label: 'Dog friendly' },
      { id: 'goodForGroups', label: 'Good for groups' },
      { id: 'goodForChildren', label: 'Kid friendly' },
      { id: 'wheelchairAccessible', label: 'Wheelchair access' }
    ]
  }
]

export const CATEGORY_GROUPS = {
  foodDining: {
    label: 'Food & Dining',
    color: '#67e8f9',
    categories: [
      'african_restaurant', 'american_restaurant', 'asian_restaurant', 'bakery', 'bar', 'bar_and_grill',
      'barbecue_restaurant', 'breakfast_restaurant', 'buffet_restaurant', 'cafe', 'cafeteria',
      'chinese_restaurant', 'coffee_shop', 'fast_food_restaurant', 'food_court', 'hamburger_restaurant',
      'indian_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'meal_takeaway',
      'mediterranean_restaurant', 'mexican_restaurant', 'night_club', 'pizza_restaurant', 'ramen_restaurant',
      'restaurant', 'seafood_restaurant', 'sushi_restaurant', 'thai_restaurant', 'vegan_restaurant', 'wine_bar'
    ]
  },
  shopping: {
    label: 'Shopping',
    color: '#f59e0b',
    categories: [
      'auto_parts_store', 'bicycle_store', 'book_store', 'cell_phone_store', 'clothing_store', 'convenience_store',
      'department_store', 'discount_store', 'drugstore', 'electronics_store', 'florist', 'furniture_store',
      'gift_shop', 'grocery_store', 'hardware_store', 'home_goods_store', 'home_improvement_store',
      'jewelry_store', 'liquor_store', 'market', 'pet_store', 'shoe_store', 'shopping_mall',
      'sporting_goods_store', 'store', 'supermarket'
    ]
  },
  lodging: {
    label: 'Lodging',
    color: '#7dd3fc',
    categories: ['bed_and_breakfast', 'hostel', 'hotel', 'lodging', 'motel']
  },
  culture: {
    label: 'Culture & Entertainment',
    color: '#c084fc',
    categories: [
      'art_gallery', 'community_center', 'convention_center', 'cultural_center', 'event_venue',
      'movie_theater', 'museum', 'performing_arts_theater', 'visitor_center'
    ]
  },
  religious: {
    label: 'Religious Buildings',
    color: '#fbbf24',
    categories: ['church', 'mosque', 'place_of_worship', 'synagogue']
  },
  health: {
    label: 'Health & Wellness',
    color: '#4ade80',
    categories: [
      'beauty_salon', 'dental_clinic', 'dentist', 'doctor', 'fitness_center', 'gym', 'hair_salon',
      'health', 'hospital', 'medical_lab', 'pharmacy', 'physiotherapist', 'spa'
    ]
  },
  education: {
    label: 'Education',
    color: '#22d3ee',
    categories: ['library', 'preschool', 'school', 'secondary_school', 'university']
  },
  financial: {
    label: 'Financial Services',
    color: '#34d399',
    categories: ['accounting', 'atm', 'bank', 'finance', 'insurance_agency', 'real_estate_agency']
  },
  transportation: {
    label: 'Transportation',
    color: '#94a3b8',
    categories: [
      'bus_station', 'car_dealer', 'car_rental', 'car_repair', 'car_wash',
      'electric_vehicle_charging_station', 'gas_station', 'parking'
    ]
  },
  recreation: {
    label: 'Recreation & Sports',
    color: '#fb7185',
    categories: ['athletic_field', 'park', 'sports_club', 'sports_complex', 'swimming_pool', 'yoga_studio']
  },
  publicServices: {
    label: 'Public Services',
    color: '#60a5fa',
    categories: ['city_hall', 'courthouse', 'embassy', 'lawyer', 'local_government_office', 'police', 'post_office']
  },
  tourist: {
    label: 'Tourist Attractions',
    color: '#38bdf8',
    categories: ['tourist_attraction']
  }
}

const formatCategoryLabel = (value) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const SALES_VIEW_OPTIONS = [
  { id: 'saleValue', label: 'Sale Value', helper: 'Total parcel sale value' },
  { id: 'pricePerSqm', label: 'Sale Price / m2', helper: 'Higher sale-price intensity streets' },
  { id: 'daysOnMarket', label: 'Time To Sell', helper: 'How long stock sits before selling' },
  { id: 'turnover', label: 'Turnover', helper: 'Repeat trading concentration' }
]

const formatRandCompact = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  if (numeric >= 1000000) return `R${(numeric / 1000000).toFixed(1)}M`
  if (numeric >= 1000) return `R${Math.round(numeric / 1000)}k`
  return `R${Math.round(numeric)}`
}

const formatPopupDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

const parseSalesRecords = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const formatSalesCategoryLabel = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (letter) => letter.toUpperCase())

const BusinessAnalytics = ({
  businessMode,
  onModeChange,
  dayOfWeek,
  hour,
  onDayChange,
  onHourChange,
  businessesData,
  streetStallsData,
  surveyData,
  salesData,
  availableSalesYears = [],
  selectedSalesYear = 'all',
  onSelectedSalesYearChange,
  salesMapView = 'saleValue',
  onSalesMapViewChange,
  salesInsights,
  salesLegend,
  selectedSalesFeature,
  onSelectedSalesFeatureChange,
  landParcelsData,
  openSpacesData,
  parcelFilters,
  onParcelFiltersChange,
  parcelInsights,
  openSpaceInsights,
  parcelColorMode = 'zoning',
  onParcelColorModeChange,
  openSpaceColorMode = 'zoning',
  onOpenSpaceColorModeChange,
  opinionSource,
  onOpinionSourceChange,
  amenitiesFilters: amenitiesFiltersProps,
  onAmenitiesFiltersChange,
  categoriesFilters,
  onCategoriesFiltersChange,
  expandedGroups,
  onExpandedGroupsChange,
  eventsData,
  eventsMonth,
  onEventsMonthChange,
  eventsScope = 'cbd',
  onEventsScopeChange,
  analyticsTitle = 'Retail',
  analyticsSubtitle = 'Explore retail patterns and insights',
  renderEventsInline = true,
  hideLayerControls = false
}) => {
  const parcelZoningColors = {
    Residential: '#1d4ed8',
    Business: '#f97316',
    'Mixed Use': '#7c3aed',
    Community: '#10b981',
    'Open Space': '#84cc16',
    Transport: '#06b6d4',
    Utility: '#fde047',
    'Limited Use': '#f43f5e',
    Other: '#0ea5e9',
    Unknown: '#475569'
  }
  const parcelValueChangeColors = {
    'Rising fast': '#16a34a',
    Rising: '#86efac',
    Stable: '#facc15',
    Dropping: '#fb923c',
    'Dropping fast': '#dc2626',
    'No comparison': '#64748b'
  }

  const updateParcelFilter = (patch) => {
    onParcelFiltersChange?.({
      ...(parcelFilters || {}),
      ...patch
    })
  }

  const toggleParcelZoningGroup = (group) => {
    const current = new Set(parcelFilters?.zoningGroups || [])
    if (current.has(group)) {
      current.delete(group)
    } else {
      current.add(group)
    }
    updateParcelFilter({ zoningGroups: [...current] })
  }

  const toggleGroup = (groupId) => {
    onExpandedGroupsChange({
      ...expandedGroups,
      [groupId]: !expandedGroups[groupId]
    })
  }

  const toggleCategory = (categoryId) => {
    onCategoriesFiltersChange({
      ...categoriesFilters,
      [categoryId]: !categoriesFilters[categoryId]
    })
  }

  const toggleAllInGroup = (groupId) => {
    const group = CATEGORY_GROUPS[groupId]
    const allChecked = group.categories.every(cat => categoriesFilters[cat])
    const updates = {}
    group.categories.forEach(cat => {
      updates[cat] = !allChecked
    })
    onCategoriesFiltersChange({
      ...categoriesFilters,
      ...updates
    })
  }
  
  const [businessStats, setBusinessStats] = useState(null)
  const [opinionStats, setOpinionStats] = useState(null)
  const [reviewStats, setReviewStats] = useState(null)
  
  // Calculate business liveliness stats
  useEffect(() => {
    if (businessMode === 'liveliness' && businessesData?.features) {
      const stats = getBusinessStats(businessesData.features, dayOfWeek, hour)
      setBusinessStats(stats)
    }
  }, [businessMode, businessesData, dayOfWeek, hour])
  
  // Calculate opinion stats
  useEffect(() => {
    if (businessMode === 'opinions') {
      const consentedData = [
        ...(opinionSource === 'formal' || opinionSource === 'both'
          ? (surveyData?.features || []).filter(f => [1, '1', '1.0', true, 'yes'].includes(f.properties.stake_consent))
          : []),
        ...(opinionSource === 'informal' || opinionSource === 'both'
          ? (streetStallsData?.features || []).filter(f => f.properties.stake_consent === 'yes')
          : [])
      ]
      setOpinionStats(consentedData.length ? getOpinionStats(consentedData, 'stake_big_change') : null)
    }
  }, [businessMode, opinionSource, surveyData, streetStallsData])
  
  // Calculate review ratings stats
  useEffect(() => {
    if (businessMode === 'ratings' && businessesData?.features) {
      const featuresWithRatings = businessesData.features.filter(f => f.properties.rating)
      const stats = {
        total: featuresWithRatings.length,
        avgRating: featuresWithRatings.reduce((sum, f) => sum + f.properties.rating, 0) / featuresWithRatings.length,
        ratingDistribution: {
          '5': featuresWithRatings.filter(f => f.properties.rating >= 4.5).length,
          '4': featuresWithRatings.filter(f => f.properties.rating >= 3.5 && f.properties.rating < 4.5).length,
          '3': featuresWithRatings.filter(f => f.properties.rating >= 2.5 && f.properties.rating < 3.5).length,
          '2': featuresWithRatings.filter(f => f.properties.rating >= 1.5 && f.properties.rating < 2.5).length,
          '1': featuresWithRatings.filter(f => f.properties.rating < 1.5).length
        }
      }
      setReviewStats(stats)
    }
  }, [businessMode, businessesData])
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const salesYearOptions = ['all', ...availableSalesYears]
  const selectedSalesYearIndex = Math.max(0, salesYearOptions.findIndex((year) => String(year) === String(selectedSalesYear)))
  const selectedSalesView = SALES_VIEW_OPTIONS.find((option) => option.id === salesMapView) || SALES_VIEW_OPTIONS[0]
  const selectedSalesProps = selectedSalesFeature?.properties || null
  const selectedSalesRecords = parseSalesRecords(selectedSalesProps?.sales_records)
  const latestSelectedSale = selectedSalesRecords[0] || null
  const selectedSalesStreet = [selectedSalesProps?.street_name, selectedSalesProps?.street_type].filter(Boolean).join(' ').trim()
  const selectedSalesCategories = Array.isArray(selectedSalesProps?.sale_categories)
    ? selectedSalesProps.sale_categories.filter(Boolean)
    : []

  return (
    <div className="business-analytics">
      <div className="analytics-header">
        <h2>{analyticsTitle}</h2>
        <p className="header-subtitle">{analyticsSubtitle}</p>
      </div>
      
      {/* Mode Selector with Radio Buttons - hidden when using category selector */}
      {!hideLayerControls && (
      <div className="mode-selector-radio">
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'liveliness'}
            onChange={() => onModeChange('liveliness')}
          />
          <span>Business Liveliness</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'opinions'}
            onChange={() => onModeChange('opinions')}
          />
          <span>Vendor Opinions</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'ratings'}
            onChange={() => onModeChange('ratings')}
          />
          <span>Review Ratings</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'amenities'}
            onChange={() => onModeChange('amenities')}
          />
          <span>Amenities</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'categories'}
            onChange={() => onModeChange('categories')}
          />
          <span>Business Categories</span>
        </label>
        
        <label className="mode-radio">
          <input
            type="radio"
            name="businessMode"
            checked={businessMode === 'events'}
            onChange={() => onModeChange('events')}
          />
          <span>City Events</span>
        </label>
      </div>
      )}
      
      {/* Layer Controls - hidden when using category selector */}
      {!hideLayerControls && (
        <div className="layer-controls">
          <h4>Map Layers</h4>
          <div className="layer-toggles">
            <div className="layer-toggle-item">
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                />
                <span>Businesses</span>
              </label>
            </div>
            
            <div className="layer-toggle-item">
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                />
                <span>Street Stalls</span>
              </label>
            </div>
            
            <div className="layer-toggle-item">
              <label className="layer-toggle">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
                />
                <span>Properties</span>
              </label>
            </div>
          </div>
        </div>
      )}
      
      {/* Business Liveliness Mode */}
      {businessMode === 'liveliness' && (
        <div className="mode-content">
          <div className="business-liveliness-hero">
            <div className="business-liveliness-hero-copy">
              <span>Business Liveliness</span>
              <h3>{getDayName(dayOfWeek)} · {formatHour(hour)}</h3>
            </div>
            {businessStats && (
              <div className="business-liveliness-hero-metric">
                <strong>{Math.round((businessStats.openBusinesses / Math.max(1, businessStats.totalBusinesses)) * 100)}%</strong>
                <small>live</small>
              </div>
            )}
          </div>

          {businessStats && (
            <div className="business-liveliness-stats">
              <div className="business-liveliness-stat">
                <span>Active now</span>
                <strong>{businessStats.openBusinesses.toLocaleString()}</strong>
              </div>
              <div className="business-liveliness-stat">
                <span>Closed now</span>
                <strong>{businessStats.closedBusinesses.toLocaleString()}</strong>
              </div>
              <div className="business-liveliness-stat">
                <span>Total mapped</span>
                <strong>{businessStats.totalBusinesses.toLocaleString()}</strong>
              </div>
              <div className="business-liveliness-stat">
                <span>Open share</span>
                <strong>{Math.round((businessStats.openBusinesses / Math.max(1, businessStats.totalBusinesses)) * 100)}%</strong>
              </div>
            </div>
          )}

          <div className="control-section business-liveliness-controls">
            <div className="business-liveliness-controls-head">
              <span>Time Controls</span>
              <strong>{formatHour(hour)}</strong>
            </div>

            <label className="control-label">
              Day: <span className="control-value">{getDayName(dayOfWeek)}</span>
            </label>
            <div className="day-buttons">
              {days.map((day, index) => (
                <button
                  key={index}
                  className={`day-button ${dayOfWeek === index ? 'active' : ''}`}
                  onClick={() => onDayChange(index)}
                  title={getDayName(index)}
                >
                  {day}
                </button>
              ))}
            </div>

            <label className="control-label">
              Time: <span className="control-value">{formatHour(hour)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="23"
              value={hour}
              onChange={(e) => onHourChange(parseInt(e.target.value))}
              className="hour-slider"
            />
            <div className="hour-labels">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
          </div>

          <div className="control-section business-liveliness-legend">
            <div className="business-liveliness-controls-head">
              <span>Heatmap Legend</span>
              <strong>Map density</strong>
            </div>
            <div className="legend-gradient">
              <div
                className="legend-bar"
                style={{
                  background: `linear-gradient(to right, ${BUSINESS_LIVELINESS_HEATMAP_STOPS.map((item) => item.color).join(', ')})`
                }}
              />
              <div className="legend-labels">
                <span>{BUSINESS_LIVELINESS_HEATMAP_STOPS[1].label}</span>
                <span>{BUSINESS_LIVELINESS_HEATMAP_STOPS.at(-1)?.label}</span>
              </div>
            </div>
            <div className="business-liveliness-legend-list">
              {BUSINESS_LIVELINESS_HEATMAP_STOPS.slice(1).map((item) => (
                <div key={item.stop}>
                  <i style={{ background: item.color }} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Opinions Mode */}
      {businessMode === 'opinions' && (
        <div className="mode-content">
          <div className="control-section">
            <div className="control-header">VENDOR CHALLENGES</div>
            <p className="mode-description">
              Showing stakeholder opinions from businesses and street vendors who consented to interviews.
            </p>
            
            {/* Opinion Source Toggle */}
            <div style={{ marginTop: '1rem' }}>
              <label className="mode-radio">
                <input
                  type="radio"
                  name="opinionSource"
                  checked={opinionSource === 'both'}
                  onChange={() => onOpinionSourceChange('both')}
                />
                <span>Both Formal & Informal</span>
              </label>
              
              <label className="mode-radio">
                <input
                  type="radio"
                  name="opinionSource"
                  checked={opinionSource === 'formal'}
                  onChange={() => onOpinionSourceChange('formal')}
                />
                <span>Formal Businesses Only</span>
              </label>
              
              <label className="mode-radio">
                <input
                  type="radio"
                  name="opinionSource"
                  checked={opinionSource === 'informal'}
                  onChange={() => onOpinionSourceChange('informal')}
                />
                <span>Street Vendors Only</span>
              </label>
            </div>
          </div>
          
          {/* Challenge Legend */}
          <div className="control-section">
            <div className="control-header">CHALLENGE LEGEND</div>
            <div className="challenge-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#ef4444' }}></div>
                <span>Crime/Safety</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#f97316' }}></div>
                <span>Competition</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#8b5cf6' }}></div>
                <span>Rent</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#eab308' }}></div>
                <span>Low Customers</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#22c55e' }}></div>
                <span>Litter</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#ec4899' }}></div>
                <span>Permits</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#3b82f6' }}></div>
                <span>Infrastructure/Parking</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#6b7280' }}></div>
                <span>Other Issues</span>
              </div>
            </div>
          </div>
          
          {opinionStats && (
            <div className="opinion-themes">
              {Object.entries(OPINION_THEMES).map(([key, theme]) => {
                const count = opinionStats.byTheme?.[key] || 0
                if (count === 0) return null
                
                return (
                  <div key={key} className="theme-item" style={{ borderLeftColor: theme.color }}>
                    <div className="theme-icon" style={{ color: theme.color }}>{theme.icon}</div>
                    <div className="theme-info">
                      <div className="theme-name">{theme.label}</div>
                      <div className="theme-count">{count} responses</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Review Ratings Mode */}
      {businessMode === 'ratings' && (
        <div className="mode-content">
          <div className="control-section">
            <div className="control-header">REVIEW RATINGS</div>
            <p className="mode-description">
              Bubble size represents review count, color represents average rating.
            </p>
          </div>
          
          {reviewStats && (
            <div className="stats-summary">
              <div className="stat-card primary">
                <div className="stat-value">{reviewStats.avgRating.toFixed(1)}</div>
                <div className="stat-label">Average Rating</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{reviewStats.total}</div>
                <div className="stat-label">Rated Businesses</div>
              </div>
            </div>
          )}
          
          {reviewStats && (
            <div className="rating-distribution">
              <div className="control-header">RATING DISTRIBUTION</div>
              {Object.entries(reviewStats.ratingDistribution).reverse().map(([star, count]) => (
                <div key={star} className="rating-bar">
                  <span className="rating-label">{'⭐'.repeat(parseInt(star))}</span>
                  <div className="bar-container">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${(count / reviewStats.total) * 100}%` }}
                    />
                  </div>
                  <span className="rating-count">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Amenities Mode */}
      {businessMode === 'amenities' && (
        <div className="mode-content">
          <div className="control-section amenities-summary-card">
            <div className="business-liveliness-controls-head">
              <span>Amenities</span>
              <strong>{Object.values(amenitiesFiltersProps || {}).filter(Boolean).length} selected</strong>
            </div>
            <p className="mode-description">
              Filter mapped businesses by service format, meal times, drinks, and customer experience.
            </p>
          </div>
          
          <div className="amenities-filters">
            {AMENITY_GROUPS.map((group) => (
              <section key={group.id} className="amenity-group">
                <div className="amenity-group-top">
                  <div className="amenity-group-label">{group.label}</div>
                  <div className="amenity-group-count">
                    {group.items.filter((item) => amenitiesFiltersProps[item.id]).length}/{group.items.length}
                  </div>
                </div>
                <div className="amenity-chip-grid">
                  {group.items.map((item) => (
                    <label key={item.id} className={`filter-checkbox amenity-chip ${amenitiesFiltersProps[item.id] ? 'is-active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={amenitiesFiltersProps[item.id] || false}
                        onChange={() => onAmenitiesFiltersChange({ ...amenitiesFiltersProps, [item.id]: !amenitiesFiltersProps[item.id] })}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      
      {/* Categories Mode */}
      {businessMode === 'categories' && (
        <div className="mode-content">
          <div className="control-section amenities-summary-card">
            <div className="business-liveliness-controls-head">
              <span>Business Categories</span>
              <strong>{Object.values(categoriesFilters || {}).filter(Boolean).length} selected</strong>
            </div>
            <p className="mode-description">
              Open a sector group to isolate specific business types and compare street-level concentration.
            </p>
          </div>
          
          <div className="categories-filters">
            {Object.entries(CATEGORY_GROUPS).map(([groupId, group]) => {
              const isExpanded = expandedGroups[groupId]
              const checkedCount = group.categories.filter(cat => categoriesFilters[cat]).length
              const totalCount = group.categories.length
              
              return (
                <div key={groupId} className="category-group">
                  <div 
                    className="category-group-header"
                    style={{ '--group-color': group.color }}
                  >
                    <button 
                      className="expand-btn"
                      onClick={() => toggleGroup(groupId)}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <label className="group-label" onClick={() => toggleGroup(groupId)}>
                      <span>{group.label}</span>
                      {checkedCount > 0 && (
                        <span className="count-badge">
                          {checkedCount}/{totalCount}
                        </span>
                      )}
                    </label>
                    <button
                      className="select-all-btn"
                      onClick={() => toggleAllInGroup(groupId)}
                      title={checkedCount === totalCount ? 'Deselect all' : 'Select all'}
                    >
                      {checkedCount === totalCount ? 'Clear' : 'All'}
                    </button>
                  </div>
                  
                  {isExpanded && (
                    <div className="category-group-items">
                      {group.categories.map(categoryId => (
                        <label key={categoryId} className="filter-checkbox subcategory">
                          <input 
                            type="checkbox"
                            checked={categoriesFilters[categoryId] || false}
                            onChange={() => toggleCategory(categoryId)}
                          />
                          <span>{formatCategoryLabel(categoryId)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      
      {/* Parcel Sales Mode */}
      {businessMode === 'parcelSales' && salesData && (
        <div className="mode-content">
          <div className="control-section sales-hero-card">
            <div className="business-liveliness-controls-head">
              <span>CBD Sales Market</span>
              <strong>{salesInsights?.yearLabel || 'All years'}</strong>
            </div>
            <p className="mode-description">
              Sales are matched to land parcels by `SL` key. Use the year slider and lens controls to inspect value, intensity, time to sell, and turnover patterns across the CBD.
            </p>
          </div>

          <div className="control-section sales-selection-card">
            <div className="business-liveliness-controls-head">
              <span>Selected Parcel</span>
              <strong>{selectedSalesFeature ? 'Parcel details' : 'Click a parcel'}</strong>
            </div>
            {selectedSalesFeature ? (
              <div className="sales-selection-detail">
                <div className="sales-selection-title-row">
                  <div>
                    <h4>{selectedSalesProps?.address || selectedSalesProps?.prty_nmbr || selectedSalesStreet || 'Sales Parcel'}</h4>
                    <p>{[selectedSalesStreet || null, selectedSalesProps?.zoning || null].filter(Boolean).join(' · ') || 'CBD sales parcel'}</p>
                  </div>
                  <button
                    type="button"
                    className="sales-selection-clear"
                    onClick={() => onSelectedSalesFeatureChange?.(null)}
                  >
                    Clear
                  </button>
                </div>

                <div className="sales-selection-grid">
                  <div className="sales-selection-metric">
                    <span>Sales count</span>
                    <strong>{(Number(selectedSalesProps?.sales_count) || 0).toLocaleString()}</strong>
                  </div>
                  <div className="sales-selection-metric">
                    <span>Total value</span>
                    <strong>{formatRandCompact(selectedSalesProps?.total_sale_price)}</strong>
                  </div>
                  <div className="sales-selection-metric">
                    <span>Avg price / m2</span>
                    <strong>{formatRandCompact(selectedSalesProps?.avg_rate_per_m2)}</strong>
                  </div>
                  <div className="sales-selection-metric">
                    <span>Avg days to sell</span>
                    <strong>{Number.isFinite(Number(selectedSalesProps?.avg_days_on_market)) ? `${Number(selectedSalesProps.avg_days_on_market).toFixed(0)} days` : '—'}</strong>
                  </div>
                </div>

                <div className="sales-selection-meta">
                  <span>Latest sale: {formatPopupDate(latestSelectedSale?.sale_date || selectedSalesProps?.latest_sale_date)}</span>
                  <span>Area: {Number.isFinite(Number(selectedSalesProps?.area_m2)) ? `${Number(selectedSalesProps.area_m2).toLocaleString(undefined, { maximumFractionDigits: 0 })} m2` : '—'}</span>
                  <span>Ownership: {selectedSalesProps?.is_city_owned ? 'City owned' : (selectedSalesProps?.owner_type || 'Unknown')}</span>
                </div>

                {selectedSalesCategories.length > 0 && (
                  <div className="sales-selection-tags">
                    {selectedSalesCategories.slice(0, 4).map((category) => (
                      <span key={category}>{formatSalesCategoryLabel(category)}</span>
                    ))}
                  </div>
                )}

                {latestSelectedSale && (
                  <div className="sales-selection-transaction">
                    <span>Latest transaction</span>
                    <strong>{formatRandCompact(latestSelectedSale.sale_price)}</strong>
                    <em>
                      {[
                        latestSelectedSale.property || latestSelectedSale.address || null,
                        Number.isFinite(Number(latestSelectedSale.rate_per_m2)) ? `${formatRandCompact(latestSelectedSale.rate_per_m2)}/m2` : null,
                        Number.isFinite(Number(latestSelectedSale.days_on_market)) ? `${Number(latestSelectedSale.days_on_market).toFixed(0)} days on market` : null
                      ].filter(Boolean).join(' · ')}
                    </em>
                  </div>
                )}
              </div>
            ) : (
              <p className="sales-selection-empty">
                Click any sales parcel on the map to inspect the property in this side panel.
              </p>
            )}
          </div>

          <div className="sales-sidebar-grid">
            <div className="sales-mini-card">
              <span>Sales Count</span>
              <strong>{(salesInsights?.summary?.salesCount || 0).toLocaleString()}</strong>
            </div>
            <div className="sales-mini-card">
              <span>Avg Days To Sell</span>
              <strong>{Number.isFinite(salesInsights?.summary?.avgDaysOnMarket) ? `${salesInsights.summary.avgDaysOnMarket.toFixed(0)}d` : '—'}</strong>
            </div>
            <div className="sales-mini-card">
              <span>Avg Sale Price / m2</span>
              <strong>{formatRandCompact(salesInsights?.summary?.avgRatePerSqm)}</strong>
            </div>
            <div className="sales-mini-card">
              <span>Peak Month</span>
              <strong>{salesInsights?.summary?.peakMonth?.name || '—'}</strong>
            </div>
          </div>

          <div className="control-section sales-year-card">
            <div className="business-liveliness-controls-head">
              <span>Year Filter</span>
              <strong>{selectedSalesYear === 'all' ? 'All years' : selectedSalesYear}</strong>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(0, salesYearOptions.length - 1)}
              value={selectedSalesYearIndex}
              onChange={(event) => onSelectedSalesYearChange?.(salesYearOptions[Number(event.target.value)] || 'all')}
              className="sales-year-slider"
              disabled={salesYearOptions.length <= 1}
            />
            <div className="sales-year-scale">
              {salesYearOptions.map((year, index) => (
                <button
                  key={`${year}-${index}`}
                  type="button"
                  className={`sales-year-tick ${index === selectedSalesYearIndex ? 'is-active' : ''}`}
                  onClick={() => onSelectedSalesYearChange?.(year)}
                >
                  {year === 'all' ? 'All' : year}
                </button>
              ))}
            </div>
          </div>

          <div className="control-section sales-view-card">
            <div className="business-liveliness-controls-head">
              <span>Map Lenses</span>
              <strong>{selectedSalesView.label}</strong>
            </div>
            <div className="sales-view-switcher">
              {SALES_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={salesMapView === option.id ? 'active' : ''}
                  onClick={() => onSalesMapViewChange?.(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="sales-view-helper">{selectedSalesView.helper}</p>
            {salesLegend && (
              <div className="sales-sidebar-legend" aria-label="Sales lens colour legend">
                <div className="sales-sidebar-legend-top">
                  <span>{salesLegend.title}</span>
                  <strong>Colour Key</strong>
                </div>
                <p className="sales-sidebar-legend-subtitle">{salesLegend.subtitle}</p>
                <div className="sales-sidebar-legend-gradient" style={{ background: salesLegend.gradient }} />
                <div className="sales-sidebar-legend-scale">
                  {salesLegend.scale.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="sales-sidebar-legend-items">
                  {salesLegend.items.map((item) => (
                    <div key={item.label}>
                      <i style={{ background: item.color }} />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <p className="sales-sidebar-legend-note">{salesLegend.note}</p>
              </div>
            )}
          </div>

          <div className="control-section sales-seasonality-card">
            <div className="sales-panel-topline">
              <span>Seasonality</span>
              <strong>{Number.isFinite(salesInsights?.summary?.monthlyMean) ? `${salesInsights.summary.monthlyMean.toFixed(1)} monthly mean` : 'No trend yet'}</strong>
            </div>
            <div className="sales-mini-bars" aria-hidden="true">
              {(salesInsights?.monthly || []).map((entry) => {
                const peak = salesInsights?.summary?.peakMonth?.name
                const low = salesInsights?.summary?.lowMonth?.name
                const maxSales = Math.max(1, ...(salesInsights?.monthly || []).map((item) => item.sales || 0))
                const height = `${Math.max(24, ((entry.sales || 0) / maxSales) * 68)}px`
                const className = entry.name === peak ? 'is-peak' : entry.name === low ? 'is-low' : ''
                return (
                  <div key={entry.name} className="sales-mini-bar-col">
                    <i className={className} style={{ height }} />
                    <span>{entry.name}</span>
                  </div>
                )
              })}
            </div>
            <div className="sales-seasonality-summary">
              <div className="sales-seasonality-card sales-seasonality-card--peak">
                <span>Peak</span>
                <strong>{salesInsights?.summary?.peakMonth?.name || '—'}</strong>
                <em>{(salesInsights?.summary?.peakMonth?.sales || 0).toLocaleString()} sales</em>
              </div>
              <div className="sales-seasonality-card sales-seasonality-card--low">
                <span>Low</span>
                <strong>{salesInsights?.summary?.lowMonth?.name || '—'}</strong>
                <em>{(salesInsights?.summary?.lowMonth?.sales || 0).toLocaleString()} sales</em>
              </div>
            </div>
          </div>

          <div className="control-section sales-leader-card">
            <div className="control-header">Street Leaders</div>
            <div className="sales-leader-list">
              <div className="sales-leader-item">
                <span>Longest time to sell</span>
                <strong>{salesInsights?.streetLeaders?.slowestStreet?.name || '—'}</strong>
                <em>{Number.isFinite(salesInsights?.streetLeaders?.slowestStreet?.avgDaysOnMarket) ? `${salesInsights.streetLeaders.slowestStreet.avgDaysOnMarket.toFixed(0)} days avg` : 'No days-on-market data'}</em>
              </div>
              <div className="sales-leader-item">
                <span>Highest sale price per m2</span>
                <strong>{salesInsights?.streetLeaders?.highestValueStreet?.name || '—'}</strong>
                <em>{formatRandCompact(salesInsights?.streetLeaders?.highestValueStreet?.avgRatePerSqm)} avg intensity</em>
              </div>
              <div className="sales-leader-item">
                <span>Most sales</span>
                <strong>{salesInsights?.streetLeaders?.highestVolumeStreet?.name || '—'}</strong>
                <em>{(salesInsights?.streetLeaders?.highestVolumeStreet?.salesCount || 0).toLocaleString()} transactions</em>
              </div>
              <div className="sales-leader-item">
                <span>Highest turnover</span>
                <strong>{salesInsights?.streetLeaders?.highestTurnoverStreet?.name || '—'}</strong>
                <em>{Number.isFinite(salesInsights?.streetLeaders?.highestTurnoverStreet?.turnoverIndex) ? `${salesInsights.streetLeaders.highestTurnoverStreet.turnoverIndex.toFixed(1)} sales per parcel` : 'No turnover signal yet'}</em>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Land Parcels Mode */}
      {businessMode === 'parcels' && (
        <div className="mode-content">
          <div className="control-section parcel-command-panel">
            <div className="control-header">LAND PARCEL FILTERS</div>
            <p className="mode-description">
              Combine cadastral parcels with mapped open spaces such as parking lots, grass patches, public walkways, and open parking areas.
            </p>

            <input
              className="parcel-search-input"
              type="search"
              value={parcelFilters?.search || ''}
              onChange={(event) => updateParcelFilter({ search: event.target.value })}
              placeholder="Search erf, address, zoning..."
            />

            <div className="parcel-toggle-row">
              <label className="filter-checkbox parcel-toggle">
                <input
                  type="checkbox"
                  checked={parcelFilters?.cityOwnedOnly || false}
                  onChange={() => updateParcelFilter({ cityOwnedOnly: !parcelFilters?.cityOwnedOnly })}
                />
                <span>City owned only</span>
              </label>
            </div>

            <div className="parcel-range-grid">
              <label>
                <span>Min value</span>
                <input
                  type="number"
                  value={parcelFilters?.minMarketValue || ''}
                  onChange={(event) => updateParcelFilter({ minMarketValue: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span>Max value</span>
                <input
                  type="number"
                  value={parcelFilters?.maxMarketValue || ''}
                  onChange={(event) => updateParcelFilter({ maxMarketValue: event.target.value })}
                  placeholder="Any"
                />
              </label>
              <label>
                <span>Min area m2</span>
                <input
                  type="number"
                  value={parcelFilters?.minArea || ''}
                  onChange={(event) => updateParcelFilter({ minArea: event.target.value })}
                  placeholder="0"
                />
              </label>
              <label>
                <span>Max area m2</span>
                <input
                  type="number"
                  value={parcelFilters?.maxArea || ''}
                  onChange={(event) => updateParcelFilter({ maxArea: event.target.value })}
                  placeholder="Any"
                />
              </label>
            </div>

            <button
              className="parcel-reset-btn"
              type="button"
              onClick={() => onParcelFiltersChange?.({
                cityOwnedOnly: false,
                zoningGroups: [],
                minMarketValue: '',
                maxMarketValue: '',
                minArea: '',
                maxArea: '',
                search: ''
              })}
            >
              Reset filters
            </button>
          </div>

          <div className="control-section">
            <div className="control-header">COLOUR MAP BY</div>
            <div className="parcel-color-mode-switch">
              <button
                type="button"
                className={parcelColorMode === 'zoning' ? 'active' : ''}
                onClick={() => onParcelColorModeChange?.('zoning')}
              >
                Zoning
              </button>
              <button
                type="button"
                className={parcelColorMode === 'valueChange' ? 'active' : ''}
                onClick={() => onParcelColorModeChange?.('valueChange')}
              >
                GV Change
              </button>
            </div>
          </div>

          <div className="control-section">
            <div className="control-header">OPEN SPACES COLOUR</div>
            <div className="parcel-color-mode-switch">
              <button
                type="button"
                className={openSpaceColorMode === 'zoning' ? 'active' : ''}
                onClick={() => onOpenSpaceColorModeChange?.('zoning')}
              >
                Zoning
              </button>
              <button
                type="button"
                className={openSpaceColorMode === 'priority' ? 'active' : ''}
                onClick={() => onOpenSpaceColorModeChange?.('priority')}
              >
                Priority Score
              </button>
            </div>
          </div>

          <div className="control-section">
            <div className="control-header">ZONING GROUPS</div>
            <div className="parcel-zoning-grid">
              {(parcelInsights?.zoningGroups || []).map((group) => {
                const selected = (parcelFilters?.zoningGroups || []).includes(group)
                return (
                  <button
                    key={group}
                    type="button"
                    className={`parcel-zoning-chip ${selected ? 'active' : ''}`}
                    onClick={() => toggleParcelZoningGroup(group)}
                    style={{ '--parcel-color': parcelZoningColors[group] || parcelZoningColors.Other }}
                  >
                    <span className="parcel-zoning-dot" />
                    <span>{group}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="stats-summary parcel-stats-summary">
            <div className="stat-card primary">
              <div className="stat-value">{(landParcelsData?.features?.length || 0).toLocaleString()}</div>
              <div className="stat-label">Parcels</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(parcelInsights?.summary?.cityOwned || 0).toLocaleString()}</div>
              <div className="stat-label">City Owned</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(((parcelInsights?.summary?.totalAreaM2 || 0) / 10000).toFixed(1))}</div>
              <div className="stat-label">Hectares</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(openSpacesData?.features?.length || 0).toLocaleString()}</div>
              <div className="stat-label">Open Spaces</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{(((openSpaceInsights?.summary?.totalAreaM2 || 0) / 10000).toFixed(1))}</div>
              <div className="stat-label">Open ha</div>
            </div>
          </div>

          <div className="control-section">
            <div className="control-header">{parcelColorMode === 'valueChange' ? 'GV CHANGE LEGEND' : 'MAP LEGEND'}</div>
            <div className="parcel-legend">
              {Object.entries(parcelColorMode === 'valueChange' ? parcelValueChangeColors : parcelZoningColors).map(([group, color]) => (
                <div key={group} className="legend-item">
                  <div className="legend-color" style={{ backgroundColor: color }}></div>
                  <span>{group}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* City Events Mode */}
      {businessMode === 'events' && (
        <EventInsightsPanel
          eventsData={eventsData}
          eventsMonth={eventsMonth}
          onEventsMonthChange={onEventsMonthChange}
          eventsScope={eventsScope}
          onEventsScopeChange={onEventsScopeChange}
          variant="sidebar"
          detailLevel="summary"
        />
      )}
    </div>
  )
}

export default BusinessAnalytics
