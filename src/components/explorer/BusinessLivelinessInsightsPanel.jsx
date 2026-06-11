import React, { useMemo } from 'react'
import { formatHour, getBusinessLivelinessInsights } from '../../utils/timeUtils'
import './BusinessLivelinessInsightsPanel.css'

const formatPercent = (value) => `${Math.round((value || 0) * 100)}%`

const BusinessLivelinessInsightsPanel = ({
  businessesData,
  dayOfWeek,
  hour,
  expanded = false,
  onToggle
}) => {
  const insights = useMemo(() => (
    getBusinessLivelinessInsights(businessesData?.features || [], dayOfWeek, hour)
  ), [businessesData, dayOfWeek, hour])

  if (!insights.totalBusinesses) return null

  const currentOpen = insights.currentStats?.openBusinesses || 0

  return (
    <aside className={`business-liveliness-panel ${expanded ? 'business-liveliness-panel--expanded' : ''}`}>
      <button
        type="button"
        className="business-liveliness-panel__header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div>
          <span>Business Pulse</span>
          <strong>{expanded ? 'Liveliness Insights' : 'Open liveliness insights'}</strong>
          <small>{currentOpen.toLocaleString()} places open at {formatHour(hour)}</small>
        </div>
        <div className="business-liveliness-panel__header-meta">
          <em>{formatPercent(insights.currentOpenShare)} active</em>
          <i>{expanded ? 'Hide' : 'Open'}</i>
        </div>
      </button>

      {expanded && (
        <div className="business-liveliness-panel__body">
          <div className="business-liveliness-panel__grid">
            <section className="business-liveliness-card">
              <div className="business-liveliness-card__head">
                <span>Today Rhythm</span>
                <strong>{insights.peakHour?.label || '—'} peak</strong>
              </div>
              <div className="business-liveliness-bars">
                {insights.hourlyProfile.map((entry) => (
                  <div
                    key={entry.hour}
                    className={`business-liveliness-bar ${entry.hour === hour ? 'is-current' : ''} ${entry.hour === insights.peakHour?.hour ? 'is-peak' : ''} ${entry.hour === insights.quietHour?.hour ? 'is-quiet' : ''}`}
                  >
                    <i style={{ height: `${Math.max(10, entry.openShare * 100)}%` }} />
                    <span>{entry.hour}</span>
                  </div>
                ))}
              </div>
              <div className="business-liveliness-card__footer">
                <small>Quietest: {insights.quietHour?.label || '—'}</small>
                <small>Peak: {insights.peakHour?.openBusinesses?.toLocaleString() || 0} open</small>
              </div>
            </section>

            <section className="business-liveliness-card">
              <div className="business-liveliness-card__head">
                <span>Day Comparison</span>
                <strong>{insights.peakDay?.label || '—'} strongest</strong>
              </div>
              <div className="business-liveliness-days">
                {insights.dailyProfile.map((entry) => (
                  <div key={entry.dayIndex} className={`business-liveliness-days__item ${entry.dayIndex === dayOfWeek ? 'is-current' : ''}`}>
                    <div>
                      <small>{entry.label}</small>
                      <strong>{formatPercent(entry.openShare)}</strong>
                    </div>
                    <i style={{ width: `${Math.max(8, entry.openShare * 100)}%` }} />
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="business-liveliness-panel__grid business-liveliness-panel__grid--compact">
            <section className="business-liveliness-card">
              <div className="business-liveliness-card__head">
                <span>Time Bands</span>
                <strong>City cadence</strong>
              </div>
              <div className="business-liveliness-band-grid">
                {insights.dayParts.map((band) => (
                  <div key={band.id}>
                    <span>{band.label}</span>
                    <strong>{formatPercent(band.averageOpenShare)}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="business-liveliness-card">
              <div className="business-liveliness-card__head">
                <span>Open Mix</span>
                <strong>Current leaders</strong>
              </div>
              <div className="business-liveliness-categories">
                {insights.openByCategory.map((entry) => (
                  <div key={entry.key} className="business-liveliness-categories__row">
                    <div>
                      <small>{entry.label}</small>
                      <span>{entry.open.toLocaleString()} open</span>
                    </div>
                    <strong>{formatPercent(entry.share)}</strong>
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

export default BusinessLivelinessInsightsPanel
