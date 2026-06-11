import React, { useMemo } from 'react'
import { AMENITY_GROUPS, CATEGORY_GROUPS } from './BusinessAnalytics'
import './BusinessFiltersInsightsPanel.css'

const formatPercent = (value) => `${Math.round(value || 0)}%`

const getBusinessName = (properties = {}) => (
  properties.displayName?.text
  || properties.google_display_name
  || properties.google_place_name
  || properties.name
  || 'Unknown business'
)

const getPrimaryType = (properties = {}) => (
  properties.primaryType
  || properties.primaryTypeDisplayName?.text?.toLowerCase().replace(/\s+/g, '_')
  || properties.types?.[0]
  || ''
)

const formatTypeLabel = (value = '') => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

const cleanBusinesses = (businessesData) => (
  (businessesData?.features || []).filter((feature) => {
    const properties = feature.properties || {}
    return (getBusinessName(properties)) && properties.businessStatus !== 'CLOSED_PERMANENTLY'
  })
)

const BusinessFiltersInsightsPanel = ({
  businessesData,
  mode,
  amenitiesFilters = {},
  categoriesFilters = {},
  expanded = false,
  onToggle
}) => {
  const insights = useMemo(() => {
    const businesses = cleanBusinesses(businessesData)
    if (!businesses.length) return null

    if (mode === 'amenities') {
      const amenityRows = AMENITY_GROUPS.flatMap((group) => (
        group.items.map((item) => {
          const count = businesses.filter((feature) => feature.properties?.[item.id]).length
          return {
            ...item,
            group: group.label,
            count,
            share: (count / businesses.length) * 100
          }
        })
      )).sort((a, b) => b.count - a.count)

      const activeAmenityIds = Object.entries(amenitiesFilters).filter(([, active]) => active).map(([id]) => id)
      const matchingBusinesses = activeAmenityIds.length
        ? businesses.filter((feature) => activeAmenityIds.every((id) => feature.properties?.[id]))
        : businesses

      const groupRows = AMENITY_GROUPS.map((group) => {
        const rows = amenityRows.filter((row) => row.group === group.label)
        const averageShare = rows.length ? rows.reduce((sum, row) => sum + row.share, 0) / rows.length : 0
        return {
          id: group.id,
          label: group.label,
          averageShare,
          strongest: rows[0]?.label || '—'
        }
      })

      return {
        title: 'Amenities Insights',
        subtitle: `${matchingBusinesses.length.toLocaleString()} businesses match the current amenity lens`,
        meta: activeAmenityIds.length ? `${activeAmenityIds.length} filters active` : 'Citywide amenity view',
        cards: [
          { label: 'Mapped businesses', value: businesses.length.toLocaleString() },
          { label: 'Matching now', value: matchingBusinesses.length.toLocaleString() },
          { label: 'Match share', value: formatPercent((matchingBusinesses.length / businesses.length) * 100) }
        ],
        topRows: amenityRows.slice(0, 8),
        groupRows
      }
    }

    const selectedCategoryIds = Object.entries(categoriesFilters).filter(([, active]) => active).map(([id]) => id)
    const groupRows = Object.entries(CATEGORY_GROUPS).map(([groupId, group]) => {
      const count = businesses.filter((feature) => group.categories.includes(getPrimaryType(feature.properties))).length
      return {
        id: groupId,
        label: group.label,
        color: group.color,
        count,
        share: (count / businesses.length) * 100
      }
    }).sort((a, b) => b.count - a.count)

    const matchingBusinesses = selectedCategoryIds.length
      ? businesses.filter((feature) => selectedCategoryIds.includes(getPrimaryType(feature.properties)))
      : businesses

    const topTypes = matchingBusinesses
      .reduce((map, feature) => {
        const key = getPrimaryType(feature.properties)
        if (!key) return map
        const current = map.get(key) || { key, label: formatTypeLabel(key), count: 0 }
        current.count += 1
        map.set(key, current)
        return map
      }, new Map())

    const topTypeRows = [...topTypes.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    return {
      title: 'Category Insights',
      subtitle: `${matchingBusinesses.length.toLocaleString()} businesses in the current category lens`,
      meta: selectedCategoryIds.length ? `${selectedCategoryIds.length} types selected` : 'Citywide category mix',
      cards: [
        { label: 'Mapped businesses', value: businesses.length.toLocaleString() },
        { label: 'Category groups', value: Object.keys(CATEGORY_GROUPS).length.toString() },
        { label: 'Selection share', value: formatPercent((matchingBusinesses.length / businesses.length) * 100) }
      ],
      topRows: groupRows.slice(0, 8).map((row) => ({
        id: row.id,
        label: row.label,
        count: row.count,
        share: row.share,
        color: row.color
      })),
      groupRows: topTypeRows.map((row) => ({
        id: row.key,
        label: row.label,
        strongest: `${row.count.toLocaleString()} businesses`,
        averageShare: (row.count / matchingBusinesses.length) * 100
      }))
    }
  }, [businessesData, mode, amenitiesFilters, categoriesFilters])

  if (!insights) return null

  return (
    <aside className={`business-filters-panel ${expanded ? 'business-filters-panel--expanded' : ''}`}>
      <button
        type="button"
        className="business-filters-panel__header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div>
          <span>{mode === 'amenities' ? 'Amenities Lens' : 'Category Lens'}</span>
          <strong>{expanded ? insights.title : `Open ${insights.title.toLowerCase()}`}</strong>
          <small>{insights.subtitle}</small>
        </div>
        <div className="business-filters-panel__header-meta">
          <em>{insights.meta}</em>
          <i>{expanded ? 'Hide' : 'Open'}</i>
        </div>
      </button>

      {expanded && (
        <div className="business-filters-panel__body">
          <div className="business-filters-panel__stats">
            {insights.cards.map((card) => (
              <div key={card.label} className="business-filters-stat">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            ))}
          </div>

          <div className="business-filters-panel__grid">
            <section className="business-filters-card">
              <div className="business-filters-card__head">
                <span>{mode === 'amenities' ? 'Coverage' : 'Group Mix'}</span>
                <strong>Top signals</strong>
              </div>
              <div className="business-filters-bars">
                {insights.topRows.map((row) => (
                  <div key={row.id} className="business-filters-bars__row">
                    <div>
                      <small>{row.label}</small>
                      <span>{row.count.toLocaleString()} places</span>
                    </div>
                    <div className="business-filters-bars__track">
                      <b style={{ width: `${Math.max(6, row.share)}%`, background: row.color || 'linear-gradient(90deg, #67e8f9, #22d3ee)' }} />
                    </div>
                    <strong>{formatPercent(row.share)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="business-filters-card">
              <div className="business-filters-card__head">
                <span>{mode === 'amenities' ? 'Group Strength' : 'Top Types'}</span>
                <strong>{mode === 'amenities' ? 'Average adoption' : 'Current leaders'}</strong>
              </div>
              <div className="business-filters-list">
                {insights.groupRows.map((row) => (
                  <div key={row.id} className="business-filters-list__row">
                    <div>
                      <small>{row.label}</small>
                      <span>{row.strongest}</span>
                    </div>
                    <strong>{formatPercent(row.averageShare)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </aside>
  )
}

export default BusinessFiltersInsightsPanel
