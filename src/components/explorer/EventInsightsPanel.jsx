import React from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import './BusinessAnalytics.css'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const EVENT_CHART_COLORS = ['#34d399', '#22c55e', '#16a34a', '#4ade80', '#86efac', '#bbf7d0', '#15803d']

const formatEventMonthKey = (key) => {
  if (!key) return 'All Months'
  const [y, m] = key.split('-')
  const monthIndex = Number(m) - 1
  return `${MONTH_LABELS[monthIndex] || m} ${y}`
}

const parseEventDateTime = (dateValue, timeValue = '00:00:00') => {
  if (!dateValue) return null
  const iso = `${dateValue}T${(timeValue || '00:00:00').slice(0, 8)}`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const formatEventDateLabel = (dateValue, timeValue) => {
  const date = parseEventDateTime(dateValue, timeValue)
  if (!date) return dateValue || 'Unknown date'
  const day = date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
  const hasTime = Boolean(timeValue)
  const time = hasTime
    ? date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
    : ''
  return time ? `${day} · ${time}` : day
}

const formatTimestampLabel = (value) => {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

const getHourNumber = (timeValue) => {
  if (!timeValue || typeof timeValue !== 'string') return null
  const [hour] = timeValue.split(':')
  const parsed = Number(hour)
  return Number.isInteger(parsed) ? parsed : null
}

function EventChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  const resolvedLabel = point?.payload?.label || point?.payload?.month || point?.payload?.fullVenue || label
  return (
    <div className="events-chart-tooltip">
      <div className="events-chart-tooltip-label">{resolvedLabel}</div>
      <div className="events-chart-tooltip-value">
        {point.value} event{point.value === 1 ? '' : 's'}
      </div>
    </div>
  )
}

function EventInsightsPanel({
  eventsData,
  eventsMonth,
  onEventsMonthChange,
  eventsScope = 'cbd',
  onEventsScopeChange,
  variant = 'sidebar',
  detailLevel = 'full'
}) {
  const allFeatures = eventsData?.features || []
  const eventsMetadata = eventsData?.metadata || {}

  const monthSet = new Set()
  allFeatures.forEach((f) => {
    const d = f.properties?.date
    if (!d) return
    const [year, month] = d.split('-')
    if (year && month) monthSet.add(`${year}-${month}`)
  })
  const sortedMonths = Array.from(monthSet).sort()
  const activeMonthKey = eventsMonth
    ? `${String(Math.floor(eventsMonth / 100)).padStart(4, '0')}-${String(eventsMonth % 100).padStart(2, '0')}`
    : null

  const filtered = activeMonthKey
    ? allFeatures.filter((f) => f.properties?.date?.startsWith(activeMonthKey))
    : allFeatures

  const totalEvents = filtered.length
  const now = new Date()
  const datedEvents = filtered
    .map((feature) => {
      const properties = feature.properties || {}
      return {
        feature,
        properties,
        dateObj: parseEventDateTime(properties.date, properties.time)
      }
    })
    .filter((item) => item.properties.date)

  const venueCounts = {}
  const weekdayCounts = WEEKDAY_LABELS.reduce((acc, label) => ({ ...acc, [label]: 0 }), {})
  const hourCounts = Array.from({ length: 24 }, (_, hourValue) => ({
    label: `${String(hourValue).padStart(2, '0')}:00`,
    count: 0
  }))

  filtered.forEach((f) => {
    const p = f.properties || {}
    const venueName = p.venue || 'Unknown'
    venueCounts[venueName] = (venueCounts[venueName] || 0) + 1

    const eventDate = parseEventDateTime(p.date, p.time)
    if (eventDate) {
      const weekdayLabel = WEEKDAY_LABELS[eventDate.getDay()]
      weekdayCounts[weekdayLabel] = (weekdayCounts[weekdayLabel] || 0) + 1
    }

    const hour = getHourNumber(p.time)
    if (hour != null && hourCounts[hour]) {
      hourCounts[hour].count += 1
    }
  })

  const topVenues = Object.entries(venueCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const monthCounts = {}
  sortedMonths.forEach((m) => { monthCounts[m] = 0 })
  allFeatures.forEach((f) => {
    const d = f.properties?.date
    if (!d) return
    const key = d.slice(0, 7)
    if (monthCounts[key] !== undefined) monthCounts[key]++
  })

  const monthlyChartData = sortedMonths.map((key) => ({
    key,
    month: formatEventMonthKey(key),
    shortMonth: formatEventMonthKey(key),
    count: monthCounts[key] || 0,
    isActive: activeMonthKey === key
  }))

  const weekdayChartData = WEEKDAY_LABELS.map((label, index) => ({
    day: label,
    count: weekdayCounts[label] || 0,
    fill: EVENT_CHART_COLORS[index % EVENT_CHART_COLORS.length]
  }))

  const hourChartData = hourCounts.filter((entry) => entry.count > 0)
  const topVenueChartData = topVenues.map(([venue, count], index) => ({
    venue: venue.length > 20 ? `${venue.slice(0, 20)}…` : venue,
    fullVenue: venue,
    count,
    fill: EVENT_CHART_COLORS[index % EVENT_CHART_COLORS.length]
  }))

  const busiestDay = weekdayChartData.reduce((best, item) => item.count > (best?.count || 0) ? item : best, null)
  const busiestHour = hourChartData.reduce((best, item) => item.count > (best?.count || 0) ? item : best, null)
  const upcomingEvents = [...datedEvents]
    .filter((item) => !item.dateObj || item.dateObj >= now)
    .sort((a, b) => (a.properties?.date || '').localeCompare(b.properties?.date || ''))
    .slice(0, 8)
  const nextEvent = [...datedEvents]
    .filter((item) => item.dateObj && item.dateObj >= now)
    .sort((a, b) => a.dateObj - b.dateObj)[0] || null

  const coverageStart = eventsMetadata.eventDateRange?.start || sortedMonths[0]
  const coverageEnd = eventsMetadata.eventDateRange?.end || sortedMonths[sortedMonths.length - 1]
  const lastUpdatedLabel = formatTimestampLabel(eventsMetadata.lastUpdatedAt || allFeatures[0]?.properties?.updated_at)
  const liveSourceLabel = eventsMetadata.fallback ? 'Static fallback' : 'Live planning DB'
  const geographyLabel = eventsScope === 'all' ? 'All Cape Town' : 'Cape Town CBD'
  const showSummarySections = detailLevel === 'summary'
  const showExtendedSections = detailLevel === 'full'

  return (
    <div className={`events-insights-panel events-insights-panel--${variant}`}>
      <div className="mode-content">
        {showSummarySections && (
          <>
            <div className="events-sidebar-status">
              <div className="events-sidebar-status-top">
                <span className="events-live-pill">{liveSourceLabel}</span>
                <span className="events-update-text">Last sync {lastUpdatedLabel}</span>
              </div>
              <div className="events-sidebar-status-meta">
                <span>{geographyLabel}</span>
                <span>{coverageStart ? `From ${coverageStart}` : 'Live feed'}</span>
                <span>{coverageEnd ? `to ${coverageEnd}` : 'Current period'}</span>
              </div>
            </div>

            <div className="control-section events-sidebar-section">
              <div className="control-header">GEOGRAPHY</div>
              <div className="events-scope-toggle">
                <button
                  type="button"
                  className={`events-scope-button ${eventsScope === 'cbd' ? 'active' : ''}`}
                  onClick={() => onEventsScopeChange?.('cbd')}
                >
                  Inner City CBD
                </button>
                <button
                  type="button"
                  className={`events-scope-button ${eventsScope === 'all' ? 'active' : ''}`}
                  onClick={() => onEventsScopeChange?.('all')}
                >
                  All Cape Town
                </button>
              </div>
            </div>

            <div className="control-section events-sidebar-section">
              <div className="control-header">FILTER BY MONTH</div>
              <div className="events-sidebar-month-row">
                <span className="events-sidebar-month-label">
                  {activeMonthKey ? formatEventMonthKey(activeMonthKey) : 'All Months'}
                </span>
                <button
                  onClick={() => onEventsMonthChange?.(null)}
                  className="events-inline-reset"
                >
                  All
                </button>
              </div>
              <input
                type="range"
                min={0}
                max={sortedMonths.length - 1}
                value={activeMonthKey ? sortedMonths.indexOf(activeMonthKey) : Math.max(sortedMonths.length - 1, 0)}
                onChange={(e) => {
                  const key = sortedMonths[parseInt(e.target.value)]
                  if (!key) return
                  const [y, m] = key.split('-')
                  onEventsMonthChange?.(parseInt(y) * 100 + parseInt(m))
                }}
                className="hour-slider"
                style={{ width: '100%' }}
                disabled={sortedMonths.length === 0}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                <span>{formatEventMonthKey(sortedMonths[0])}</span>
                <span>{formatEventMonthKey(sortedMonths[sortedMonths.length - 1])}</span>
              </div>
            </div>

            <div className="stats-summary events-stats-grid events-stats-grid--sidebar">
              <div className="stat-card primary">
                <div className="stat-value">{totalEvents}</div>
                <div className="stat-label">Events{activeMonthKey ? ` in ${formatEventMonthKey(activeMonthKey)}` : ' Total'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{Object.keys(venueCounts).length}</div>
                <div className="stat-label">Active Venues</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{busiestDay?.day || '--'}</div>
                <div className="stat-label">Busiest Day</div>
                <div className="stat-percentage">{busiestDay?.count || 0} events</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{busiestHour?.label || '--'}</div>
                <div className="stat-label">Most Common Start Time</div>
                <div className="stat-percentage">{busiestHour?.count || 0} events</div>
              </div>
            </div>
          </>
        )}

        {showExtendedSections && <div className="events-chart-grid">
          <div className="control-section events-chart-card">
            <div className="control-header">MONTHLY DISTRIBUTION</div>
            <div className="events-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="shortMonth" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<EventChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {monthlyChartData.map((entry, index) => (
                      <Cell
                        key={`${entry.key}-${index}`}
                        fill={entry.isActive ? '#4ade80' : '#1f8f5a'}
                        onClick={() => {
                          if (!entry.key) return
                          const [y, mo] = entry.key.split('-')
                          onEventsMonthChange?.(parseInt(y) * 100 + parseInt(mo))
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="control-section events-chart-card">
            <div className="control-header">BUSIEST DAYS</div>
            <div className="events-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayChartData} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<EventChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                    {weekdayChartData.map((entry, index) => (
                      <Cell key={`${entry.day}-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="events-chart-caption">
              {busiestDay?.day ? `${busiestDay.day} leads with ${busiestDay.count} events.` : 'No weekday signal yet.'}
            </div>
          </div>
        </div>}

        {showExtendedSections && <div className="events-chart-grid">
          <div className="control-section events-chart-card">
            <div className="control-header">EVENT START TIMES</div>
            <div className="events-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourChartData} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={56} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<EventChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="events-chart-caption">
              {busiestHour ? `${busiestHour.label} has ${busiestHour.count} event${busiestHour.count === 1 ? '' : 's'}.` : 'No scheduled start times yet.'}
            </div>
          </div>

          {topVenueChartData.length > 0 && (
            <div className="control-section events-chart-card">
              <div className="control-header">TOP VENUES</div>
              <div className="events-chart-shell">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topVenueChartData} layout="vertical" margin={{ top: 4, right: 10, left: 12, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="venue" width={120} tick={{ fill: 'rgba(255,255,255,0.58)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const point = payload[0]?.payload
                        return (
                          <div className="events-chart-tooltip">
                            <div className="events-chart-tooltip-label">{point?.fullVenue}</div>
                            <div className="events-chart-tooltip-value">{point?.count} event{point?.count === 1 ? '' : 's'}</div>
                          </div>
                        )
                      }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                      {topVenueChartData.map((entry, index) => (
                        <Cell key={`${entry.fullVenue}-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>}

        {showExtendedSections && <div className="control-section">
          <div className="control-header">EVENT SNAPSHOT</div>
          <div className="events-snapshot-grid">
            <div className="events-snapshot-card">
              <span className="events-snapshot-label">Next scheduled event</span>
              <strong>{nextEvent?.properties?.name || 'No upcoming event in this filter'}</strong>
              <span>{nextEvent ? formatEventDateLabel(nextEvent.properties?.date, nextEvent.properties?.time) : 'Try All Months for the full pipeline.'}</span>
            </div>
            <div className="events-snapshot-card">
              <span className="events-snapshot-label">Most active venue</span>
              <strong>{topVenues[0]?.[0] || 'No venue data'}</strong>
              <span>{topVenues[0]?.[1] || 0} event{topVenues[0]?.[1] === 1 ? '' : 's'} in this selection.</span>
            </div>
            <div className="events-snapshot-card">
              <span className="events-snapshot-label">Most common start time</span>
              <strong>{busiestHour?.label || 'Unknown'}</strong>
              <span>{busiestHour?.count || 0} event{busiestHour?.count === 1 ? '' : 's'} scheduled at this time.</span>
            </div>
            <div className="events-snapshot-card">
              <span className="events-snapshot-label">Data freshness</span>
              <strong>{lastUpdatedLabel}</strong>
              <span>{eventsMetadata.fallback ? 'Showing the bundled static fallback dataset.' : 'Served live from the planning schema API.'}</span>
            </div>
          </div>
        </div>}

        {showExtendedSections && upcomingEvents.length > 0 && (
          <div className="control-section">
            <div className="control-header">
              {activeMonthKey ? `EVENTS IN ${formatEventMonthKey(activeMonthKey).toUpperCase()}` : 'UPCOMING EVENTS'}
            </div>
            <div className="events-list">
              {upcomingEvents.map((item, i) => {
                const p = item.properties || {}
                return (
                  <a
                    key={`${p.name || 'event'}-${i}`}
                    className="event-list-card"
                    href={p.url || '#'}
                    target={p.url ? '_blank' : undefined}
                    rel={p.url ? 'noreferrer' : undefined}
                  >
                    <div className="event-list-card-top">
                      <div className="event-list-title" title={p.name}>{p.name}</div>
                      <div className="event-list-time">{p.time ? p.time.slice(0, 5) : 'TBA'}</div>
                    </div>
                    <div className="event-list-venue">{p.venue || 'Unknown venue'}</div>
                    <div className="event-list-date">{formatEventDateLabel(p.date, p.time)}</div>
                  </a>
                )
              })}
              {filtered.length > 8 && (
                <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', padding: '0.25rem' }}>
                  +{filtered.length - 8} more events in this selection are available on the map.
                </div>
              )}
            </div>
          </div>
        )}

        {showExtendedSections && topVenues.length > 0 && (
          <div className="control-section">
            <div className="control-header">VENUE LEADERBOARD</div>
            <div className="events-venue-list">
              {topVenues.map(([venue, count], i) => (
                <div key={venue} className="events-venue-row">
                  <span className="events-venue-rank">{i + 1}</span>
                  <div className="events-venue-copy">
                    <div className="events-venue-name" title={venue}>{venue}</div>
                    <div className="events-venue-bar-track">
                      <div className="events-venue-bar-fill" style={{ width: `${(count / (topVenues[0]?.[1] || 1)) * 100}%` }} />
                    </div>
                  </div>
                  <span className="events-venue-count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalEvents === 0 && (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
            No events found for {activeMonthKey ? formatEventMonthKey(activeMonthKey) : 'the selected period'}.
          </div>
        )}

        {showExtendedSections && <div className="legend-section" style={{ marginTop: '1rem' }}>
          <div className="control-header">HEATMAP LEGEND</div>
          <div className="legend-gradient" style={{ marginTop: '0.5rem' }}>
            <div className="legend-bar" style={{
              background: 'linear-gradient(to right, transparent, #00ff88)',
              height: '12px', borderRadius: '4px', border: '1px solid #1a3d22'
            }}></div>
            <div className="legend-labels">
              <span>No events</span>
              <span>Event hotspot</span>
            </div>
          </div>
        </div>}
      </div>
    </div>
  )
}

export default EventInsightsPanel
