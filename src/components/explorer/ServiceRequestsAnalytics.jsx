import React, { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import './ServiceRequestsAnalytics.css'

const compact = (value) => Number(value || 0).toLocaleString()

const number = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const days = (value) => {
  const numeric = number(value)
  if (numeric === null) return '-'
  if (numeric < 1) return '<1d'
  return `${numeric.toFixed(numeric >= 10 ? 0 : 1)}d`
}

const dateLabel = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
}

const barColors = ['#f8fafc', '#d1d5db', '#9ca3af', '#6b7280']

const COMPLAINT_GROUP_COLORS = {
  Sewage: '#2563eb',
  Water: '#06b6d4',
  Electricity: '#f59e0b',
  'Roads & Stormwater': '#a855f7',
  'Waste & Cleansing': '#22c55e',
  'Public Realm': '#84cc16',
  Other: '#94a3b8'
}

const complaintColor = (group) => COMPLAINT_GROUP_COLORS[group] || COMPLAINT_GROUP_COLORS.Other

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="service-tooltip">
      <strong>{dateLabel(label)}</strong>
      {payload.map((item) => (
        <div key={item.dataKey}>
          <span style={{ color: item.color }}>{item.name}</span>
          <b>{item.dataKey?.includes('response') ? days(item.value) : compact(item.value)}</b>
        </div>
      ))}
    </div>
  )
}

