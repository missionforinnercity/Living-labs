import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'
import { MAPBOX_TOKEN } from '../utils/mapboxToken'
import './WardExplorer.css'

const BASE_MAP_VIEW = {
  center: [18.56, -33.95],
  zoom: 10.1,
  pitch: 22,
  bearing: -10
}

const FEATURE_SOURCE_ID = 'cpt-atlas'
const FEATURE_FILL_ID = 'cpt-atlas-fill'
const FEATURE_OUTLINE_ID = 'cpt-atlas-outline'
const FEATURE_LABEL_ID = 'cpt-atlas-label'

const DECIMAL_FORMATTER = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 })
const INTEGER_FORMATTER = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 })
const COMPACT_FORMATTER = new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 })
const CURRENCY_FORMATTER = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })

const WATER_LABELS = {
  'Piped (tap) water inside the dwelling/house': 'Inside the home',
  'Piped (tap) water inside the yard': 'Inside the yard',
  'Piped water from neighbour': 'From a neighbour',
  'Piped water from community stand': 'Community stand'
}

const REFUSE_LABELS = {
  'Removed by local authority/private company/community members at least once a week': 'Collected weekly',
  'Removed by local authority/private company/community members less often than once a week': 'Collected less often',
  'Communal refuse dump': 'Communal dump',
  'Communal container/central collection point': 'Collection point',
  'Own refuse dump': 'Own dump',
  'Dump or leave rubbish anywhere (no rubbish disposal)': 'No safe disposal',
  Other: 'Other'
}

const ELECTRICITY_LABELS = {
  'In-house prepaid meter': 'Prepaid meter',
  'In-house conventional meter (municipal electricity that is paid with rates or a bill)': 'Conventional meter',
  'Connection from elsewhere (including direct to overhead cables)': 'Shared or informal connection',
  'Connection from the main house (only for backyard dwellers)': 'Connected from main house'
}

const COOKING_LABELS = {
  Mains: 'Mains electricity',
  Gas: 'Gas',
  Paraffin: 'Paraffin',
  Wood: 'Wood',
  Solar: 'Solar',
  Coal: 'Coal',
  Other: 'Other',
  None: 'None'
}

const HUNGER_ORDER = ['Never', 'Seldom', 'Sometimes', 'Often', 'Always']

const LENS_CONFIG = {
  neighbourhoods: {
    id: 'neighbourhoods',
    badge: 'Neighbourhood Lens',
    label: 'Neighbourhoods',
    title: 'Neighbourhood fabric',
    subtitle: 'Population, liveability, lighting and green-blue access across Cape Town.',
    datasetPath: '/data/CPT/master_neighbourhoods_enriched.geojson',
    nameKey: 'display_name',
    searchPlaceholder: 'Search neighbourhoods...',
    metrics: [
      { key: 'GreenBlue_Score', label: 'Nature Access Score', description: 'Combined access to green and blue amenities.', format: 'score', low: '#0f2b2b', high: '#3CB28D' },
      { key: 'Green_Score', label: 'Green Space Score', description: 'Tree, park and vegetation strength.', format: 'score', low: '#112414', high: '#7CC715' },
      { key: 'Blue_Score', label: 'Blue Space Score', description: 'Water-edge and blue infrastructure score.', format: 'score', low: '#0f2440', high: '#5076FF' },
      { key: 'pop_total', label: 'Population', description: 'Estimated total residents.', format: 'integer', low: '#1a1530', high: '#7B93FF' },
      { key: 'population_density', label: 'Population Density', description: 'Residents per square kilometre.', format: 'density', low: '#1a1530', high: '#A78BFA' },
      { key: 'avg_income', label: 'Average Income', description: 'Estimated average personal income.', format: 'currency', low: '#1a2018', high: '#5EC2A0' },
      { key: 'employed', label: 'Employed Residents', description: 'Estimated employed residents.', format: 'integer', low: '#141828', high: '#7B93FF' },
      { key: 'lights_per_sqkm', label: 'Street Lights per km²', description: 'Lighting intensity of the built environment.', format: 'decimal', low: '#1a1a10', high: '#C4CDFF' }
    ],
    detailStats: [
      { key: 'pop_total', label: 'Population', format: 'integer' },
      { key: 'population_density', label: 'Population Density', format: 'density' },
      { key: 'avg_income', label: 'Average Income', format: 'currency' },
      { key: 'employed', label: 'Employed Residents', format: 'integer' },
      { key: 'hh_count', label: 'Households', format: 'integer' },
      { key: 'GreenBlue_Score', label: 'Nature Access Score', format: 'score' },
      { key: 'Green_Score', label: 'Green Space Score', format: 'score' },
      { key: 'Blue_Score', label: 'Blue Space Score', format: 'score' },
      { key: 'total_lights', label: 'Total Street Lights', format: 'integer' },
      { key: 'park_area_sqm', label: 'Park Area', format: 'area' }
    ]
  },
  suburbs: {
    id: 'suburbs',
    badge: 'Planning Suburbs',
    label: 'Planning Suburbs',
    title: 'Household services',
    subtitle: 'Service access, mobility and public facility use at planning suburb level.',
    datasetPath: '/data/CPT/master_planning_suburbs_enriched.geojson',
    nameKey: 'display_name',
    searchPlaceholder: 'Search planning suburbs...',
    metrics: [
      { key: 'pct_households_piped_water_inside_dwelling', label: 'Water Inside the Home', description: 'Share of households with a tap inside the home.', format: 'percent', low: '#1c1a42', high: '#53b6ff' },
      { key: 'pct_households_refuse_removed_weekly', label: 'Weekly Refuse Removal', description: 'Share of households receiving weekly refuse collection.', format: 'percent', low: '#151a18', high: '#5EC2A0' },
      { key: 'pct_households_cooking_mains', label: 'Cooking With Mains Electricity', description: 'Households using mains electricity for cooking.', format: 'percent', low: '#132434', high: '#4bd8ff' },
      { key: 'pct_households_cooking_gas', label: 'Cooking With Gas', description: 'Households using gas for cooking.', format: 'percent', low: '#16141e', high: '#A78BFA' },
      { key: 'pct_commuters_under_30_minutes', label: 'Commutes Under 30 Minutes', description: 'Residents with shorter daily travel times.', format: 'percent', low: '#12261e', high: '#49e7a6' },
      { key: 'pct_commuters_mode_walking', label: 'Walking to Work or School', description: 'Share of commuters travelling on foot.', format: 'percent', low: '#171d38', high: '#8b8cff' },
      { key: 'pct_public_facility_use_park_monthly_within_suburb', label: 'Monthly Park Use', description: 'Residents using a park within the suburb each month.', format: 'percent', low: '#152116', high: '#9bff7e' },
      { key: 'pct_public_facility_use_library_monthly_within_suburb', label: 'Monthly Library Use', description: 'Residents using a library within the suburb each month.', format: 'percent', low: '#1f1735', high: '#d391ff' }
    ],
    detailStats: [
      { key: 'pct_households_piped_water_inside_dwelling', label: 'Water Inside the Home', format: 'percent' },
      { key: 'pct_households_refuse_removed_weekly', label: 'Weekly Refuse Removal', format: 'percent' },
      { key: 'pct_households_cooking_mains', label: 'Cooking With Mains Electricity', format: 'percent' },
      { key: 'pct_households_cooking_gas', label: 'Cooking With Gas', format: 'percent' },
      { key: 'pct_commuters_under_30_minutes', label: 'Commutes Under 30 Minutes', format: 'percent' },
      { key: 'pct_commuters_mode_walking', label: 'Walking to Work or School', format: 'percent' },
      { key: 'pct_public_facility_use_park_monthly_within_suburb', label: 'Monthly Park Use', format: 'percent' },
      { key: 'pct_public_facility_use_library_monthly_within_suburb', label: 'Monthly Library Use', format: 'percent' }
    ]
  },
  economy: {
    id: 'economy',
    badge: 'Economic Hexagons',
    label: 'Economic Hexagons',
    title: 'Economic activity',
    subtitle: 'Formal employment, establishments, income and growth hotspots by tax hexagon.',
    datasetPath: '/data/CPT/master_tax_hexagons_enriched.geojson',
    nameKey: 'display_name',
    searchPlaceholder: 'Search economic areas...',
    metrics: [
      { key: 'tax_employment_latest', label: 'Formal Jobs', description: 'Estimated formal jobs in the latest year.', format: 'integer', low: '#11243a', high: '#48d0ff' },
      { key: 'tax_establishments_latest', label: 'Registered Establishments', description: 'Estimated registered establishments in the latest year.', format: 'integer', low: '#151a18', high: '#5EC2A0' },
      { key: 'tax_median_income_latest', label: 'Median Income', description: 'Median income in the latest year.', format: 'currency', low: '#26163b', high: '#d191ff' },
      { key: 'tax_jobs_per_establishment_latest', label: 'Jobs per Establishment', description: 'Average number of jobs per establishment.', format: 'decimal', low: '#102d24', high: '#42e8ab' },
      { key: 'tax_employment_pct_change_2014_2025', label: 'Employment Growth Since 2014', description: 'Percentage change in employment between 2014 and 2025.', format: 'signedPercent', low: '#141420', high: '#7B93FF' },
      { key: 'tax_establishments_pct_change_2014_2025', label: 'Business Growth Since 2014', description: 'Percentage change in establishments between 2014 and 2025.', format: 'signedPercent', low: '#151a18', high: '#5EC2A0' },
      { key: 'tax_youth_fte_share', label: 'Youth Employment Share', description: 'Share of jobs held by young people.', format: 'percent', low: '#142038', high: '#63a8ff' },
      { key: 'tax_female_fte_share', label: 'Female Employment Share', description: 'Share of jobs held by women.', format: 'percent', low: '#16141e', high: '#A78BFA' }
    ],
    detailStats: [
      { key: 'tax_employment_2014', label: 'Jobs in 2014', format: 'integer' },
      { key: 'tax_employment_2025', label: 'Jobs in 2025', format: 'integer' },
      { key: 'tax_employment_pct_change_2014_2025', label: 'Employment Growth', format: 'signedPercent' },
      { key: 'tax_establishments_2014', label: 'Businesses in 2014', format: 'integer' },
      { key: 'tax_establishments_2025', label: 'Businesses in 2025', format: 'integer' },
      { key: 'tax_establishments_pct_change_2014_2025', label: 'Business Growth', format: 'signedPercent' },
      { key: 'tax_median_income_2014', label: 'Median Income in 2014', format: 'currency' },
      { key: 'tax_median_income_2025', label: 'Median Income in 2025', format: 'currency' },
      { key: 'tax_jobs_per_establishment_latest', label: 'Jobs per Establishment', format: 'decimal' },
      { key: 'tax_female_fte_share', label: 'Female Employment Share', format: 'percent' }
    ]
  }
}

