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