const ServiceRequestsAnalytics = ({ analytics, requestsData, loading, error, variant = 'bottom' }) => {
  const [activeView, setActiveView] = useState('pulse')
  const metadata = analytics?.metadata || {}
  const daily = analytics?.daily || []
  const monthly = analytics?.monthly || []
  const complaintTypes = analytics?.complaintTypes || []
  const workCenters = analytics?.workCenters || []
  const responseBands = analytics?.responseBands || []
  const weekdays = analytics?.weekdays || []
  const surgeDays = analytics?.surgeDays || []
  const slowestCompleted = analytics?.slowestCompleted || []
  const incompleteRecords = analytics?.incompleteRecords || []

  const recentDaily = useMemo(() => daily.slice(-120), [daily])
  const topComplaints = useMemo(() => complaintTypes.slice(0, 10), [complaintTypes])
  const topWorkCenters = useMemo(() => workCenters.slice(0, 8), [workCenters])
  const completedResponseBands = useMemo(
    () => responseBands.filter((row) => row.response_band !== 'Incomplete'),
    [responseBands]
  )
  const mappedCount = requestsData?.metadata?.mapped_count ?? metadata.mapped_count

  if (loading && !analytics) {
    return <div className={`service-analytics service-analytics--${variant}`}><div className="service-loading">Loading service request intelligence...</div></div>
  }

  if (error) {
    return <div className={`service-analytics service-analytics--${variant}`}><div className="service-error">{error.message || 'Service request analytics failed to load.'}</div></div>
  }

  return (
    <div className={`service-analytics service-analytics--${variant}`}>
      <section className="service-hero">
        <div className="service-hero-copy">
          <span>Infrastructure Response</span>
          <h3>Service Requests</h3>
          <p>{dateLabel(metadata.first_created)} to {dateLabel(metadata.latest_created)} · {compact(mappedCount)} mapped requests</p>
        </div>
        <div className="service-kpi-grid">
          <div className="service-kpi service-kpi--primary">
            <span>Total requests</span>
            <strong>{compact(metadata.request_count)}</strong>
          </div>
          <div className="service-kpi">
            <span>Incomplete records</span>
            <strong>{compact(metadata.incomplete_count)}</strong>
          </div>
          <div className="service-kpi">
            <span>Median response</span>
            <strong>{days(metadata.median_response_days)}</strong>
          </div>
          <div className="service-kpi">
            <span>P90 response</span>
            <strong>{days(metadata.p90_response_days)}</strong>
          </div>
          <div className="service-kpi">
            <span>Complete date coverage</span>
            <strong>{number(metadata.completion_record_rate)?.toFixed(1) ?? '-'}%</strong>
          </div>
        </div>
      </section>

      <section className="service-tabs" role="tablist" aria-label="Service request analytics views">
        {[
          ['pulse', 'Demand Pulse'],
          ['response', 'Response Speed'],
          ['types', 'Complaint Mix'],
          ['quality', 'Data Quality']
        ].map(([id, label]) => (
          <button key={id} className={activeView === id ? 'active' : ''} onClick={() => setActiveView(id)}>
            {label}
          </button>
        ))}
      </section>

      {activeView === 'pulse' && (
        <section className="service-dashboard-grid service-dashboard-grid--pulse">
          <div className="service-chart-card service-chart-card--wide">
            <div className="service-card-header">
              <h4>Daily request pressure</h4>
              <span>{recentDaily.length} recent days</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={recentDaily}>
                <defs>
                  <linearGradient id="serviceDemandGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e5e7eb" stopOpacity={0.58} />
                    <stop offset="95%" stopColor="#64748b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="day_key" tickFormatter={dateLabel} tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={28} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={34} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="request_count" name="Requests" fill="url(#serviceDemandGradient)" stroke="#e5e7eb" strokeWidth={2} />
                <Line type="monotone" dataKey="rolling_7d_count" name="7-day avg" stroke="#cbd5e1" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="service-chart-card">
            <div className="service-card-header">
              <h4>Surge days</h4>
              <span>statistical spikes</span>
            </div>
            <div className="service-surge-list">
              {surgeDays.slice(0, 7).map((row) => (
                <div key={row.day_key} className="service-ranked-row">
                  <div>
                    <strong>{dateLabel(row.day_key)}</strong>
                    <span>{days(row.avg_response_days)} avg response</span>
                  </div>
                  <b>{compact(row.request_count)}</b>
                </div>
              ))}
              {!surgeDays.length && <div className="service-empty">No surge days detected.</div>}
            </div>
          </div>
          <div className="service-chart-card">
            <div className="service-card-header">
              <h4>Monthly volume</h4>
              <span>with incomplete records</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthly.slice(-18)}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="month_key" tick={{ fill: '#94a3b8', fontSize: 10 }} minTickGap={18} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={34} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="request_count" name="Requests" fill="#cbd5e1" radius={[5, 5, 0, 0]} />
                <Bar dataKey="incomplete_count" name="Incomplete" fill="#6b7280" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {activeView === 'response' && (
        <section className="service-dashboard-grid">
          <div className="service-chart-card">
            <div className="service-card-header">
              <h4>Completed response bands</h4>
              <span>created + completed dates only</span>
            </div>
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={completedResponseBands}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="response_band" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={34} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="request_count" name="Requests" radius={[6, 6, 0, 0]}>
                  {completedResponseBands.map((_, index) => <Cell key={index} fill={barColors[index % barColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="service-chart-card">
            <div className="service-card-header">
              <h4>Weekday pattern</h4>
              <span>request load</span>
            </div>
            <ResponsiveContainer width="100%" height={235}>
              <ComposedChart data={weekdays}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="weekday_label" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} width={34} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={34} />
                <Tooltip content={<CustomTooltip />} />
                <Bar yAxisId="left" dataKey="request_count" name="Requests" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="avg_response_days" name="Avg response" stroke="#f8fafc" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="service-chart-card service-list-card">
            <div className="service-card-header">
              <h4>Slowest completed</h4>
              <span>long tail</span>
            </div>
            {slowestCompleted.slice(0, 8).map((row) => (
              <div key={row.object_id} className="service-ranked-row">
                <div>
                  <strong>{row.complaint_type}</strong>
                  <span>{row.work_center}</span>
                </div>
                <b>{days(row.response_days)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeView === 'types' && (
        <section className="service-dashboard-grid">
          <div className="service-chart-card service-chart-card--wide">
            <div className="service-card-header">
              <h4>Top complaint types</h4>
              <span>volume and speed</span>
            </div>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={topComplaints} layout="vertical" margin={{ left: 12, right: 20 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis type="category" dataKey="complaint_type" tick={{ fill: '#cbd5e1', fontSize: 10 }} width={145} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="request_count" name="Requests" radius={[0, 6, 6, 0]}>
                  {topComplaints.map((row) => (
                    <Cell key={row.complaint_type} fill={complaintColor(row.complaint_group)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="service-chart-card service-list-card">
            <div className="service-card-header">
              <h4>Work centers</h4>
              <span>operational load</span>
            </div>
            {topWorkCenters.map((row) => (
              <div key={row.work_center} className="service-ranked-row">
                <div>
                  <strong>{row.work_center}</strong>
                  <span>{compact(row.incomplete_count)} incomplete · {days(row.avg_response_days)} avg</span>
                </div>
                <b>{compact(row.request_count)}</b>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeView === 'quality' && (
        <section className="service-dashboard-grid service-dashboard-grid--backlog">
          <div className="service-chart-card service-list-card service-chart-card--wide">
            <div className="service-card-header">
              <h4>Records missing completion dates</h4>
              <span>excluded from response-time calculations</span>
            </div>
            <div className="service-open-grid">
              {incompleteRecords.slice(0, 18).map((row) => (
                <div key={row.object_id} className="service-open-card">
                  <span>{row.complaint_type}</span>
                  <strong>{days(row.age_days)}</strong>
                  <small>{row.work_center}</small>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default ServiceRequestsAnalytics
