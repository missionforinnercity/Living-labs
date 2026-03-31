import proj4 from 'proj4'

proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs')
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs')

export function transformGeoJSON(geojson, sourceCRS, targetCRS) {
  if (!geojson || !geojson.features) return geojson

  const transform = proj4(sourceCRS, targetCRS)

  const transformCoordinates = (coords, depth) => {
    if (depth === 0) return transform.forward(coords)
    return coords.map((coord) => transformCoordinates(coord, depth - 1))
  }

  const features = geojson.features.map((feature) => {
    if (!feature.geometry?.coordinates) return feature

    let depth
    switch (feature.geometry.type) {
      case 'Point':
        depth = 0
        break
      case 'LineString':
      case 'MultiPoint':
        depth = 1
        break
      case 'Polygon':
      case 'MultiLineString':
        depth = 2
        break
      case 'MultiPolygon':
        depth = 3
        break
      default:
        return feature
    }

    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: transformCoordinates(feature.geometry.coordinates, depth)
      }
    }
  })

  return {
    ...geojson,
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
    },
    features
  }
}
