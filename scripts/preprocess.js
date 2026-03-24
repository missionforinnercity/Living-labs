#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import proj4 from 'proj4'
import { parse } from 'csv-parse/sync'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.join(__dirname, '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const PROCESSED_DIR = path.join(DATA_DIR, 'processed')

// Define coordinate systems
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs +type=crs')

console.log('🚀 Starting data preprocessing...\n')

// Create processed directory
if (!fs.existsSync(PROCESSED_DIR)) {
  fs.mkdirSync(PROCESSED_DIR, { recursive: true })
}

/**
 * Normalize GeoJSON to RFC 7946 spec (WGS84, no CRS property)
 * Mapbox expects EPSG:4326 (WGS84) and handles projection internally
 */
function transformCoordinates(coords, depth = 0) {
  if (depth === 0) {
    // Round to 6 decimal places (~11cm precision)
    return coords.map(c => parseFloat(c.toFixed(6)))
  }
  return coords.map(c => transformCoordinates(c, depth - 1))
}

function transformGeometry(geometry) {
  if (!geometry) return geometry
  
  const depths = {
    'Point': 0,
    'LineString': 1,
    'Polygon': 2,
    'MultiPoint': 1,
    'MultiLineString': 2,
    'MultiPolygon': 3
  }
  
  const depth = depths[geometry.type]
  if (depth === undefined) return geometry
  
  return {
    ...geometry,
    coordinates: transformCoordinates(geometry.coordinates, depth)
  }
}

function transformGeoJSON(geojson, filename) {
  console.log(`  📍 Normalizing ${filename} to RFC 7946...`)
  
  const transformed = {
    type: geojson.type,
    features: geojson.features.map(feature => ({
      ...feature,
      geometry: transformGeometry(feature.geometry)
    }))
  }
  
  // RFC 7946 GeoJSON: WGS84 assumed, no CRS property
  console.log(`  ✅ Normalized ${transformed.features.length} features`)
  return transformed
}

/**
 * Process shade data
 */
function processShadeData() {
  console.log('\n🌳 Processing shade data...')
  const shadeDir = path.join(DATA_DIR, 'shade')
  const seasons = ['summer', 'autumn', 'winter', 'spring']
  
  const processedFiles = []
  
  seasons.forEach(season => {
    const seasonDir = path.join(shadeDir, season)
    if (!fs.existsSync(seasonDir)) return
    
    const files = fs.readdirSync(seasonDir).filter(f => f.endsWith('.geojson'))
    
    files.forEach(file => {
      const filepath = path.join(seasonDir, file)
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
      const transformed = transformGeoJSON(data, `${season}/${file}`)
      
      // Save to processed directory
      const outputDir = path.join(PROCESSED_DIR, 'shade', season)
      fs.mkdirSync(outputDir, { recursive: true })
      const outputPath = path.join(outputDir, file)
      fs.writeFileSync(outputPath, JSON.stringify(transformed))
      
      processedFiles.push({
        season,
        time: file.replace('.geojson', '').split('_')[1],
        path: `processed/shade/${season}/${file}`,
        features: transformed.features.length
      })
    })
  })
  
  // Update manifest
  const manifest = {
    metadata: {
      description: 'Shade coverage and thermal comfort analysis',
      crs: 'EPSG:3857',
      processed_at: new Date().toISOString()
    },
    files: processedFiles
  }
  
  fs.writeFileSync(
    path.join(PROCESSED_DIR, 'shade_manifest.json'),
    JSON.stringify(manifest, null, 2)
  )
  
  console.log(`✅ Processed ${processedFiles.length} shade files`)
}

/**
 * Process lighting data
 */
function processLightingData() {
  console.log('\n💡 Processing lighting data...')
  const lightingDir = path.join(DATA_DIR, 'lighting')
  
  const files = ['streetLighting.json', 'lighting.geojson', 'road_segments_lighting_kpis.geojson']
  
  files.forEach(file => {
    const filepath = path.join(lightingDir, file)
    if (!fs.existsSync(filepath)) {
      console.log(`  ⚠️  ${file} not found, skipping`)
      return
    }
    
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    const transformed = transformGeoJSON(data, file)
    
    const outputPath = path.join(PROCESSED_DIR, 'lighting', file)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(transformed))
  })
  
  console.log('✅ Processed lighting files')
}

