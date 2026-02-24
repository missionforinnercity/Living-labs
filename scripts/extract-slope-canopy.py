#!/usr/bin/env python3
"""
extract-slope-canopy.py
Compute real slope + real tree-canopy shade for each road segment.

Inputs:
  - data/DEM/dtm5m_clipped.tif                                    (EPSG:32734, 5m)
  - data/greenery/tree_canopy.geojson                              (EPSG:3857)
  - data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson (CRS:84 / WGS84)

Outputs:
  - data/processed/walkability/segment_slopes.json    { "idx": slope_penalty_0_1 }
  - data/processed/walkability/segment_canopy.json    { "idx": canopy_fraction_0_1 }

Dependencies: rasterio, numpy, shapely, pyproj  (all pip-installable)
"""

import json, os, math, sys
import numpy as np
import rasterio
from rasterio.transform import rowcol
from shapely.geometry import shape, MultiPolygon, LineString, MultiLineString
from shapely.ops import transform as shapely_transform
from shapely import STRtree
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ═══════════════════════════════════════════════════════════════════════════════
# 1. SLOPE FROM DEM
# ═══════════════════════════════════════════════════════════════════════════════

def compute_slopes(segments):
    """
    For each road segment, sample the DEM at evenly-spaced points along the
    line, compute the average gradient, and apply the Tobler Hiking Function
    to get a normalised slope_penalty (1.0 = flat, lower = steeper).
    """
    dem_path = os.path.join(ROOT, 'data/DEM/dtm5m_clipped.tif')
    ds = rasterio.open(dem_path)
    dem = ds.read(1)
    dem_transform = ds.transform
    dem_crs = ds.crs  # EPSG:32734

    # Transformer: WGS84 → UTM34S
    to_utm = Transformer.from_crs('EPSG:4326', dem_crs, always_xy=True)

    slopes = {}

    for idx, feat in enumerate(segments):
        geom = feat['geometry']
        coords = geom['coordinates']
        if geom['type'] == 'MultiLineString':
            coords = [pt for part in coords for pt in part]

        if len(coords) < 2:
            slopes[idx] = 1.0
            continue

        # Convert to UTM
        utm_coords = [to_utm.transform(c[0], c[1]) for c in coords]

        # Sample DEM at each vertex
        elevations = []
        for ux, uy in utm_coords:
            try:
                row, col = rowcol(dem_transform, ux, uy)
                if 0 <= row < dem.shape[0] and 0 <= col < dem.shape[1]:
                    elev = float(dem[row, col])
                    if elev > -9000:  # valid
                        elevations.append((ux, uy, elev))
            except Exception:
                pass

        if len(elevations) < 2:
            slopes[idx] = 1.0
            continue

        # Also interpolate along long segments — add intermediate sample pts
        # Walk along the line at 5m intervals
        line_utm = LineString([(e[0], e[1]) for e in elevations])
        length = line_utm.length
        if length < 1:
            slopes[idx] = 1.0
            continue

        step = 5.0  # sample every 5m (matches DEM resolution)
        n_samples = max(2, int(length / step))
        sampled_elevs = []
        sampled_dists = []

        for i in range(n_samples + 1):
            frac = i / n_samples
            pt = line_utm.interpolate(frac, normalized=True)
            try:
                row, col = rowcol(dem_transform, pt.x, pt.y)
                if 0 <= row < dem.shape[0] and 0 <= col < dem.shape[1]:
                    elev = float(dem[row, col])
                    if elev > -9000:
                        sampled_elevs.append(elev)
                        sampled_dists.append(frac * length)
            except Exception:
                pass

        if len(sampled_elevs) < 2:
            slopes[idx] = 1.0
            continue

        # Compute segment-average absolute gradient
        total_rise = 0.0
        total_run  = 0.0
        for i in range(1, len(sampled_elevs)):
            dz = abs(sampled_elevs[i] - sampled_elevs[i-1])
            dd = sampled_dists[i] - sampled_dists[i-1]
            if dd > 0:
                total_rise += dz
                total_run  += dd

        avg_slope = total_rise / total_run if total_run > 0 else 0.0

        # Tobler Hiking Function penalty
        # V = 6 * exp(-3.5 * |s + 0.05|)
        # Normalise so flat (s=0) → 1.0
        v = 6.0 * math.exp(-3.5 * abs(avg_slope + 0.05))
        v_flat = 6.0 * math.exp(-3.5 * 0.05)
        penalty = max(0.05, min(1.0, v / v_flat))

        slopes[idx] = round(penalty, 4)

        # Raw elev / slope for debugging
        if idx < 5:
            print(f'  Seg {idx}: elev {sampled_elevs[0]:.1f}→{sampled_elevs[-1]:.1f}m, '
                  f'avg_slope={avg_slope:.4f}, penalty={penalty:.3f}, '
                  f'length={length:.1f}m, samples={len(sampled_elevs)}')

    ds.close()
    return slopes


