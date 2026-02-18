#!/usr/bin/env python3
"""
Fix road names across all GeoJSON data files using the correct names
from data/roads/roads_correct_names.geojson.

Phase 1: KEY-based matching for files that have SL_STR_NAME_KEY
Phase 2: SPATIAL matching for files without keys (uses Phase 1 output as reference)
"""

import json
import math
import sys
from pathlib import Path

try:
    from pyproj import Transformer
    HAS_PYPROJ = True
except ImportError:
    HAS_PYPROJ = False
    print("WARNING: pyproj not found. EPSG:3857 files will be skipped.")


def get_all_coords(geometry):
    gtype = geometry['type']
    coords = geometry['coordinates']
    if gtype == 'Point':
        return [coords]
    elif gtype == 'LineString':
        return coords
    elif gtype == 'MultiLineString':
        return [c for line in coords for c in line]
    elif gtype == 'MultiPoint':
        return coords
    elif gtype == 'Polygon':
        return [c for ring in coords for c in ring]
    return []


def get_sample_points(geometry, transformer=None, n_samples=7):
    coords = get_all_coords(geometry)
    if not coords:
        return []
    if transformer:
        reprojected = []
        for c in coords:
            try:
                lng, lat = transformer.transform(c[0], c[1])
                reprojected.append([lng, lat])
            except:
                continue
        coords = reprojected
    if not coords:
        return []
    if len(coords) <= n_samples:
        return coords
    step = max(1, (len(coords) - 1) // (n_samples - 1))
    sampled = [coords[i] for i in range(0, len(coords), step)]
    if coords[-1] not in sampled:
        sampled.append(coords[-1])
    return sampled[:n_samples]


def haversine_dist(p1, p2):
    dx = p1[0] - p2[0]
    dy = p1[1] - p2[1]
    return math.sqrt(dx * dx + dy * dy)


class SpatialGrid:
    """Grid-based spatial index using ALL coords from each road segment."""
    
    def __init__(self, cell_size=0.0003):
        self.cell_size = cell_size
        self.grid = {}
    
    def add_road(self, coords, name):
        for c in coords:
            cell = self._cell_key(c)
            if cell not in self.grid:
                self.grid[cell] = []
            self.grid[cell].append((c, name))
    
    def _cell_key(self, point):
        return (int(point[0] / self.cell_size), int(point[1] / self.cell_size))
    
    def find_nearest(self, points, max_dist=0.0005):
        """Find nearest road using voting from multiple query points."""
        votes = {}
        for pt in points:
            cell = self._cell_key(pt)
            best_name = None
            best_dist = float('inf')
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    key = (cell[0] + dx, cell[1] + dy)
                    for (ref_pt, name) in self.grid.get(key, []):
                        d = haversine_dist(pt, ref_pt)
                        if d < best_dist:
                            best_dist = d
                            best_name = name
            if best_name and best_dist <= max_dist:
                votes[best_name] = votes.get(best_name, 0) + 1
        if votes:
            return max(votes.items(), key=lambda x: x[1])[0]
        return None


def build_key_lookup(ref_features):
    lookup = {}
    for feat in ref_features:
        key = feat['properties'].get('SL_STR_NAME_KEY')
        name = feat['properties'].get('STR_NAME')
        if key is not None and name:
            lookup[str(key)] = name
    return lookup


def fix_by_key(filepath, key_lookup):
    print(f"\n[KEY] {filepath}")
    with open(filepath) as f:
        data = json.load(f)
    features = data.get('features', [])
    if not features:
        print("  No features, skipping.")
        return []
    matched = 0
    corrected = 0
    no_key = 0
    for feat in features:
        slk = feat['properties'].get('SL_STR_NAME_KEY')
        if slk is not None:
            slk_str = str(int(float(slk)))
            correct_name = key_lookup.get(slk_str)
            if correct_name:
                old_name = feat['properties'].get('STR_NAME', '')
                feat['properties']['street_name'] = correct_name
                if old_name != correct_name:
                    feat['properties']['STR_NAME'] = correct_name
                    corrected += 1
                    if corrected <= 10:
                        print(f"  Fixed: '{old_name}' -> '{correct_name}' (key={slk_str})")
                matched += 1
            else:
                existing = feat['properties'].get('STR_NAME', '')
                feat['properties']['street_name'] = existing
                no_key += 1
        else:
            existing = feat['properties'].get('STR_NAME', '')
            if existing:
                feat['properties']['street_name'] = existing
            no_key += 1
    print(f"  {matched} matched, {corrected} corrected, {no_key} no key")
    with open(filepath, 'w') as f:
        json.dump(data, f)
    print(f"  Saved ✓")
    return features


def build_spatial_index(corrected_features):
    grid = SpatialGrid(cell_size=0.0003)
    for feat in corrected_features:
        name = feat['properties'].get('street_name') or feat['properties'].get('STR_NAME')
        if not name:
            continue
        coords = get_all_coords(feat['geometry'])
        grid.add_road(coords, name)
    return grid


def fix_by_spatial(filepath, spatial_grid, is_3857=False):
    print(f"\n[SPATIAL] {filepath}")
    with open(filepath) as f:
        data = json.load(f)
    features = data.get('features', [])
    if not features:
        print("  No features, skipping.")
        return
    transformer = None
    if is_3857 and HAS_PYPROJ:
        transformer = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    matched = 0
    corrected = 0
    unmatched = 0
    for i, feat in enumerate(features):
        sample_pts = get_sample_points(feat['geometry'], transformer, n_samples=7)
        if not sample_pts:
            unmatched += 1
            continue
        name = spatial_grid.find_nearest(sample_pts)
        if name:
            old_name = feat['properties'].get('street_name', '')
            feat['properties']['street_name'] = name
            matched += 1
            if old_name and old_name != name:
                corrected += 1
                if corrected <= 10:
                    print(f"  Corrected [{i}]: '{old_name}' -> '{name}'")
        else:
            unmatched += 1
    print(f"  {matched} matched, {corrected} corrected, {unmatched} unmatched")
    with open(filepath, 'w') as f:
        json.dump(data, f)
    print(f"  Saved ✓")


def main():
    base_dir = Path(__file__).parent.parent
    
    # Load reference roads
    ref_path = base_dir / 'data' / 'roads' / 'roads_correct_names.geojson'
    print(f"Loading reference: {ref_path}")
    with open(ref_path) as f:
        ref_data = json.load(f)
    
    key_lookup = build_key_lookup(ref_data['features'])
    print(f"Reference: {len(key_lookup)} key -> name mappings")
    
    # ── PHASE 1: Key-based matching ──
    print(f"\n{'#'*50}")
    print("PHASE 1: Key-based matching")
    print(f"{'#'*50}")
    
    lighting_path = base_dir / 'data' / 'lighting' / 'new_Lights' / 'road_segments_lighting_kpis_all.geojson'
    corrected_lighting = fix_by_key(lighting_path, key_lookup)
    
    walking_path = base_dir / 'data' / 'walkabilty' / 'roads_with_walking_times.geojson'
    fix_by_key(walking_path, key_lookup)
    
    processed_lighting_path = base_dir / 'data' / 'processed' / 'lighting' / 'road_segments_lighting_kpis.geojson'
    if processed_lighting_path.exists():
        fix_by_key(processed_lighting_path, key_lookup)
    
    # ── Build spatial index from corrected data + reference ──
    print(f"\nBuilding spatial index...")
    spatial_grid = build_spatial_index(corrected_lighting)
    for feat in ref_data['features']:
        name = feat['properties'].get('STR_NAME')
        if name:
            coords = get_all_coords(feat['geometry'])
            spatial_grid.add_road(coords, name)
    print(f"  Grid cells: {len(spatial_grid.grid)}")
    
    # ── PHASE 2: Spatial matching ──
    print(f"\n{'#'*50}")
    print("PHASE 2: Spatial matching")
    print(f"{'#'*50}")
    
    fix_by_spatial(
        base_dir / 'data' / 'surfaceTemp' / 'annual_surface_temperature_timeseries_20260211_1332.geojson',
        spatial_grid
    )
    fix_by_spatial(
        base_dir / 'data' / 'walkabilty' / 'processed' / 'pedestrian_month_all.geojson',
        spatial_grid
    )
    fix_by_spatial(
        base_dir / 'data' / 'walkabilty' / 'processed' / 'cycling_month_all.geojson',
        spatial_grid
    )
    fix_by_spatial(
        base_dir / 'data' / 'walkabilty' / 'processed' / 'network_connectivity.geojson',
        spatial_grid,
        is_3857=True
    )
    fix_by_spatial(
        base_dir / 'data' / 'greenery' / 'greenryandSkyview.geojson',
        spatial_grid
    )
    
    print(f"\n{'='*50}")
    print("Done! All road names fixed.")
    print(f"{'='*50}")


if __name__ == '__main__':
    main()