const DEFAULT_METRIC_BY_LENS = {
  neighbourhoods: 'GreenBlue_Score',
  suburbs: 'pct_households_piped_water_inside_dwelling',
  economy: 'tax_employment_latest'
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells.map(cell => cell.trim())
}

function parseValue(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

function parseCsvText(text) {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)

  if (!lines.length) return []

  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce((row, header, index) => {
      row[header] = parseValue(values[index] ?? '')
      return row
    }, {})
  })
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function smartPercentValue(value) {
  if (!Number.isFinite(value)) return null
  return Math.abs(value) <= 1.5 ? value * 100 : value
}

function formatMetricValue(format, rawValue) {
  if (!Number.isFinite(rawValue)) return 'No data'

  switch (format) {
    case 'currency':
      return CURRENCY_FORMATTER.format(rawValue)
    case 'percent':
      return `${DECIMAL_FORMATTER.format(smartPercentValue(rawValue))}%`
    case 'signedPercent': {
      const value = smartPercentValue(rawValue)
      const sign = value > 0 ? '+' : ''
      return `${sign}${DECIMAL_FORMATTER.format(value)}%`
    }
    case 'density':
      return `${DECIMAL_FORMATTER.format(rawValue)} / km²`
    case 'score':
      return DECIMAL_FORMATTER.format(rawValue)
    case 'area':
      return `${DECIMAL_FORMATTER.format(rawValue / 1e6)} km²`
    case 'decimal':
      return DECIMAL_FORMATTER.format(rawValue)
    case 'compact':
      return COMPACT_FORMATTER.format(rawValue)
    case 'integer':
    default:
      return INTEGER_FORMATTER.format(rawValue)
  }
}

function formatAxisTick(value) {
  if (!Number.isFinite(value)) return value
  if (Math.abs(value) >= 1000) return COMPACT_FORMATTER.format(value)
  return DECIMAL_FORMATTER.format(value)
}

function mixHexColors(startHex, endHex, weight = 0.5) {
  const toRgb = (hex) => {
    const value = hex.replace('#', '')
    const sized = value.length === 3 ? value.split('').map((part) => part + part).join('') : value
    return [
      parseInt(sized.slice(0, 2), 16),
      parseInt(sized.slice(2, 4), 16),
      parseInt(sized.slice(4, 6), 16)
    ]
  }

  const [r1, g1, b1] = toRgb(startHex)
  const [r2, g2, b2] = toRgb(endHex)
  const mix = (a, b) => Math.round(a + ((b - a) * weight))
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`
}

function computeMetricRange(features, key) {
  const allValues = features
    .map((feature) => Number(feature.properties?.[key]))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (!allValues.length) return [0, 1]

  const positiveValues = allValues.filter((value) => value > 0)
  const values = positiveValues.length >= Math.min(12, allValues.length) ? positiveValues : allValues
  const pickPercentile = (percentile) => values[Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * percentile)))]
  const min = pickPercentile(0.08)
  const max = pickPercentile(0.92)
  if (min === max) return [min, min + 1]
  return [min, max]
}

function isMeaningfulMetricValue(value, format = 'integer') {
  if (!Number.isFinite(value)) return false
  if (format === 'signedPercent') return value !== 0
  return value > 0
}

function getMeaningfulFeatureValues(features, key, format = 'integer') {
  return features
    .map((feature) => Number(feature.properties?.[key]))
    .filter((value) => isMeaningfulMetricValue(value, format))
}

function sumMeaningfulFeatureValues(features, key, format = 'integer') {
  return getMeaningfulFeatureValues(features, key, format).reduce((sum, value) => sum + value, 0)
}

function averageMeaningfulFeatureValue(features, key, format = 'integer') {
  const values = getMeaningfulFeatureValues(features, key, format)
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildFillColorExpression(metric, range) {
  const [min, max] = range
  const midpoint = min + ((max - min) * 0.5)
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', metric.key], min],
    min, metric.low,
    midpoint, mixHexColors(metric.low, metric.high, 0.55),
    max, metric.high
  ]
}

function buildMetricVisibilityFilter(metricKey) {
  return [
    'all',
    ['!=', ['coalesce', ['get', metricKey], null], null],
    ['>', ['coalesce', ['get', metricKey], 0], 0]
  ]
}

function getFillOpacityExpression(lensId) {
  if (lensId === 'economy') {
    return ['case', ['boolean', ['feature-state', 'selected'], false], 0.48, ['boolean', ['feature-state', 'hover'], false], 0.34, 0.2]
  }

  return ['case', ['boolean', ['feature-state', 'selected'], false], 0.92, ['boolean', ['feature-state', 'hover'], false], 0.84, 0.7]
}

function traverseCoordinates(coordinates, callback) {
  if (!Array.isArray(coordinates)) return
  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    callback(coordinates)
    return
  }
  coordinates.forEach((coordinate) => traverseCoordinates(coordinate, callback))
}

function getFeatureBounds(feature) {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity

  traverseCoordinates(feature.geometry?.coordinates, ([lng, lat]) => {
    minLng = Math.min(minLng, lng)
    minLat = Math.min(minLat, lat)
    maxLng = Math.max(maxLng, lng)
    maxLat = Math.max(maxLat, lat)
  })

  return [[minLng, minLat], [maxLng, maxLat]]
}

function enrichNeighbourhoodCollection(collection) {
  return {
    ...collection,
    features: (collection.features || []).map((feature) => {
      const properties = feature.properties || {}
      const areaKm2 = Number(properties.nb_area_sqm || 0) / 1e6
      const population = Number(properties.pop_total || 0)
      return {
        ...feature,
        id: String(properties.neighbourhood),
        properties: {
          ...properties,
          __featureId: String(properties.neighbourhood),
          display_name: properties.neighbourhood,
          population_density: areaKm2 > 0 ? population / areaKm2 : 0
        }
      }
    })
  }
}

function enrichSuburbCollection(collection) {
  return {
    ...collection,
    features: (collection.features || []).map((feature) => {
      const properties = feature.properties || {}
      const commuteUnder30 = Number(properties.pct_commuters_travel_time_less_than_15_minutes || 0) +
        Number(properties.pct_commuters_travel_time_15_30_minutes || 0)
      const suburbName = toTitleCase(properties.suburb)
      return {
        ...feature,
        id: String(properties.GlobalID || properties.suburb),
        properties: {
          ...properties,
          __featureId: String(properties.GlobalID || properties.suburb),
          display_name: suburbName,
          suburb_lookup: normalizeName(properties.suburb),
          pct_commuters_under_30_minutes: commuteUnder30
        }
      }
    })
  }
}

function enrichEconomyCollection(collection) {
  return {
    ...collection,
    features: (collection.features || []).map((feature, index) => {
      const properties = feature.properties || {}
      return {
        ...feature,
        id: String(properties.hex7),
        properties: {
          ...properties,
          __featureId: String(properties.hex7),
          display_name: `Economic Area ${index + 1}`,
          tax_employment_latest: Number(properties.tax_employment_latest ?? properties.tax_employment_2025 ?? 0),
          tax_establishments_latest: Number(properties.tax_establishments_latest ?? properties.tax_establishments_2025 ?? 0),
          tax_median_income_latest: Number(properties.tax_median_income_latest ?? properties.tax_median_income_2025 ?? 0)
        }
      }
    })
  }
}

function enrichCollection(lensId, collection) {
  if (lensId === 'neighbourhoods') return enrichNeighbourhoodCollection(collection)
  if (lensId === 'suburbs') return enrichSuburbCollection(collection)
  if (lensId === 'economy') return enrichEconomyCollection(collection)
  return collection
}

function truncateLabel(value, max = 18) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function CustomChartTooltip({ active, payload, label, formatters = {} }) {
  if (!active || !payload?.length) return null

  return (
    <div className="we-chart-tooltip">
      <div className="we-chart-tooltip-title">{label}</div>
      {payload.map((entry) => {
        const formatter = formatters[entry.dataKey]
        const value = formatter ? formatter(entry.value) : formatAxisTick(entry.value)
        return (
          <div key={entry.dataKey} className="we-chart-tooltip-row">
            <span className="we-chart-tooltip-dot" style={{ background: entry.color }} />
            <span>{entry.name}</span>
            <strong>{value}</strong>
          </div>
        )
      })}
    </div>
  )
}

function StoryToggle({ options, value, onChange }) {
  return (
    <div className="we-story-toggle">
      {options.map((option) => (
        <button
          key={option.value}
          className={`we-story-toggle-btn ${value === option.value ? 'we-story-toggle-btn--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function RankingChart({ data, metric, onBarClick }) {
  const handleBarClick = useCallback((barData) => {
    if (onBarClick && barData?._feature) {
      onBarClick(barData._feature)
    }
  }, [onBarClick])

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 14, bottom: 4 }}
      >
        <CartesianGrid stroke="rgba(255,255,255,0.07)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: 'rgba(236, 243, 255, 0.55)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatAxisTick}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fill: 'rgba(236, 243, 255, 0.7)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomChartTooltip formatters={{ value: (value) => formatMetricValue(metric.format, value) }} />} />
        <Bar
          dataKey="value"
          name={metric.label}
          fill={metric.high}
          radius={[0, 8, 8, 0]}
          cursor={onBarClick ? 'pointer' : undefined}
          onClick={handleBarClick}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

