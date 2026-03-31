import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/utils/reportGenerator.js')) return 'report-generator'
          if (id.includes('/src/utils/districtEngine.js')) return 'district-engine'

          if (id.includes('node_modules')) {
            if (id.includes('mapbox-gl') || id.includes('/@mapbox/')) return 'mapbox-core'
            if (id.includes('react-map-gl')) return 'react-map'
            if (id.includes('@turf/turf') || id.includes('/@turf/')) return 'spatial'
            if (id.includes('proj4')) return 'projection'
            if (id.includes('h3-js')) return 'hex'
            if (id.includes('supercluster')) return 'map-clustering'
            if (id.includes('recharts')) return 'charts'
            if (id.includes('jspdf')) return 'pdf'
            if (id.includes('html2canvas')) return 'canvas-capture'
            if (id.includes('react') || id.includes('react-dom')) return 'react-vendor'
          }
        }
      }
    }
  }
})
