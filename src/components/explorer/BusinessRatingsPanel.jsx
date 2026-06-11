import React, { useEffect, useMemo, useState } from 'react'
import './BusinessRatingsPanel.css'

const MEANINGFUL_REVIEW_COUNT = 5
const LOW_RATING_THRESHOLD = 3.5

const getBusinessName = (properties = {}) => (
  properties.displayName?.text
  || properties.google_display_name
  || properties.google_place_name
  || properties.name
  || 'Unknown business'
)

const getBusinessType = (properties = {}) => (
  properties.primaryTypeDisplayName?.text
  || properties.primaryType
  || properties.types?.[0]?.replace(/_/g, ' ')
  || ''
)

const getBusinessAddress = (properties = {}) => (
  properties.shortFormattedAddress
  || properties.google_formatted_address
  || properties.formattedAddress
  || ''
)

const formatPriceLevel = (value) => {
  if (!value) return ''
  const match = String(value).match(/(\d+)/)
  const numeric = match ? Number(match[1]) : NaN
  return Number.isFinite(numeric) && numeric > 0 ? '·'.repeat(numeric) : ''
}

const average = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null

const STREET_TYPE_MAP = {
  st: 'Street',
  street: 'Street',
  rd: 'Road',
  road: 'Road',
  ave: 'Avenue',
  avenue: 'Avenue',
  blvd: 'Boulevard',
  boulevard: 'Boulevard',
  ln: 'Lane',
  lane: 'Lane',
  dr: 'Drive',
  drive: 'Drive',
  ct: 'Court',
  court: 'Court',
  pl: 'Place',
  place: 'Place',
  sq: 'Square',
  square: 'Square',
  way: 'Way',
  mall: 'Mall'
}

const toTitleCase = (value = '') => value
  .toLowerCase()
  .replace(/\b\w/g, (char) => char.toUpperCase())

