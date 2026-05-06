import React, { useEffect, useMemo, useState } from 'react'
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

const formatScore = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '-'
}

const compact = (value) => Number(value || 0).toLocaleString()

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
  onOpenAnalytics
}) => {
  const [activeView, setActiveView] = useState('overview')
  const [primaryStreet, setPrimaryStreet] = useState('')
  const [compareStreet, setCompareStreet] = useState('')
  const [detailStreet, setDetailStreet] = useState('')
  const [commentCategoryFilter, setCommentCategoryFilter] = useState('all')
  const [commentSourceFilter, setCommentSourceFilter] = useState('all')

  const months = analytics?.months || []
  const streets = analytics?.streets || []
  const topics = analytics?.topics || []
  const categories = analytics?.categories || []
  const comments = analytics?.impactComments || []
  const words = analytics?.words || []
  const sources = analytics?.sources || []
  const engines = analytics?.engines || []
  const daily = analytics?.daily || []
  const distribution = analytics?.sentimentDistribution || []
  const streetWeeks = analytics?.streetWeeks || []
  const anomalies = analytics?.anomalies || []
  const extremeComments = analytics?.extremeComments || []
  const streetDrops = analytics?.streetDrops || []
  const streetMonthly = analytics?.streetMonthly || []
  const streetSources = analytics?.streetSources || []
  const streetThemes = analytics?.streetThemes || []
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
  const selectedDetailStreet = detailStreet || primaryStreet || worstStreet?.street_name || ''
  const detailMonthly = useMemo(() => streetMonthly.filter((row) => row.street_name === selectedDetailStreet), [selectedDetailStreet, streetMonthly])
  const detailSources = useMemo(() => streetSources.filter((row) => row.street_name === selectedDetailStreet).slice(0, 10), [selectedDetailStreet, streetSources])
  const detailThemes = useMemo(() => streetThemes.filter((row) => row.street_name === selectedDetailStreet).slice(0, 12), [selectedDetailStreet, streetThemes])
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
    if (commentSourceFilter !== 'all') return matchingDetailComments.slice(0, 8)
    return balancedCommentSample(matchingDetailComments, 8)
  }, [commentSourceFilter, matchingDetailComments])

  useEffect(() => {
    setCommentCategoryFilter('all')
    setCommentSourceFilter('all')
  }, [selectedDetailStreet])
  const negativeComments = Number(distribution.find((item) => item.label === 'Negative')?.comment_count || 0)
  const positiveComments = Number(distribution.find((item) => item.label === 'Positive')?.comment_count || 0)
  const neutralComments = Number(distribution.find((item) => item.label === 'Neutral')?.comment_count || 0)
  const geminiRows = engines.find((item) => String(item.engine).toLowerCase().includes('gemini'))?.comment_count || 0
  const heatmapWeeks = useMemo(() => (
    [...new Set(streetWeeks.map((row) => row.week))].sort((a, b) => Number(a) - Number(b))
  ), [streetWeeks])
  const heatmapRows = useMemo(() => {
    const topStreetNames = new Set(streets.slice(0, 18).map((street) => street.street_name))
    const byStreet = new Map()
    streetWeeks.forEach((row) => {
      if (!topStreetNames.has(row.street_name)) return
      if (!byStreet.has(row.street_name)) byStreet.set(row.street_name, {})
      byStreet.get(row.street_name)[row.week] = row
    })
    return [...byStreet.entries()].map(([streetName, weeks]) => ({ streetName, weeks }))
  }, [streetWeeks, streets])
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
                ['evidence', 'Evidence'],
                ['data', 'Sources']
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

          {activeView === 'overview' && (
            <div className="analytics-section">
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
                  <span>Trend, themes, sources and comments for a selected street.</span>
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
            </div>
          )}

          {activeView === 'topics' && (
            <div className="analytics-section">
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
            </div>
          )}

          {activeView === 'streets' && (
            <div className="analytics-section">
              <div className="sentiment-insight-row">
                {worstStreet && <span>Worst percentile: <strong style={{ color: percentileColor(worstStreet.sentiment_percentile) }}>{worstStreet.street_name}</strong> P{Number(worstStreet.sentiment_percentile || 0).toFixed(0)}</span>}
                {bestStreet && <span>Best percentile: <strong style={{ color: percentileColor(bestStreet.sentiment_percentile) }}>{bestStreet.street_name}</strong> P{Number(bestStreet.sentiment_percentile || 0).toFixed(0)}</span>}
                {mostActiveStreet && <span>Most active: <strong>{mostActiveStreet.street_name}</strong> {compact(mostActiveStreet.comment_count)} posts</span>}
              </div>
              <div className="subsection-header"><h4>Problem Streets</h4></div>
              <div className="sentiment-street-table">
                {attentionStreets.slice(0, 24).map((street) => (
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
                    <small>{compact(street.negative_count)}/{compact(street.comment_count)}</small>
                  </button>
                ))}
              </div>
              <div className="subsection-header"><h4>Best Performing Streets</h4></div>
              <div className="sentiment-street-table">
                {bestStreets.slice(0, 12).map((street) => (
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
                    <small>{compact(street.comment_count)}</small>
                  </button>
                ))}
              </div>
              {heatmapRows.length > 0 && (
                <>
                  <div className="subsection-header"><h4>Street x Week Heatmap</h4></div>
                  <div className="sentiment-week-heatmap">
                    <div className="sentiment-week-head">
                      <span>Street</span>
                      {heatmapWeeks.map((week) => <strong key={week}>W{week}</strong>)}
                    </div>
                    {heatmapRows.map((row) => (
                      <div key={row.streetName} className="sentiment-week-row">
                        <span>{row.streetName}</span>
                        {heatmapWeeks.map((week) => {
                          const cell = row.weeks[week]
                          return (
                            <i
                              key={week}
                              title={cell ? `${row.streetName} W${week}: ${formatScore(cell.avg_sentiment)} (${cell.comment_count} comments)` : 'No posts'}
                              style={{ background: cell ? sentimentColor(cell.avg_sentiment) : 'rgba(255,255,255,0.05)', opacity: cell ? 0.9 : 0.35 }}
                            />
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {activeView === 'alerts' && (
            <div className="analytics-section">
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
            </div>
          )}

          {activeView === 'detail' && (
            <div className="analytics-section">
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
                    <small>Monthly trend, complaint themes, sources and comments</small>
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
                    <div className="sentiment-mini-chart sentiment-list-panel">
                      <h4>Source Mix</h4>
                      {detailSources.map((item) => (
                        <div key={item.source} className={`sentiment-breakdown-row ${Number(item.source_priority) === 1 ? 'priority' : ''}`}>
                          <span>{String(item.source).replace(/_/g, ' ')}</span>
                          <strong>{compact(item.comment_count)}</strong>
                          <small style={{ color: sentimentColor(item.avg_sentiment) }}>{formatScore(item.avg_sentiment)}</small>
                        </div>
                      ))}
                      {!detailSources.length && <div className="sentiment-empty">No source breakdown found for this street.</div>}
                    </div>
                  </div>

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
                    Showing {compact(filteredDetailComments.length)} of {compact(matchingDetailComments.length)} matching comments
                    {commentCategoryFilter !== 'all' && ` · ${commentCategoryFilter}`}
                    {commentSourceFilter !== 'all' && ` · ${String(commentSourceFilter).replace(/_/g, ' ')}`}
                    {matchingDetailComments.length > filteredDetailComments.length && ' · top 8 shown'}
                  </div>
                  <div className="sentiment-comment-list">
                    {filteredDetailComments.map((comment, index) => (
                      <CommentCard key={`${comment.month_key}-${comment.street_name}-${index}`} comment={comment} />
                    ))}
                    {!detailComments.length && <div className="sentiment-empty">No comments available for this street in the current extract.</div>}
                    {detailComments.length > 0 && !filteredDetailComments.length && <div className="sentiment-empty">No comments match this category/source combination.</div>}
                  </div>
                </>
              ) : (
                <div className="sentiment-empty">Choose a street to open its detail layer.</div>
              )}
            </div>
          )}

          {activeView === 'comments' && (
            <div className="analytics-section">
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
            </div>
          )}

          {activeView === 'evidence' && (
            <div className="analytics-section">
              <div className="sentiment-overview-grid">
                <div className="sentiment-mini-chart">
                  <h4>Source Mix</h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={sources.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 18 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                      <YAxis type="category" dataKey="source" width={116} stroke="#94a3b8" fontSize={10} tickFormatter={(value) => String(value).replace(/_/g, ' ').slice(0, 20)} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8 }} />
                      <Bar dataKey="comment_count" fill="#38bdf8" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
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
            </div>
          )}

          {activeView === 'words' && (
            <div className="analytics-section">
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
            </div>
          )}

          {activeView === 'data' && (
            <div className="analytics-section">
              <div className="sentiment-overview-grid">
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Source Breakdown</h4>
                  {sources.map((item) => (
                    <div key={item.source} className="sentiment-breakdown-row">
                      <span>{String(item.source).replace(/_/g, ' ')}</span>
                      <strong>{compact(item.comment_count)}</strong>
                      <small style={{ color: sentimentColor(item.avg_sentiment) }}>{formatScore(item.avg_sentiment)}</small>
                    </div>
                  ))}
                </div>
                <div className="sentiment-mini-chart sentiment-list-panel">
                  <h4>Scoring Engine</h4>
                  {engines.map((item) => (
                    <div key={item.engine} className="sentiment-breakdown-row">
                      <span>{String(item.engine).replace(/_/g, ' ')}</span>
                      <strong>{compact(item.comment_count)}</strong>
                      <small style={{ color: sentimentColor(item.avg_sentiment) }}>{formatScore(item.avg_sentiment)}</small>
                    </div>
                  ))}
                </div>
                <div className="sentiment-mini-chart sentiment-list-panel sentiment-extreme-panel">
                  <h4>Most Positive Post</h4>
                  {(extremePositive[0] || strongestPositive[0]) ? <CommentCard comment={extremePositive[0] || strongestPositive[0]} /> : <div className="sentiment-empty">No positive post found.</div>}
                </div>
                <div className="sentiment-mini-chart sentiment-list-panel sentiment-extreme-panel">
                  <h4>Most Negative Post</h4>
                  {(extremeNegative[0] || strongestNegative[0]) ? <CommentCard comment={extremeNegative[0] || strongestNegative[0]} /> : <div className="sentiment-empty">No negative post found.</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
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
      {comment.stars !== null && comment.stars !== undefined && <span>{Number(comment.stars).toFixed(0)} stars</span>}
      {comment.url && <a href={comment.url} target="_blank" rel="noreferrer">Open source</a>}
    </div>
  </article>
)

export default SentimentAnalytics
