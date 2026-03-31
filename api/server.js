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

// Current environment grid data — returns all grid cells
app.get('/api/environment/current', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        grid_id, latitude, longitude,
        fetched_utc, aq_datetime, updated_at,
        uaqi, uaqi_display, uaqi_category, uaqi_dominant,
        poll_co_value, poll_no2_value, poll_o3_value,
        poll_pm10_value, poll_so2_value,
        health_general
      FROM environment.airquality_current
      ORDER BY grid_id
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