# ═══════════════════════════════════════════════════════════════════════════════
# 2. TREE CANOPY SHADE
# ═══════════════════════════════════════════════════════════════════════════════

def compute_canopy(segments):
    """
    For each road segment, buffer it by 20m, then compute the fraction of the
    buffer area covered by tree canopy polygons.

    Canopy is in EPSG:3857, segments are WGS84 — we project segments to 3857.
    """
    canopy_path = os.path.join(ROOT, 'data/greenery/tree_canopy.geojson')
    with open(canopy_path) as f:
        canopy_fc = json.load(f)

    print(f'  Loading {len(canopy_fc["features"])} canopy polygons...')

    # Build Shapely geometries for canopy (already in EPSG:3857)
    canopy_geoms = []
    for feat in canopy_fc['features']:
        try:
            g = shape(feat['geometry'])
            if g.is_valid and not g.is_empty:
                canopy_geoms.append(g)
        except Exception:
            pass

    print(f'  Valid canopy polygons: {len(canopy_geoms)}')

    # Build spatial index
    tree = STRtree(canopy_geoms)

    # Transformer: WGS84 → EPSG:3857
    to_merc = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)

    canopy_scores = {}

    for idx, feat in enumerate(segments):
        geom = feat['geometry']
        coords = geom['coordinates']

        if geom['type'] == 'MultiLineString':
            merc_parts = []
            for part in coords:
                merc_pts = [to_merc.transform(c[0], c[1]) for c in part]
                if len(merc_pts) >= 2:
                    merc_parts.append(merc_pts)
            if not merc_parts:
                canopy_scores[idx] = 0.0
                continue
            line = MultiLineString(merc_parts)
        else:
            merc_pts = [to_merc.transform(c[0], c[1]) for c in coords]
            if len(merc_pts) < 2:
                canopy_scores[idx] = 0.0
                continue
            line = LineString(merc_pts)

        # Buffer 20m each side — total 40m corridor (catches far-side sidewalk trees)
        buffer = line.buffer(20.0)
        buffer_area = buffer.area

        if buffer_area < 1:
            canopy_scores[idx] = 0.0
            continue

        # Query spatial index for candidate canopy polygons
        candidates = tree.query(buffer)

        covered_area = 0.0
        for ci in candidates:
            canopy_poly = canopy_geoms[ci]
            try:
                intersection = buffer.intersection(canopy_poly)
                covered_area += intersection.area
            except Exception:
                pass

        frac = min(1.0, covered_area / buffer_area)
        canopy_scores[idx] = round(frac, 4)

        if idx < 5:
            print(f'  Seg {idx}: buffer_area={buffer_area:.1f}m², '
                  f'canopy_area={covered_area:.1f}m², frac={frac:.3f}')

    return canopy_scores


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    seg_path = os.path.join(ROOT, 'data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson')
    with open(seg_path) as f:
        seg_fc = json.load(f)
    segments = seg_fc['features']
    print(f'Road segments: {len(segments)}')

    out_dir = os.path.join(ROOT, 'data/processed/walkability')
    os.makedirs(out_dir, exist_ok=True)

    # ── Slopes ──
    print('\n=== Computing slopes from DEM ===')
    slopes = compute_slopes(segments)
    slope_vals = list(slopes.values())
    print(f'  Done. Range: {min(slope_vals):.3f} – {max(slope_vals):.3f}')
    print(f'  Mean: {sum(slope_vals)/len(slope_vals):.3f}')
    with open(os.path.join(out_dir, 'segment_slopes.json'), 'w') as f:
        json.dump(slopes, f)
    print(f'  Written → segment_slopes.json')

    # ── Canopy ──
    print('\n=== Computing canopy coverage ===')
    canopy = compute_canopy(segments)
    canopy_vals = list(canopy.values())
    non_zero = [v for v in canopy_vals if v > 0]
    print(f'  Done. Non-zero: {len(non_zero)} / {len(canopy_vals)}')
    print(f'  Range: {min(canopy_vals):.3f} – {max(canopy_vals):.3f}')
    print(f'  Mean (overall): {sum(canopy_vals)/len(canopy_vals):.3f}')
    if non_zero:
        print(f'  Mean (shaded): {sum(non_zero)/len(non_zero):.3f}')
    with open(os.path.join(out_dir, 'segment_canopy.json'), 'w') as f:
        json.dump(canopy, f)
    print(f'  Written → segment_canopy.json')

    print('\n✅ All done.')
