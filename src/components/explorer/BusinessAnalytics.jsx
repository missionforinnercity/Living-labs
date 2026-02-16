import React, { useState, useEffect } from 'react'
import { getDayName, formatHour, isBusinessOpen, getBusinessStats } from '../../utils/timeUtils'
import { getOpinionStats, OPINION_THEMES } from '../../utils/opinionUtils'
import './BusinessAnalytics.css'

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
  propertiesData,
  opinionSource,
  onOpinionSourceChange,
  amenitiesFilters: amenitiesFiltersProps,
  onAmenitiesFiltersChange,
  categoriesFilters,
  onCategoriesFiltersChange,
  expandedGroups,
  onExpandedGroupsChange,
  hideLayerControls = false
}) => {
  // Define hierarchical category structure
  const CATEGORY_GROUPS = {
    'foodDining': {
      label: '🍽️ Food & Dining',
      color: '#ff6b35',
      categories: [
        'african_restaurant', 'american_restaurant', 'asian_restaurant', 'bakery', 'bar', 'bar_and_grill',
        'barbecue_restaurant', 'breakfast_restaurant', 'buffet_restaurant', 'cafe', 'cafeteria',
        'chinese_restaurant', 'coffee_shop', 'fast_food_restaurant', 'food_court', 'hamburger_restaurant',
        'indian_restaurant', 'italian_restaurant', 'japanese_restaurant', 'korean_restaurant', 'meal_takeaway',
        'mediterranean_restaurant', 'mexican_restaurant', 'night_club', 'pizza_restaurant', 'ramen_restaurant',
        'restaurant', 'seafood_restaurant', 'sushi_restaurant', 'thai_restaurant', 'vegan_restaurant', 'wine_bar'
      ]
    },
    'shopping': {
      label: '🛍️ Shopping',
      color: '#c44569',
      categories: [
        'auto_parts_store', 'bicycle_store', 'book_store', 'cell_phone_store', 'clothing_store', 'convenience_store',
        'department_store', 'discount_store', 'drugstore', 'electronics_store', 'florist', 'furniture_store',
        'gift_shop', 'grocery_store', 'hardware_store', 'home_goods_store', 'home_improvement_store',
        'jewelry_store', 'liquor_store', 'market', 'pet_store', 'shoe_store', 'shopping_mall',
        'sporting_goods_store', 'store', 'supermarket'
      ]
    },
    'lodging': {
      label: '🏨 Lodging',
      color: '#4a90e2',
      categories: ['bed_and_breakfast', 'hostel', 'hotel', 'lodging', 'motel']
    },
    'culture': {
      label: '🎭 Culture & Entertainment',
      color: '#e056fd',
      categories: [
        'art_gallery', 'community_center', 'convention_center', 'cultural_center', 'event_venue',
        'movie_theater', 'museum', 'performing_arts_theater', 'visitor_center'
      ]
    },
    'religious': {
      label: '⛪ Religious Buildings',
      color: '#f7b731',
      categories: ['church', 'mosque', 'place_of_worship', 'synagogue']
    },
    'health': {
      label: '🏥 Health & Wellness',
      color: '#5cd65c',
      categories: [
        'beauty_salon', 'dental_clinic', 'dentist', 'doctor', 'fitness_center', 'gym', 'hair_salon',
        'health', 'hospital', 'medical_lab', 'pharmacy', 'physiotherapist', 'spa'
      ]
    },
    'education': {
      label: '🎓 Education',
      color: '#0fb9b1',
      categories: ['library', 'preschool', 'school', 'secondary_school', 'university']
    },
    'financial': {
      label: '🏦 Financial Services',
      color: '#20bf6b',
      categories: ['accounting', 'atm', 'bank', 'finance', 'insurance_agency', 'real_estate_agency']
    },
    'transportation': {
      label: '🚗 Transportation',
      color: '#778ca3',
      categories: [
        'bus_station', 'car_dealer', 'car_rental', 'car_repair', 'car_wash',
        'electric_vehicle_charging_station', 'gas_station', 'parking'
      ]
    },
    'recreation': {
      label: '⚽ Recreation & Sports',
      color: '#fa8231',
      categories: ['athletic_field', 'park', 'sports_club', 'sports_complex', 'swimming_pool', 'yoga_studio']
    },
    'publicServices': {
      label: '🏛️ Public Services',
      color: '#4b7bec',
      categories: ['city_hall', 'courthouse', 'embassy', 'lawyer', 'local_government_office', 'police', 'post_office']
    },
    'tourist': {
      label: '📸 Tourist Attractions',
      color: '#45aaf2',
      categories: ['tourist_attraction']
    }
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
    if (businessMode === 'opinions' && surveyData?.features && streetStallsData?.features) {
      // Combine survey and street stalls data with stake_consent=yes
      const consentedData = [
        ...surveyData.features.filter(f => f.properties.stake_consent === 'yes'),
        ...streetStallsData.features.filter(f => f.properties.stake_consent === 'yes')
      ]
      const stats = getOpinionStats(consentedData, 'stake_big_change')
      setOpinionStats(stats)
    }
  }, [businessMode, surveyData, streetStallsData])
  
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

  return (
    <div className="business-analytics">
      <div className="analytics-header">
        <h2>Business Analytics</h2>
        <p className="header-subtitle">Explore business patterns and insights</p>
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
            checked={businessMode === 'property'}
            onChange={() => onModeChange('property')}
          />
          <span>Property Sales</span>
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
          {/* Time Controls */}
          <div className="control-section">
            <div className="control-header">TIME CONTROLS</div>
            
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
          
          {/* Stats Display */}
          {businessStats && (
            <div className="stats-summary">
              <div className="stat-card primary">
                <div className="stat-value">{businessStats.openBusinesses}</div>
                <div className="stat-label">Businesses Open</div>
                <div className="stat-percentage">
                  {Math.round((businessStats.openBusinesses / businessStats.totalBusinesses) * 100)}% of total
                </div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{businessStats.closedBusinesses}</div>
                <div className="stat-label">Closed</div>
              </div>
              
              <div className="stat-card">
                <div className="stat-value">{businessStats.totalBusinesses}</div>
                <div className="stat-label">Total</div>
              </div>
            </div>
          )}
          
          {/* Legend */}
          <div className="legend-section">
            <div className="control-header">HEATMAP LEGEND</div>
            <div className="legend-gradient">
              <div className="legend-bar"></div>
              <div className="legend-labels">
                <span>Low Activity</span>
                <span>High Activity</span>
              </div>
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
                const count = opinionStats[key] || 0
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
          <div className="control-section">
            <div className="control-header">FILTER BY AMENITIES</div>
            <p className="mode-description">
              Select amenities to filter businesses on the map.
            </p>
          </div>
          
          <div className="amenities-filters">
            {/* Dining Options */}
            <div className="amenity-group">
              <div className="amenity-group-label">Dining Options</div>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.dineIn || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, dineIn: !amenitiesFiltersProps.dineIn})} />
                <span>🍽️ Dine-in</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.takeout || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, takeout: !amenitiesFiltersProps.takeout})} />
                <span>🥡 Takeout</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.delivery || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, delivery: !amenitiesFiltersProps.delivery})} />
                <span>🚚 Delivery</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.reservable || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, reservable: !amenitiesFiltersProps.reservable})} />
                <span>📅 Reservations</span>
              </label>
            </div>

            {/* Meals */}
            <div className="amenity-group">
              <div className="amenity-group-label">Meals</div>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesBreakfast || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesBreakfast: !amenitiesFiltersProps.servesBreakfast})} />
                <span>🌅 Breakfast</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesBrunch || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesBrunch: !amenitiesFiltersProps.servesBrunch})} />
                <span>🥐 Brunch</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesLunch || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesLunch: !amenitiesFiltersProps.servesLunch})} />
                <span>🥗 Lunch</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesDinner || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesDinner: !amenitiesFiltersProps.servesDinner})} />
                <span>🍝 Dinner</span>
              </label>
            </div>

            {/* Beverages */}
            <div className="amenity-group">
              <div className="amenity-group-label">Beverages</div>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesCoffee || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesCoffee: !amenitiesFiltersProps.servesCoffee})} />
                <span>☕ Coffee</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesBeer || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesBeer: !amenitiesFiltersProps.servesBeer})} />
                <span>🍺 Beer</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesWine || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesWine: !amenitiesFiltersProps.servesWine})} />
                <span>🍷 Wine</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.servesCocktails || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, servesCocktails: !amenitiesFiltersProps.servesCocktails})} />
                <span>🍹 Cocktails</span>
              </label>
            </div>

            {/* Features */}
            <div className="amenity-group">
              <div className="amenity-group-label">Features</div>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.outdoorSeating || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, outdoorSeating: !amenitiesFiltersProps.outdoorSeating})} />
                <span>🌳 Outdoor Seating</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.liveMusic || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, liveMusic: !amenitiesFiltersProps.liveMusic})} />
                <span>🎵 Live Music</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.allowsDogs || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, allowsDogs: !amenitiesFiltersProps.allowsDogs})} />
                <span>🐕 Dog Friendly</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.goodForGroups || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, goodForGroups: !amenitiesFiltersProps.goodForGroups})} />
                <span>👥 Good for Groups</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.goodForChildren || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, goodForChildren: !amenitiesFiltersProps.goodForChildren})} />
                <span>👶 Kid Friendly</span>
              </label>
              <label className="filter-checkbox">
                <input type="checkbox" checked={amenitiesFiltersProps.wheelchairAccessible || false}
                  onChange={() => onAmenitiesFiltersChange({...amenitiesFiltersProps, wheelchairAccessible: !amenitiesFiltersProps.wheelchairAccessible})} />
                <span>♿ Wheelchair Accessible</span>
              </label>
            </div>
          </div>
        </div>
      )}
      
      {/* Categories Mode */}
      {businessMode === 'categories' && (
        <div className="mode-content">
          <div className="control-section">
            <div className="control-header">BUSINESS CATEGORIES</div>
            <p className="mode-description">
              Click on a category group to expand and select specific types.
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
                    style={{ borderLeft: `4px solid ${group.color}` }}
                  >
                    <button 
                      className="expand-btn"
                      onClick={() => toggleGroup(groupId)}
                      style={{ color: group.color }}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    <label className="group-label" onClick={() => toggleGroup(groupId)}>
                      <span style={{ color: group.color }}>{group.label}</span>
                      {checkedCount > 0 && (
                        <span 
                          className="count-badge"
                          style={{ 
                            color: group.color,
                            background: `${group.color}20`,
                            borderColor: `${group.color}40`
                          }}
                        >
                          {checkedCount}/{totalCount}
                        </span>
                      )}
                    </label>
                    <button
                      className="select-all-btn"
                      onClick={() => toggleAllInGroup(groupId)}
                      title={checkedCount === totalCount ? 'Deselect all' : 'Select all'}
                      style={{ 
                        color: group.color,
                        borderColor: `${group.color}60`
                      }}
                    >
                      {checkedCount === totalCount ? '☑' : '☐'}
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
                          <span>{categoryId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
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
      
      {/* Property Sales Mode */}
      {businessMode === 'property' && propertiesData && (
        <div className="mode-content">
          <div className="control-section">
            <div className="control-header">PROPERTY SALES</div>
            <p className="mode-description">
              Bubble size shows number of transfers, color intensity shows total transaction value.
            </p>
          </div>
          
          {/* Bubble Size Legend */}
          <div className="control-section">
            <div className="control-header">BUBBLE SIZE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '16px', 
                  height: '16px', 
                  borderRadius: '50%', 
                  backgroundColor: '#3b82f6',
                  border: '2px solid #fff'
                }}></div>
                <span style={{ fontSize: '0.875rem', color: '#e8f5e9' }}>1-2 sales</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '28px', 
                  height: '28px', 
                  borderRadius: '50%', 
                  backgroundColor: '#3b82f6',
                  border: '2px solid #fff'
                }}></div>
                <span style={{ fontSize: '0.875rem', color: '#e8f5e9' }}>5-10 sales</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ 
                  width: '44px', 
                  height: '44px', 
                  borderRadius: '50%', 
                  backgroundColor: '#3b82f6',
                  border: '2px solid #fff'
                }}></div>
                <span style={{ fontSize: '0.875rem', color: '#e8f5e9' }}>20+ sales</span>
              </div>
            </div>
          </div>
          
          {/* Color Legend */}
          <div className="control-section">
            <div className="control-header">TRANSACTION VALUE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#dbeafe' }}></div>
                <span>Under R1M</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#60a5fa' }}></div>
                <span>R5M - R10M</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#3b82f6' }}></div>
                <span>R10M - R20M</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#2563eb' }}></div>
                <span>R20M - R50M</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#1e40af' }}></div>
                <span>Over R100M</span>
              </div>
            </div>
          </div>
          
          <div className="stats-summary">
            <div className="stat-card primary">
              <div className="stat-value">{propertiesData.features.length}</div>
              <div className="stat-label">Properties</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessAnalytics
