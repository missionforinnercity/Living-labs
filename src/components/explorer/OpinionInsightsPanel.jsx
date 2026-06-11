import React, { useEffect, useMemo, useState } from 'react'
import { OPINION_THEMES, NULL_THEME, categorizeOpinion } from '../../utils/opinionUtils'
import './OpinionInsightsPanel.css'

const CONSENTED_FORMAL_VALUES = new Set([1, '1', '1.0', true, 'yes'])

const challengeFlagToLabel = {
  'stake_challenges/crime': 'Crime / safety',
  'stake_challenges/litter': 'Litter',
  'stake_challenges/rent': 'Rent',
  'stake_challenges/low_customers': 'Low customers',
  'stake_challenges/competition': 'Competition',
  'stake_challenges/permits': 'Permits',
  'stake_challenges/other': 'Other'
}

const isActiveFlag = (value) => ['1', '1.0', 1, true, 'yes'].includes(value)

const formatPercent = (value, total) => {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

const hasMeaningfulOpinion = (text) => {
  const value = String(text || '').trim()
  if (!value) return false
  const lowered = value.toLowerCase()
  return !['no', 'none', 'n/a', 'null'].includes(lowered)
}

const buildFallbackChallengeText = (properties) => {
  const active = Object.entries(challengeFlagToLabel)
    .filter(([key]) => isActiveFlag(properties?.[key]))
    .map(([, label]) => label)
  return active.length ? active.join(', ') : ''
}

const getDisplayName = (properties, source) => {
  if (source === 'formal') return properties?.biz_name || properties?.google_display_name || properties?.google_place_name || 'Formal business'
  return properties?.biz_name || properties?.street_other || properties?.street || 'Street vendor'
}

const getLocationLabel = (properties) => (
  properties?.street_other || properties?.street || properties?.google_address || properties?.google_formatted_address || 'Cape Town CBD'
)

const OpinionInsightsPanel = ({
  surveyData,
  streetStallsData,
  opinionSource = 'both',
  expanded = false,
  onToggle
}) => {
  const [activeIndex, setActiveIndex] = useState(0)

  const insights = useMemo(() => {
    const formal = (surveyData?.features || [])
      .filter((feature) => CONSENTED_FORMAL_VALUES.has(feature.properties?.stake_consent))
      .map((feature, index) => {
        const text = String(feature.properties?.stake_big_change || '').trim() || buildFallbackChallengeText(feature.properties)
        const theme = categorizeOpinion(text)
        return {
          id: feature.properties?._uuid || feature.properties?._id || `formal-${index}`,
          source: 'formal',
          title: getDisplayName(feature.properties, 'formal'),
          location: getLocationLabel(feature.properties),
          text,
          theme,
          properties: feature.properties
        }
      })
      .filter((item) => hasMeaningfulOpinion(item.text) && item.theme !== NULL_THEME)

    const informal = (streetStallsData?.features || [])
      .filter((feature) => String(feature.properties?.stake_consent || '').toLowerCase() === 'yes')
      .map((feature, index) => {
        const text = String(feature.properties?.stake_big_change || '').trim() || buildFallbackChallengeText(feature.properties)
        const theme = categorizeOpinion(text)
        return {
          id: feature.properties?._uuid || feature.properties?._id || `informal-${index}`,
          source: 'informal',
          title: getDisplayName(feature.properties, 'informal'),
          location: getLocationLabel(feature.properties),
          text,
          theme,
          properties: feature.properties
        }
      })
      .filter((item) => hasMeaningfulOpinion(item.text) && item.theme !== NULL_THEME)

    const filteredEntries = [...(opinionSource !== 'informal' ? formal : []), ...(opinionSource !== 'formal' ? informal : [])]

    const themeCounts = Object.entries(OPINION_THEMES).map(([key, theme]) => ({
      key,
      label: theme.name,
      color: theme.color,
      count: filteredEntries.filter((entry) => entry.theme?.name === theme.name).length
    })).filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count)

    const sourceCounts = {
      formal: formal.length,
      informal: informal.length
    }

    return {
      entries: filteredEntries,
      sourceCounts,
      themeCounts,
      topTheme: themeCounts[0] || null
    }
  }, [surveyData, streetStallsData, opinionSource])

  useEffect(() => {
    setActiveIndex(0)
  }, [opinionSource, surveyData, streetStallsData])

  if (!insights.entries.length && !insights.sourceCounts.formal && !insights.sourceCounts.informal) return null

  const totalVisible = insights.entries.length
  const activeEntry = insights.entries[Math.min(activeIndex, Math.max(0, totalVisible - 1))] || null

  return (
    <aside className={`opinion-insights-panel ${expanded ? 'opinion-insights-panel--expanded' : ''}`}>
      <button
        type="button"
        className="opinion-insights-panel__header"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div>
          <span>Vendor Insights</span>
          <strong>{expanded ? 'Opinion Findings' : 'Open opinion findings'}</strong>
          <small>{totalVisible.toLocaleString()} consented responses with mapped challenges</small>
        </div>
        <div className="opinion-insights-panel__header-meta">
          <em>{insights.topTheme ? insights.topTheme.label : 'No themes yet'}</em>
          <i>{expanded ? 'Hide' : 'Open'}</i>
        </div>
      </button>

      {expanded && (
        <div className="opinion-insights-panel__body">
          <div className="opinion-insights-grid">
            <section className="opinion-insights-card opinion-insights-card--summary">
              <div className="opinion-insights-card__head">
                <span>Source Split</span>
                <strong>{opinionSource === 'both' ? 'Formal + informal' : opinionSource === 'formal' ? 'Formal only' : 'Informal only'}</strong>
              </div>
              <div className="opinion-insights-summary">
                <div>
                  <span>Formal</span>
                  <strong>{insights.sourceCounts.formal.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Informal</span>
                  <strong>{insights.sourceCounts.informal.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Visible</span>
                  <strong>{totalVisible.toLocaleString()}</strong>
                </div>
              </div>
            </section>

            <section className="opinion-insights-card">
              <div className="opinion-insights-card__head">
                <span>Dominant Themes</span>
                <strong>{insights.topTheme ? insights.topTheme.label : 'No dominant theme'}</strong>
              </div>
              <div className="opinion-insights-theme-list">
                {insights.themeCounts.slice(0, 6).map((theme) => (
                  <div key={theme.key} className="opinion-insights-theme-row">
                    <div>
                      <i style={{ background: theme.color }} />
                      <span>{theme.label}</span>
                    </div>
                    <div className="opinion-insights-theme-row__bar">
                      <b style={{ width: `${(theme.count / Math.max(1, totalVisible)) * 100}%`, background: theme.color }} />
                    </div>
                    <strong>{formatPercent(theme.count, totalVisible)}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {activeEntry && (
            <section className="opinion-insights-card opinion-insights-card--quote">
              <div className="opinion-insights-card__head">
                <span>Response Browser</span>
                <strong>{activeIndex + 1} of {totalVisible}</strong>
              </div>
              <div className="opinion-insights-quote-meta">
                <div>
                  <small>{activeEntry.source === 'formal' ? 'Formal business' : 'Street vendor'}</small>
                  <h4>{activeEntry.title}</h4>
                  <p>{activeEntry.location}</p>
                </div>
                <span style={{ background: activeEntry.theme?.color || '#64748b' }}>
                  {activeEntry.theme?.name || 'Uncategorized'}
                </span>
              </div>
              <blockquote>{activeEntry.text}</blockquote>
              <div className="opinion-insights-quote-actions">
                <button
                  type="button"
                  onClick={() => setActiveIndex((value) => (value - 1 + totalVisible) % totalVisible)}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((value) => (value + 1) % totalVisible)}
                >
                  Next
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </aside>
  )
}

export default OpinionInsightsPanel
