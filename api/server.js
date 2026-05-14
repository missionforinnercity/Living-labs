import express from 'express'
import cors from 'cors'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env from project root
const envPath = join(__dirname, '..', '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) return
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  })
} catch (_) {}

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const app = express()
app.use(cors())
app.use(express.json())

function buildEventsFeatureCollection(rows) {
  const features = rows
    .filter((row) => Number.isFinite(row.longitude) && Number.isFinite(row.latitude))
    .map((row) => ({
      type: 'Feature',
      properties: {
        name: row.event_name || 'Untitled event',
        venue: row.venue || 'Unknown venue',
        date: row.event_date || null,
        time: row.event_time || null,
        url: row.event_url || null,
        source_url: row.source_url || null,
        first_seen_at: row.first_seen_at || null,
        updated_at: row.updated_at || null
      },
      geometry: {
        type: 'Point',
        coordinates: [row.longitude, row.latitude]
      }
    }))

  const timestamps = rows.flatMap((row) => [row.first_seen_at, row.updated_at]).filter(Boolean)
  const eventDates = rows.map((row) => row.event_date).filter(Boolean).sort()
  const venues = new Set(rows.map((row) => row.venue).filter(Boolean))

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      totalRows: rows.length,
      totalFeatures: features.length,
      venueCount: venues.size,
      firstSeenAt: timestamps.length ? timestamps.reduce((min, value) => (value < min ? value : min)) : null,
      lastUpdatedAt: timestamps.length ? timestamps.reduce((max, value) => (value > max ? value : max)) : null,
      eventDateRange: eventDates.length
        ? { start: eventDates[0], end: eventDates[eventDates.length - 1] }
        : null,
      fetchedAt: new Date().toISOString(),
      source: 'planning.event_features_geojson'
    }
  }
}

function buildGeoFeatureCollection(rows, {
  geometryField = 'geometry',
  source = null,
  metadata = {}
} = {}) {
  const features = rows
    .filter((row) => row?.[geometryField])
    .map((row) => {
      const properties = { ...row }
      delete properties[geometryField]

      return {
        type: 'Feature',
        properties,
        geometry: row[geometryField]
      }
    })

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      totalRows: rows.length,
      totalFeatures: features.length,
      fetchedAt: new Date().toISOString(),
      ...(source ? { source } : {}),
      ...metadata
    }
  }
}