function OverviewStat({ label, value, hint }) {
  return (
    <div className="we-overview-stat">
      <span className="we-overview-stat-label">{label}</span>
      <strong className="we-overview-stat-value">{value}</strong>
      {hint ? <span className="we-overview-stat-hint">{hint}</span> : null}
    </div>
  )
}

function DetailRow({ label, value, delta }) {
  if (value === 'No data') return null
  return (
    <div className="we-detail-row">
      <span className="we-detail-row-label">{label}</span>
      <div className="we-detail-row-right">
        <span className="we-detail-row-value">{value}</span>
        {delta ? <span className={`we-detail-row-delta ${delta.positive ? 'we-detail-row-delta--positive' : 'we-detail-row-delta--negative'}`}>{delta.label}</span> : null}
      </div>
    </div>
  )
}

export default function WardExplorer({ onEnterDashboard, isVisible = true }) {
  const mapRef = useRef(null)
  const mapEl = useRef(null)
  const mapboxglRef = useRef(null)
  const hoveredFeatureIdRef = useRef(null)
  const selectedFeatureIdRef = useRef(null)
  const initialHashRef = useRef(null)
  const activeCollectionRef = useRef(null)
  const activeLensIdRef = useRef('neighbourhoods')
  const activeLensNameKeyRef = useRef(LENS_CONFIG.neighbourhoods.nameKey)
  const activeMetricRef = useRef(LENS_CONFIG.neighbourhoods.metrics[0])
  const applyActiveMetricColorRef = useRef(null)
  const applyActiveMetricVisibilityRef = useRef(null)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [collections, setCollections] = useState({})
  const [csvData, setCsvData] = useState({
    water: [],
    refuse: [],
    hunger: [],
    materials: [],
    cooking: [],
    electricity: []
  })
  const [activeLensId, setActiveLensId] = useState('neighbourhoods')
  const [metricByLens, setMetricByLens] = useState(DEFAULT_METRIC_BY_LENS)
  const [selectedFeatureId, setSelectedFeatureId] = useState(null)
  const [hoveredFeatureId, setHoveredFeatureId] = useState(null)
  const [hoveredPos, setHoveredPos] = useState({ x: 0, y: 0 })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [neighbourhoodStory, setNeighbourhoodStory] = useState('water')
  const [suburbStory, setSuburbStory] = useState('cooking')
  const [economyStory, setEconomyStory] = useState('trend')
  const [materialType, setMaterialType] = useState('Wall')
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false)
  const [isThemePanelCollapsed, setIsThemePanelCollapsed] = useState(false)
  const [isDetailMinimized, setIsDetailMinimized] = useState(false)
  const [isAnalyticsCollapsed, setIsAnalyticsCollapsed] = useState(true)
  const [mapEpoch, setMapEpoch] = useState(0)
  const mapLoadedRef = useRef(false)
  const mapDebugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugMaps') === '1'

  const debugMap = useCallback((message, details = null) => {
    if (!mapDebugEnabled) return
    if (details === null) {
      console.log(`[WardExplorer] ${message}`)
      return
    }
    console.log(`[WardExplorer] ${message}`, details)
  }, [mapDebugEnabled])

  const collectMapDiagnostics = useCallback(() => {
    const map = mapRef.current
    const canvas = map?.getCanvas?.() || mapEl.current?.querySelector?.('canvas')
    const container = mapEl.current
    const canvasStyle = canvas ? window.getComputedStyle(canvas) : null
    const containerStyle = container ? window.getComputedStyle(container) : null

    return {
      mapEpoch,
      isVisible,
      mapLoaded: mapLoadedRef.current,
      hasMapInstance: Boolean(map),
      loaded: map?.loaded?.() ?? null,
      styleLoaded: map?.isStyleLoaded?.() ?? null,
      tilesLoaded: map?.areTilesLoaded?.() ?? null,
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        display: canvasStyle?.display,
        visibility: canvasStyle?.visibility,
        opacity: canvasStyle?.opacity
      } : null,
      container: container ? {
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        display: containerStyle?.display,
        visibility: containerStyle?.visibility,
        opacity: containerStyle?.opacity
      } : null,
      sourcePresent: map?.getSource?.(FEATURE_SOURCE_ID) ? true : false,
      fillLayerPresent: map?.getLayer?.(FEATURE_FILL_ID) ? true : false,
      labelLayerPresent: map?.getLayer?.(FEATURE_LABEL_ID) ? true : false
    }
  }, [isVisible, mapEpoch])

  const rebuildMap = useCallback(() => {
    debugMap('manual rebuild requested', collectMapDiagnostics())
    try {
      mapRef.current?.remove?.()
    } catch (error) {
      debugMap('manual rebuild remove failed', error)
    }
    mapRef.current = null
    mapboxglRef.current = null
    setMapLoaded(false)
    mapLoadedRef.current = false
    setMapEpoch((value) => value + 1)
  }, [collectMapDiagnostics, debugMap])

  useEffect(() => {
    mapLoadedRef.current = mapLoaded
  }, [mapLoaded])

  useEffect(() => {
    initialHashRef.current = new URLSearchParams(window.location.hash.slice(1))
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        const geojsonEntries = await Promise.all(
          Object.values(LENS_CONFIG).map(async (lens) => {
            const response = await fetch(lens.datasetPath)
            const collection = await response.json()
            return [lens.id, enrichCollection(lens.id, collection)]
          })
        )

        const csvEntries = await Promise.all([
          fetch('/data/CPT/access_to_water_data_2026-03-18.csv').then((response) => response.text()).then(parseCsvText),
          fetch('/data/CPT/2024_CCT_Survey_refuse_data_2026-03-18%20(1).csv').then((response) => response.text()).then(parseCsvText),
          fetch('/data/CPT/CCT_Survey_2024_adult_hunger2026-03-18.csv').then((response) => response.text()).then(parseCsvText),
          fetch('/data/CPT/2024_CCT_Survey_Building_Materials2026-03-18.csv').then((response) => response.text()).then(parseCsvText),
          fetch('/data/CPT/2024_CCT_Survey_cooking_data_2026-03-18.csv').then((response) => response.text()).then(parseCsvText),
          fetch('/data/CPT/2024_CCT_Survey_elect_main_source_2026-03-18.csv').then((response) => response.text()).then(parseCsvText)
        ])

        setCollections(Object.fromEntries(geojsonEntries))
        setCsvData({
          water: csvEntries[0],
          refuse: csvEntries[1],
          hunger: csvEntries[2],
          materials: csvEntries[3],
          cooking: csvEntries[4],
          electricity: csvEntries[5]
        })
      } catch (error) {
        console.error('Failed to load CPT atlas data:', error)
      }
    }

    loadData()
  }, [])

  const activeLens = LENS_CONFIG[activeLensId]
  const activeCollection = collections[activeLensId] || null
  const activeMetricKey = metricByLens[activeLensId]
  const activeMetric = activeLens.metrics.find((metric) => metric.key === activeMetricKey) || activeLens.metrics[0]

  const metricRanges = useMemo(() => {
    const ranges = {}
    Object.entries(collections).forEach(([lensId, collection]) => {
      const lens = LENS_CONFIG[lensId]
      const featureRanges = {}
      lens.metrics.forEach((metric) => {
        featureRanges[metric.key] = computeMetricRange(collection.features || [], metric.key)
      })
      ranges[lensId] = featureRanges
    })
    return ranges
  }, [collections])

  const activeFeatures = activeCollection?.features || []

  useEffect(() => {
    activeCollectionRef.current = activeCollection
  }, [activeCollection])

  useEffect(() => {
    activeLensIdRef.current = activeLensId
    activeLensNameKeyRef.current = activeLens.nameKey
    activeMetricRef.current = activeMetric
  }, [activeLens.nameKey, activeLensId, activeMetric])

  useEffect(() => {
    if (selectedFeatureId) {
      setIsHeroCollapsed(true)
      setIsThemePanelCollapsed(true)
      setIsDetailMinimized(false)
      setIsAnalyticsCollapsed(true)
    }
  }, [selectedFeatureId])

  const selectedFeature = useMemo(
    () => activeFeatures.find((feature) => String(feature.id) === String(selectedFeatureId)) || null,
    [activeFeatures, selectedFeatureId]
  )

  const hoveredFeature = useMemo(
    () => activeFeatures.find((feature) => String(feature.id) === String(hoveredFeatureId)) || null,
    [activeFeatures, hoveredFeatureId]
  )

  const rankedFeatures = useMemo(() => {
    return [...activeFeatures]
      .filter((feature) => isMeaningfulMetricValue(Number(feature.properties?.[activeMetric.key]), activeMetric.format))
      .sort((a, b) => Number(b.properties?.[activeMetric.key]) - Number(a.properties?.[activeMetric.key]))
  }, [activeFeatures, activeMetric.format, activeMetric.key])

  const focusFeature = selectedFeature || rankedFeatures[0] || null

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const query = normalizeName(searchQuery)
    return activeFeatures
      .filter((feature) => normalizeName(feature.properties?.display_name).includes(query))
      .slice(0, 8)
  }, [activeFeatures, searchQuery])

  const rankingChartData = useMemo(() => {
    return rankedFeatures.slice(0, 8).map((feature) => ({
      name: truncateLabel(feature.properties?.display_name, activeLensId === 'economy' ? 16 : 20),
      value: Number(feature.properties?.[activeMetric.key] || 0),
      _feature: feature
    }))
  }, [rankedFeatures, activeMetric.key, activeLensId])

  const cityOverviewStats = useMemo(() => {
    if (!activeFeatures.length) return []

    if (activeLensId === 'neighbourhoods') {
      const totalPopulation = sumMeaningfulFeatureValues(activeFeatures, 'pop_total', 'integer')
      const avgIncome = averageMeaningfulFeatureValue(activeFeatures, 'avg_income', 'currency')
      const totalLights = sumMeaningfulFeatureValues(activeFeatures, 'total_lights', 'integer')
      const natureLeader = rankedFeatures[0]
      return [
        { label: 'Neighbourhoods', value: INTEGER_FORMATTER.format(activeFeatures.length) },
        { label: 'Population', value: COMPACT_FORMATTER.format(totalPopulation) },
        { label: 'Average Income', value: avgIncome ? CURRENCY_FORMATTER.format(avgIncome) : 'No data' },
        { label: 'Top Area', value: natureLeader?.properties?.display_name || 'No data', hint: activeMetric.label }
      ]
    }

    if (activeLensId === 'suburbs') {
      const avgWater = averageMeaningfulFeatureValue(activeFeatures, 'pct_households_piped_water_inside_dwelling', 'percent')
      const avgRefuse = averageMeaningfulFeatureValue(activeFeatures, 'pct_households_refuse_removed_weekly', 'percent')
      const avgCommute = averageMeaningfulFeatureValue(activeFeatures, 'pct_commuters_under_30_minutes', 'percent')
      const topSuburb = rankedFeatures[0]
      return [
        { label: 'Planning Suburbs', value: INTEGER_FORMATTER.format(activeFeatures.length) },
        { label: 'Avg Water Access', value: avgWater !== null ? formatMetricValue('percent', avgWater) : 'No data' },
        { label: 'Avg Weekly Refuse', value: avgRefuse !== null ? formatMetricValue('percent', avgRefuse) : 'No data' },
        { label: 'Fast Commutes', value: avgCommute !== null ? formatMetricValue('percent', avgCommute) : 'No data', hint: '< 30 minutes' },
        { label: 'Leading Suburb', value: topSuburb?.properties?.display_name || 'No data', hint: activeMetric.label }
      ]
    }

    const totalJobs = sumMeaningfulFeatureValues(activeFeatures, 'tax_employment_latest', 'integer')
    const totalBusinesses = sumMeaningfulFeatureValues(activeFeatures, 'tax_establishments_latest', 'integer')
    const avgIncome = averageMeaningfulFeatureValue(activeFeatures, 'tax_median_income_latest', 'currency')
    const topHex = rankedFeatures[0]
    return [
      { label: 'Economic Hexagons', value: INTEGER_FORMATTER.format(activeFeatures.length) },
      { label: 'Formal Jobs', value: COMPACT_FORMATTER.format(totalJobs) },
      { label: 'Establishments', value: COMPACT_FORMATTER.format(totalBusinesses) },
      { label: 'Median Income', value: avgIncome ? CURRENCY_FORMATTER.format(avgIncome) : 'No data' },
      { label: 'Leading Hexagon', value: topHex?.properties?.display_name || 'No data', hint: activeMetric.label }
    ]
  }, [activeFeatures, activeLensId, activeMetric.label, rankedFeatures])

  const averageLookup = useMemo(() => {
    const lookup = {}
    activeLens.detailStats.forEach((stat) => {
      const values = getMeaningfulFeatureValues(activeFeatures, stat.key, stat.format)
      if (!values.length) return
      lookup[stat.key] = values.reduce((sum, value) => sum + value, 0) / values.length
    })
    return lookup
  }, [activeFeatures, activeLens.detailStats])

  const selectedCookingRow = useMemo(() => {
    if (activeLensId !== 'suburbs') return null
    const lookupName = normalizeName(focusFeature?.properties?.display_name)
    if (!lookupName) return csvData.cooking[0] || null
    return csvData.cooking.find((row) => normalizeName(row.Suburb) === lookupName) || null
  }, [activeLensId, focusFeature, csvData.cooking])

  const waterChartData = useMemo(() => {
    return csvData.water
      .filter((row) => row.Dataset === '2024 CCT Survey')
      .map((row) => ({
        name: WATER_LABELS[row.piped_water] || row.piped_water,
        formal: smartPercentValue(Number(row.Formal_dwelling || 0)),
        informal: smartPercentValue(Number(row.Informal_dwelling || 0)),
        adi: smartPercentValue(Number(row.ADI || 0)),
        city: smartPercentValue(Number(row['Cape Town (All dwellings)'] || 0))
      }))
      .sort((a, b) => b.city - a.city)
  }, [csvData.water])

  const hungerChartData = useMemo(() => {
    const valuesByStatus = {}
    csvData.hunger.forEach((row) => {
      const key = row.adult_hunger
      if (!valuesByStatus[key]) valuesByStatus[key] = { name: key, survey2024: 0, ghs2023: 0 }
      if (row.Dataset === '2024 CCT Survey') valuesByStatus[key].survey2024 = smartPercentValue(Number(row['Cape Town (All Dwellings)'] || 0))
      if (row.Dataset === '2023 GHS') valuesByStatus[key].ghs2023 = smartPercentValue(Number(row['Cape Town (All Dwellings)'] || 0))
    })
    return HUNGER_ORDER.map((status) => valuesByStatus[status]).filter(Boolean)
  }, [csvData.hunger])

  const materialChartData = useMemo(() => {
    const filtered = csvData.materials.filter(
      (row) => row.Dataset === '2024 CCT Survey' && row.Type === materialType
    )
    const total = filtered.reduce((sum, row) => sum + Number(row['Cape Town (All dwellings)'] || 0), 0)
    return filtered
      .map((row) => ({
        name: truncateLabel(row['Building Material'], 16),
        share: total > 0 ? (Number(row['Cape Town (All dwellings)'] || 0) / total) * 100 : 0
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 7)
  }, [csvData.materials, materialType])

  const cookingChartData = useMemo(() => {
    if (!selectedCookingRow) return []
    return Object.entries(COOKING_LABELS)
      .map(([key, label]) => ({
        name: label,
        value: Number(selectedCookingRow[key] || 0)
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [selectedCookingRow])

  const electricityChartData = useMemo(() => {
    const grouped = {}
    csvData.electricity.forEach((row) => {
      const label = ELECTRICITY_LABELS[row.elect_main_supply] || row.elect_main_supply
      if (!grouped[label]) grouped[label] = { name: label, cct: 0, eskom: 0 }
      if (row.SUPPLY_AUT === 'CCT') grouped[label].cct = smartPercentValue(Number(row['Cape Town'] || 0))
      if (row.SUPPLY_AUT === 'Eskom') grouped[label].eskom = smartPercentValue(Number(row['Cape Town'] || 0))
    })
    return Object.values(grouped)
      .sort((a, b) => Math.max(b.cct, b.eskom) - Math.max(a.cct, a.eskom))
  }, [csvData.electricity])

  const refuseChartData = useMemo(() => {
    return csvData.refuse.map((row) => ({
      name: REFUSE_LABELS[row['Refuse Removal']] || row['Refuse Removal'],
      formal: smartPercentValue(Number(row.Formal_dwelling || 0)),
      informal: smartPercentValue(Number(row.Informal_dwelling || 0)),
      adi: smartPercentValue(Number(row.ADI || 0)),
      total: smartPercentValue(Number(row.Total || 0))
    }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [csvData.refuse])

  const economyTrendData = useMemo(() => {
    if (!focusFeature) return []
    const properties = focusFeature.properties || {}
    const jobBase = Number(properties.tax_employment_2014 || 0)
    const businessBase = Number(properties.tax_establishments_2014 || 0)
    const incomeBase = Number(properties.tax_median_income_2014 || 0)
    const indexValue = (latest, base) => {
      if (!Number.isFinite(latest) || !Number.isFinite(base) || base <= 0) return null
      return (latest / base) * 100
    }
    return [
      { year: '2014', jobs: 100, businesses: 100, income: 100 },
      {
        year: '2025',
        jobs: indexValue(Number(properties.tax_employment_2025 || 0), jobBase),
        businesses: indexValue(Number(properties.tax_establishments_2025 || 0), businessBase),
        income: indexValue(Number(properties.tax_median_income_2025 || 0), incomeBase)
      }
    ]
  }, [focusFeature])

  const economyCompositionData = useMemo(() => {
    if (!focusFeature) return []
    const properties = focusFeature.properties || {}
    return [
      { name: 'Female jobs', value: smartPercentValue(Number(properties.tax_female_fte_share || 0)) },
      { name: 'Youth jobs', value: smartPercentValue(Number(properties.tax_youth_fte_share || 0)) },
      { name: 'Export-linked', value: smartPercentValue(Number(properties.tax_export_fte_share || 0)) },
      { name: 'Import-linked', value: smartPercentValue(Number(properties.tax_import_fte_share || 0)) }
    ]
  }, [focusFeature])

  const economyGrowthChartData = useMemo(() => {
    return [...activeFeatures]
      .filter((feature) => isMeaningfulMetricValue(Number(feature.properties?.tax_employment_pct_change_2014_2025), 'signedPercent'))
      .sort((a, b) => Number(b.properties?.tax_employment_pct_change_2014_2025) - Number(a.properties?.tax_employment_pct_change_2014_2025))
      .slice(0, 8)
      .map((feature) => ({
        name: truncateLabel(feature.properties?.display_name, 16),
        growth: smartPercentValue(Number(feature.properties?.tax_employment_pct_change_2014_2025 || 0))
      }))
  }, [activeFeatures])

  const spotlightStats = useMemo(() => {
    if (!focusFeature) return []
    const properties = focusFeature.properties || {}

    if (activeLensId === 'neighbourhoods') {
      return [
        { label: 'Population', value: formatMetricValue('integer', Number(properties.pop_total || 0)) },
        { label: 'Average Income', value: formatMetricValue('currency', Number(properties.avg_income || 0)) },
        { label: 'Street Lights', value: formatMetricValue('integer', Number(properties.total_lights || 0)) },
        { label: 'Nature Score', value: formatMetricValue('score', Number(properties.GreenBlue_Score || 0)) }
      ]
    }

    if (activeLensId === 'suburbs') {
      return [
        { label: 'Water Inside Home', value: formatMetricValue('percent', Number(properties.pct_households_piped_water_inside_dwelling || 0)) },
        { label: 'Weekly Refuse', value: formatMetricValue('percent', Number(properties.pct_households_refuse_removed_weekly || 0)) },
        { label: 'Short Commutes', value: formatMetricValue('percent', Number(properties.pct_commuters_under_30_minutes || 0)) },
        { label: 'Park Use', value: formatMetricValue('percent', Number(properties.pct_public_facility_use_park_monthly_within_suburb || 0)) }
      ]
    }

    return [
      { label: 'Formal Jobs', value: formatMetricValue('integer', Number(properties.tax_employment_latest || 0)) },
      { label: 'Businesses', value: formatMetricValue('integer', Number(properties.tax_establishments_latest || 0)) },
      { label: 'Median Income', value: formatMetricValue('currency', Number(properties.tax_median_income_latest || 0)) },
      { label: 'Jobs per Business', value: formatMetricValue('decimal', Number(properties.tax_jobs_per_establishment_latest || 0)) }
    ]
  }, [activeLensId, focusFeature])

  const fitFeatureOnMap = useCallback((feature) => {
    const map = mapRef.current
    if (!map || !feature) return
    const bounds = getFeatureBounds(feature)
    map.fitBounds(bounds, { padding: { top: 110, right: 360, bottom: 260, left: 320 }, duration: 700, maxZoom: activeLensIdRef.current === 'economy' ? 12.4 : 13.3 })
  }, [])

  const clearSelectedFeatureState = useCallback(() => {
    const map = mapRef.current
    if (!map || !map.getSource(FEATURE_SOURCE_ID) || !selectedFeatureIdRef.current) return
    map.setFeatureState({ source: FEATURE_SOURCE_ID, id: selectedFeatureIdRef.current }, { selected: false })
    selectedFeatureIdRef.current = null
  }, [])

  const setSelectedFeatureState = useCallback((featureId) => {
    const map = mapRef.current
    if (!featureId || !map || !map.getSource(FEATURE_SOURCE_ID)) return
    if (selectedFeatureIdRef.current && selectedFeatureIdRef.current !== featureId) {
      map.setFeatureState({ source: FEATURE_SOURCE_ID, id: selectedFeatureIdRef.current }, { selected: false })
    }
    map.setFeatureState({ source: FEATURE_SOURCE_ID, id: featureId }, { selected: true })
    selectedFeatureIdRef.current = featureId
  }, [])

  const applyActiveMetricColor = useCallback((mapInstance, lensId, metricConfig, collectionOverride = null) => {
    if (!mapInstance?.getLayer(FEATURE_FILL_ID)) return
    const collection = collectionOverride || collections[lensId]
    const fallbackRange = collection ? computeMetricRange(collection.features || [], metricConfig.key) : [0, 1]
    const range = metricRanges[lensId]?.[metricConfig.key] || fallbackRange
    mapInstance.setPaintProperty(FEATURE_FILL_ID, 'fill-color', buildFillColorExpression(metricConfig, range))
  }, [collections, metricRanges])

  const applyActiveMetricVisibility = useCallback((mapInstance, metricConfig) => {
    if (!mapInstance?.getLayer(FEATURE_FILL_ID) || !mapInstance?.getLayer(FEATURE_OUTLINE_ID) || !mapInstance?.getLayer(FEATURE_LABEL_ID)) return
    const filter = buildMetricVisibilityFilter(metricConfig.key)
    mapInstance.setFilter(FEATURE_FILL_ID, filter)
    mapInstance.setFilter(FEATURE_OUTLINE_ID, filter)
    mapInstance.setFilter(FEATURE_LABEL_ID, filter)
  }, [])

  useEffect(() => {
    applyActiveMetricColorRef.current = applyActiveMetricColor
    applyActiveMetricVisibilityRef.current = applyActiveMetricVisibility
  }, [applyActiveMetricColor, applyActiveMetricVisibility])

  useEffect(() => {
    if (!isVisible || !activeCollection || mapRef.current || !mapEl.current) return

    let observer = null
    let frameId = null
    let retryTimer = null
    let cancelled = false
    let map = null
    let initAttempts = 0

    const scheduleInitialize = () => {
      if (cancelled || mapRef.current || frameId) return
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        initializeMap()
      })
    }

    const scheduleRetry = () => {
      if (cancelled || mapRef.current || retryTimer || initAttempts >= 5) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        initializeMap()
      }, 220)
    }

    const initializeMap = async () => {
      if (cancelled || mapRef.current || !mapEl.current) return
      initAttempts += 1

      const { clientWidth, clientHeight } = mapEl.current
      debugMap('initialize attempt', { initAttempts, clientWidth, clientHeight, isVisible })
      if (clientWidth <= 0 || clientHeight <= 0) {
        scheduleInitialize()
        return
      }

      const mapboxModule = await import('mapbox-gl')
      const mapboxgl = mapboxModule.default ?? mapboxModule
      mapboxgl.accessToken = MAPBOX_TOKEN
      mapboxglRef.current = mapboxgl
      if (cancelled || mapRef.current || !mapEl.current) return

      try {
        map = new mapboxgl.Map({
          container: mapEl.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: BASE_MAP_VIEW.center,
          zoom: BASE_MAP_VIEW.zoom,
          pitch: BASE_MAP_VIEW.pitch,
          bearing: BASE_MAP_VIEW.bearing,
          attributionControl: false
        })
      } catch (error) {
        debugMap('map initialization failed', error)
        scheduleRetry()
        return
      }

      mapRef.current = map
      const canvas = map.getCanvas()
      const handleContextLost = (event) => {
        event.preventDefault?.()
        debugMap('webglcontextlost')
      }
      const handleContextRestored = () => {
        debugMap('webglcontextrestored')
      }
      canvas?.addEventListener('webglcontextlost', handleContextLost)
      canvas?.addEventListener('webglcontextrestored', handleContextRestored)

      map.on('error', (event) => {
        debugMap('map error', {
          message: event?.error?.message,
          error: event?.error
        })
      })

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

        map.on('load', () => {
          debugMap('map load')
          const logDelayedStatus = (label, delay) => {
            window.setTimeout(() => {
              debugMap(label, collectMapDiagnostics())
            }, delay)
          }
          map.addSource(FEATURE_SOURCE_ID, {
          type: 'geojson',
          data: activeCollectionRef.current,
          promoteId: '__featureId'
        })

        map.addLayer({
          id: FEATURE_FILL_ID,
          type: 'fill',
          source: FEATURE_SOURCE_ID,
          paint: {
            'fill-color': activeMetricRef.current.high,
            'fill-opacity': getFillOpacityExpression(activeLensIdRef.current)
          }
        })

        map.addLayer({
          id: FEATURE_OUTLINE_ID,
          type: 'line',
          source: FEATURE_SOURCE_ID,
          paint: {
            'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ffffff', ['boolean', ['feature-state', 'hover'], false], 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0.18)'],
            'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.2, ['boolean', ['feature-state', 'hover'], false], 1.2, 0.55]
          }
        })

        map.addLayer({
          id: FEATURE_LABEL_ID,
          type: 'symbol',
          source: FEATURE_SOURCE_ID,
          minzoom: 10.8,
          layout: {
            'text-field': ['get', activeLensNameKeyRef.current],
            'text-size': activeLensIdRef.current === 'economy' ? 9 : 10,
            'text-max-width': 8,
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            visibility: activeLensIdRef.current === 'economy' ? 'none' : 'visible'
          },
          paint: {
            'text-color': 'rgba(255,255,255,0.64)',
            'text-halo-color': 'rgba(7, 9, 20, 0.82)',
            'text-halo-width': 1
          }
        })

        map.setPaintProperty(FEATURE_FILL_ID, 'fill-opacity', getFillOpacityExpression(activeLensIdRef.current))
        applyActiveMetricColorRef.current?.(map, activeLensIdRef.current, activeMetricRef.current, activeCollectionRef.current)
        applyActiveMetricVisibilityRef.current?.(map, activeMetricRef.current)
        map.resize()

        map.on('mousemove', FEATURE_FILL_ID, (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          const featureId = feature.id ?? feature.properties?.__featureId
          if (!featureId) return
          if (hoveredFeatureIdRef.current && hoveredFeatureIdRef.current !== featureId) {
            map.setFeatureState({ source: FEATURE_SOURCE_ID, id: hoveredFeatureIdRef.current }, { hover: false })
          }
          map.setFeatureState({ source: FEATURE_SOURCE_ID, id: featureId }, { hover: true })
          hoveredFeatureIdRef.current = featureId
          setHoveredFeatureId(featureId)
          setHoveredPos({ x: event.point.x, y: event.point.y })
          map.getCanvas().style.cursor = 'pointer'
        })

        map.on('mouseleave', FEATURE_FILL_ID, () => {
          if (hoveredFeatureIdRef.current) {
            map.setFeatureState({ source: FEATURE_SOURCE_ID, id: hoveredFeatureIdRef.current }, { hover: false })
            hoveredFeatureIdRef.current = null
          }
          setHoveredFeatureId(null)
          map.getCanvas().style.cursor = ''
        })

        map.on('click', FEATURE_FILL_ID, (event) => {
          const feature = event.features?.[0]
          if (!feature) return
          const featureId = feature.id ?? feature.properties?.__featureId
          if (!featureId) return
          const fullFeature = activeCollectionRef.current?.features?.find((item) => String(item.id) === String(featureId))
          setSelectedFeatureId(featureId)
          setSelectedFeatureState(featureId)
          fitFeatureOnMap(fullFeature)
        })

        setMapLoaded(true)
        debugMap('post-load status', collectMapDiagnostics())
        logDelayedStatus('post-load status +300ms', 300)
        logDelayedStatus('post-load status +1200ms', 1200)
      })

      map.once('remove', () => {
        canvas?.removeEventListener('webglcontextlost', handleContextLost)
        canvas?.removeEventListener('webglcontextrestored', handleContextRestored)
        debugMap('map remove')
      })
    }

    initializeMap()

    if (!mapRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize()
          return
        }
        initializeMap()
      })
      observer.observe(mapEl.current)
    }

    scheduleInitialize()

    return () => {
      cancelled = true
      setMapLoaded(false)
      mapLoadedRef.current = false
      if (frameId) window.cancelAnimationFrame(frameId)
      if (retryTimer) window.clearTimeout(retryTimer)
      if (observer) observer.disconnect()
      const currentMap = mapRef.current || map
      debugMap('cleanup', { hadMap: Boolean(currentMap), isVisible })
      if (currentMap) currentMap.remove()
      mapRef.current = null
      mapboxglRef.current = null
    }
  }, [activeCollection, debugMap, fitFeatureOnMap, isVisible, mapEpoch, setSelectedFeatureState])

  useEffect(() => {
    if (typeof window === 'undefined' || !mapDebugEnabled) return

    window.__wardMapDebug = {
      status: () => {
        const snapshot = collectMapDiagnostics()
        console.log('[WardExplorer] manual status', snapshot)
        return snapshot
      },
      repaint: () => {
        const map = mapRef.current
        if (!map) return null
        map.resize()
        map.triggerRepaint?.()
        const snapshot = collectMapDiagnostics()
        console.log('[WardExplorer] manual repaint', snapshot)
        return snapshot
      },
      rebuild: () => {
        rebuildMap()
        return 'rebuild requested'
      }
    }

    return () => {
      if (window.__wardMapDebug) {
        delete window.__wardMapDebug
      }
    }
  }, [collectMapDiagnostics, mapDebugEnabled, rebuildMap])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !activeCollection) return
    const map = mapRef.current
    if (!map.isStyleLoaded() || !map.getLayer(FEATURE_FILL_ID) || !map.getLayer(FEATURE_LABEL_ID)) return
    const source = map.getSource(FEATURE_SOURCE_ID)
    if (!source) return

    source.setData(activeCollection)
    map.setLayoutProperty(FEATURE_LABEL_ID, 'text-field', ['get', activeLens.nameKey])
    map.setLayoutProperty(FEATURE_LABEL_ID, 'visibility', activeLensId === 'economy' ? 'none' : 'visible')
    map.setPaintProperty(FEATURE_FILL_ID, 'fill-opacity', getFillOpacityExpression(activeLensId))
    applyActiveMetricColor(map, activeLensId, activeMetric, activeCollection)
    applyActiveMetricVisibility(map, activeMetric)
    map.easeTo({ ...BASE_MAP_VIEW, duration: 700 })

    if (hoveredFeatureIdRef.current) {
      hoveredFeatureIdRef.current = null
      setHoveredFeatureId(null)
    }
    clearSelectedFeatureState()
    setSelectedFeatureId(null)
    setSearchQuery('')
  }, [activeCollection, activeLens.nameKey, activeLensId, activeMetric, applyActiveMetricColor, applyActiveMetricVisibility, clearSelectedFeatureState, mapLoaded])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    if (!mapRef.current.isStyleLoaded() || !mapRef.current.getLayer(FEATURE_FILL_ID) || !mapRef.current.getLayer(FEATURE_OUTLINE_ID) || !mapRef.current.getLayer(FEATURE_LABEL_ID)) return
    mapRef.current.setPaintProperty(FEATURE_FILL_ID, 'fill-opacity', getFillOpacityExpression(activeLensId))
    mapRef.current.setLayoutProperty(FEATURE_LABEL_ID, 'visibility', activeLensId === 'economy' ? 'none' : 'visible')
    applyActiveMetricColor(mapRef.current, activeLensId, activeMetric)
    applyActiveMetricVisibility(mapRef.current, activeMetric)
  }, [activeLensId, activeMetric, applyActiveMetricColor, applyActiveMetricVisibility, mapLoaded])

  useEffect(() => {
    if (!isVisible || !mapRef.current) return

    let frameId = null
    const timers = []
    const refreshMap = () => {
      if (!mapRef.current) return
      mapRef.current.resize()
      mapRef.current.triggerRepaint()
    }

    frameId = window.requestAnimationFrame(refreshMap)
    timers.push(window.setTimeout(refreshMap, 80))
    timers.push(window.setTimeout(refreshMap, 240))

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [isVisible, mapLoaded])

  useEffect(() => {
    if (!collections[activeLensId] || !initialHashRef.current) return
    const params = initialHashRef.current
    const lens = params.get('lens')
    const metric = params.get('metric')
    const item = params.get('item')

    if (lens && LENS_CONFIG[lens]) setActiveLensId(lens)
    if (lens && metric && LENS_CONFIG[lens]?.metrics.some((entry) => entry.key === metric)) {
      setMetricByLens((current) => ({ ...current, [lens]: metric }))
    }

    if (lens === activeLensId && item) {
      setSelectedFeatureId(item)
    }

    initialHashRef.current = null
  }, [activeLensId, collections])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set('lens', activeLensId)
    params.set('metric', activeMetric.key)
    if (selectedFeatureId) params.set('item', String(selectedFeatureId))
    window.history.replaceState(null, '', `#${params.toString()}`)
  }, [activeLensId, activeMetric.key, selectedFeatureId])

  useEffect(() => {
    if (!mapLoaded || !selectedFeature) return
    setSelectedFeatureState(selectedFeature.id)
  }, [mapLoaded, selectedFeature, setSelectedFeatureState])

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    const map = mapRef.current
    const resizeMap = () => {
      if (!mapRef.current) return
      mapRef.current.resize()
    }

    const immediateTimer = window.setTimeout(resizeMap, 0)
    const settleTimer = window.setTimeout(resizeMap, 180)

    window.addEventListener('resize', resizeMap)
    document.addEventListener('visibilitychange', resizeMap)

    return () => {
      window.clearTimeout(immediateTimer)
      window.clearTimeout(settleTimer)
      window.removeEventListener('resize', resizeMap)
      document.removeEventListener('visibilitychange', resizeMap)
    }
  }, [mapLoaded])

  const handleMetricChange = useCallback((metricKey) => {
    setMetricByLens((current) => ({ ...current, [activeLensId]: metricKey }))
  }, [activeLensId])

  const handleSearchSelect = useCallback((feature) => {
    setSearchQuery('')
    setSearchOpen(false)
    setSelectedFeatureId(feature.id)
    setSelectedFeatureState(feature.id)
    fitFeatureOnMap(feature)
  }, [fitFeatureOnMap, setSelectedFeatureState])

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }, [])

  const renderNeighbourhoodStory = () => {
    if (neighbourhoodStory === 'water') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">Service Snapshot</div>
              <h3>Water access by dwelling type</h3>
            </div>
            <StoryToggle
              value={neighbourhoodStory}
              onChange={setNeighbourhoodStory}
              options={[
                { value: 'water', label: 'Water' },
                { value: 'hunger', label: 'Hunger' },
                { value: 'materials', label: 'Housing' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={waterChartData} margin={{ top: 8, right: 6, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-10} textAnchor="end" height={54} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
              <Tooltip content={<CustomChartTooltip formatters={{ formal: (value) => `${DECIMAL_FORMATTER.format(value)}%`, informal: (value) => `${DECIMAL_FORMATTER.format(value)}%`, adi: (value) => `${DECIMAL_FORMATTER.format(value)}%`, city: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
              <Legend wrapperStyle={{ color: 'rgba(236,243,255,0.65)', fontSize: 11 }} />
              <Bar dataKey="formal" name="Formal" fill="#7B93FF" radius={[6, 6, 0, 0]} />
              <Bar dataKey="informal" name="Informal" fill="#E2E2E2" radius={[6, 6, 0, 0]} />
              <Bar dataKey="adi" name="ADI" fill="#5EC2A0" radius={[6, 6, 0, 0]} />
              <Bar dataKey="city" name="Cape Town" fill="#A78BFA" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )
    }

    if (neighbourhoodStory === 'hunger') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">Wellbeing Snapshot</div>
              <h3>Adult hunger comparison</h3>
            </div>
            <StoryToggle
              value={neighbourhoodStory}
              onChange={setNeighbourhoodStory}
              options={[
                { value: 'water', label: 'Water' },
                { value: 'hunger', label: 'Hunger' },
                { value: 'materials', label: 'Housing' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hungerChartData} margin={{ top: 8, right: 6, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
              <Tooltip content={<CustomChartTooltip formatters={{ survey2024: (value) => `${DECIMAL_FORMATTER.format(value)}%`, ghs2023: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
              <Legend wrapperStyle={{ color: 'rgba(236,243,255,0.65)', fontSize: 11 }} />
              <Bar dataKey="survey2024" name="2024 CCT Survey" fill="#7B93FF" radius={[6, 6, 0, 0]} />
              <Bar dataKey="ghs2023" name="2023 GHS" fill="#E2E2E2" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )
    }

    return (
      <>
        <div className="we-chart-card-head">
          <div>
            <div className="we-chart-card-kicker">Housing Snapshot</div>
            <h3>Main building materials</h3>
          </div>
          <div className="we-chart-head-controls">
            <StoryToggle
              value={neighbourhoodStory}
              onChange={setNeighbourhoodStory}
              options={[
                { value: 'water', label: 'Water' },
                { value: 'hunger', label: 'Hunger' },
                { value: 'materials', label: 'Housing' }
              ]}
            />
            <StoryToggle
              value={materialType}
              onChange={setMaterialType}
              options={[
                { value: 'Wall', label: 'Walls' },
                { value: 'Roof', label: 'Roof' }
              ]}
            />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={materialChartData} layout="vertical" margin={{ top: 8, right: 10, left: 12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${DECIMAL_FORMATTER.format(value)}%`} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fill: 'rgba(236,243,255,0.65)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomChartTooltip formatters={{ share: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
            <Bar dataKey="share" name="Share of all dwellings" fill="#C4CDFF" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </>
    )
  }

  const renderSuburbStory = () => {
    if (suburbStory === 'cooking') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">Suburb Profile</div>
              <h3>{selectedCookingRow ? `${selectedCookingRow.Suburb} cooking fuel mix` : 'Cooking fuel mix'}</h3>
            </div>
            <StoryToggle
              value={suburbStory}
              onChange={setSuburbStory}
              options={[
                { value: 'cooking', label: 'Cooking' },
                { value: 'electricity', label: 'Electricity' },
                { value: 'refuse', label: 'Refuse' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cookingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 14 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-10} textAnchor="end" height={50} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${DECIMAL_FORMATTER.format(value)}%`} />
              <Tooltip content={<CustomChartTooltip formatters={{ value: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
              <Bar dataKey="value" name="Households" fill="#7B93FF" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )
    }

    if (suburbStory === 'electricity') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">City Snapshot</div>
              <h3>Main electricity supply types</h3>
            </div>
            <StoryToggle
              value={suburbStory}
              onChange={setSuburbStory}
              options={[
                { value: 'cooking', label: 'Cooking' },
                { value: 'electricity', label: 'Electricity' },
                { value: 'refuse', label: 'Refuse' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={electricityChartData} margin={{ top: 8, right: 6, left: 0, bottom: 18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={56} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
              <Tooltip content={<CustomChartTooltip formatters={{ cct: (value) => `${DECIMAL_FORMATTER.format(value)}%`, eskom: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
              <Legend wrapperStyle={{ color: 'rgba(236,243,255,0.65)', fontSize: 11 }} />
              <Bar dataKey="cct" name="CCT supply" fill="#7B93FF" radius={[6, 6, 0, 0]} />
              <Bar dataKey="eskom" name="Eskom supply" fill="#5EC2A0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )
    }

    return (
      <>
        <div className="we-chart-card-head">
          <div>
            <div className="we-chart-card-kicker">Service Snapshot</div>
            <h3>Refuse removal pathways</h3>
          </div>
          <StoryToggle
            value={suburbStory}
            onChange={setSuburbStory}
            options={[
              { value: 'cooking', label: 'Cooking' },
              { value: 'electricity', label: 'Electricity' },
              { value: 'refuse', label: 'Refuse' }
            ]}
          />
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={refuseChartData} margin={{ top: 8, right: 6, left: 0, bottom: 18 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.58)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-10} textAnchor="end" height={62} />
            <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
            <Tooltip content={<CustomChartTooltip formatters={{ formal: (value) => `${DECIMAL_FORMATTER.format(value)}%`, informal: (value) => `${DECIMAL_FORMATTER.format(value)}%`, adi: (value) => `${DECIMAL_FORMATTER.format(value)}%`, total: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
            <Legend wrapperStyle={{ color: 'rgba(236,243,255,0.65)', fontSize: 11 }} />
            <Bar dataKey="formal" name="Formal" fill="#7B93FF" radius={[6, 6, 0, 0]} />
            <Bar dataKey="informal" name="Informal" fill="#E2E2E2" radius={[6, 6, 0, 0]} />
            <Bar dataKey="adi" name="ADI" fill="#5EC2A0" radius={[6, 6, 0, 0]} />
            <Bar dataKey="total" name="Total" fill="#A78BFA" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </>
    )
  }

  const renderEconomyStory = () => {
    if (economyStory === 'trend') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">Trend Story</div>
              <h3>{focusFeature ? `${focusFeature.properties.display_name} growth index` : 'Growth index'}</h3>
            </div>
            <StoryToggle
              value={economyStory}
              onChange={setEconomyStory}
              options={[
                { value: 'trend', label: 'Trend' },
                { value: 'composition', label: 'Composition' },
                { value: 'growth', label: 'Top Growth' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={economyTrendData} margin={{ top: 12, right: 18, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${DECIMAL_FORMATTER.format(value)}`} />
              <Tooltip content={<CustomChartTooltip formatters={{ jobs: (value) => `${DECIMAL_FORMATTER.format(value)} index`, businesses: (value) => `${DECIMAL_FORMATTER.format(value)} index`, income: (value) => `${DECIMAL_FORMATTER.format(value)} index` }} />} />
              <Legend wrapperStyle={{ color: 'rgba(236,243,255,0.65)', fontSize: 11 }} />
              <Line type="monotone" dataKey="jobs" name="Jobs" stroke="#7B93FF" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="businesses" name="Businesses" stroke="#5EC2A0" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="income" name="Income" stroke="#A78BFA" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )
    }

    if (economyStory === 'composition') {
      return (
        <>
          <div className="we-chart-card-head">
            <div>
              <div className="we-chart-card-kicker">Workforce Mix</div>
              <h3>{focusFeature ? `${focusFeature.properties.display_name} workforce profile` : 'Workforce profile'}</h3>
            </div>
            <StoryToggle
              value={economyStory}
              onChange={setEconomyStory}
              options={[
                { value: 'trend', label: 'Trend' },
                { value: 'composition', label: 'Composition' },
                { value: 'growth', label: 'Top Growth' }
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={economyCompositionData} margin={{ top: 8, right: 8, left: 0, bottom: 18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'rgba(236,243,255,0.6)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-10} textAnchor="end" height={52} />
              <YAxis tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${DECIMAL_FORMATTER.format(value)}%`} />
              <Tooltip content={<CustomChartTooltip formatters={{ value: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
              <Bar dataKey="value" name="Share" fill="#5EC2A0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </>
      )
    }

    return (
      <>
        <div className="we-chart-card-head">
          <div>
            <div className="we-chart-card-kicker">Growth Leaders</div>
            <h3>Top employment growth hexagons</h3>
          </div>
          <StoryToggle
            value={economyStory}
            onChange={setEconomyStory}
            options={[
              { value: 'trend', label: 'Trend' },
              { value: 'composition', label: 'Composition' },
              { value: 'growth', label: 'Top Growth' }
            ]}
          />
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={economyGrowthChartData} layout="vertical" margin={{ top: 8, right: 10, left: 12, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" horizontal={false} />
            <XAxis type="number" tick={{ fill: 'rgba(236,243,255,0.55)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${DECIMAL_FORMATTER.format(value)}%`} />
            <YAxis type="category" dataKey="name" width={104} tick={{ fill: 'rgba(236,243,255,0.65)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomChartTooltip formatters={{ growth: (value) => `${DECIMAL_FORMATTER.format(value)}%` }} />} />
            <Bar dataKey="growth" name="Employment growth" fill="#A78BFA" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </>
    )
  }

  const renderStoryCard = () => {
    if (activeLensId === 'neighbourhoods') return renderNeighbourhoodStory()
    if (activeLensId === 'suburbs') return renderSuburbStory()
    return renderEconomyStory()
  }

  if (!activeCollection) {
    return (
      <div className="we-root">
        <div className="we-map" ref={mapEl} style={{ opacity: 0 }} />
        <div className="we-loading">
          <div className="we-loading-spinner" />
          <p>Loading CPT atlas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`we-root ${isAnalyticsCollapsed ? 'we-root--analytics-collapsed' : 'we-root--analytics-open'}`}>
      {/* atmosphere glow removed for cleaner map view */}
      <div className="we-map" ref={mapEl} />

      <header className="we-header">
        <div className="we-brand">
          <div className="we-brand-mark" />
          <div>
            <h1 className="we-brand-title">Mission Urban Lab</h1>
            <p className="we-brand-sub">Cape Town atlas for neighbourhood, suburb and economic insight</p>
          </div>
        </div>

        <div className="we-search">
          <input
            className="we-search-input"
            type="text"
            placeholder={activeLens.searchPlaceholder}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
          />
          {searchOpen && searchResults.length > 0 ? (
            <div className="we-search-dropdown">
              {searchResults.map((feature) => (
                <button
                  key={feature.id}
                  className="we-search-result"
                  onMouseDown={() => handleSearchSelect(feature)}
                >
                  <span className="we-search-name">{feature.properties?.display_name}</span>
                  <span className="we-search-meta">{activeLens.badge}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="we-header-actions">
          <button className={`we-share-btn ${copied ? 'we-share-btn--copied' : ''}`} onClick={handleShare}>
            {copied ? 'Copied' : 'Share View'}
          </button>
          <button className="we-enter-btn" onClick={onEnterDashboard}>
            Enter Dashboard
            <span className="we-enter-arrow">→</span>
          </button>
        </div>
      </header>

      <div className="we-left-col">
        <div className={`we-hero-card ${isHeroCollapsed ? 'we-hero-card--collapsed' : ''}`}>
          <div className="we-panel-utility">
            <div className="we-hero-kicker">{activeLens.badge}</div>
            <button className="we-panel-toggle" onClick={() => setIsHeroCollapsed((current) => !current)}>
              {isHeroCollapsed ? 'Show overview' : 'Hide overview'}
            </button>
          </div>
          {!isHeroCollapsed ? (
            <>
              <h2 className="we-hero-title">{activeLens.title}</h2>
              <p className="we-hero-desc">{activeLens.subtitle}</p>
              <div className="we-overview-grid">
                {cityOverviewStats.map((stat) => (
                  <OverviewStat key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
                ))}
              </div>
            </>
          ) : (
            <p className="we-collapsed-note">Overview hidden so the map has more space.</p>
          )}
        </div>

        <aside className={`we-left-panel ${isThemePanelCollapsed ? 'we-left-panel--collapsed' : ''}`}>
        <div className="we-panel-header">
          <div className="we-panel-utility">
            <div className="we-panel-kicker">Map Theme</div>
            <button className="we-panel-toggle" onClick={() => setIsThemePanelCollapsed((current) => !current)}>
              {isThemePanelCollapsed ? 'Show themes' : 'Hide themes'}
            </button>
          </div>
          <h3>{activeMetric.label}</h3>
          <p>{activeMetric.description}</p>
        </div>
        {!isThemePanelCollapsed ? (
          <>
            <div className="we-metric-grid">
              {activeLens.metrics.map((metric) => (
                <button
                  key={metric.key}
                  className={`we-metric-pill ${activeMetric.key === metric.key ? 'we-metric-pill--active' : ''}`}
                  onClick={() => handleMetricChange(metric.key)}
                  style={activeMetric.key === metric.key ? { borderColor: metric.high, color: metric.high, boxShadow: `0 0 0 1px ${metric.high} inset` } : undefined}
                >
                  <span className="we-metric-pill-title">{metric.label}</span>
                  <span className="we-metric-pill-desc">{metric.description}</span>
                </button>
              ))}
            </div>
            <div className="we-legend">
              <div
                className="we-legend-bar"
                style={{ background: `linear-gradient(90deg, ${activeMetric.low}, ${mixHexColors(activeMetric.low, activeMetric.high, 0.5)}, ${activeMetric.high})` }}
              />
              <div className="we-legend-labels">
                <span>Lower</span>
                <strong>{activeMetric.label}</strong>
                <span>Higher</span>
              </div>
            </div>
          </>
        ) : (
          <div className="we-collapsed-note">Theme picker hidden while you inspect map results.</div>
        )}
      </aside>
      </div>

      <div className="we-lens-switcher">
        {Object.values(LENS_CONFIG).map((lens) => (
          <button
            key={lens.id}
            className={`we-lens-btn ${activeLensId === lens.id ? 'we-lens-btn--active' : ''}`}
            onClick={() => setActiveLensId(lens.id)}
          >
            <span className="we-lens-btn-label">{lens.label}</span>
            <span className="we-lens-btn-sub">{lens.badge}</span>
          </button>
        ))}
      </div>

      {hoveredFeature && !selectedFeature ? (
        <div
          className="we-tooltip"
          style={{
            left: Math.min(hoveredPos.x + 18, window.innerWidth - 240),
            top: Math.max(hoveredPos.y - 36, 72)
          }}
        >
          <div className="we-tooltip-title">{hoveredFeature.properties?.display_name}</div>
          <div className="we-tooltip-row">
            <span>{activeMetric.label}</span>
            <strong>{formatMetricValue(activeMetric.format, Number(hoveredFeature.properties?.[activeMetric.key]))}</strong>
          </div>
          <div className="we-tooltip-hint">Click to pin this area</div>
        </div>
      ) : null}

      <aside className={`we-detail-panel ${isDetailMinimized ? 'we-detail-panel--minimized' : ''}`}>
        <div className="we-detail-head">
          <div>
            <div className="we-detail-kicker">{activeLens.badge}</div>
            <h3>{focusFeature?.properties?.display_name || 'Select an area'}</h3>
            <p>{focusFeature ? 'Pinned view with friendly labels and citywide comparison.' : 'Click on the map to inspect an area in more detail.'}</p>
          </div>
          <div className="we-detail-actions">
            <button className="we-panel-toggle" onClick={() => setIsDetailMinimized((current) => !current)}>
              {isDetailMinimized ? 'Expand stats' : 'Minimise'}
            </button>
            {selectedFeature ? (
              <button
                className="we-detail-close"
                onClick={() => {
                  clearSelectedFeatureState()
                  setSelectedFeatureId(null)
                  setIsDetailMinimized(false)
                  setIsThemePanelCollapsed(false)
                }}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
        {!isDetailMinimized ? (
          <>
            <div className="we-detail-main-metric">
              <span>Main metric</span>
              <strong>{focusFeature ? formatMetricValue(activeMetric.format, Number(focusFeature.properties?.[activeMetric.key])) : 'No data'}</strong>
              <small>{activeMetric.label}</small>
            </div>
            <div className="we-detail-rows">
              {focusFeature ? activeLens.detailStats.map((stat) => {
                const rawValue = Number(focusFeature.properties?.[stat.key])
                if (!Number.isFinite(rawValue)) return null
                const average = averageLookup[stat.key]
                const deltaPercent = Number.isFinite(average) && average !== 0 ? ((rawValue - average) / average) * 100 : null
                const delta = deltaPercent !== null && Math.abs(deltaPercent) >= 2
                  ? {
                      label: `${deltaPercent > 0 ? '+' : ''}${DECIMAL_FORMATTER.format(deltaPercent)} vs city`,
                      positive: deltaPercent > 0
                    }
                  : null
                return (
                  <DetailRow
                    key={stat.key}
                    label={stat.label}
                    value={formatMetricValue(stat.format, rawValue)}
                    delta={delta}
                  />
                )
              }) : null}
            </div>
          </>
        ) : (
          <div className="we-collapsed-note">Detailed stats are minimised. Expand them when you want the full breakdown.</div>
        )}
      </aside>

      <section className={`we-analytics-rail ${isAnalyticsCollapsed ? 'we-analytics-rail--collapsed' : ''}`}>
        <div className="we-analytics-rail-head">
          <div>
            <div className="we-chart-card-kicker">Charts And Stats</div>
            <h3>{isAnalyticsCollapsed ? 'Bottom analytics hidden for a clearer map view' : 'Bottom analytics open'}</h3>
          </div>
          <button className="we-panel-toggle" onClick={() => setIsAnalyticsCollapsed((current) => !current)}>
            {isAnalyticsCollapsed ? 'Show charts' : 'Hide charts'}
          </button>
        </div>

        {!isAnalyticsCollapsed ? (
          <div className="we-analytics-rail-body">
            <article className="we-chart-card">
              <div className="we-chart-card-head">
                <div>
                  <div className="we-chart-card-kicker">Map Ranking</div>
                  <h3>Top places for {activeMetric.label.toLowerCase()}</h3>
                </div>
                <div className="we-chart-card-note">Based on the active map layer</div>
              </div>
              <RankingChart data={rankingChartData} metric={activeMetric} onBarClick={handleSearchSelect} />
            </article>

            <article className="we-chart-card">
              {renderStoryCard()}
            </article>

            <article className="we-chart-card we-chart-card--spotlight">
              <div className="we-chart-card-head">
                <div>
                  <div className="we-chart-card-kicker">Spotlight</div>
                  <h3>{focusFeature?.properties?.display_name || 'Area spotlight'}</h3>
                </div>
              </div>
              <p className="we-spotlight-copy">
                {focusFeature
                  ? `This card keeps the selected area in focus while you flip through the map themes and bottom charts.`
                  : 'Pick any area on the map and the spotlight card will update with its most useful summary values.'}
              </p>
              <div className="we-spotlight-grid">
                {spotlightStats.map((stat) => (
                  <div key={stat.label} className="we-spotlight-stat">
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                  </div>
                ))}
              </div>
              <div className="we-spotlight-note">
                Labels are translated into plain English so the landing page stays easy to scan.
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </div>
  )
}
