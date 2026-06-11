/**
 * Time utility functions for business opening hours
 */

/**
 * Check if a business is open at a specific day and hour
 * @param {Object} business - The business feature from GeoJSON
 * @param {number} dayOfWeek - 0=Sunday, 1=Monday, ..., 6=Saturday
 * @param {number} hour - Hour in 24-hour format (0-23)
 * @returns {boolean} - True if business is open
 */
export function isBusinessOpen(business, dayOfWeek, hour) {
  const properties = business.properties || business;
  
  // Check if business is operational (handle both old and new format)
  const businessStatus = properties.businessStatus || properties.google_business_status;
  if (businessStatus !== 'OPERATIONAL') {
    return false;
  }
  
  // Parse periods from new or old format
  let periods = [];
  
  // Try new format first (regularOpeningHours)
  if (properties.regularOpeningHours) {
    const openingHours = typeof properties.regularOpeningHours === 'string'
      ? JSON.parse(properties.regularOpeningHours)
      : properties.regularOpeningHours;
    periods = openingHours.periods || [];
  }
  // Try currentOpeningHours
  else if (properties.currentOpeningHours) {
    const openingHours = typeof properties.currentOpeningHours === 'string'
      ? JSON.parse(properties.currentOpeningHours)
      : properties.currentOpeningHours;
    periods = openingHours.periods || [];
  }
  // Fall back to old format
  else if (properties.google_periods) {
    try {
      periods = typeof properties.google_periods === 'string' 
        ? JSON.parse(properties.google_periods)
        : properties.google_periods;
    } catch (e) {
      console.warn('Failed to parse google_periods', e);
      return false;
    }
  } else if (properties.google_opening_hours_json) {
    try {
      const openingHours = typeof properties.google_opening_hours_json === 'string'
        ? JSON.parse(properties.google_opening_hours_json)
        : properties.google_opening_hours_json;
      periods = openingHours.periods || [];
    } catch (e) {
      console.warn('Failed to parse google_opening_hours_json', e);
      return false;
    }
  }
  
  if (!periods || periods.length === 0) {
    return false;
  }
  
  // Check if business is open 24 hours
  if (periods.length === 1 && !periods[0].close) {
    return true;
  }
  
  // Check each period
  for (const period of periods) {
    if (!period.open) continue;
    
    const openDay = period.open.day;
    const openHour = period.open.hour || 0;
    const openMinute = period.open.minute || 0;
    
    // If no close time, assume open until end of day
    const closeDay = period.close?.day ?? openDay;
    const closeHour = period.close?.hour ?? 23;
    const closeMinute = period.close?.minute ?? 59;
    
    // Convert everything to minutes since start of week for easier comparison
    const currentTime = dayOfWeek * 24 * 60 + hour * 60;
    const openTime = openDay * 24 * 60 + openHour * 60 + openMinute;
    let closeTime = closeDay * 24 * 60 + closeHour * 60 + closeMinute;
    
    // Handle periods that span across days
    if (closeTime < openTime) {
      closeTime += 7 * 24 * 60; // Add a week
    }
    
    // Check if current time falls within this period
    if (currentTime >= openTime && currentTime < closeTime) {
      return true;
    }
    
    // Also check wrapped around week (for periods crossing week boundary)
    const currentTimeWrapped = currentTime + 7 * 24 * 60;
    if (currentTimeWrapped >= openTime && currentTimeWrapped < closeTime) {
      return true;
    }
  }
  
  return false;
}

export const BUSINESS_LIVELINESS_HEATMAP_STOPS = [
  { stop: 0, color: 'rgba(33, 102, 172, 0)', label: 'No visible cluster' },
  { stop: 0.2, color: 'rgb(103, 169, 207)', label: 'Light presence' },
  { stop: 0.4, color: 'rgb(209, 229, 240)', label: 'Steady footfall' },
  { stop: 0.6, color: 'rgb(253, 219, 199)', label: 'Busy streets' },
  { stop: 0.8, color: 'rgb(239, 138, 98)', label: 'Strong hotspot' },
  { stop: 1, color: 'rgb(178, 24, 43)', label: 'Peak hotspot' }
]

/**
 * Helper function to categorize business type
 */
export function categorizeBusinessType(primaryType, types) {
  const typeStr = (primaryType || '') + ' ' + (types || '');
  const lower = typeStr.toLowerCase();
  
  if (lower.includes('restaurant') || lower.includes('meal_takeaway') || lower.includes('meal_delivery')) return 'restaurant';
  if (lower.includes('cafe') || lower.includes('coffee')) return 'cafe';
  if (lower.includes('bar') || lower.includes('night_club') || lower.includes('liquor')) return 'bar';
  if (lower.includes('store') || lower.includes('shop') || lower.includes('supermarket') || lower.includes('clothing')) return 'store';
  if (lower.includes('lodging') || lower.includes('hotel') || lower.includes('accommodation')) return 'lodging';
  if (lower.includes('gallery') || lower.includes('museum') || lower.includes('tourist_attraction')) return 'attraction';
  if (lower.includes('gym') || lower.includes('spa') || lower.includes('beauty') || lower.includes('hair')) return 'wellness';
  if (lower.includes('real_estate') || lower.includes('office')) return 'office';
  
  return 'other';
}

