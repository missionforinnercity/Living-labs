# Mission Urban Lab Dashboard

Interactive urban analytics dashboard for Cape Town. The app combines a neighbourhood atlas landing experience with a dashboard for district narratives, walkability, business activity, lighting, traffic, temperature, greenery, and air-quality analysis.

## What The App Does

- Starts on a neighbourhood atlas covering Cape Town neighbourhoods, planning suburbs, and economic hexagons.
- Opens into a dashboard with two top-level modes:
  - `Narrative Tours`: district-focused storytelling and walkability views.
  - `Data Explorer`: map-first analytics across business, mobility, lighting, temperature, environment, and traffic.
- Mixes static GeoJSON/CSV assets with API-backed environment and events data.

## Current Experience

### Landing atlas

The first screen is the `WardExplorer`, which lets you explore:

- neighbourhood liveability and green-blue access
- planning suburb service access and household indicators
- tax hexagon economic activity and growth

### Dashboard modes

After entering the dashboard, the app exposes:

- `Narrative Tours`
  - `District Explorer`
  - `Walkability`
- `Data Explorer`
  - `Business Analytics`
  - `Active Mobility`
  - `Street Lighting`
  - `Climate`
  - `Environment`
  - `Traffic`

## Dashboard Features

### Neighbourhood atlas

The landing atlas gives a citywide view before entering the main dashboard.

- Switch between neighbourhood, planning suburb, and economic hexagon lenses.
- Search for places and inspect local indicators.
- Compare liveability, service access, green-blue access, lighting intensity, income, employment, and growth patterns.
- Use the landing view as a high-level discovery layer before drilling into the dashboard.

### Narrative mode

Narrative mode is the more guided side of the dashboard.

- `District Explorer` focuses on district-level storytelling and map context.
- `Walkability` focuses on street segments, route quality, and side-by-side comparison.
- The narrative map supports interactive clicks, popups, highlighting, and focused comparisons.
- It is designed for presenting place-based findings, not just raw metrics.

### Data Explorer

Data Explorer is the main analytics workspace. It combines a large interactive map with theme-specific panels and charts.

- Toggle between multiple dashboard themes without leaving the map.
- Turn layers on and off to compare different urban conditions in the same geography.
- Inspect map features directly to open detailed panels, popups, and charts.
- Use time-aware views where available for seasonality, hour-of-day, or dated records.

### Business analytics

- Explore business liveliness and commercial clustering.
- Review business ratings, amenities, and category distributions.
- Inspect property sales and survey-linked business context.
- View city events as a mapped layer with supporting event insights.
- Mix formal business data with street-level and vendor-related information.

### Active mobility

- Visualize walking, running, and cycling activity on mapped corridors.
- Explore mobility anomalies and route popularity.
- Inspect road steepness with uphill direction arrows and a steepest-streets table.
- Review network analysis outputs such as connectivity and centrality.
- Compare routes and inspect route-level analytics in more detail.
- Combine movement data with transport accessibility context.

### Street lighting

- View road-segment lighting KPIs.
- Inspect municipal light infrastructure and intervention layers.
- Compare corridor performance using lux and lighting coverage metrics.
- Understand where lighting conditions support or weaken street experience.

### Climate

Climate is the dashboard home for heat and air-quality analysis.

- Explore mapped street-level or segment-level surface temperature conditions.
- Review annual temperature patterns and extreme heat behaviour.
- Identify hot and cool corridors across the study area.
- Inspect heat-island and cool-island patterns.
- Load air-quality history and current conditions from the API-backed environment service.

### Environment

- View greenery access and park reachability.
- Inspect tree canopy and ecology layers across multiple years.
- Compare environmental comfort and ecological change spatially.

### Traffic

- Review traffic flow layers and related movement patterns.
- Use traffic context alongside walkability, lighting, and business activity to interpret corridor performance.

### Cross-cutting features

- Interactive Mapbox-based mapping across all dashboard areas.
- Layer-driven exploration with a shared spatial context.
- Lazy-loaded dashboards to keep the app modular.
- Static file datasets combined with live API-backed layers.
- URL-driven state in parts of the app so views can be revisited directly.