/**
 * Process business data
 */
function processBusinessData() {
  console.log('\n🏪 Processing business data...')
  const businessDir = path.join(DATA_DIR, 'business')
  
  const files = [
    'POI_enriched_20260120_185944.geojson',
    'properties_consolidated.geojson',
    'survey_data.geojson'
  ]
  
  files.forEach(file => {
    const filepath = path.join(businessDir, file)
    if (!fs.existsSync(filepath)) {
      console.log(`  ⚠️  ${file} not found, skipping`)
      return
    }
    
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    const transformed = transformGeoJSON(data, file)
    
    const outputPath = path.join(PROCESSED_DIR, 'business', file)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(transformed))
  })
  
  console.log('✅ Processed business files')
}

/**
 * Process walkability data
 */
function processWalkabilityData() {
  console.log('\n🚶 Processing walkability data...')
  const walkDir = path.join(DATA_DIR, 'walkabilty')
  
  const files = [
    'network_analysis.geojson',
    'network_connectivity.geojson',
    'strava_metro_monthly_aggregated.geojson',
    'roads_with_walking_times.geojson',
    'bus stops.geojson',
    'trainStation.geojson'
  ]
  
  files.forEach(file => {
    const filepath = path.join(walkDir, file)
    if (!fs.existsSync(filepath)) {
      const processedPath = path.join(walkDir, 'processed', file)
      if (fs.existsSync(processedPath)) {
        const data = JSON.parse(fs.readFileSync(processedPath, 'utf8'))
        const transformed = transformGeoJSON(data, file)
        
        const outputPath = path.join(PROCESSED_DIR, 'walkability', file)
        fs.mkdirSync(path.dirname(outputPath), { recursive: true })
        fs.writeFileSync(outputPath, JSON.stringify(transformed))
        return
      }
      console.log(`  ⚠️  ${file} not found, skipping`)
      return
    }
    
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'))
    const transformed = transformGeoJSON(data, file)
    
    const outputPath = path.join(PROCESSED_DIR, 'walkability', file)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(transformed))
  })
  
  console.log('✅ Processed walkability files')
}

/**
 * Aggregate CSV data (placeholder - CSVs are too large to process in Node)
 */
function aggregateCSVData() {
  console.log('\n📊 Aggregating CSV data...')
  console.log('  ℹ️  Legacy CSV aggregation removed')
  console.log('  ℹ️  Active mobility now reads directly from strava_metro_monthly_aggregated.geojson')
}

/**
 * Calculate superlatives for Data Explorer
 */
function calculateSuperlatives() {
  console.log('\n📈 Calculating superlatives...')
  
  const rankings = {
    metadata: {
      generated_at: new Date().toISOString(),
      description: 'Pre-calculated rankings for Data Explorer'
    },
    rankings: {}
  }
  
  // TODO: Calculate actual rankings from processed data
  // For now, create placeholder structure
  
  fs.writeFileSync(
    path.join(PROCESSED_DIR, 'rankings.json'),
    JSON.stringify(rankings, null, 2)
  )
  
  console.log('✅ Generated rankings manifest')
}

/**
 * Main execution
 */
async function main() {
  try {
    processShadeData()
    processLightingData()
    processBusinessData()
    processWalkabilityData()
    aggregateCSVData()
    calculateSuperlatives()
    
    console.log('\n✨ Preprocessing complete!')
    console.log(`📁 Processed files saved to: ${PROCESSED_DIR}`)
  } catch (error) {
    console.error('\n❌ Error during preprocessing:', error)
    process.exit(1)
  }
}

main()