const normalizeStreetName = (value = '') => {
  const cleaned = String(value || '')
    .replace(/^[\d\s-]+/, '')
    .replace(/\s*&\s*.*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''

  const parts = cleaned.split(' ')
  const last = parts[parts.length - 1]?.replace(/\./g, '').toLowerCase()
  if (STREET_TYPE_MAP[last]) {
    parts[parts.length - 1] = STREET_TYPE_MAP[last]
  }

  return toTitleCase(parts.join(' '))
}

const streetKeyFromProperties = (properties = {}) => {
  const routeComponent = properties.addressComponents?.find?.((component) => (
    Array.isArray(component.types) && component.types.includes('route')
  ))
  const route = normalizeStreetName(
    routeComponent?.longText
    || routeComponent?.shortText
    || properties.street
  )

  if (route) return route

  const address = getBusinessAddress(properties)
  const firstSegment = address.split(',')[0].trim()
  return normalizeStreetName(firstSegment) || 'Unknown street'
}

const compareLowestRatedBusinesses = (a, b) => (
  (a.rating - b.rating)
  || ((b.reviews || 0) - (a.reviews || 0))
)

const compareHighestRatedBusinesses = (a, b) => (
  (b.rating - a.rating)
  || ((b.reviews || 0) - (a.reviews || 0))
)

const BusinessRatingsPanel = ({
  businesses = [],
  sortOrder = 'best',
  onSortOrderChange,
  expanded = false,
  onToggleExpanded
}) => {
  const [carouselIndex, setCarouselIndex] = useState(0)

  const ratedBusinesses = useMemo(() => (
    businesses
      .map((feature, index) => ({
        id: feature.properties?.id || feature.properties?.google_place_id || `business-${index}`,
        feature,
        rating: Number(feature.properties?.rating),
        reviews: Number(feature.properties?.userRatingCount || 0)
      }))
      .filter((item) => Number.isFinite(item.rating) && item.rating > 0)
  ), [businesses])

  const sortedBusinesses = useMemo(() => {
    if (sortOrder === 'lowest') {
      const meaningfulReviewBusinesses = ratedBusinesses.filter((item) => item.reviews >= MEANINGFUL_REVIEW_COUNT)
      const source = meaningfulReviewBusinesses.length ? meaningfulReviewBusinesses : ratedBusinesses
      const lowRatedBusinesses = source
        .filter((item) => item.rating <= LOW_RATING_THRESHOLD)
        .sort(compareLowestRatedBusinesses)
      const higherRatedBusinesses = source
        .filter((item) => item.rating > LOW_RATING_THRESHOLD)
        .sort(compareLowestRatedBusinesses)

      return [...lowRatedBusinesses, ...higherRatedBusinesses]
    }

    return [...ratedBusinesses].sort(compareHighestRatedBusinesses)
  }, [ratedBusinesses, sortOrder])

  useEffect(() => {
    setCarouselIndex(0)
  }, [sortOrder, businesses])

  const visibleCards = useMemo(() => {
    if (!sortedBusinesses.length) return []
    const safeIndex = Math.min(carouselIndex, Math.max(0, sortedBusinesses.length - 1))
    return sortedBusinesses.slice(safeIndex, safeIndex + 4)
  }, [sortedBusinesses, carouselIndex])

  const insights = useMemo(() => {
    const meaningfulReviewBusinesses = ratedBusinesses.filter((item) => item.reviews >= MEANINGFUL_REVIEW_COUNT)
    const lowestRatedBusinesses = [...meaningfulReviewBusinesses]
      .sort(compareLowestRatedBusinesses)
      .slice(0, 10)

    const highestRatedBusinesses = [...meaningfulReviewBusinesses]
      .sort(compareHighestRatedBusinesses)
      .slice(0, 10)

    const streetMap = new Map()
    ratedBusinesses.forEach(({ feature, rating, reviews }) => {
      const key = streetKeyFromProperties(feature.properties)
      const current = streetMap.get(key) || { street: key, ratings: [], reviews: 0, businesses: 0 }
      current.ratings.push(rating)
      current.reviews += reviews || 0
      current.businesses += 1
      streetMap.set(key, current)
    })

    const streetRows = [...streetMap.values()]
      .map((entry) => ({
        ...entry,
        avgRating: average(entry.ratings)
      }))
      .filter((entry) => entry.businesses >= 3 && Number.isFinite(entry.avgRating))

    const lowestRatedStreets = [...streetRows]
      .sort((a, b) => (a.avgRating - b.avgRating) || (b.businesses - a.businesses))
      .slice(0, 10)

    return {
      lowestRatedBusinesses,
      highestRatedBusinesses,
      lowestRatedStreets
    }
  }, [ratedBusinesses])

  if (!sortedBusinesses.length) return null

  const maxIndex = Math.max(0, sortedBusinesses.length - 4)
  const safeCarouselIndex = Math.min(carouselIndex, maxIndex)
  const headerLabel = sortOrder === 'lowest' ? 'Lowest Rated First' : 'Best Rated First'
  const headerMeta = sortOrder === 'lowest'
    ? `${sortedBusinesses.length.toLocaleString()} low-rated businesses with ${MEANINGFUL_REVIEW_COUNT}+ reviews`
    : `${sortedBusinesses.length.toLocaleString()} rated businesses in carousel`

  const stepCarousel = (direction) => {
    setCarouselIndex((current) => {
      if (direction < 0) {
        return current <= 0 ? maxIndex : Math.max(0, current - 1)
      }
      return current >= maxIndex ? 0 : Math.min(maxIndex, current + 1)
    })
  }

  return (
    <aside className={`business-ratings-panel ${expanded ? 'business-ratings-panel--expanded' : ''}`}>
      <div className="business-ratings-panel__topbar" />
      <div className="business-ratings-panel__header">
        <div>
          <span className="business-ratings-panel__kicker">Business Ratings</span>
          <strong>{headerLabel}</strong>
          <small>{headerMeta}</small>
        </div>
        <div className="business-ratings-panel__actions">
          <div className="business-ratings-panel__sort">
            <button
              type="button"
              className={sortOrder === 'best' ? 'active' : ''}
              onClick={() => onSortOrderChange('best')}
            >
              Best first
            </button>
            <button
              type="button"
              className={sortOrder === 'lowest' ? 'active' : ''}
              onClick={() => onSortOrderChange('lowest')}
            >
              Lowest first
            </button>
          </div>
          <button type="button" className="business-ratings-panel__toggle" onClick={onToggleExpanded}>
            {expanded ? 'Hide Insights' : 'Show Insights'}
          </button>
        </div>
      </div>

      <div className="business-ratings-carousel">
        <button type="button" className="business-ratings-carousel__arrow" onClick={() => stepCarousel(-1)} aria-label="Previous businesses">
          ‹
        </button>
        <div className="business-ratings-carousel__track">
          {visibleCards.map(({ id, feature, rating, reviews }) => {
            const properties = feature.properties || {}
            const type = getBusinessType(properties)
            const address = getBusinessAddress(properties)
            const price = formatPriceLevel(properties.priceLevel)
            const isOpen = properties.currentOpeningHours?.openNow
            return (
              <article key={id} className="business-ratings-card">
                <h4 title={getBusinessName(properties)}>{getBusinessName(properties)}</h4>
                {type && <p className="business-ratings-card__type">{String(type).replace(/_/g, ' ')}</p>}
                <div className="business-ratings-card__meta">
                  <span className="rating">★ {rating.toFixed(1)}</span>
                  <span>{reviews.toLocaleString()} reviews</span>
                  {price && <span>{price}</span>}
                </div>
                {isOpen != null && (
                  <div className={`business-ratings-card__status ${isOpen ? 'open' : 'closed'}`}>
                    {isOpen ? 'Open now' : 'Closed now'}
                  </div>
                )}
                {address && <p className="business-ratings-card__address" title={address}>{address}</p>}
              </article>
            )
          })}
        </div>
        <button type="button" className="business-ratings-carousel__arrow" onClick={() => stepCarousel(1)} aria-label="Next businesses">
          ›
        </button>
      </div>

      <div className="business-ratings-panel__footer">
        <span>{safeCarouselIndex + 1}-{Math.min(safeCarouselIndex + visibleCards.length, sortedBusinesses.length)} of {sortedBusinesses.length}</span>
        <button type="button" onClick={onToggleExpanded}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <div className="business-ratings-insights">
          <section className="business-ratings-insights__card">
            <div className="business-ratings-insights__head">
              <span>Lowest Rated</span>
              <strong>Businesses</strong>
            </div>
            <div className="business-ratings-insights__list">
              {insights.lowestRatedBusinesses.map(({ id, feature, rating, reviews }) => (
                <div key={id} className="business-ratings-insights__row">
                  <div>
                    <small>{getBusinessName(feature.properties)}</small>
                    <span>{getBusinessType(feature.properties) || 'Business'}</span>
                  </div>
                  <strong>{rating.toFixed(1)} · {reviews} reviews</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="business-ratings-insights__card">
            <div className="business-ratings-insights__head">
              <span>Street Watch</span>
              <strong>Lowest Rated Streets</strong>
            </div>
            <div className="business-ratings-insights__list">
              {insights.lowestRatedStreets.map((street) => (
                <div key={street.street} className="business-ratings-insights__row">
                  <div>
                    <small>{street.street}</small>
                    <span>{street.businesses} businesses · {street.reviews} reviews</span>
                  </div>
                  <strong>{street.avgRating.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="business-ratings-insights__card">
            <div className="business-ratings-insights__head">
              <span>Highest Rated</span>
              <strong>Standouts</strong>
            </div>
            <div className="business-ratings-insights__list">
              {insights.highestRatedBusinesses.map(({ id, feature, rating, reviews }) => (
                <div key={id} className="business-ratings-insights__row">
                  <div>
                    <small>{getBusinessName(feature.properties)}</small>
                    <span>{streetKeyFromProperties(feature.properties)}</span>
                  </div>
                  <strong>{rating.toFixed(1)} · {reviews} reviews</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </aside>
  )
}

export default BusinessRatingsPanel