/**
 * Get statistics about businesses open at a given time
 * @param {Array} businesses - Array of business features
 * @param {number} dayOfWeek - 0=Sunday, 1=Monday, ..., 6=Saturday
 * @param {number} hour - Hour in 24-hour format (0-23)
 * @returns {Object} - Statistics object
 */
export function getBusinessStats(businesses, dayOfWeek, hour) {
  const stats = {
    totalBusinesses: businesses.length,
    openBusinesses: 0,
    closedBusinesses: 0,
    byCategory: {}
  };
  
  businesses.forEach(business => {
    const isOpen = isBusinessOpen(business, dayOfWeek, hour);
    const category = categorizeBusinessType(
      business.properties?.primaryType,
      business.properties?.types
    );
    
    if (isOpen) {
      stats.openBusinesses++;
    } else {
      stats.closedBusinesses++;
    }
    
    // Track by category
    if (!stats.byCategory[category]) {
      stats.byCategory[category] = { open: 0, closed: 0, total: 0 };
    }
    stats.byCategory[category].total++;
    if (isOpen) {
      stats.byCategory[category].open++;
    } else {
      stats.byCategory[category].closed++;
    }
  });
  
  return stats;
}

export function getBusinessLivelinessInsights(businesses = [], selectedDay = 1, selectedHour = 12) {
  const safeBusinesses = Array.isArray(businesses) ? businesses : []
  const totalBusinesses = safeBusinesses.length
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const hourlyProfile = Array.from({ length: 24 }, (_, slotHour) => {
    const stats = getBusinessStats(safeBusinesses, selectedDay, slotHour)
    const openShare = stats.totalBusinesses > 0 ? stats.openBusinesses / stats.totalBusinesses : 0
    return {
      hour: slotHour,
      label: formatHour(slotHour),
      openBusinesses: stats.openBusinesses,
      openShare
    }
  })

  const dailyProfile = dayLabels.map((label, dayIndex) => {
    const stats = getBusinessStats(safeBusinesses, dayIndex, selectedHour)
    const openShare = stats.totalBusinesses > 0 ? stats.openBusinesses / stats.totalBusinesses : 0
    return {
      dayIndex,
      label,
      openBusinesses: stats.openBusinesses,
      openShare
    }
  })

  const currentStats = getBusinessStats(safeBusinesses, selectedDay, selectedHour)
  const currentOpenShare = currentStats.totalBusinesses > 0
    ? currentStats.openBusinesses / currentStats.totalBusinesses
    : 0

  const peakHour = hourlyProfile.reduce((best, entry) => (
    !best || entry.openShare > best.openShare ? entry : best
  ), null)
  const quietHour = hourlyProfile.reduce((best, entry) => (
    !best || entry.openShare < best.openShare ? entry : best
  ), null)
  const peakDay = dailyProfile.reduce((best, entry) => (
    !best || entry.openShare > best.openShare ? entry : best
  ), null)
  const quietDay = dailyProfile.reduce((best, entry) => (
    !best || entry.openShare < best.openShare ? entry : best
  ), null)

  const dayParts = [
    { id: 'breakfast', label: 'Morning', hours: [6, 7, 8, 9, 10] },
    { id: 'midday', label: 'Midday', hours: [11, 12, 13, 14] },
    { id: 'afternoon', label: 'After Work', hours: [15, 16, 17, 18] },
    { id: 'night', label: 'Night', hours: [19, 20, 21, 22, 23] }
  ].map((band) => {
    const values = band.hours
      .map((hour) => hourlyProfile.find((entry) => entry.hour === hour)?.openShare ?? 0)
    const averageOpenShare = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0
    return {
      ...band,
      averageOpenShare
    }
  })

  const openByCategory = Object.entries(currentStats.byCategory || {})
    .map(([key, value]) => ({
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      open: value.open,
      total: value.total,
      share: value.total > 0 ? value.open / value.total : 0
    }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 5)

  return {
    totalBusinesses,
    currentStats,
    currentOpenShare,
    hourlyProfile,
    dailyProfile,
    peakHour,
    quietHour,
    peakDay,
    quietDay,
    dayParts,
    openByCategory
  }
}

/**
 * Format day of week number to name
 * @param {number} dayOfWeek - 0=Sunday, 1=Monday, ..., 6=Saturday
 * @returns {string} - Day name
 */
export function getDayName(dayOfWeek) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

/**
 * Format hour to 12-hour time string
 * @param {number} hour - Hour in 24-hour format (0-23)
 * @returns {string} - Formatted time (e.g., "9:00 AM")
 */
export function formatHour(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}
