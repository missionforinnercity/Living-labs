import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import './SentimentAnalytics.css'

const SENTIMENT_COLORS = {
  positive: '#22c55e',
  mixed: '#94a3b8',
  negative: '#ef4444'
}

const DETAIL_COMMENTS_PER_PAGE = 8

const formatScore = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '-'
}

const compact = (value) => Number(value || 0).toLocaleString()

const truncateStreetName = (value, limit = 18) => {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

const sentimentColor = (value) => {
  const score = Number(value)
  if (!Number.isFinite(score)) return '#64748b'
  if (score >= 0.25) return SENTIMENT_COLORS.positive
  if (score <= -0.25) return SENTIMENT_COLORS.negative
  return SENTIMENT_COLORS.mixed
}

const percentileColor = (value) => {
  const percentile = Number(value)
  if (!Number.isFinite(percentile)) return '#64748b'
  if (percentile <= 10) return '#ef4444'
  if (percentile <= 25) return '#fb923c'
  if (percentile <= 40) return '#fde047'
  if (percentile <= 55) return '#bef264'
  if (percentile <= 70) return '#4ade80'
  if (percentile <= 90) return '#22d3ee'
  return '#e0f2fe'
}

const fairScore = (street) => Number(street?.sentiment_index ?? street?.avg_sentiment)

const commentSourceKey = (comment) => comment?.source || 'unknown'

const isMapReview = (comment) => /google|map/i.test(String(comment?.source || ''))

const commentRecordLabel = (comment) => {
  if (comment?.comment_id) return `comment_id ${comment.comment_id}`
  if (comment?.source_table) return comment.source_table
  return ''
}

const balancedCommentSample = (comments, limit = 8) => {
  const bySource = new Map()
  comments.forEach((comment) => {
    const source = commentSourceKey(comment)
    if (!bySource.has(source)) bySource.set(source, [])
    bySource.get(source).push(comment)
  })

  const groups = [...bySource.values()]
  const sampled = []
  let cursor = 0

  while (sampled.length < limit && groups.some((group) => cursor < group.length)) {
    groups.forEach((group) => {
      if (sampled.length < limit && group[cursor]) sampled.push(group[cursor])
    })
    cursor += 1
  }

  return sampled
}

const SentimentAnalytics = ({
  analytics,
  segmentsData,
  selectedMonth,
  onMonthChange,
  loading,
  error,
  variant = 'sidebar',
  analyticsMinimized = false,
  onOpenAnalytics,
  sentimentPerspective = 'public'
}) => {
  const [activeView, setActiveView] = useState('overview')
  const [primaryStreet, setPrimaryStreet] = useState('')
  const [compareStreet, setCompareStreet] = useState('')
  const [detailStreet, setDetailStreet] = useState('')
  const [commentCategoryFilter, setCommentCategoryFilter] = useState('all')
  const [commentSourceFilter, setCommentSourceFilter] = useState('all')
  const [detailCommentPage, setDetailCommentPage] = useState(1)
  const contentRef = useRef(null)

  const months = analytics?.months || []
  const streets = analytics?.streets || []
  const topics = analytics?.topics || []
  const categories = analytics?.categories || []
  const comments = analytics?.impactComments || []
  const words = analytics?.words || []
  const daily = analytics?.daily || []
  const distribution = analytics?.sentimentDistribution || []
  const streetWeeks = analytics?.streetWeeks || []
  const anomalies = analytics?.anomalies || []
  const extremeComments = analytics?.extremeComments || []
  const streetDrops = analytics?.streetDrops || []
  const streetMonthly = analytics?.streetMonthly || []
  const streetSources = analytics?.streetSources || []
  const streetThemes = analytics?.streetThemes || []
  const streetBusinesses = analytics?.streetBusinesses || []
  const streetComments = analytics?.streetComments || []

  const streetOptions = useMemo(() => streets.slice(0, 40), [streets])

  const comparisonData = useMemo(() => {
    const chosen = [primaryStreet, compareStreet].filter(Boolean)
    if (!chosen.length || !analytics?.months?.length) return []

    const monthKeys = analytics.months.map((month) => month.month_key)
    const byMonth = Object.fromEntries(monthKeys.map((month) => [month, { month_key: month }]))
    const sourceRows = segmentsData?.features || []

    sourceRows.forEach((feature) => {
      const props = feature.properties || {}
      const streetName = props.sentiment_street_name || props.street_name
      if (!chosen.includes(streetName)) return
      byMonth[selectedMonth || 'all'] = {
        ...(byMonth[selectedMonth || 'all'] || { month_key: selectedMonth || 'all' }),
        [streetName]: Number(props.avg_sentiment)
      }
    })

    return Object.values(byMonth).filter((row) => Object.keys(row).length > 1)
  }, [analytics, compareStreet, primaryStreet, segmentsData, selectedMonth])

  const strongestPositive = comments.filter((comment) => Number(comment.score) >= 0).slice(0, 8)
  const strongestNegative = comments.filter((comment) => Number(comment.score) < 0).slice(0, 8)
  const extremePositive = extremeComments.filter((comment) => comment.type === 'positive').slice(0, 8)
  const extremeNegative = extremeComments.filter((comment) => comment.type === 'negative').slice(0, 8)
  const bestStreet = useMemo(() => streets.reduce((best, street) => (
    fairScore(street) > fairScore(best ?? { sentiment_index: -Infinity }) ? street : best
  ), null), [streets])
  const worstStreet = useMemo(() => streets.reduce((worst, street) => (
    fairScore(street) < fairScore(worst ?? { sentiment_index: Infinity }) ? street : worst
  ), null), [streets])
  const mostActiveStreet = useMemo(() => [...streets].sort((a, b) => Number(b.comment_count || 0) - Number(a.comment_count || 0))[0] || null, [streets])
  const attentionStreets = useMemo(() => [...streets].sort((a, b) => Number(b.attention_score || 0) - Number(a.attention_score || 0)), [streets])
  const bestStreets = useMemo(() => [...streets].sort((a, b) => fairScore(b) - fairScore(a)), [streets])
  const worstStreets = useMemo(() => [...streets].sort((a, b) => fairScore(a) - fairScore(b)), [streets])
  const sampledStreets = useMemo(() => (
    streets.filter((street) => Number(street.comment_count || 0) >= 5)
  ), [streets])
  const attentionPriorityStreets = useMemo(() => (
    [...sampledStreets]
      .filter((street) => (
        Number(street.sentiment_percentile || 0) <= 55
        || Number(street.avg_sentiment || 0) < 0
        || Number(street.negative_count || 0) >= 5
      ))
      .sort((a, b) => (
        Number(b.attention_score || 0) - Number(a.attention_score || 0)
        || Number(a.sentiment_percentile || 0) - Number(b.sentiment_percentile || 0)
        || Number(b.negative_count || 0) - Number(a.negative_count || 0)
      ))
  ), [sampledStreets])
  const healthyStreets = useMemo(() => (
    [...sampledStreets]
      .filter((street) => Number(street.sentiment_percentile || 0) >= 55 && Number(street.avg_sentiment || 0) >= 0)
      .sort((a, b) => (
        Number(b.sentiment_percentile || 0) - Number(a.sentiment_percentile || 0)
        || Number(b.comment_count || 0) - Number(a.comment_count || 0)
      ))
  ), [sampledStreets])
  const highestPriorityStreet = attentionPriorityStreets[0] || null
  const strongestReliableStreet = healthyStreets[0] || null
  const streetStandingData = useMemo(() => (
    [...sampledStreets]
      .map((street) => ({
        ...street,
        comment_count: Number(street.comment_count || 0),
        sentiment_percentile: Number(street.sentiment_percentile || 0),
        negative_count: Number(street.negative_count || 0),
        negative_share: Number(street.comment_count || 0) > 0
          ? (Number(street.negative_count || 0) / Number(street.comment_count || 0)) * 100
          : 0
      }))
      .sort((a, b) => a.sentiment_percentile - b.sentiment_percentile || b.comment_count - a.comment_count)
  ), [sampledStreets])
  const streetBurdenData = useMemo(() => (
    [...sampledStreets]
      .map((street) => ({
        ...street,
        comment_count: Number(street.comment_count || 0),
        sentiment_percentile: Number(street.sentiment_percentile || 0),
        negative_count: Number(street.negative_count || 0),
        negative_share: Number(street.comment_count || 0) > 0
          ? (Number(street.negative_count || 0) / Number(street.comment_count || 0)) * 100
          : 0
      }))
      .filter((street) => street.negative_count > 0)
      .sort((a, b) => b.negative_share - a.negative_share || b.negative_count - a.negative_count || b.comment_count - a.comment_count)
      .slice(0, 10)
  ), [sampledStreets])
  const selectedDetailStreet = detailStreet || primaryStreet || worstStreet?.street_name || ''
  const detailMonthly = useMemo(() => streetMonthly.filter((row) => row.street_name === selectedDetailStreet), [selectedDetailStreet, streetMonthly])
  const detailThemes = useMemo(() => streetThemes.filter((row) => row.street_name === selectedDetailStreet).slice(0, 12), [selectedDetailStreet, streetThemes])
  const detailBusinesses = useMemo(() => (
    streetBusinesses
      .filter((row) => row.street_name === selectedDetailStreet)
      .map((business) => ({
        ...business,
        comment_count: Number(business.comment_count || 0),
        negative_count: Number(business.negative_count || 0),
        positive_count: Number(business.positive_count || 0),
        avg_sentiment: Number(business.avg_sentiment || 0),
        avg_stars: business.avg_stars === null || business.avg_stars === undefined ? null : Number(business.avg_stars),
        negative_share: Number(business.comment_count || 0) > 0
          ? Number(business.negative_count || 0) / Number(business.comment_count || 0)
          : 0,
        positive_share: Number(business.comment_count || 0) > 0
          ? Number(business.positive_count || 0) / Number(business.comment_count || 0)
          : 0
      }))
      .filter((business) => business.comment_count >= 3)
  ), [selectedDetailStreet, streetBusinesses])
  const showBusinessSentiment = sentimentPerspective === 'retail'
  const complaintBusinesses = useMemo(() => (
    [...detailBusinesses]
      .filter((business) => (
        business.negative_count >= 2
        || (business.negative_count >= 1 && business.negative_share >= 0.5)
      ))
      .sort((a, b) => (
        b.negative_share - a.negative_share
        || b.negative_count - a.negative_count
        || a.avg_sentiment - b.avg_sentiment
      ))
      .slice(0, 8)
  ), [detailBusinesses])
  const positiveBusinesses = useMemo(() => (
    [...detailBusinesses]
      .filter((business) => (
        business.positive_count >= 2
        && business.positive_share >= 0.5
        && business.avg_sentiment >= 0.2
      ))
      .sort((a, b) => (
        b.positive_share - a.positive_share
        || b.positive_count - a.positive_count
        || b.avg_sentiment - a.avg_sentiment
      ))
      .slice(0, 8)
  ), [detailBusinesses])
  const detailComments = useMemo(() => streetComments.filter((row) => row.street_name === selectedDetailStreet), [selectedDetailStreet, streetComments])
  const detailCategoryOptions = useMemo(() => {
    const byCategory = new Map()
    detailComments.forEach((comment) => {
      if (commentSourceFilter !== 'all' && (comment.source || 'unknown') !== commentSourceFilter) return
      const category = comment.category || 'Uncategorised'
      byCategory.set(category, (byCategory.get(category) || 0) + 1)
    })
    return [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  }, [commentSourceFilter, detailComments])
  const detailSourceOptions = useMemo(() => {
    const bySource = new Map()
    detailComments.forEach((comment) => {
      if (commentCategoryFilter !== 'all' && (comment.category || 'Uncategorised') !== commentCategoryFilter) return
      const source = comment.source || 'unknown'
      bySource.set(source, (bySource.get(source) || 0) + 1)
    })
    return [...bySource.entries()].sort((a, b) => b[1] - a[1])
  }, [commentCategoryFilter, detailComments])
  const matchingDetailComments = useMemo(() => {
    return detailComments.filter((comment) => {
      const categoryMatch = commentCategoryFilter === 'all' || (comment.category || 'Uncategorised') === commentCategoryFilter
      const sourceMatch = commentSourceFilter === 'all' || (comment.source || 'unknown') === commentSourceFilter
      return categoryMatch && sourceMatch
    })
  }, [commentCategoryFilter, commentSourceFilter, detailComments])
  const filteredDetailComments = useMemo(() => {
    if (commentSourceFilter !== 'all') return matchingDetailComments
    return balancedCommentSample(matchingDetailComments, matchingDetailComments.length)
  }, [commentSourceFilter, matchingDetailComments])
  const detailCommentPageCount = Math.max(1, Math.ceil(filteredDetailComments.length / DETAIL_COMMENTS_PER_PAGE))
  const detailCommentPageStart = (detailCommentPage - 1) * DETAIL_COMMENTS_PER_PAGE
  const pagedDetailComments = filteredDetailComments.slice(detailCommentPageStart, detailCommentPageStart + DETAIL_COMMENTS_PER_PAGE)

  useEffect(() => {
    setCommentCategoryFilter('all')
    setCommentSourceFilter('all')
    setDetailCommentPage(1)
  }, [selectedDetailStreet])

  useEffect(() => {
    setDetailCommentPage(1)
  }, [commentCategoryFilter, commentSourceFilter])

  useEffect(() => {
    setDetailCommentPage((page) => Math.min(page, detailCommentPageCount))
  }, [detailCommentPageCount])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [activeView, selectedMonth, sentimentPerspective, variant])

  const negativeComments = Number(distribution.find((item) => item.label === 'Negative')?.comment_count || 0)
  const isControls = variant === 'controls'

  if (isControls) {
    return (
      <div className="sentiment-analytics sentiment-analytics--controls">
      <div className="analytics-section sentiment-hero">
        <div className="section-header">
            <h3>Sentiment Controls</h3>
          <span className="data-date">{analytics?.metadata?.latest_month || 'Live'}</span>
        </div>
        <p className="sentiment-intro">
            Choose the month shown on the map. The detailed charts and comment analysis now live in the
            wider bottom panel.
        </p>

        <div className="sentiment-month-row">
          <label>
            <span>Map month</span>
            <select value={selectedMonth || 'all'} onChange={(event) => onMonthChange(event.target.value)}>
              <option value="all">All months</option>
              {months.map((month) => (
                <option key={month.month_key} value={month.month_key}>{month.month_key}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="sentiment-error">{error.message}</div>}
        {loading && <div className="sentiment-loading">Loading sentiment...</div>}
          {analytics && (
            <div className="sentiment-control-kpis">
              <div>
                <span>Comments</span>
                <strong>{compact(analytics.metadata.comment_count)}</strong>
              </div>
              <div>
                <span>Avg score</span>
                <strong style={{ color: sentimentColor(analytics.metadata.avg_sentiment) }}>{formatScore(analytics.metadata.avg_sentiment)}</strong>
              </div>
              <div>
                <span>Streets</span>
                <strong>{compact(analytics.metadata.street_count)}</strong>
              </div>
            </div>
          )}
          {analyticsMinimized && (
            <button className="sentiment-open-analytics" onClick={onOpenAnalytics}>
              Show analytics panel
            </button>
          )}
      </div>
      </div>
    )
  }

  return (
    <div className={`sentiment-analytics sentiment-analytics--${variant}`}>
      {(error || loading) && (
        <div className="analytics-section sentiment-status-row">
          {error && <div className="sentiment-error">{error.message}</div>}
          {loading && <div className="sentiment-loading">Loading sentiment...</div>}
        </div>
      )}
      {analytics && (
        <>
          <div className="analytics-section">
            <div className="sentiment-tabs" role="tablist" aria-label="Sentiment analytics views">
              {[
                ['overview', 'Start'],
                ['streets', 'Problem Streets'],
                ['alerts', 'Drops'],
                ['detail', 'Street Detail'],
                ['evidence', 'Evidence']
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={activeView === id ? 'active' : ''}
                  onClick={() => setActiveView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div ref={contentRef} className="analytics-section sentiment-panel-content">
          {activeView === 'overview' && (
            <>
              <div className="sentiment-workflow-grid">
                <button className="sentiment-workflow-card" onClick={() => setActiveView('streets')}>
                  <strong>Find streets needing attention</strong>
                  <span>Ranked by weighted sentiment, negative volume and confidence.</span>
                </button>
                <button className="sentiment-workflow-card" onClick={() => setActiveView('alerts')}>
                  <strong>Check sudden drops</strong>
                  <span>See streets that worsened in a month or triggered anomaly alerts.</span>
                </button>
                <button className="sentiment-workflow-card" onClick={() => setActiveView('detail')}>
                  <strong>Open one street</strong>
                  <span>Trend, themes and comments for a selected street.</span>
                </button>
              </div>

              <div className="sentiment-stat-grid">
                <div className="sentiment-stat-card">
                  <div className="sentiment-stat-value">{compact(analytics.metadata.comment_count)}</div>
                  <div className="sentiment-stat-label">Comments</div>
                </div>
                <div className="sentiment-stat-card primary">
                  <div className="sentiment-stat-value">{formatScore(analytics.metadata.avg_sentiment)}</div>
                  <div className="sentiment-stat-label">Avg sentiment</div>
                </div>
                <div className="sentiment-stat-card">
                  <div className="sentiment-stat-value">{compact(analytics.metadata.street_count)}</div>
                  <div className="sentiment-stat-label">Streets</div>
                </div>
                <div className="sentiment-stat-card">
                  <div className="sentiment-stat-value" style={{ color: SENTIMENT_COLORS.negative }}>{compact(negativeComments)}</div>
                  <div className="sentiment-stat-label">Negative</div>
                </div>
              </div>

              <div className="sentiment-overview-grid sentiment-priority-grid">
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Needs Attention</h4>
                  {attentionStreets.slice(0, 8).map((street) => (
                    <button
                      key={`attention-${street.street_name}`}
                      className="sentiment-action-row"
                      onClick={() => {
                        setDetailStreet(street.street_name)
                        setActiveView('detail')
                      }}
                    >
                      <span>{street.street_name}</span>
                      <strong style={{ color: percentileColor(street.sentiment_percentile) }}>P{Number(street.sentiment_percentile || 0).toFixed(0)}</strong>
                      <small>{compact(street.negative_count)} negative · {compact(street.comment_count)} total</small>
                    </button>
                  ))}
                </div>
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Sudden Drops</h4>
                  {streetDrops.slice(0, 8).map((drop) => (
                    <button
                      key={`${drop.street_name}-${drop.month_key}`}
                      className="sentiment-action-row"
                      onClick={() => {
                        setDetailStreet(drop.street_name)
                        setActiveView('detail')
                      }}
                    >
                      <span>{drop.street_name}</span>
                      <strong style={{ color: SENTIMENT_COLORS.negative }}>{Number(drop.sentiment_delta).toFixed(2)}</strong>
                      <small>{drop.month_key} · {compact(drop.comment_count)} comments</small>
                    </button>
                  ))}
                  {!streetDrops.length && <div className="sentiment-empty">No month-on-month drops with enough comments yet.</div>}
                </div>
              </div>

              <div className="subsection-header"><h4>Monthly Movement</h4></div>
              <div className="sentiment-chart sentiment-chart-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={months}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="month_key" stroke="#94a3b8" fontSize={11} />
                    <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} />
                    <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                    <Bar yAxisId="right" dataKey="comment_count" fill="rgba(148,163,184,0.35)" name="Comments" />
                    <Line yAxisId="left" type="monotone" dataKey="avg_sentiment" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} name="Avg sentiment" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="sentiment-overview-grid sentiment-overview-grid--compact">
                <div className="sentiment-mini-chart">
                  <h4>Sentiment Distribution</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={distribution}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                      <Bar dataKey="comment_count" radius={[6, 6, 0, 0]}>
                        {distribution.map((item) => <Cell key={item.label} fill={item.label === 'Positive' ? SENTIMENT_COLORS.positive : item.label === 'Negative' ? SENTIMENT_COLORS.negative : SENTIMENT_COLORS.mixed} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="sentiment-mini-chart">
                  <h4>Themes</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={categories.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 18 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                      <YAxis type="category" dataKey="category" width={132} stroke="#94a3b8" fontSize={10} tickFormatter={(value) => String(value).slice(0, 22)} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                      <Bar dataKey="comment_count" radius={[0, 6, 6, 0]}>
                        {categories.slice(0, 8).map((category) => <Cell key={category.category} fill={sentimentColor(category.avg_sentiment)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {activeView === 'topics' && (
            <>
              <div className="subsection-header"><h4>Common Topics</h4></div>
              <div className="sentiment-chart sentiment-chart-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topics.slice(0, 14)} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                    <YAxis type="category" dataKey="topic" width={112} stroke="#94a3b8" fontSize={10} tickFormatter={(value) => String(value).slice(0, 20)} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                    <Bar dataKey="comment_count" name="Comments" radius={[0, 6, 6, 0]}>
                      {topics.slice(0, 14).map((topic) => <Cell key={topic.topic} fill={sentimentColor(topic.avg_sentiment)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="sentiment-topic-grid">
                {categories.slice(0, 8).map((category) => (
                  <div key={category.category} className="sentiment-topic-card">
                    <span>{category.category}</span>
                    <strong style={{ color: sentimentColor(category.avg_sentiment) }}>{formatScore(category.avg_sentiment)}</strong>
                    <small>{compact(category.comment_count)} comments</small>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeView === 'streets' && (
            <>
              <div className="sentiment-insight-row">
                {worstStreet && <span>Worst percentile: <strong style={{ color: percentileColor(worstStreet.sentiment_percentile) }}>{worstStreet.street_name}</strong> P{Number(worstStreet.sentiment_percentile || 0).toFixed(0)}</span>}
                {bestStreet && <span>Best percentile: <strong style={{ color: percentileColor(bestStreet.sentiment_percentile) }}>{bestStreet.street_name}</strong> P{Number(bestStreet.sentiment_percentile || 0).toFixed(0)}</span>}
                {mostActiveStreet && <span>Most active: <strong>{mostActiveStreet.street_name}</strong> {compact(mostActiveStreet.comment_count)} posts</span>}
              </div>
              <p className="sentiment-street-explainer">
                Low percentile means weaker overall sentiment. The attention list below only includes streets with weaker sentiment or meaningful negative volume, so strong streets no longer appear there just because they are busy.
              </p>
              <div className="sentiment-overview-grid sentiment-overview-grid--compact">
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Where To Focus First</h4>
                  {highestPriorityStreet ? (
                    <>
                      <div className="sentiment-priority-callout">
                        <strong>{highestPriorityStreet.street_name}</strong>
                        <small>
                          P{Number(highestPriorityStreet.sentiment_percentile || 0).toFixed(0)} · {compact(highestPriorityStreet.negative_count)} negative from {compact(highestPriorityStreet.comment_count)} comments
                        </small>
                      </div>
                      <p className="sentiment-muted">
                        Highest priority blends weak sentiment with enough evidence volume to act on confidently.
                      </p>
                    </>
                  ) : (
                    <div className="sentiment-empty">No clear weak streets with enough comments yet.</div>
                  )}
                </div>
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Strongest Reliable Street</h4>
                  {strongestReliableStreet ? (
                    <>
                      <div className="sentiment-priority-callout sentiment-priority-callout--positive">
                        <strong>{strongestReliableStreet.street_name}</strong>
                        <small>
                          P{Number(strongestReliableStreet.sentiment_percentile || 0).toFixed(0)} · {compact(strongestReliableStreet.comment_count)} comments
                        </small>
                      </div>
                      <p className="sentiment-muted">
                        This is the strongest street among places with enough comments to trust the ranking.
                      </p>
                    </>
                  ) : (
                    <div className="sentiment-empty">No strong streets have enough comments yet.</div>
                  )}
                </div>
              </div>
              <div className="subsection-header"><h4>Needs Attention First</h4></div>
              <div className="sentiment-street-table">
                {attentionPriorityStreets.slice(0, 12).map((street) => (
                  <button
                    key={street.street_name}
                    className="sentiment-street-row sentiment-street-row--button"
                    onClick={() => {
                      setDetailStreet(street.street_name)
                      setActiveView('detail')
                    }}
                  >
                    <span>{street.street_name}</span>
                    <div className="sentiment-row-meter">
                      <i style={{ width: `${Math.min(100, Number(street.attention_score || 0))}%`, background: percentileColor(street.sentiment_percentile) }} />
                    </div>
                    <strong style={{ color: percentileColor(street.sentiment_percentile) }}>P{Number(street.sentiment_percentile || 0).toFixed(0)}</strong>
                    <small>{compact(street.negative_count)} neg / {compact(street.comment_count)}</small>
                  </button>
                ))}
              </div>
              {!attentionPriorityStreets.length && <div className="sentiment-empty">No weak streets with enough evidence are available yet.</div>}
              <div className="subsection-header"><h4>Performing Well</h4></div>
              <div className="sentiment-street-table">
                {healthyStreets.slice(0, 12).map((street) => (
                  <button
                    key={`best-${street.street_name}`}
                    className="sentiment-street-row sentiment-street-row--button"
                    onClick={() => {
                      setDetailStreet(street.street_name)
                      setActiveView('detail')
                    }}
                  >
                    <span>{street.street_name}</span>
                    <div className="sentiment-row-meter">
                      <i style={{ width: `${Math.min(100, Number(street.sentiment_percentile || 0))}%`, background: percentileColor(street.sentiment_percentile) }} />
                    </div>
                    <strong style={{ color: percentileColor(street.sentiment_percentile) }}>P{Number(street.sentiment_percentile || 0).toFixed(0)}</strong>
                    <small>{compact(street.comment_count)} comments</small>
                  </button>
                ))}
              </div>
              {!healthyStreets.length && <div className="sentiment-empty">No high-performing streets with enough evidence are available yet.</div>}
              {streetStandingData.length > 0 && (
                <>
                  <div className="subsection-header"><h4>Street Standing</h4></div>
                  <div className="sentiment-overview-grid sentiment-overview-grid--compact">
                    <div className="sentiment-mini-chart">
                      <h4>Reliable Ranking By Percentile</h4>
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={streetStandingData} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 8 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                          <YAxis
                            type="category"
                            dataKey="street_name"
                            width={120}
                            stroke="#94a3b8"
                            fontSize={10}
                            tickFormatter={(value) => truncateStreetName(value)}
                          />
                          <Tooltip
                            contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }}
                            labelFormatter={(label) => label}
                            formatter={(value, name, item) => {
                              if (name === 'sentiment_percentile') return [`P${Number(value).toFixed(0)}`, 'Percentile']
                              if (name === 'comment_count') return [compact(value), 'Comments']
                              return [value, name]
                            }}
                          />
                          <Bar dataKey="sentiment_percentile" name="sentiment_percentile" radius={[0, 6, 6, 0]}>
                            {streetStandingData.map((street) => (
                              <Cell key={`standing-${street.street_name}`} fill={percentileColor(street.sentiment_percentile)} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="sentiment-matrix-caption">
                        This is the cleanest overall ranking. Lower bars are weaker streets; higher bars are stronger streets, using only streets with enough comments to trust the comparison.
                      </p>
                    </div>
                    <div className="sentiment-mini-chart">
                      <h4>Highest Complaint Burden</h4>
                      <ResponsiveContainer width="100%" height={340}>
                        <BarChart data={streetBurdenData} layout="vertical" margin={{ top: 8, right: 18, bottom: 8, left: 8 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} />
                          <YAxis
                            type="category"
                            dataKey="street_name"
                            width={120}
                            stroke="#94a3b8"
                            fontSize={10}
                            tickFormatter={(value) => truncateStreetName(value)}
                          />
                          <Tooltip
                            contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }}
                            labelFormatter={(label) => label}
                            formatter={(value, name, item) => {
                              if (name === 'negative_share') return [`${Number(value).toFixed(1)}%`, 'Negative share']
                              if (name === 'negative_count') return [compact(value), 'Negative comments']
                              if (name === 'comment_count') return [compact(value), 'Comments']
                              return [value, name]
                            }}
                          />
                          <Bar dataKey="negative_share" name="negative_share" fill="rgba(239,68,68,0.78)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="sentiment-matrix-caption">
                        This shows where the complaint share is heaviest. It helps separate streets that are broadly weak from streets where the negative tone is especially concentrated.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeView === 'alerts' && (
            <>
              <div className="sentiment-insight-row">
                <span>Monthly drops: <strong style={{ color: SENTIMENT_COLORS.negative }}>{streetDrops.length}</strong></span>
                <span>Low anomalies: <strong style={{ color: SENTIMENT_COLORS.negative }}>{anomalies.filter((item) => item.direction === 'Low').length}</strong></span>
                <span>High anomalies: <strong style={{ color: SENTIMENT_COLORS.positive }}>{anomalies.filter((item) => item.direction === 'High').length}</strong></span>
              </div>
              <div className="subsection-header"><h4>Largest Month Drops</h4></div>
              <div className="sentiment-anomaly-list">
                {streetDrops.length ? streetDrops.slice(0, 24).map((item) => (
                  <button
                    key={`${item.street_name}-${item.month_key}-drop`}
                    className="sentiment-anomaly-card low sentiment-anomaly-card--button"
                    onClick={() => {
                      setDetailStreet(item.street_name)
                      setActiveView('detail')
                    }}
                  >
                    <span>{item.street_name}</span>
                    <strong style={{ color: SENTIMENT_COLORS.negative }}>{Number(item.sentiment_delta).toFixed(2)}</strong>
                    <small>{item.month_key} · from {formatScore(item.previous_sentiment)} to {formatScore(item.avg_sentiment)} · {item.comment_count} posts</small>
                  </button>
                )) : (
                  <div className="sentiment-empty">No month-on-month drops with enough comments yet.</div>
                )}
              </div>
              <div className="subsection-header"><h4>Sentiment Anomaly Detection</h4></div>
              <div className="sentiment-anomaly-list">
                {anomalies.length ? anomalies.slice(0, 30).map((item) => (
                  <div key={`${item.street_name}-${item.day_key}`} className={`sentiment-anomaly-card ${item.direction === 'Low' ? 'low' : 'high'}`}>
                    <span>{item.street_name}</span>
                    <strong style={{ color: sentimentColor(item.avg_score) }}>{formatScore(item.avg_score)}</strong>
                    <small>{item.day_key} · z {Number(item.z_score).toFixed(2)} · {item.post_count} posts</small>
                  </div>
                )) : (
                  <div className="sentiment-empty">No significant anomalies detected.</div>
                )}
              </div>
            </>
          )}

          {activeView === 'detail' && (
            <>
              <div className="sentiment-detail-header">
                <label>
                  <span>Street detail</span>
                  <select value={selectedDetailStreet} onChange={(event) => setDetailStreet(event.target.value)}>
                    <option value="">Choose street</option>
                    {streetOptions.map((street) => <option key={street.street_name} value={street.street_name}>{street.street_name}</option>)}
                  </select>
                </label>
                {selectedDetailStreet && (
                  <div className="sentiment-detail-title">
                    <strong>{selectedDetailStreet}</strong>
                    <small>Monthly trend, complaint themes and comments</small>
                  </div>
                )}
              </div>

              {selectedDetailStreet ? (
                <>
                  <div className="sentiment-chart sentiment-chart-tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={detailMonthly}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="month_key" stroke="#94a3b8" fontSize={11} />
                        <YAxis yAxisId="left" stroke="#94a3b8" fontSize={11} domain={[-1, 1]} />
                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={11} />
                        <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                        <Bar yAxisId="right" dataKey="comment_count" fill="rgba(148,163,184,0.35)" name="Comments" />
                        <Bar yAxisId="right" dataKey="negative_count" fill="rgba(239,68,68,0.35)" name="Negative comments" />
                        <Line yAxisId="left" type="monotone" dataKey="avg_sentiment" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} name="Avg sentiment" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="sentiment-overview-grid">
                    <div className="sentiment-mini-chart sentiment-list-panel">
                      <h4>Complaint Themes</h4>
                      {detailThemes.map((item) => (
                        <div key={`${item.category}-${item.topic}`} className="sentiment-breakdown-row">
                          <span>{item.category} · {item.topic}</span>
                          <strong>{compact(item.negative_count)} neg</strong>
                          <small style={{ color: sentimentColor(item.avg_sentiment) }}>{formatScore(item.avg_sentiment)}</small>
                        </div>
                      ))}
                      {!detailThemes.length && <div className="sentiment-empty">No themes found for this street.</div>}
                    </div>
                  </div>

                  {showBusinessSentiment && (
                    <>
                      <div className="subsection-header"><h4>Business Sentiment</h4></div>
                      <p className="sentiment-street-explainer">
                        Business sentiment is only shown for the retail lens and only includes businesses with at least 3 matched Google Maps reviews on this street.
                      </p>
                      <div className="sentiment-business-grid">
                        <div className="sentiment-business-panel">
                          <h4>Most Complaints</h4>
                          <div className="sentiment-business-list">
                            {complaintBusinesses.map((business) => (
                              <BusinessSentimentRow
                                key={`complaint-${business.street_name}-${business.place_name}`}
                                business={business}
                                mode="negative"
                              />
                            ))}
                          </div>
                          {!complaintBusinesses.length && <div className="sentiment-empty">No complaint-heavy businesses with enough matched reviews were found for this street.</div>}
                        </div>
                        <div className="sentiment-business-panel">
                          <h4>Doing Well</h4>
                          <div className="sentiment-business-list">
                            {positiveBusinesses.map((business) => (
                              <BusinessSentimentRow
                                key={`positive-${business.street_name}-${business.place_name}`}
                                business={business}
                                mode="positive"
                              />
                            ))}
                          </div>
                          {!positiveBusinesses.length && <div className="sentiment-empty">No strong retail businesses with enough matched reviews were found for this street.</div>}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="subsection-header"><h4>Drill Into Comments</h4></div>
                  <div className="sentiment-comment-filters">
                    <label>
                      <span>Category</span>
                      <select value={commentCategoryFilter} onChange={(event) => setCommentCategoryFilter(event.target.value)}>
                        <option value="all">All categories</option>
                        {detailCategoryOptions.map(([category, count]) => (
                          <option key={category} value={category}>{category} ({compact(count)})</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Source</span>
                      <select value={commentSourceFilter} onChange={(event) => setCommentSourceFilter(event.target.value)}>
                        <option value="all">All sources</option>
                        {detailSourceOptions.map(([source, count]) => (
                          <option key={source} value={source}>{String(source).replace(/_/g, ' ')} ({compact(count)})</option>
                        ))}
                      </select>
                    </label>
                    {(commentCategoryFilter !== 'all' || commentSourceFilter !== 'all') && (
                      <button
                        className="sentiment-clear-filters"
                        onClick={() => {
                          setCommentCategoryFilter('all')
                          setCommentSourceFilter('all')
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                  <div className="sentiment-filter-summary">
                    Showing {filteredDetailComments.length ? `${compact(detailCommentPageStart + 1)}-${compact(Math.min(detailCommentPageStart + DETAIL_COMMENTS_PER_PAGE, filteredDetailComments.length))}` : '0'} of {compact(matchingDetailComments.length)} matching comments
                    {commentCategoryFilter !== 'all' && ` · ${commentCategoryFilter}`}
                    {commentSourceFilter !== 'all' && ` · ${String(commentSourceFilter).replace(/_/g, ' ')}`}
                    {filteredDetailComments.length > DETAIL_COMMENTS_PER_PAGE && ` · page ${compact(detailCommentPage)} of ${compact(detailCommentPageCount)}`}
                  </div>
                  {filteredDetailComments.length > DETAIL_COMMENTS_PER_PAGE && (
                    <div className="sentiment-comment-pagination" aria-label="Comment pages">
                      <button
                        type="button"
                        onClick={() => setDetailCommentPage((page) => Math.max(1, page - 1))}
                        disabled={detailCommentPage <= 1}
                      >
                        Previous
                      </button>
                      <span>{compact(detailCommentPage)} / {compact(detailCommentPageCount)}</span>
                      <button
                        type="button"
                        onClick={() => setDetailCommentPage((page) => Math.min(detailCommentPageCount, page + 1))}
                        disabled={detailCommentPage >= detailCommentPageCount}
                      >
                        Next
                      </button>
                    </div>
                  )}
                  <div className="sentiment-comment-list">
                    {pagedDetailComments.map((comment, index) => (
                      <CommentCard key={`${comment.comment_id || comment.month_key}-${comment.street_name}-${detailCommentPageStart + index}`} comment={comment} />
                    ))}
                    {!detailComments.length && <div className="sentiment-empty">No comments available for this street in the current extract.</div>}
                    {detailComments.length > 0 && !filteredDetailComments.length && <div className="sentiment-empty">No comments match this category/source combination.</div>}
                  </div>
                </>
              ) : (
                <div className="sentiment-empty">Choose a street to open its detail layer.</div>
              )}
            </>
          )}

          {activeView === 'comments' && (
            <>
              <div className="subsection-header"><h4>Largest Positive Effects</h4></div>
              <div className="sentiment-comment-list">
                {(extremePositive.length ? extremePositive : strongestPositive).map((comment, index) => (
                  <CommentCard key={`${comment.month_key}-pos-${index}`} comment={comment} />
                ))}
              </div>
              <div className="subsection-header"><h4>Largest Negative Effects</h4></div>
              <div className="sentiment-comment-list">
                {(extremeNegative.length ? extremeNegative : strongestNegative).map((comment, index) => (
                  <CommentCard key={`${comment.month_key}-neg-${index}`} comment={comment} />
                ))}
              </div>
            </>
          )}

          {activeView === 'evidence' && (
            <>
              <div className="sentiment-overview-grid">
                <div className="sentiment-mini-chart">
                  <h4>Daily Post Volume</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={daily}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="day_key" stroke="#94a3b8" fontSize={10} tickFormatter={(value) => String(value).slice(5, 10)} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                      <Bar dataKey="comment_count" fill="rgba(148,163,184,0.38)" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="avg_sentiment" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="subsection-header"><h4>Largest Negative Effects</h4></div>
              <div className="sentiment-comment-list sentiment-comment-list--compact">
                {(extremeNegative.length ? extremeNegative : strongestNegative).slice(0, 6).map((comment, index) => (
                  <CommentCard key={`${comment.month_key}-evidence-neg-${index}`} comment={comment} />
                ))}
              </div>

              <div className="subsection-header"><h4>Words People Use</h4></div>
              <div className="sentiment-word-cloud">
                {words.slice(0, 36).map((word) => (
                  <span key={word.word} style={{ color: sentimentColor(word.avg_sentiment) }}>
                    {word.word}
                    <small>{word.count}</small>
                  </span>
                ))}
              </div>
            </>
          )}

          {activeView === 'words' && (
            <>
              <div className="subsection-header"><h4>Words People Use</h4></div>
              <div className="sentiment-chart sentiment-chart-tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="count" name="Uses" stroke="#94a3b8" fontSize={11} />
                    <YAxis dataKey="avg_sentiment" name="Sentiment" stroke="#94a3b8" fontSize={11} domain={[-1, 1]} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                    <Scatter data={words.slice(0, 40)} dataKey="avg_sentiment">
                      {words.slice(0, 40).map((word) => <Cell key={word.word} fill={sentimentColor(word.avg_sentiment)} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="sentiment-word-cloud">
                {words.slice(0, 36).map((word) => (
                  <span key={word.word} style={{ color: sentimentColor(word.avg_sentiment) }}>
                    {word.word}
                    <small>{word.count}</small>
                  </span>
                ))}
              </div>
            </>
          )}
          </div>
        </>
      )}
    </div>
  )
}

const BusinessSentimentRow = ({ business, mode }) => {
  const isPositive = mode === 'positive'
  const signalCount = Number((isPositive ? business.positive_count : business.negative_count) || 0)
  const totalCount = Math.max(1, Number(business.comment_count || 0))
  const signalShare = Math.round((signalCount / totalCount) * 100)
  const color = isPositive ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative

  return (
    <article className="sentiment-business-row">
      <div className="sentiment-business-row-main">
        <strong>{business.place_name}</strong>
        <span>{compact(signalCount)} {isPositive ? 'positive' : 'complaints'} · {compact(business.comment_count)} total</span>
      </div>
      <div className="sentiment-business-row-score">
        <strong style={{ color }}>{formatScore(business.avg_sentiment)}</strong>
        {business.avg_stars !== null && business.avg_stars !== undefined && <small>{Number(business.avg_stars).toFixed(1)} stars</small>}
      </div>
      <div className="sentiment-business-meter" aria-hidden="true">
        <i style={{ width: `${Math.max(6, signalShare)}%`, background: color }} />
      </div>
      {business.url && <a href={business.url} target="_blank" rel="noreferrer">Open source</a>}
    </article>
  )
}

const CommentCard = ({ comment }) => (
  <article className="sentiment-comment-card">
    <div className="sentiment-comment-meta">
      <strong style={{ color: sentimentColor(comment.score) }}>{formatScore(comment.score)}</strong>
      <span>{isMapReview(comment) && comment.place_name ? `${comment.street_name || 'Unknown street'} · ${comment.place_name}` : comment.street_name || 'Unknown street'}</span>
      <small>{comment.month_key}</small>
    </div>
    <p>{comment.comment_text}</p>
    <div className="sentiment-comment-tags">
      {comment.topic && <span>{comment.topic}</span>}
      {comment.category && <span>{comment.category}</span>}
      {comment.source && <span>{String(comment.source).replace(/_/g, ' ')}</span>}
      {isMapReview(comment) && comment.place_name && <span className="sentiment-place-tag">{comment.place_name}</span>}
      {comment.comment_date && <span>{comment.comment_date}</span>}
      {commentRecordLabel(comment) && <span>{commentRecordLabel(comment)}</span>}
      {comment.stars !== null && comment.stars !== undefined && <span>{Number(comment.stars).toFixed(0)} stars</span>}
      {comment.url && <a href={comment.url} target="_blank" rel="noreferrer">Open source</a>}
    </div>
  </article>
)

export default SentimentAnalytics