## Tech Stack

- React 18
- Vite 5
- Mapbox GL JS
- `react-map-gl`
- Turf.js
- Recharts
- Express
- PostgreSQL via `pg`

## Requirements

- Node.js 18+
- npm
- A Mapbox token
- PostgreSQL access for API-backed data such as events and environment layers

## Environment Variables

Create a `.env` file in the project root.

```env
VITE_MAPBOX_TOKEN=your_mapbox_token
DATABASE_URL=postgresql://user:password@host:5432/dbname
API_PORT=3001
```

Notes:

- `VITE_MAPBOX_TOKEN` is used by the frontend map.
- `DATABASE_URL` is required for the Express API.
- `API_PORT` is optional; the default is `3001`.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Add the environment variables shown above.

3. Start the frontend and API together:

```bash
npm run dev:full
```

4. Open `http://localhost:3000`.

If you only want the frontend, you can run:

```bash
npm run dev
```

That works for static assets, but API-backed explorer panels will fail or fall back when the backend is not running.

## Available Scripts

- `npm run dev` starts the Vite frontend on port `3000`
- `npm run api` starts the Express API on port `3001` by default
- `npm run dev:full` runs both frontend and API together
- `npm run build` creates a production build in `dist/`
- `npm run preview` previews the production build
- `npm run preprocess` regenerates derived datasets such as processed shade layers

## Data Overview

### Atlas datasets

- `data/CPT/master_neighbourhoods_enriched.geojson`
- `data/CPT/master_planning_suburbs_enriched.geojson`
- `data/CPT/master_tax_hexagons_enriched.geojson`
- supporting survey CSVs in `data/CPT/`

### Dashboard datasets

- Business:
  - POI, property, survey, and street-stall data in `data/business/` and `data/processed/business/`
- Walkability:
  - network analysis, ranked routes, slopes, canopy, and Strava-derived mobility layers in `data/walkabilty/` and `data/processed/walkability/`
- Lighting:
  - municipal fixtures, interventions, and road-segment KPI layers in `data/lighting/` and `data/processed/lighting/`
- Environment:
  - tree canopy, ecology time series, parks, and air-quality or greenery-access API outputs
- Temperature:
  - annual surface temperature time series in `data/surfaceTemp/`
- Traffic:
  - traffic analysis layers in `data/Traffic/`

### API-backed layers

The Express server exposes:

- `/api/environment/current`
- `/api/environment/history`
- `/api/environment/greenery-access`
- `/api/environment/green-destinations`
- `/api/transport/road-steepness`
- `/api/planning/events`
- `/api/health`

These routes are consumed by the explorer for air quality, greenery access, green destinations, road steepness, and city events.

## Project Structure

```text
api/
  server.js                  Express API for environment and events data

scripts/
  preprocess.js             Preprocesses derived frontend datasets
  compute-walkability.cjs   Walkability scoring pipeline
  extract-slope-canopy.py   Segment slope and canopy extraction

src/
  App.jsx                   App shell, landing flow, dashboard routing
  components/
    Map.jsx                 Narrative/dashboard Mapbox view
    WardExplorer.jsx        Landing atlas experience
    NarrativeDistricts.jsx  District narrative panel
    WalkabilityPanel.jsx    Narrative walkability tools
    explorer/               Unified explorer analytics and map modules
  features/
    business/
    environment/
    lighting/
    traffic/
    walkability/
  utils/
    dataLoader.js
    districtEngine.js
    reportGenerator.js
```

## Architecture Notes

- The frontend reads the Mapbox token from `src/utils/mapboxToken.js` via `import.meta.env.VITE_MAPBOX_TOKEN`.
- Vite proxies `/api` requests to the local Express server during development.
- Some business event views can fall back to static data if the API is unavailable, but the full environment stack expects the backend.
- Processed datasets live under `data/processed/`; some source assets remain in their original folders under `data/`.

## Status

`npm run build` currently succeeds in this repo.

## Contributing

When updating the dashboard:

- keep the README aligned with `src/App.jsx`, `package.json`, and `api/server.js`
- document new env vars and data dependencies when adding API-backed features
- prefer updating preprocessing notes when derived datasets change
