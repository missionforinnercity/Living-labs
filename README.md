# Urban Experience Dashboard

A dual-mode narrative and data exploration dashboard for urban analytics, combining shade/comfort, lighting, walkability, business, and public art data layers with synchronized temporal controls.

## 🎯 Features

### **Dual UX Modes**
- **📖 Narrative Tours**: Curated experiences like "Perfect Evening Walk", "Outdoor Dining Finder", "Cultural Circuit"
- **🔍 Data Explorer**: Raw data superlatives and rankings (most walked routes, coolest streets, brightest corridors)

### **5 Thematic Narratives**
1. **🌿 Seating & Greening** - Shade coverage, surface temperature, vegetation index, comfort levels
2. **💡 Lighting** - Street light infrastructure, lux measurements, narrative project descriptions
3. **🚶 Walking & Wayfinding** - Network centrality, pedestrian/cycling flows, demographics, trip purposes
4. **🏪 Retail Curation** - Business POI with ratings, outdoor seating, properties, clustering
5. **🎭 Public Art & Events** - Galleries, lighting projects (narrative infrastructure)

### **Interactive Features**
- ⏰ Synchronized temporal controls (season, time-of-day, hour sliders)
- 🗺️ Layer stacking with z-index ordering
- 💬 Rich popups with detailed metrics
- 🎨 Data-driven styling with color gradients
- 📊 Dynamic legends showing active layers
- 🔄 Metric selectors for each theme

## 🚀 Quick Start

1. **Install dependencies:**
```bash
npm install
```

2. **Add your Mapbox token** in `src/components/Map.jsx`:
```javascript
mapboxgl.accessToken = 'YOUR_TOKEN_HERE'
```

3. **Run preprocessing** (already completed):
```bash
npm run preprocess
```

4. **Start development server:**
```bash
npm run dev
```

Visit http://localhost:3000/

## 📊 Data Layers

### Shade & Comfort (16 files)
- **4 seasons** × **4 times/day** = temporal matrix
- Metrics: shade_coverage_pct, surface_temp_celsius, vegetation_index, comfort_level, sky_view_factor
- Transformed to EPSG:3857 Web Mercator

### Lighting (3 sources)
- **4,387 street light fixtures** with wattage, lamp type, ownership
- **1,057 road segments** with lighting KPIs (mean/min/max lux, coverage %)
- **5 narrative projects** with titles, descriptions, images

### Walkability (4 datasets)
- **Network centrality**: Betweenness, density, harmonic closeness, integration
- **1,314 pedestrian segments** with trip counts, demographics, speeds
- **1,580 cycling segments** with e-bike tracking, directional flows
- **Hourly statistics**: Peak at 7 AM with 1.38M trips

### Business (3 sources)
- **4,139 POI** (Google Places enriched) with ratings, hours, amenities
- **62 properties** with transaction data, price/sqm metrics
- **4,505 survey points** with occupancy, trading hours, employee counts

## 🎨 Narrative Tours

### Perfect Evening Walk
Combines: High betweenness streets + good lighting (>100 lux) + active businesses after 18:00 + comfortable temps (<25°C)

### Outdoor Dining Finder
Combines: Outdoor seating POI + high shade coverage (>50%) + comfortable temps + current hour filter

### Cool Summer Route
Combines: Highest shade coverage + lowest surface temps + high vegetation index + high walkability

### Cultural Circuit
Combines: Art galleries + lighting narrative projects + event venues

### Retail Vibrancy Tour
Combines: High-rated businesses + high pedestrian traffic + low vacancy rates

## 🛠️ Tech Stack

- **Frontend**: React 18 + Vite
- **Mapping**: Mapbox GL JS 3.1
- **Spatial**: Turf.js, Proj4 (CRS transformations)
- **Clustering**: Mapbox built-in clustering
- **Data**: 30+ GeoJSON files, all in EPSG:3857

## 📁 Project Structure

```
src/
├── App.jsx                    # Main app with mode toggle
├── components/
│   ├── Map.jsx               # Mapbox map with all layers
│   ├── ModeToggle.jsx        # Narrative ⟷ Explorer switch
│   ├── NarrativeTours.jsx    # Curated tour buttons
│   ├── DataExplorer.jsx      # Metrics & rankings
│   └── TemporalControls.jsx  # Season/time/hour sliders
├── utils/
│   └── dataLoader.js         # Data loading utilities
└── index.css                 # Global styles

data/processed/               # Preprocessed EPSG:3857 data
├── shade/                    # 16 seasonal files
├── lighting/                 # 3 sources
├── walkability/              # 4 datasets
└── business/                 # 3 sources
```

## 🎯 Key Metrics & Superlatives

### Greenery & Comfort
- **Coolest Street**: Lowest surface_temp_celsius (summer 2 PM)
- **Most Shaded Route**: Highest shade_coverage_pct
- **Greenest Corridor**: Highest vegetation_index

### Lighting Infrastructure
- **Brightest Street**: Highest mean_lux (176+ lux observed)
- **Darkest Gaps**: Lowest min_lux values
- **Most Fixtures**: Highest density per segment

### Walkability
- **Most Connected**: Highest cc_betweenness_400 (>2000)
- **Most Walked**: Highest total_trip_count (425 cycling, 320 pedestrian/month)
- **Fastest Routes**: Cycling speeds up to 9.3 m/s

### Business Vitality
- **Top Rated**: Highest Google rating (5.0 stars)
- **Most Popular**: Highest userRatingCount
- **Outdoor Dining Hub**: Most outdoor seating concentration

## 🔮 Future Enhancements

- [ ] Real-time hour-based business filtering (what's open now)
- [ ] Calculate superlatives/rankings dynamically
- [ ] Add public art installation inventory
- [ ] Events calendar integration
- [ ] User-generated content (photos, ratings)
- [ ] 3D building extrusions for shade visualization
- [ ] Export filtered data (CSV/GeoJSON)
- [ ] Comparison mode (side-by-side seasons/times)

## 📝 Data Sources

- Shade/thermal: Modeled from buildings + DTM + trees + satellite
- Lighting: City infrastructure database + field documentation
- Walkability: December 2025 + cityseer network analysis
- Business: Google Places API + field surveys + property transactions

## 🤝 Contributing

This dashboard demonstrates narrative-driven data visualization for urban planning. The architecture supports adding new themes and data sources.

---

**Built with 💜 for urban experience storytelling**
