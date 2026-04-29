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

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

const PORT = process.env.API_PORT || 3001
app.listen(PORT, () => console.log(`[environment-api] listening on http://localhost:${PORT}`))