async function getGeometryColumn(schemaName, tableName) {
  const { rows } = await pool.query(`
    SELECT f_geometry_column AS column_name
    FROM geometry_columns
    WHERE f_table_schema = $1 AND f_table_name = $2
    LIMIT 1
  `, [schemaName, tableName])

  if (rows[0]?.column_name) return rows[0].column_name

  const fallback = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = $2
      AND column_name IN ('wkb_geometry', 'geom', 'geometry')
    ORDER BY CASE column_name
      WHEN 'wkb_geometry' THEN 1
      WHEN 'geom' THEN 2
      ELSE 3
    END
    LIMIT 1
  `, [schemaName, tableName])

  return fallback.rows[0]?.column_name || null
}

async function getTableColumns(schemaName, tableName, excludedColumns = []) {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, [schemaName, tableName])

  const excluded = new Set(excludedColumns)
  return rows
    .map((row) => row.column_name)
    .filter((column) => !excluded.has(column))
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function normaliseStreetSql(expression) {
  return `lower(regexp_replace(regexp_replace(coalesce(${expression}, ''), '\\s+', ' ', 'g'), '\\s+(street|st|road|rd|avenue|ave|mall|pass|lane|ln|drive|dr|boulevard|blvd)$', '', 'i'))`
}

function parseMarketValueList(value) {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite)
  return String(value)
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite) || []
}

function getParcelZoningGroup(zoningValue) {
  const zoning = String(zoningValue || '').toLowerCase()
  if (!zoning.trim()) return 'Unknown'
  if (zoning.includes('community')) return 'Community'
  if (zoning.includes('general business') || zoning.includes('local business')) return 'Business'
  if (zoning.includes('mixed use')) return 'Mixed Use'
  if (zoning.includes('residential') || zoning.includes('housing')) return 'Residential'
  if (zoning.includes('open space')) return 'Open Space'
  if (zoning.includes('transport') || zoning.includes('road') || zoning.includes('parking')) return 'Transport'
  if (zoning.includes('utility')) return 'Utility'
  if (zoning.includes('limited use')) return 'Limited Use'
  return 'Other'
}

function getParcelValueChangeGroup(previousValue, currentValue) {
  if (!Number.isFinite(previousValue) || !Number.isFinite(currentValue) || previousValue <= 0 || currentValue <= 0) {
    return 'No comparison'
  }
  const pctChange = ((currentValue - previousValue) / previousValue) * 100
  if (pctChange >= 35) return 'Rising fast'
  if (pctChange >= 8) return 'Rising'
  if (pctChange <= -35) return 'Dropping fast'
  if (pctChange <= -8) return 'Dropping'
  return 'Stable'
}

function buildLandParcelFeatureCollection(rows) {
  const features = rows
    .filter((row) => row.geometry)
    .map((row) => {
      const previousMarketValues = parseMarketValueList(row.gv_market_values_numeric).filter((value) => value > 0)
      const currentMarketValues = parseMarketValueList(row.gv2025_market_values_numeric).filter((value) => value > 0)
      const previousMarketValue = previousMarketValues.length ? Math.max(...previousMarketValues) : null
      const currentMarketValue = currentMarketValues.length ? Math.max(...currentMarketValues) : null
      const marketValue = currentMarketValue || previousMarketValue
      const marketValueChange = Number.isFinite(previousMarketValue) && Number.isFinite(currentMarketValue)
        ? currentMarketValue - previousMarketValue
        : null
      const marketValueChangePct = Number.isFinite(marketValueChange) && previousMarketValue > 0
        ? (marketValueChange / previousMarketValue) * 100
        : null
      const valueChangeGroup = getParcelValueChangeGroup(previousMarketValue, currentMarketValue)
      const areaM2 = Number(row.area_m2 || row.shape__area)
      const ownerType = row.gv2025_owner_type || row.owner_type || null
      const isCityOwned = Boolean(row.gv2025_is_city_owned || row.is_city_owned)

      return {
        type: 'Feature',
        properties: {
          fid: row.fid,
          sg26_code: row.sg26_code,
          sl_land_prcl_key: row.sl_land_prcl_key,
          prty_nmbr: row.prty_nmbr,
          address: [row.adr_no, row.adr_no_sfx, row.str_name, row.lu_str_name_type]
            .filter((part) => part !== null && part !== undefined && String(part).trim() !== '')
            .join(' '),
          suburb: row.ofc_sbrb_name || row.alt_name || null,
          ward_name: row.ward_name || null,
          zoning: row.zoning || 'Unzoned / unknown',
          zoning_group: getParcelZoningGroup(row.zoning),
          owner_type: ownerType,
          is_city_owned: isCityOwned,
          market_value: marketValue,
          market_value_previous: previousMarketValue,
          market_value_2025: currentMarketValue,
          market_value_change: marketValueChange,
          market_value_change_pct: marketValueChangePct,
          value_change_group: valueChangeGroup,
          market_value_count: previousMarketValues.length + currentMarketValues.length,
          area_m2: Number.isFinite(areaM2) ? areaM2 : null,
          rating_categories: row.gv2025_rating_categories || row.gv_rating_categories || null,
          registered_descriptions: row.gv2025_registered_descriptions || row.gv_registered_descriptions || null,
          valuation_types: row.gv2025_valuation_types || row.gv_valuation_types || null,
          match_count: row.gv2025_match_count || row.gv_match_count || null,
          source_year: row.gv2025_market_values_numeric ? 2025 : null
        },
        geometry: row.geometry
      }
    })

  const zoningGroups = {}
  let marketValueTotal = 0
  let marketValueCount = 0
  let cityOwnedCount = 0
  let totalAreaM2 = 0

  features.forEach((feature) => {
    const props = feature.properties
    zoningGroups[props.zoning_group] = (zoningGroups[props.zoning_group] || 0) + 1
    if (props.is_city_owned) cityOwnedCount += 1
    if (Number.isFinite(props.market_value)) {
      marketValueTotal += props.market_value
      marketValueCount += 1
    }
    if (Number.isFinite(props.area_m2)) totalAreaM2 += props.area_m2
  })

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      totalRows: rows.length,
      totalFeatures: features.length,
      cityOwnedCount,
      avgMarketValue: marketValueCount ? marketValueTotal / marketValueCount : null,
      totalAreaM2,
      zoningGroups,
      fetchedAt: new Date().toISOString(),
      source: 'cadastre.landparcels_gv'
    }
  }
}

const CLIMATE_TABLES = {
  heat_grid: {
    source: 'climate.heat_grid',
    orderColumns: ['analysis_year', 'analysis_month', 'thermal_percentile', 'urban_heat_score', 'feature_id', 'ogc_fid'],
    summaryColumns: [
      'predicted_lst_c_fusion',
      'heat_model_lst_c',
      'mean_lst_c',
      'thermal_percentile',
      'urban_heat_score',
      'pedestrian_heat_score',
      'priority_score',
      'night_heat_retention_c',
      'retained_heat_score',
      'effective_canopy_pct',
      'thermal_confidence_score',
      'cool_island_score',
      'shade_deficit_score'
    ]
  },
  shade: {
    source: 'climate.shade',
    orderColumns: ['hour', 'ogc_fid'],
    summaryColumns: ['area_m2']
  },
  est_wind: {
    source: 'climate.est_wind',
    orderColumns: ['estimated_speed_kmh', 'class_value', 'ogc_fid'],
    summaryColumns: ['estimated_speed_kmh', 'wind_speed_factor', 'frequency_weight', 'area_m2']
  }
}

async function buildClimateTableFeatureCollection(tableName, filters = {}) {
  const config = CLIMATE_TABLES[tableName]
  if (!config) throw new Error(`Unsupported climate table: ${tableName}`)

  const schemaName = 'climate'
  const geometryColumn = await getGeometryColumn(schemaName, tableName)
  if (!geometryColumn) {
    throw new Error(`No geometry column found for climate.${tableName}`)
  }

  const propertyColumns = await getTableColumns(schemaName, tableName, [geometryColumn])
  const scenarioSpeedKmh = Number(filters.scenarioSpeedKmh)
  const selectedPropertyExpressions = propertyColumns.map((column) => {
    if (
      tableName === 'est_wind'
      && column === 'estimated_speed_kmh'
      && Number.isFinite(scenarioSpeedKmh)
      && propertyColumns.includes('wind_speed_factor')
    ) {
      return `round((${quoteIdentifier('wind_speed_factor')} * ${scenarioSpeedKmh})::numeric, 2) AS ${quoteIdentifier('estimated_speed_kmh')}`
    }
    if (
      tableName === 'est_wind'
      && column === 'reference_speed_kmh'
      && Number.isFinite(scenarioSpeedKmh)
    ) {
      return `${scenarioSpeedKmh}::double precision AS ${quoteIdentifier('reference_speed_kmh')}`
    }
    return quoteIdentifier(column)
  })
  const selectedProperties = selectedPropertyExpressions.length
    ? `${selectedPropertyExpressions.join(',')},`
    : ''

  const where = [`${quoteIdentifier(geometryColumn)} IS NOT NULL`]
  const params = []
  if (filters.hour && propertyColumns.includes('hour')) {
    params.push(filters.hour)
    where.push(`${quoteIdentifier('hour')} = $${params.length}`)
  }

  if (filters.month && tableName === 'shade') {
    const monthColumn = ['analysis_month', 'month', 'month_num'].find((column) => propertyColumns.includes(column))
    const monthValue = Number(filters.month)
    if (monthColumn && Number.isFinite(monthValue)) {
      params.push(monthValue)
      where.push(`${quoteIdentifier(monthColumn)} = $${params.length}`)
    }
  }

  if (filters.direction && tableName === 'est_wind') {
    const directionColumn = [
      'wind_direction',
      'wind_direction_deg',
      'direction',
      'direction_deg',
      'prevailing_wind_direction'
    ].find((column) => propertyColumns.includes(column))

    if (directionColumn) {
      params.push(String(filters.direction).toLowerCase())
      where.push(`lower(${quoteIdentifier(directionColumn)}::text) = $${params.length}`)
    }
  }

  const orderCandidates = config.orderColumns.filter((column) => propertyColumns.includes(column))
  const orderClause = orderCandidates.length
    ? `ORDER BY ${orderCandidates.map((column) => `${quoteIdentifier(column)} DESC NULLS LAST`).join(', ')}`
    : ''
  const geometryExpression = tableName === 'est_wind'
    ? `ST_AsGeoJSON(ST_SimplifyPreserveTopology(${quoteIdentifier(geometryColumn)}, 0.00001))::json AS geometry`
    : `ST_AsGeoJSON(${quoteIdentifier(geometryColumn)})::json AS geometry`

  const { rows } = await pool.query(`
    SELECT
      ${selectedProperties}
      ${geometryExpression}
    FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
    WHERE ${where.join(' AND ')}
    ${orderClause}
  `, params)

  const numericColumnSummary = config.summaryColumns
    .filter((column) => propertyColumns.includes(column))
    .map((column) => `round(avg(${quoteIdentifier(column)})::numeric, 2) AS ${quoteIdentifier(`avg_${column}`)}`)

  const summaryRows = numericColumnSummary.length
    ? (await pool.query(`
        SELECT
          count(*) AS feature_count,
          ${numericColumnSummary.join(',')}
        FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
        WHERE ${where.join(' AND ')}
      `, params)).rows
    : [{ feature_count: rows.length }]

  return buildGeoFeatureCollection(rows, {
    source: config.source,
    metadata: {
      ...(summaryRows[0] || {}),
      geometryColumn,
      filters
    }
  })
}

// Current environment grid data — latest record per grid cell derived from history
app.get('/api/environment/current', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        DISTINCT ON (grid_id)
        grid_id,
        latitude,
        longitude,
        datetime_utc AS fetched_utc,
        datetime_utc AS aq_datetime,
        datetime_utc AS updated_at,
        uaqi,
        uaqi AS uaqi_display,
        uaqi_category,
        NULL::text AS uaqi_dominant,
        poll_co_value,
        poll_no2_value,
        poll_o3_value,
        poll_pm10_value,
        poll_so2_value,
        health_general
      FROM environment.airquality_history
      ORDER BY grid_id, datetime_utc DESC
    `)
    res.json({ rows, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[API] /environment/current error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Environmental grid history — all available data
app.get('/api/environment/history', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        grid_id, latitude, longitude,
        datetime_utc AS hour_utc,
        uaqi,
        poll_co_value  AS poll_co,
        poll_no2_value AS poll_no2,
        poll_o3_value  AS poll_o3,
        poll_pm10_value AS poll_pm10,
        poll_so2_value  AS poll_so2,
        uaqi_category,
        health_general
      FROM environment.airquality_history
      ORDER BY grid_id, datetime_utc
    `)
    res.json({ rows, fetchedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[API] /environment/history error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/environment/greenery-access', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ogc_fid,
        globalid,
        objectid,
        sl_str_name_key,
        str_name,
        lu_str_name_type_key,
        bgn_date,
        str_name_mdf,
        prvt_ind,
        lu_str_name_drct_key,
        shape__length,
        segment_id,
        residential_buildings_250m,
        is_residential_proxy,
        segment_length_m,
        walk_time_minutes,
        best_case_minutes,
        worst_case_minutes,
        residential_access_gap,
        park_walk_time_minutes,
        park_quality_score,
        park_quality_class,
        quality_adjusted_park_minutes,
        ST_AsGeoJSON(wkb_geometry)::json AS geometry
      FROM environment.greenery_accessibility_metrics
      ORDER BY str_name NULLS LAST, segment_id
    `)

    const [{ rows: summaryRows }] = await Promise.all([
      pool.query(`
        SELECT
          count(*) AS segment_count,
          count(distinct str_name) AS street_count,
          count(*) FILTER (WHERE residential_access_gap) AS access_gap_segments,
          round(avg(walk_time_minutes)::numeric, 2) AS avg_walk_time_minutes,
          round(avg(quality_adjusted_park_minutes)::numeric, 2) AS avg_quality_adjusted_minutes,
          round(avg(park_quality_score)::numeric, 1) AS avg_park_quality_score
        FROM environment.greenery_accessibility_metrics
      `)
    ])

    res.json(buildGeoFeatureCollection(rows, {
      source: 'environment.greenery_accessibility_metrics',
      metadata: summaryRows[0] || {}
    }))
  } catch (err) {
    console.error('[API] /environment/greenery-access error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/environment/green-destinations', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ogc_fid,
        name,
        destination_type,
        source_layer,
        source,
        osm_id,
        quality_score,
        quality_class,
        canopy_cover_ratio,
        area_m2,
        is_official_park,
        near_major_road,
        access_reason,
        destination_group,
        ST_AsGeoJSON(wkb_geometry)::json AS geometry
      FROM environment.green_destinations
      ORDER BY destination_group NULLS LAST, destination_type NULLS LAST, name NULLS LAST
    `)

    const [{ rows: summaryRows }] = await Promise.all([
      pool.query(`
        SELECT
          count(*) AS destination_count,
          count(*) FILTER (WHERE is_official_park) AS official_park_count,
          count(*) FILTER (WHERE near_major_road) AS near_major_road_count,
          round(avg(quality_score)::numeric, 1) AS avg_quality_score
        FROM environment.green_destinations
      `)
    ])

    res.json(buildGeoFeatureCollection(rows, {
      source: 'environment.green_destinations',
      metadata: summaryRows[0] || {}
    }))
  } catch (err) {
    console.error('[API] /environment/green-destinations error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/transport/road-steepness', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH steepness AS (
        SELECT
          ogc_fid,
          globalid,
          NULLIF(objectid, '')::numeric::int AS objectid,
          NULLIF(sl_str_name_key, '')::numeric::int AS sl_str_name_key,
          NULLIF(str_name, '') AS str_name,
          NULLIF(length_m, '')::double precision AS length_m,
          NULLIF(start_elev_m, '')::double precision AS start_elev_m,
          NULLIF(end_elev_m, '')::double precision AS end_elev_m,
          NULLIF(elev_gain_m, '')::double precision AS elev_gain_m,
          NULLIF(elev_loss_m, '')::double precision AS elev_loss_m,
          NULLIF(net_elev_change_m, '')::double precision AS net_elev_change_m,
          NULLIF(mean_abs_grade_pct, '')::double precision AS mean_abs_grade_pct,
          NULLIF(max_grade_pct, '')::double precision AS max_grade_pct,
          NULLIF(net_grade_pct, '')::double precision AS net_grade_pct,
          NULLIF(steepness_valid, '')::boolean AS steepness_valid
        FROM transport.road_steepness
        WHERE NULLIF(objectid, '') IS NOT NULL
      )
      SELECT
        s.ogc_fid,
        s.globalid,
        s.objectid,
        s.sl_str_name_key,
        COALESCE(s.str_name, r."STR_NAME") AS street_name,
        s.length_m,
        s.start_elev_m,
        s.end_elev_m,
        s.elev_gain_m,
        s.elev_loss_m,
        s.net_elev_change_m,
        s.mean_abs_grade_pct,
        s.max_grade_pct,
        s.net_grade_pct,
        abs(s.net_grade_pct) AS abs_net_grade_pct,
        CASE
          WHEN abs(s.net_grade_pct) < 1 THEN 'flat'
          WHEN abs(s.net_grade_pct) < 4 THEN 'gentle'
          WHEN abs(s.net_grade_pct) < 8 THEN 'moderate'
          WHEN abs(s.net_grade_pct) < 12 THEN 'steep'
          ELSE 'very_steep'
        END AS steepness_class,
        CASE
          WHEN s.net_grade_pct > 0.25 THEN 'with_geometry'
          WHEN s.net_grade_pct < -0.25 THEN 'against_geometry'
          ELSE 'mostly_flat'
        END AS uphill_direction,
        CASE
          WHEN s.net_grade_pct < -0.25 THEN s.end_elev_m
          ELSE s.start_elev_m
        END AS uphill_from_elev_m,
        CASE
          WHEN s.net_grade_pct < -0.25 THEN s.start_elev_m
          ELSE s.end_elev_m
        END AS uphill_to_elev_m,
        s.steepness_valid,
        ST_AsGeoJSON(
          ST_Transform(
            CASE WHEN s.net_grade_pct < -0.25 THEN ST_Reverse(r.geom) ELSE r.geom END,
            4326
          )
        )::json AS geometry
      FROM steepness s
      JOIN transport."Roads_innercity_CCID" r ON s.objectid = r."OBJECTID"
      WHERE r.geom IS NOT NULL
      ORDER BY abs(s.net_grade_pct) DESC NULLS LAST, COALESCE(s.str_name, r."STR_NAME") NULLS LAST
    `)

    const [{ rows: summaryRows }] = await Promise.all([
      pool.query(`
        WITH steepness AS (
          SELECT
            NULLIF(objectid, '')::numeric::int AS objectid,
            NULLIF(net_grade_pct, '')::double precision AS net_grade_pct,
            NULLIF(steepness_valid, '')::boolean AS steepness_valid
          FROM transport.road_steepness
          WHERE NULLIF(objectid, '') IS NOT NULL
        )
        SELECT
          count(*) AS segment_count,
          count(*) FILTER (WHERE abs(net_grade_pct) >= 8) AS steep_segment_count,
          round(avg(abs(net_grade_pct))::numeric, 2) AS avg_abs_grade_pct,
          round(max(abs(net_grade_pct))::numeric, 2) AS max_abs_grade_pct
        FROM steepness
        WHERE steepness_valid IS DISTINCT FROM false
      `)
    ])

    res.json(buildGeoFeatureCollection(rows, {
      source: 'transport.road_steepness',
      metadata: summaryRows[0] || {}
    }))
  } catch (err) {
    console.error('[API] /transport/road-steepness error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/transport/strava-mobility', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ogc_fid,
        edge_uid,
        osm_reference_id,
        monthly_stats,
        ST_AsGeoJSON(wkb_geometry)::json AS geometry
      FROM transport.strava_mobility
      WHERE wkb_geometry IS NOT NULL
      ORDER BY edge_uid
    `)

    const { rows: summaryRows } = await pool.query(`
      WITH months AS (
        SELECT jsonb_object_keys(COALESCE(monthly_stats::jsonb, '{}'::jsonb)) AS month_key
        FROM transport.strava_mobility
      )
      SELECT
        (SELECT count(*) FROM transport.strava_mobility WHERE wkb_geometry IS NOT NULL) AS segment_count,
        count(DISTINCT month_key) AS month_count,
        min(month_key) AS first_month,
        max(month_key) AS latest_month
      FROM months
    `)

    res.json(buildGeoFeatureCollection(rows, {
      source: 'transport.strava_mobility',
      metadata: summaryRows[0] || {}
    }))
  } catch (err) {
    console.error('[API] /transport/strava-mobility error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/climate/heat-streets', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        ogc_fid,
        feature_id,
        analysis_year,
        analysis_month,
        analysis_mode,
        analysis_window_start,
        analysis_window_end,
        analysis_window_days,
        analysis_window_label,
        analysis_month_label,
        analysis_temporal_scope,
        analysis_unit_type,
        street_name,
        road_segment_length_m,
        road_buffer_m,
        sampled_unit_count,
        thermal_source,
        model_product,
        model_version,
        heat_model_lst_source,
        heat_model_basis,
        fusion_model_type,
        mean_heat_model_lst_c,
        mean_surface_air_delta_c,
        mean_heat_exposure_c,
        mean_urban_heat_score,
        mean_pedestrian_heat_score,
        mean_effective_canopy_pct,
        mean_shade_deficit_score,
        mean_retained_heat_score,
        mean_road_edge_heat_penalty,
        mean_thermal_confidence_score,
        hot_street_score,
        hot_street_class,
        cool_street_score,
        hot_street_score AS temp_percentile,
        mean_heat_model_lst_c AS overall_max_temp,
        mean_heat_model_lst_c AS overall_avg_temp,
        mean_heat_model_lst_c AS surface_temp,
        ST_AsGeoJSON(wkb_geometry)::json AS geometry
      FROM climate.heat_streets
      WHERE wkb_geometry IS NOT NULL
      ORDER BY hot_street_score DESC NULLS LAST, street_name NULLS LAST
    `)

    const [{ rows: summaryRows }] = await Promise.all([
      pool.query(`
        SELECT
          count(*) AS segment_count,
          count(*) FILTER (WHERE hot_street_score >= 80) AS critical_or_hot_count,
          round(avg(mean_heat_model_lst_c)::numeric, 2) AS avg_heat_model_lst_c,
          round(max(mean_heat_model_lst_c)::numeric, 2) AS max_heat_model_lst_c,
          round(avg(hot_street_score)::numeric, 2) AS avg_hot_street_score,
          round(max(hot_street_score)::numeric, 2) AS max_hot_street_score
        FROM climate.heat_streets
        WHERE wkb_geometry IS NOT NULL
      `)
    ])

    res.json(buildGeoFeatureCollection(rows, {
      source: 'climate.heat_streets',
      metadata: summaryRows[0] || {}
    }))
  } catch (err) {
    console.error('[API] /climate/heat-streets error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/climate/heat-zones', async (_req, res) => {
  const schemaName = 'climate'
  const tableName = 'heat_zones'

  try {
    const geometryColumn = await getGeometryColumn(schemaName, tableName)
    if (!geometryColumn) {
      throw new Error('No geometry column found for climate.heat_zones')
    }

    const propertyColumns = await getTableColumns(schemaName, tableName, [geometryColumn])
    const selectedProperties = propertyColumns.length
      ? `${propertyColumns.map(quoteIdentifier).join(',')},`
      : ''
    const orderCandidates = [
      'analysis_year',
      'analysis_month',
      'thermal_percentile',
      'urban_heat_score',
      'feature_id',
      'ogc_fid'
    ].filter((column) => propertyColumns.includes(column))
    const orderClause = orderCandidates.length
      ? `ORDER BY ${orderCandidates.map((column) => `${quoteIdentifier(column)} DESC NULLS LAST`).join(', ')}`
      : ''

    const { rows } = await pool.query(`
      SELECT
        ${selectedProperties}
        ST_AsGeoJSON(${quoteIdentifier(geometryColumn)})::json AS geometry
      FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
      WHERE ${quoteIdentifier(geometryColumn)} IS NOT NULL
      ${orderClause}
    `)

    const numericColumnSummary = propertyColumns
      .filter((column) => [
        'predicted_lst_c_fusion',
        'heat_model_lst_c',
        'urban_heat_score',
        'pedestrian_heat_score',
        'thermal_percentile',
        'cool_island_score',
        'health_score',
        'surface_air_delta_c',
        'mean_lst_c',
        'heat_impact',
        'priority_score',
        'night_heat_retention_c',
        'retained_heat_score',
        'effective_canopy_pct',
        'thermal_confidence_score'
      ].includes(column))
      .map((column) => `round(avg(${quoteIdentifier(column)})::numeric, 2) AS ${quoteIdentifier(`avg_${column}`)}`)

    const summaryRows = numericColumnSummary.length
      ? (await pool.query(`
          SELECT
            count(*) AS zone_count,
            ${numericColumnSummary.join(',')}
          FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
          WHERE ${quoteIdentifier(geometryColumn)} IS NOT NULL
        `)).rows
      : [{ zone_count: rows.length }]

    res.json(buildGeoFeatureCollection(rows, {
      source: 'climate.heat_zones',
      metadata: {
        ...(summaryRows[0] || {}),
        geometryColumn
      }
    }))
  } catch (err) {
    console.error('[API] /climate/heat-zones error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/climate/heat-grid', async (_req, res) => {
  try {
    res.json(await buildClimateTableFeatureCollection('heat_grid'))
  } catch (err) {
    console.error('[API] /climate/heat-grid error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/climate/shade', async (req, res) => {
  try {
    res.json(await buildClimateTableFeatureCollection('shade', {
      hour: typeof req.query.hour === 'string' ? req.query.hour : null,
      month: typeof req.query.month === 'string' ? req.query.month : null
    }))
  } catch (err) {
    console.error('[API] /climate/shade error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/climate/est-wind', async (req, res) => {
  try {
    res.json(await buildClimateTableFeatureCollection('est_wind', {
      direction: typeof req.query.direction === 'string' ? req.query.direction : 'se',
      scenarioSpeedKmh: typeof req.query.speedKmh === 'string' ? req.query.speedKmh : null
    }))
  } catch (err) {
    console.error('[API] /climate/est-wind error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/planning/events', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        event_url,
        source_url,
        event_name,
        venue,
        event_date,
        event_time,
        latitude,
        longitude,
        first_seen_at,
        updated_at
      FROM planning.event_features_geojson
      ORDER BY
        NULLIF(event_date, '') NULLS LAST,
        NULLIF(event_time, '') NULLS LAST,
        event_name NULLS LAST
    `)

    res.json(buildEventsFeatureCollection(rows))
  } catch (err) {
    console.error('[API] /planning/events error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/cadastre/landparcels', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 12000, 20000))
    const { rows } = await pool.query(`
      SELECT
        fid,
        sg26_code,
        sl_land_prcl_key,
        adr_no,
        adr_no_sfx,
        str_name,
        lu_str_name_type,
        ofc_sbrb_name,
        alt_name,
        ward_name,
        prty_nmbr,
        zoning,
        shape__area,
        owner_type,
        gv2025_owner_type,
        is_city_owned,
        gv2025_is_city_owned,
        gv_match_count,
        gv2025_match_count,
        gv_rating_categories,
        gv2025_rating_categories,
        gv_registered_descriptions,
        gv2025_registered_descriptions,
        gv_valuation_types,
        gv2025_valuation_types,
        gv_market_values_numeric,
        gv2025_market_values_numeric,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.00001))::json AS geometry
      FROM cadastre.landparcels_gv
      WHERE geom IS NOT NULL
      ORDER BY
        COALESCE(gv2025_is_city_owned, is_city_owned, false) DESC,
        shape__area DESC NULLS LAST,
        fid
      LIMIT $1
    `, [limit])

    res.json(buildLandParcelFeatureCollection(rows))
  } catch (err) {
    console.error('[API] /cadastre/landparcels error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

async function getSentimentTables() {
  const { rows } = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'sentiment'
      AND table_type = 'BASE TABLE'
      AND table_name ~ '^city_pulse_[0-9]{4}_[0-9]{2}$'
    ORDER BY table_name
  `)
  return rows.map((row) => row.table_name)
}

function getSentimentMonthKey(tableName) {
  const match = String(tableName).match(/city_pulse_(\d{4})_(\d{2})$/)
  return match ? `${match[1]}-${match[2]}` : tableName
}

function buildSentimentUnionSql(tables) {
  return tables.map((tableName) => {
    const monthKey = getSentimentMonthKey(tableName)
    return `
      SELECT
        ${quoteLiteral(monthKey)} AS month_key,
        ${quoteLiteral(tableName)} AS source_table,
        ogc_fid,
        id::text AS comment_id,
        source::text AS source,
        nullif(street_name::text, '') AS street_name,
        nullif(place_name::text, '') AS place_name,
        nullif(text::text, '') AS comment_text,
        stars::double precision AS stars,
        nullif(url::text, '') AS url,
        collected_at::text AS collected_at,
        date::text AS date_text,
        month::text AS month_label,
        week::int AS week,
        day::text AS day_text,
        score::double precision AS score,
        nullif(category::text, '') AS category,
        nullif(topic::text, '') AS topic,
        nullif(engine::text, '') AS engine,
        ST_AsGeoJSON(wkb_geometry)::json AS geometry
      FROM sentiment.${quoteIdentifier(tableName)}
    `
  }).join('\nUNION ALL\n')
}

async function getSentimentUnion({ month = null, sourceMode = 'all' } = {}) {
  const tables = await getSentimentTables()
  if (!tables.length) {
    return {
      tables,
      sql: 'SELECT * FROM (VALUES (NULL)) AS empty_row WHERE false',
      params: [],
      selectedSourceMode: 'all'
    }
  }

  const params = []
  const monthKeys = new Set(tables.map(getSentimentMonthKey))
  const selectedMonth = month && month !== 'all' && monthKeys.has(month) ? month : null
  const selectedSourceMode = ['public', 'retail'].includes(sourceMode) ? sourceMode : 'all'

  const baseSql = buildSentimentUnionSql(tables)
  const filters = []
  if (selectedMonth) {
    params.push(selectedMonth)
    filters.push(`month_key = $${params.length}`)
  }
  const googleMapsReviewFilter = `(
    lower(coalesce(source, '')) LIKE '%google%map%'
    OR lower(coalesce(source, '')) LIKE '%google_map%'
    OR lower(coalesce(source, '')) LIKE '%maps%'
    OR lower(coalesce(source, '')) LIKE '%google review%'
    OR (
      lower(coalesce(source, '')) LIKE '%google%'
      AND stars IS NOT NULL
    )
  )`
  if (selectedSourceMode === 'retail') {
    filters.push(googleMapsReviewFilter)
  } else if (selectedSourceMode === 'public') {
    filters.push(`NOT ${googleMapsReviewFilter}`)
  }

  const filteredSql = filters.length
    ? `SELECT * FROM (${baseSql}) all_sentiment WHERE ${filters.join(' AND ')}`
    : `SELECT * FROM (${baseSql}) all_sentiment`

  return { tables, sql: filteredSql, params, selectedMonth, selectedSourceMode }
}

app.get('/api/sentiment/street-segments', async (req, res) => {
  try {
    const { tables, sql: sentimentSql, params, selectedMonth, selectedSourceMode } = await getSentimentUnion({
      month: typeof req.query.month === 'string' ? req.query.month : null,
      sourceMode: typeof req.query.sourceMode === 'string' ? req.query.sourceMode : 'all'
    })

    const { rows } = await pool.query(`
      WITH sentiment_rows AS (
        ${sentimentSql}
      ),
      global_stats AS (
        SELECT
          coalesce(avg(score), 0)::double precision AS global_avg_sentiment,
          greatest(max(street_counts.comment_count), 1)::double precision AS max_comment_count,
          greatest(max(street_counts.negative_count), 1)::double precision AS max_negative_count,
          greatest(max(street_counts.positive_count), 1)::double precision AS max_positive_count
        FROM (
          SELECT
            ${normaliseStreetSql('street_name')} AS street_key,
            count(*)::int AS comment_count,
            count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
            count(*) FILTER (WHERE score >= 0.25)::int AS positive_count
          FROM sentiment_rows
          WHERE street_name IS NOT NULL
          GROUP BY ${normaliseStreetSql('street_name')}
        ) street_counts
        CROSS JOIN sentiment_rows
      ),
      street_base AS (
        SELECT
          ${normaliseStreetSql('street_name')} AS street_key,
          min(street_name) AS sentiment_street_name,
          count(*)::int AS comment_count,
          count(*) FILTER (WHERE score >= 0.25)::int AS positive_count,
          count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
          round(avg(stars)::numeric, 2)::double precision AS avg_stars,
          jsonb_agg(DISTINCT topic) FILTER (WHERE topic IS NOT NULL) AS topics,
          jsonb_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories
        FROM sentiment_rows
        WHERE street_name IS NOT NULL
        GROUP BY ${normaliseStreetSql('street_name')}
      ),
      street_scored AS (
        SELECT
          sb.*,
          round((sqrt(sb.comment_count::double precision) / (sqrt(sb.comment_count::double precision) + sqrt(20.0)))::numeric, 4)::double precision AS confidence_weight,
          round((sb.negative_count::double precision / nullif(sb.comment_count, 0))::numeric, 4)::double precision AS negative_share,
          round((sb.positive_count::double precision / nullif(sb.comment_count, 0))::numeric, 4)::double precision AS positive_share,
          round((ln(sb.negative_count + 1) / nullif(ln(gs.max_negative_count + 1), 0))::numeric, 4)::double precision AS negative_burden,
          round((ln(sb.positive_count + 1) / nullif(ln(gs.max_positive_count + 1), 0))::numeric, 4)::double precision AS positive_burden,
          round(least(1, greatest(-1,
            (((sb.avg_sentiment * sb.comment_count) + (gs.global_avg_sentiment * 20.0)) / nullif(sb.comment_count + 20.0, 0))
            - (0.18 * (ln(sb.negative_count + 1) / nullif(ln(gs.max_negative_count + 1), 0)))
            + (0.08 * (ln(sb.positive_count + 1) / nullif(ln(gs.max_positive_count + 1), 0)))
          ))::numeric, 4)::double precision AS sentiment_index
        FROM street_base sb
        CROSS JOIN global_stats gs
      ),
      street_sentiment AS (
        SELECT
          ss.*,
          round((percent_rank() OVER (ORDER BY ss.sentiment_index) * 100)::numeric, 1)::double precision AS sentiment_percentile,
          (floor((percent_rank() OVER (ORDER BY ss.sentiment_index) * 100) / 10) * 10)::int AS sentiment_decile,
          round(((1 - ((ss.sentiment_index + 1) / 2)) * 60 + coalesce(ss.negative_burden, 0) * 30 + ss.confidence_weight * 10)::numeric, 2)::double precision AS attention_score
        FROM street_scored ss
      )
      SELECT
        r."OBJECTID" AS objectid,
        r."SL_STR_NAME_KEY" AS sl_str_name_key,
        r."STR_NAME" AS street_name,
        r."STR_NAME_MDF" AS street_name_modified,
        r."Shape__Length" AS shape_length,
        s.sentiment_street_name,
        s.comment_count,
        s.positive_count,
        s.negative_count,
        s.avg_sentiment,
        s.sentiment_index,
        s.sentiment_percentile,
        s.sentiment_decile,
        s.confidence_weight,
        s.negative_share,
        s.positive_share,
        s.negative_burden,
        s.positive_burden,
        s.attention_score,
        s.avg_stars,
        s.topics,
        s.categories,
        CASE
          WHEN s.avg_sentiment >= 0.45 THEN 'very_positive'
          WHEN s.avg_sentiment >= 0.15 THEN 'positive'
          WHEN s.avg_sentiment > -0.15 THEN 'mixed'
          WHEN s.avg_sentiment > -0.45 THEN 'negative'
          WHEN s.avg_sentiment IS NULL THEN 'no_data'
          ELSE 'very_negative'
        END AS sentiment_class,
        ST_AsGeoJSON(ST_Transform(r.geom, 4326))::json AS geometry
      FROM transport."Roads_innercity_CCID" r
      LEFT JOIN street_sentiment s
        ON ${normaliseStreetSql('r."STR_NAME"')} = s.street_key
        OR ${normaliseStreetSql('r."STR_NAME_MDF"')} = s.street_key
      WHERE r.geom IS NOT NULL
      ORDER BY s.avg_sentiment DESC NULLS LAST, r."STR_NAME" NULLS LAST
    `, params)

    const summaryRows = await pool.query(`
      WITH sentiment_rows AS (
        ${sentimentSql}
      )
      SELECT
        count(*)::int AS comment_count,
        count(distinct street_name)::int AS street_count,
        round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
        round(avg(stars)::numeric, 2)::double precision AS avg_stars,
        count(*) FILTER (WHERE score >= 0.25)::int AS positive_count,
        count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
        count(*) FILTER (WHERE score > -0.25 AND score < 0.25)::int AS mixed_count
      FROM sentiment_rows
    `, params)

    res.json(buildGeoFeatureCollection(rows, {
      source: 'sentiment.city_pulse_* joined to transport.Roads_innercity_CCID',
      metadata: {
        ...(summaryRows.rows[0] || {}),
        tables,
        selectedMonth: selectedMonth || 'all',
        sourceMode: selectedSourceMode
      }
    }))
  } catch (err) {
    console.error('[API] /sentiment/street-segments error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/sentiment/analytics', async (req, res) => {
  try {
    const { tables, sql: sentimentSql, selectedSourceMode } = await getSentimentUnion({
      sourceMode: typeof req.query.sourceMode === 'string' ? req.query.sourceMode : 'all'
    })

    const [
      summaryResult,
      monthlyResult,
      streetResult,
      topicResult,
      categoryResult,
      impactResult,
      wordResult,
      sourceResult,
      engineResult,
      dailyResult,
      distributionResult,
      streetWeekResult,
      anomalyResult,
      extremeResult,
      dropResult,
      streetMonthlyResult,
      streetSourceResult,
      streetThemeResult,
      streetCommentResult
    ] = await Promise.all([
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          count(*)::int AS comment_count,
          count(distinct street_name)::int AS street_count,
          count(distinct topic)::int AS topic_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
          round(avg(stars)::numeric, 2)::double precision AS avg_stars,
          min(month_key) AS first_month,
          max(month_key) AS latest_month
        FROM sentiment_rows
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          month_key,
          count(*)::int AS comment_count,
          count(distinct street_name)::int AS street_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
          count(*) FILTER (WHERE score >= 0.25)::int AS positive_count,
          count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
          count(*) FILTER (WHERE score > -0.25 AND score < 0.25)::int AS mixed_count
        FROM sentiment_rows
        GROUP BY month_key
        ORDER BY month_key
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        global_stats AS (
          SELECT
            coalesce(avg(score), 0)::double precision AS global_avg_sentiment,
            greatest(max(street_counts.negative_count), 1)::double precision AS max_negative_count,
            greatest(max(street_counts.positive_count), 1)::double precision AS max_positive_count
          FROM (
            SELECT
              street_name,
              count(*)::int AS comment_count,
              count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
              count(*) FILTER (WHERE score >= 0.25)::int AS positive_count
            FROM sentiment_rows
            WHERE street_name IS NOT NULL
            GROUP BY street_name
          ) street_counts
          CROSS JOIN sentiment_rows
        ),
        street_base AS (
          SELECT
            street_name,
            count(*)::int AS comment_count,
            round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
            count(*) FILTER (WHERE score >= 0.25)::int AS positive_count,
            count(*) FILTER (WHERE score <= -0.25)::int AS negative_count
          FROM sentiment_rows
          WHERE street_name IS NOT NULL
          GROUP BY street_name
          HAVING count(*) >= 3
        ),
        scored AS (
          SELECT
            sb.*,
            round((sqrt(sb.comment_count::double precision) / (sqrt(sb.comment_count::double precision) + sqrt(20.0)))::numeric, 4)::double precision AS confidence_weight,
            round((sb.negative_count::double precision / nullif(sb.comment_count, 0))::numeric, 4)::double precision AS negative_share,
            round((sb.positive_count::double precision / nullif(sb.comment_count, 0))::numeric, 4)::double precision AS positive_share,
            round((ln(sb.negative_count + 1) / nullif(ln(gs.max_negative_count + 1), 0))::numeric, 4)::double precision AS negative_burden,
            round((ln(sb.positive_count + 1) / nullif(ln(gs.max_positive_count + 1), 0))::numeric, 4)::double precision AS positive_burden,
            round(least(1, greatest(-1,
              (((sb.avg_sentiment * sb.comment_count) + (gs.global_avg_sentiment * 20.0)) / nullif(sb.comment_count + 20.0, 0))
              - (0.18 * (ln(sb.negative_count + 1) / nullif(ln(gs.max_negative_count + 1), 0)))
              + (0.08 * (ln(sb.positive_count + 1) / nullif(ln(gs.max_positive_count + 1), 0)))
            ))::numeric, 4)::double precision AS sentiment_index
          FROM street_base sb
          CROSS JOIN global_stats gs
        )
        SELECT
          *,
          round((percent_rank() OVER (ORDER BY sentiment_index) * 100)::numeric, 1)::double precision AS sentiment_percentile,
          round(((1 - ((sentiment_index + 1) / 2)) * 60 + coalesce(negative_burden, 0) * 30 + confidence_weight * 10)::numeric, 2)::double precision AS attention_score
        FROM scored
        ORDER BY attention_score DESC, negative_count DESC, avg_sentiment ASC
        LIMIT 80
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          topic,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
          count(distinct street_name)::int AS street_count
        FROM sentiment_rows
        WHERE topic IS NOT NULL
        GROUP BY topic
        ORDER BY comment_count DESC
        LIMIT 80
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          coalesce(category, 'Uncategorised') AS category,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        GROUP BY coalesce(category, 'Uncategorised')
        ORDER BY comment_count DESC
        LIMIT 40
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          month_key,
          street_name,
          place_name,
          topic,
          category,
          score,
          stars,
          comment_text,
          url,
          source,
          coalesce(day_text, date_text) AS comment_date
        FROM sentiment_rows
        WHERE comment_text IS NOT NULL AND score IS NOT NULL
        ORDER BY abs(score) DESC, stars DESC NULLS LAST
        LIMIT 120
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        words AS (
          SELECT lower(match[1]) AS word, score
          FROM sentiment_rows,
          regexp_matches(coalesce(comment_text, ''), '([A-Za-z][A-Za-z''-]{3,})', 'g') AS match
        )
        SELECT
          word,
          count(*)::int AS count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM words
        WHERE word NOT IN (
          'this','that','with','from','have','they','there','their','about','would','could','should','your','very',
          'just','were','been','when','what','will','more','some','into','than','then','them','also','really',
          'because','please','thank','thanks','good','great','nice','best','cape','town','street'
        )
        GROUP BY word
        HAVING count(*) >= 5
        ORDER BY count DESC
        LIMIT 80
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          coalesce(source, 'unknown') AS source,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        GROUP BY coalesce(source, 'unknown')
        ORDER BY comment_count DESC
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          coalesce(engine, 'unknown') AS engine,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        GROUP BY coalesce(engine, 'unknown')
        ORDER BY comment_count DESC
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        daily AS (
          SELECT
            coalesce(day_text, date_text) AS day_key,
            count(*)::int AS comment_count,
            count(distinct street_name)::int AS street_count,
            round(avg(score)::numeric, 4)::double precision AS avg_sentiment
          FROM sentiment_rows
          WHERE coalesce(day_text, date_text) IS NOT NULL
          GROUP BY coalesce(day_text, date_text)
        )
        SELECT *
        FROM daily
        ORDER BY day_key
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        labelled AS (
          SELECT
            CASE
              WHEN score > 0.05 THEN 'Positive'
              WHEN score < -0.05 THEN 'Negative'
              ELSE 'Neutral'
            END AS label,
            score
          FROM sentiment_rows
        )
        SELECT
          label,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM labelled
        GROUP BY label
        ORDER BY CASE label WHEN 'Positive' THEN 1 WHEN 'Neutral' THEN 2 ELSE 3 END
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          street_name,
          week,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        WHERE street_name IS NOT NULL AND week IS NOT NULL
        GROUP BY street_name, week
        HAVING count(*) >= 1
        ORDER BY street_name, week
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        daily_streets AS (
          SELECT
            street_name,
            coalesce(day_text, date_text) AS day_key,
            count(*)::int AS post_count,
            avg(score)::double precision AS avg_score
          FROM sentiment_rows
          WHERE street_name IS NOT NULL
            AND coalesce(day_text, date_text) IS NOT NULL
          GROUP BY street_name, coalesce(day_text, date_text)
        ),
        stats AS (
          SELECT avg(avg_score) AS overall_mean, stddev_samp(avg_score) AS overall_std
          FROM daily_streets
        )
        SELECT
          street_name,
          day_key,
          post_count,
          round(avg_score::numeric, 4)::double precision AS avg_score,
          round(((avg_score - overall_mean) / nullif(overall_std, 0))::numeric, 3)::double precision AS z_score,
          CASE WHEN ((avg_score - overall_mean) / nullif(overall_std, 0)) < 0 THEN 'Low' ELSE 'High' END AS direction
        FROM daily_streets, stats
        WHERE overall_std IS NOT NULL
          AND abs((avg_score - overall_mean) / nullif(overall_std, 0)) >= 1.5
        ORDER BY z_score ASC NULLS LAST
        LIMIT 80
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        (
          SELECT
            'positive' AS type,
            month_key,
            street_name,
            place_name,
            topic,
            category,
            score,
            stars,
            comment_text,
            url,
            source,
            coalesce(day_text, date_text) AS comment_date
          FROM sentiment_rows
          WHERE comment_text IS NOT NULL AND score IS NOT NULL
          ORDER BY score DESC, stars DESC NULLS LAST
          LIMIT 12
        )
        UNION ALL
        (
          SELECT
            'negative' AS type,
            month_key,
            street_name,
            place_name,
            topic,
            category,
            score,
            stars,
            comment_text,
            url,
            source,
            coalesce(day_text, date_text) AS comment_date
          FROM sentiment_rows
          WHERE comment_text IS NOT NULL AND score IS NOT NULL
          ORDER BY score ASC, stars ASC NULLS LAST
          LIMIT 12
        )
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        monthly AS (
          SELECT
            street_name,
            month_key,
            count(*)::int AS comment_count,
            count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
            round(avg(score)::numeric, 4)::double precision AS avg_sentiment
          FROM sentiment_rows
          WHERE street_name IS NOT NULL
          GROUP BY street_name, month_key
          HAVING count(*) >= 3
        ),
        movement AS (
          SELECT
            *,
            lag(avg_sentiment) OVER (PARTITION BY street_name ORDER BY month_key) AS previous_sentiment,
            lag(comment_count) OVER (PARTITION BY street_name ORDER BY month_key) AS previous_comment_count
          FROM monthly
        )
        SELECT
          street_name,
          month_key,
          comment_count,
          negative_count,
          avg_sentiment,
          previous_sentiment,
          previous_comment_count,
          round((avg_sentiment - previous_sentiment)::numeric, 4)::double precision AS sentiment_delta
        FROM movement
        WHERE previous_sentiment IS NOT NULL
          AND previous_comment_count >= 3
        ORDER BY sentiment_delta ASC, negative_count DESC, comment_count DESC
        LIMIT 80
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          street_name,
          month_key,
          count(*)::int AS comment_count,
          count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
          count(*) FILTER (WHERE score >= 0.25)::int AS positive_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        WHERE street_name IS NOT NULL
        GROUP BY street_name, month_key
        HAVING count(*) >= 2
        ORDER BY street_name, month_key
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          street_name,
          coalesce(source, 'unknown') AS source,
          count(*)::int AS comment_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment,
          count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
          CASE
            WHEN lower(coalesce(source, '')) LIKE '%google%' THEN 2
            ELSE 1
          END AS source_priority
        FROM sentiment_rows
        WHERE street_name IS NOT NULL
        GROUP BY
          street_name,
          coalesce(source, 'unknown'),
          CASE
            WHEN lower(coalesce(source, '')) LIKE '%google%' THEN 2
            ELSE 1
          END
        HAVING count(*) >= 1
        ORDER BY source_priority, negative_count DESC, comment_count DESC
        LIMIT 500
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql})
        SELECT
          street_name,
          coalesce(category, 'Uncategorised') AS category,
          coalesce(topic, 'General') AS topic,
          count(*)::int AS comment_count,
          count(*) FILTER (WHERE score <= -0.25)::int AS negative_count,
          round(avg(score)::numeric, 4)::double precision AS avg_sentiment
        FROM sentiment_rows
        WHERE street_name IS NOT NULL
        GROUP BY street_name, coalesce(category, 'Uncategorised'), coalesce(topic, 'General')
        HAVING count(*) >= 1
        ORDER BY negative_count DESC, comment_count DESC
        LIMIT 800
      `),
      pool.query(`
        WITH sentiment_rows AS (${sentimentSql}),
        scored_comments AS (
          SELECT
            month_key,
            street_name,
            place_name,
            topic,
            category,
            score,
            stars,
            comment_text,
            url,
            source,
            coalesce(day_text, date_text) AS comment_date,
            CASE
              WHEN lower(coalesce(source, '')) LIKE '%google%' THEN 2
              ELSE 1
            END AS source_priority,
            CASE
              WHEN lower(coalesce(category, '') || ' ' || coalesce(topic, '')) ~ '(clean|waste|litter|crime|safety|security|shoot|theft|robbery|assault)' THEN 0
              ELSE 1
            END AS civic_priority
          FROM sentiment_rows
          WHERE street_name IS NOT NULL
            AND comment_text IS NOT NULL
            AND score IS NOT NULL
        )
        SELECT
          month_key,
          street_name,
          place_name,
          topic,
          category,
          score,
          stars,
          comment_text,
          url,
          source,
          comment_date,
          source_priority,
          civic_priority
        FROM scored_comments
        ORDER BY street_name, civic_priority, source_priority, score ASC, abs(score) DESC
      `)
    ])

    res.json({
      metadata: {
        ...(summaryResult.rows[0] || {}),
        tables,
        sourceMode: selectedSourceMode,
        fetchedAt: new Date().toISOString()
      },
      months: monthlyResult.rows,
      streets: streetResult.rows,
      topics: topicResult.rows,
      categories: categoryResult.rows,
      impactComments: impactResult.rows,
      words: wordResult.rows,
      sources: sourceResult.rows,
      engines: engineResult.rows,
      daily: dailyResult.rows,
      sentimentDistribution: distributionResult.rows,
      streetWeeks: streetWeekResult.rows,
      anomalies: anomalyResult.rows,
      extremeComments: extremeResult.rows,
      streetDrops: dropResult.rows,
      streetMonthly: streetMonthlyResult.rows,
      streetSources: streetSourceResult.rows,
      streetThemes: streetThemeResult.rows,
      streetComments: streetCommentResult.rows
    })
  } catch (err) {
    console.error('[API] /sentiment/analytics error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

const serviceRequestDateSql = (columnName) => `
  CASE
    WHEN ${columnName} ~ '^\\d{2}\\.\\d{2}\\.\\d{4}$' THEN to_date(${columnName}, 'DD.MM.YYYY')
    WHEN ${columnName} ~ '^\\d{4}/\\d{2}/\\d{2}$' THEN to_date(${columnName}, 'YYYY/MM/DD')
    WHEN ${columnName} ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN ${columnName}::date
    ELSE NULL
  END
`

const serviceRequestBaseSql = `
  SELECT
    object_id,
    arcgis_id,
    suburb,
    sub_council,
    ward,
    nullif(complaint_type, '') AS complaint_type,
    nullif(work_center, '') AS work_center,
    notification,
    nullif(notification_type, '') AS notification_type,
    longitude,
    latitude,
    created_on_date,
    changed_on,
    completed_date,
    ${serviceRequestDateSql('created_on_date')} AS created_date,
    ${serviceRequestDateSql('changed_on')} AS changed_date,
    ${serviceRequestDateSql('completed_date')} AS completed_dt,
    notifications_created,
    source_url,
    fetched_at,
    inserted_at,
    updated_at
  FROM planning.cape_town_cbd_service_requests
`

const serviceRequestComplaintGroupSql = (columnName = 'complaint_type') => `
  CASE
    WHEN lower(coalesce(${columnName}, '')) ~ '(sew|sewer|blocked|overflow)' THEN 'Sewage'
    WHEN lower(coalesce(${columnName}, '')) ~ '(water|wat:|leak|meter)' THEN 'Water'
    WHEN lower(coalesce(${columnName}, '')) ~ '(power|electric|prepaid|street.?light|light)' THEN 'Electricity'
    WHEN lower(coalesce(${columnName}, '')) ~ '(road|pothole|stormwater|drain|kerb|pavement|traffic)' THEN 'Roads & Stormwater'
    WHEN lower(coalesce(${columnName}, '')) ~ '(refuse|waste|litter|clean|dump|bin)' THEN 'Waste & Cleansing'
    WHEN lower(coalesce(${columnName}, '')) ~ '(park|tree|grass|open space)' THEN 'Public Realm'
    ELSE 'Other'
  END
`

app.get('/api/service-requests/points', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH requests AS (${serviceRequestBaseSql})
      SELECT
        object_id,
        arcgis_id,
        suburb,
        sub_council,
        ward,
        coalesce(complaint_type, 'Uncategorised') AS complaint_type,
        ${serviceRequestComplaintGroupSql('complaint_type')} AS complaint_group,
        coalesce(work_center, 'Unknown work center') AS work_center,
        notification,
        notification_type,
        created_on_date,
        changed_on,
        completed_date,
        created_date,
        completed_dt AS completed_date_parsed,
        CASE
          WHEN completed_dt IS NULL THEN NULL
          ELSE greatest(0, completed_dt - created_date)
        END AS response_days,
        CASE
          WHEN completed_dt IS NULL OR created_date IS NULL THEN 'Incomplete record'
          WHEN completed_dt - created_date <= 1 THEN 'Same day'
          WHEN completed_dt - created_date <= 3 THEN '1-3 days'
          WHEN completed_dt - created_date <= 7 THEN '4-7 days'
          ELSE '8+ days'
        END AS response_band,
        CASE WHEN completed_dt IS NULL OR created_date IS NULL THEN 'incomplete' ELSE 'complete' END AS record_status,
        notifications_created,
        source_url,
        ST_AsGeoJSON(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))::json AS geometry
      FROM requests
      WHERE longitude IS NOT NULL
        AND latitude IS NOT NULL
        AND created_date IS NOT NULL
      ORDER BY created_date DESC, object_id DESC
      LIMIT 12000
    `)

    res.json(buildGeoFeatureCollection(rows, {
      source: 'planning.cape_town_cbd_service_requests',
      metadata: {
        table: 'planning.cape_town_cbd_service_requests'
      }
    }))
  } catch (err) {
    console.error('[API] /service-requests/points error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/service-requests/street-segments', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH requests AS (${serviceRequestBaseSql}),
      request_points AS (
        SELECT
          *,
          ${serviceRequestComplaintGroupSql('complaint_type')} AS complaint_group,
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS geom
        FROM requests
        WHERE longitude IS NOT NULL
          AND latitude IS NOT NULL
          AND created_date IS NOT NULL
      ),
      snapped AS (
        SELECT
          rp.*,
          nearest."OBJECTID" AS road_objectid,
          nearest."STR_NAME" AS road_name,
          nearest.distance_m
        FROM request_points rp
        JOIN LATERAL (
          SELECT
            r."OBJECTID",
            r."STR_NAME",
            ST_Distance(ST_Transform(r.geom, 4326)::geography, rp.geom::geography) AS distance_m
          FROM transport."Roads_innercity_CCID" r
          WHERE r.geom IS NOT NULL
            AND ST_DWithin(ST_Transform(r.geom, 4326)::geography, rp.geom::geography, 55)
          ORDER BY ST_Transform(r.geom, 4326)::geography <-> rp.geom::geography
          LIMIT 1
        ) nearest ON true
      ),
      segment_counts AS (
        SELECT
          road_objectid,
          complaint_group,
          count(*)::int AS complaint_count
        FROM snapped
        GROUP BY road_objectid, complaint_group
      ),
      dominant AS (
        SELECT DISTINCT ON (road_objectid)
          road_objectid,
          complaint_group AS dominant_complaint_group,
          complaint_count AS dominant_complaint_count
        FROM segment_counts
        ORDER BY road_objectid, complaint_count DESC, complaint_group
      ),
      group_rollup AS (
        SELECT
          road_objectid,
          jsonb_object_agg(complaint_group, complaint_count ORDER BY complaint_group) AS complaint_group_counts
        FROM segment_counts
        GROUP BY road_objectid
      ),
      request_rollup AS (
        SELECT
          road_objectid,
          count(*)::int AS request_count,
          count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
          min(created_date) AS first_created,
          max(created_date) AS latest_created,
          round(avg(CASE WHEN completed_dt IS NOT NULL THEN greatest(0, completed_dt - created_date) END)::numeric, 2)::double precision AS avg_response_days,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY CASE WHEN completed_dt IS NOT NULL THEN greatest(0, completed_dt - created_date) END
          )::double precision AS median_response_days,
          jsonb_agg(
            jsonb_build_object(
              'object_id', object_id,
              'arcgis_id', arcgis_id,
              'complaint_type', coalesce(complaint_type, 'Uncategorised'),
              'complaint_group', complaint_group,
              'work_center', coalesce(work_center, 'Unknown work center'),
              'notification', notification,
              'notification_type', notification_type,
              'created_on_date', created_on_date,
              'changed_on', changed_on,
              'completed_date', completed_date,
              'created_date', created_date,
              'response_days', CASE WHEN completed_dt IS NULL THEN NULL ELSE greatest(0, completed_dt - created_date) END,
              'record_status', CASE WHEN completed_dt IS NULL OR created_date IS NULL THEN 'incomplete' ELSE 'complete' END,
              'distance_m', round(distance_m::numeric, 1)
            )
            ORDER BY created_date DESC, object_id DESC
          ) AS complaints
        FROM snapped
        GROUP BY road_objectid
      )
      SELECT
        r."OBJECTID" AS segment_id,
        r."SL_STR_NAME_KEY" AS street_name_key,
        coalesce(nullif(r."STR_NAME", ''), 'Unnamed street') AS street_name,
        r."STR_NAME_MDF" AS modified_street_name,
        COALESCE(rr.request_count, 0)::int AS request_count,
        COALESCE(rr.incomplete_count, 0)::int AS incomplete_count,
        rr.first_created,
        rr.latest_created,
        rr.avg_response_days,
        rr.median_response_days,
        COALESCE(d.dominant_complaint_group, 'No requests') AS dominant_complaint_group,
        COALESCE(d.dominant_complaint_count, 0)::int AS dominant_complaint_count,
        COALESCE(gr.complaint_group_counts, '{}'::jsonb) AS complaint_group_counts,
        COALESCE(rr.complaints, '[]'::jsonb) AS complaints,
        ST_AsGeoJSON(ST_Transform(r.geom, 4326))::json AS geometry
      FROM transport."Roads_innercity_CCID" r
      LEFT JOIN request_rollup rr ON rr.road_objectid = r."OBJECTID"
      LEFT JOIN dominant d ON d.road_objectid = r."OBJECTID"
      LEFT JOIN group_rollup gr ON gr.road_objectid = r."OBJECTID"
      WHERE r.geom IS NOT NULL
      ORDER BY request_count DESC, street_name
    `)

    const totalRequests = rows.reduce((sum, row) => sum + (Number(row.request_count) || 0), 0)
    const activeSegments = rows.filter((row) => Number(row.request_count) > 0).length

    res.json(buildGeoFeatureCollection(rows, {
      source: 'transport.Roads_innercity_CCID joined to planning.cape_town_cbd_service_requests',
      metadata: {
        table: 'planning.cape_town_cbd_service_requests',
        segment_source: 'transport.Roads_innercity_CCID',
        request_count: totalRequests,
        mapped_count: totalRequests,
        active_segment_count: activeSegments,
        segment_count: rows.length,
        snap_distance_m: 55
      }
    }))
  } catch (err) {
    console.error('[API] /service-requests/street-segments error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/service-requests/analytics', async (_req, res) => {
  try {
    const baseCte = `WITH requests AS (${serviceRequestBaseSql})`
    const [
      summaryResult,
      dailyResult,
      monthlyResult,
      complaintResult,
      workCenterResult,
      responseBandResult,
      weekdayResult,
      slowestResult,
      openResult
    ] = await Promise.all([
      pool.query(`
        ${baseCte},
        clean AS (
          SELECT *, CASE WHEN completed_dt IS NULL THEN NULL ELSE greatest(0, completed_dt - created_date) END AS response_days
          FROM requests
          WHERE created_date IS NOT NULL
        )
        SELECT
          count(*)::int AS request_count,
          count(*) FILTER (WHERE longitude IS NOT NULL AND latitude IS NOT NULL)::int AS mapped_count,
          count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
          count(*) FILTER (WHERE completed_dt IS NOT NULL AND created_date IS NOT NULL)::int AS complete_count,
          count(distinct complaint_type)::int AS complaint_type_count,
          count(distinct work_center)::int AS work_center_count,
          min(created_date) AS first_created,
          max(created_date) AS latest_created,
          round(avg(response_days) FILTER (WHERE response_days IS NOT NULL)::numeric, 2)::double precision AS avg_response_days,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY response_days) FILTER (WHERE response_days IS NOT NULL)::double precision AS median_response_days,
          percentile_cont(0.9) WITHIN GROUP (ORDER BY response_days) FILTER (WHERE response_days IS NOT NULL)::double precision AS p90_response_days,
          round((count(*) FILTER (WHERE completed_dt IS NOT NULL AND created_date IS NOT NULL)::double precision / nullif(count(*), 0) * 100)::numeric, 1)::double precision AS completion_record_rate
        FROM clean
      `),
      pool.query(`
        ${baseCte},
        daily AS (
          SELECT
            created_date AS day_key,
            count(*)::int AS request_count,
            count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
            round(avg(greatest(0, completed_dt - created_date)) FILTER (WHERE completed_dt IS NOT NULL)::numeric, 2)::double precision AS avg_response_days
          FROM requests
          WHERE created_date IS NOT NULL
          GROUP BY created_date
        ),
        stats AS (
          SELECT avg(request_count)::double precision AS mean_count, stddev_samp(request_count)::double precision AS std_count
          FROM daily
        )
        SELECT
          daily.*,
          round(avg(request_count) OVER (ORDER BY day_key ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)::numeric, 2)::double precision AS rolling_7d_count,
          CASE
            WHEN request_count >= coalesce(mean_count, 0) + 2 * coalesce(std_count, 0) THEN true
            ELSE false
          END AS is_surge
        FROM daily CROSS JOIN stats
        ORDER BY day_key
      `),
      pool.query(`
        ${baseCte}
        SELECT
          to_char(date_trunc('month', created_date), 'YYYY-MM') AS month_key,
          count(*)::int AS request_count,
          count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
          round(avg(greatest(0, completed_dt - created_date)) FILTER (WHERE completed_dt IS NOT NULL)::numeric, 2)::double precision AS avg_response_days
        FROM requests
        WHERE created_date IS NOT NULL
        GROUP BY date_trunc('month', created_date)
        ORDER BY month_key
      `),
      pool.query(`
        ${baseCte}
        SELECT
          coalesce(complaint_type, 'Uncategorised') AS complaint_type,
          ${serviceRequestComplaintGroupSql('complaint_type')} AS complaint_group,
          count(*)::int AS request_count,
          count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
          round(avg(greatest(0, completed_dt - created_date)) FILTER (WHERE completed_dt IS NOT NULL)::numeric, 2)::double precision AS avg_response_days
        FROM requests
        WHERE created_date IS NOT NULL
        GROUP BY coalesce(complaint_type, 'Uncategorised'), ${serviceRequestComplaintGroupSql('complaint_type')}
        ORDER BY request_count DESC
        LIMIT 30
      `),
      pool.query(`
        ${baseCte}
        SELECT
          coalesce(work_center, 'Unknown work center') AS work_center,
          count(*)::int AS request_count,
          count(*) FILTER (WHERE completed_dt IS NULL OR created_date IS NULL)::int AS incomplete_count,
          round(avg(greatest(0, completed_dt - created_date)) FILTER (WHERE completed_dt IS NOT NULL)::numeric, 2)::double precision AS avg_response_days
        FROM requests
        WHERE created_date IS NOT NULL
        GROUP BY coalesce(work_center, 'Unknown work center')
        ORDER BY request_count DESC
        LIMIT 24
      `),
      pool.query(`
        ${baseCte},
        labelled AS (
          SELECT
            CASE
              WHEN completed_dt IS NULL OR created_date IS NULL THEN 'Incomplete'
              WHEN completed_dt - created_date <= 1 THEN 'Same day'
              WHEN completed_dt - created_date <= 3 THEN '1-3 days'
              WHEN completed_dt - created_date <= 7 THEN '4-7 days'
              ELSE '8+ days'
            END AS response_band
          FROM requests
          WHERE created_date IS NOT NULL
        )
        SELECT response_band, count(*)::int AS request_count
        FROM labelled
        GROUP BY response_band
        ORDER BY CASE response_band WHEN 'Same day' THEN 1 WHEN '1-3 days' THEN 2 WHEN '4-7 days' THEN 3 WHEN '8+ days' THEN 4 ELSE 5 END
      `),
      pool.query(`
        ${baseCte}
        SELECT
          extract(isodow from created_date)::int AS weekday,
          to_char(created_date, 'Dy') AS weekday_label,
          count(*)::int AS request_count,
          round(avg(greatest(0, completed_dt - created_date)) FILTER (WHERE completed_dt IS NOT NULL)::numeric, 2)::double precision AS avg_response_days
        FROM requests
        WHERE created_date IS NOT NULL
        GROUP BY extract(isodow from created_date), to_char(created_date, 'Dy')
        ORDER BY weekday
      `),
      pool.query(`
        ${baseCte}
        SELECT
          object_id,
          notification,
          coalesce(complaint_type, 'Uncategorised') AS complaint_type,
          coalesce(work_center, 'Unknown work center') AS work_center,
          created_date,
          completed_dt AS completed_date,
          greatest(0, completed_dt - created_date)::int AS response_days,
          longitude,
          latitude
        FROM requests
        WHERE created_date IS NOT NULL
          AND completed_dt IS NOT NULL
        ORDER BY response_days DESC, created_date DESC
        LIMIT 40
      `),
      pool.query(`
        ${baseCte}
        SELECT
          object_id,
          notification,
          coalesce(complaint_type, 'Uncategorised') AS complaint_type,
          coalesce(work_center, 'Unknown work center') AS work_center,
          created_date,
          (current_date - created_date)::int AS age_days,
          longitude,
          latitude
        FROM requests
        WHERE created_date IS NOT NULL
          AND completed_dt IS NULL
        ORDER BY age_days DESC, created_date ASC
        LIMIT 40
      `)
    ])

    const dailyRows = dailyResult.rows
    const surgeDays = dailyRows
      .filter((row) => row.is_surge)
      .sort((a, b) => b.request_count - a.request_count)
      .slice(0, 20)

    res.json({
      metadata: {
        ...(summaryResult.rows[0] || {}),
        source: 'planning.cape_town_cbd_service_requests',
        fetchedAt: new Date().toISOString()
      },
      daily: dailyRows,
      surgeDays,
      monthly: monthlyResult.rows,
      complaintTypes: complaintResult.rows,
      workCenters: workCenterResult.rows,
      responseBands: responseBandResult.rows,
      weekdays: weekdayResult.rows,
      slowestCompleted: slowestResult.rows,
      incompleteRecords: openResult.rows
    })
  } catch (err) {
    console.error('[API] /service-requests/analytics error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

const PORT = process.env.API_PORT || 3001
const server = app.listen(PORT, () => console.log(`[environment-api] listening on http://localhost:${PORT}`))
server.ref?.()
const keepAliveInterval = setInterval(() => {}, 60 * 60 * 1000)

function shutdown() {
  clearInterval(keepAliveInterval)
  server.close(() => {
    pool.end().finally(() => process.exit(0))
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
