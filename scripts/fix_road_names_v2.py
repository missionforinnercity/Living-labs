#!/usr/bin/env python3
"""
Road name correction v2 — Direction-aware line matching.

Previous approach used point-to-nearest-reference voting, which fails at
intersections and for parallel streets.  This version:

1.  For each target segment, computes its **bearing** (overall direction).
2.  Densely samples points along the target segment.
3.  For each sample point, finds nearby reference segments.
4.  Scores each candidate by  distance × angular_penalty.
5.  Picks the reference whose *average* score across all sample points is best,
    strongly favouring segments with the same bearing (same street).

Also handles:
-  Key-matched files  (Phase 1 — authoritative SL_STR_NAME_KEY matching)
-  Spatially-matched files (Phase 2 — bearing-aware nearest-line matching)
-  EPSG:3857 → 4326 reprojection for network_connectivity.geojson
"""

import json, math, os, sys
from collections import defaultdict

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def load_geojson(path):
    with open(path) as f:
        return json.load(f)

def save_geojson(data, path):
    with open(path, 'w') as f:
        json.dump(data, f)
    print(f"  Saved {path}")

def get_line_coords(feat):
    """Return a flat list of (lon, lat) from any Line/MultiLine geometry."""
    g = feat['geometry']
    if g['type'] == 'MultiLineString':
        pts = []
        for part in g['coordinates']:
            pts.extend([(c[0], c[1]) for c in part])
        return pts
    elif g['type'] == 'LineString':
        return [(c[0], c[1]) for c in g['coordinates']]
    return []

def bearing(lon1, lat1, lon2, lat2):
    """Compass bearing in degrees [0, 360)."""
    dlon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    return math.degrees(math.atan2(x, y)) % 360

def segment_bearing(coords):
    """Overall bearing from first to last point. Returns None if degenerate."""
    if len(coords) < 2:
        return None
    lon1, lat1 = coords[0]
    lon2, lat2 = coords[-1]
    if abs(lon2 - lon1) < 1e-9 and abs(lat2 - lat1) < 1e-9:
        # Try endpoints of longest sub-segment
        max_d = 0
        best = None
        for i in range(len(coords) - 1):
            d = (coords[i+1][0] - coords[i][0])**2 + (coords[i+1][1] - coords[i][1])**2
            if d > max_d:
                max_d = d
                best = (coords[i], coords[i+1])
        if best and max_d > 1e-18:
            return bearing(best[0][0], best[0][1], best[1][0], best[1][1])
        return None
    return bearing(lon1, lat1, lon2, lat2)

def angular_diff(a, b):
    """Minimum angle between two bearings [0, 180]."""
    if a is None or b is None:
        return 90  # neutral penalty when unknown
    d = abs(a - b) % 360
    return min(d, 360 - d)

def haversine_m(lon1, lat1, lon2, lat2):
    """Approximate distance in metres between two WGS84 points."""
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def point_to_segment_dist(px, py, ax, ay, bx, by):
    """Distance from point (px,py) to segment (ax,ay)-(bx,by) in coord units."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax)*dx + (py - ay)*dy) / (dx*dx + dy*dy)))
    nx, ny = ax + t*dx, ay + t*dy
    return math.hypot(px - nx, py - ny)

def min_dist_point_to_line(px, py, line_coords):
    """Minimum distance from point to polyline (in coord units)."""
    best = float('inf')
    for i in range(len(line_coords) - 1):
        d = point_to_segment_dist(px, py, line_coords[i][0], line_coords[i][1],
                                  line_coords[i+1][0], line_coords[i+1][1])
        if d < best:
            best = d
    return best

def sample_points(coords, n=15):
    """Sample n evenly spaced points along a polyline."""
    if len(coords) < 2:
        return list(coords)
    # Compute cumulative distances
    dists = [0.0]
    for i in range(1, len(coords)):
        d = math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
        dists.append(dists[-1] + d)
    total = dists[-1]
    if total < 1e-12:
        return [coords[0]]
    pts = []
    for k in range(n):
        target = total * k / (n - 1) if n > 1 else 0
        # Find segment
        for i in range(len(dists) - 1):
            if dists[i+1] >= target:
                seg_len = dists[i+1] - dists[i]
                if seg_len < 1e-15:
                    pts.append(coords[i])
                else:
                    frac = (target - dists[i]) / seg_len
                    x = coords[i][0] + frac * (coords[i+1][0] - coords[i][0])
                    y = coords[i][1] + frac * (coords[i+1][1] - coords[i][1])
                    pts.append((x, y))
                break
    return pts

# ---------------------------------------------------------------------------
# Spatial index — grid of reference line segments (not points)
# ---------------------------------------------------------------------------

class LineGrid:
    """Grid index storing reference *line segments* (pairs of consecutive
    points) so we can compute true point-to-segment distances."""

    def __init__(self, cell_size=0.002):
        self.cell_size = cell_size
        self.grid = defaultdict(list)  # cell -> [(ref_idx, (ax,ay,bx,by)), ...]

    def _cells(self, lon, lat, radius=0):
        """Grid cells covering a point ± radius."""
        r = int(radius / self.cell_size) + 1
        cx = int(lon / self.cell_size)
        cy = int(lat / self.cell_size)
        for dx in range(-r, r+1):
            for dy in range(-r, r+1):
                yield (cx+dx, cy+dy)

    def add(self, ref_idx, coords):
        """Add all line segments of a reference polyline."""
        seen = set()
        for i in range(len(coords)-1):
            ax, ay = coords[i]
            bx, by = coords[i+1]
            # Add to cells covering both endpoints
            for lon, lat in [(ax, ay), (bx, by)]:
                for cell in self._cells(lon, lat, 0):
                    if (cell, ref_idx) not in seen:
                        seen.add((cell, ref_idx))
                        self.grid[cell].append((ref_idx, (ax, ay, bx, by)))

    def nearby(self, lon, lat, radius_cells=1):
        """Find all (ref_idx, segment) near a point."""
        results = []
        cx = int(lon / self.cell_size)
        cy = int(lat / self.cell_size)
        for dx in range(-radius_cells, radius_cells+1):
            for dy in range(-radius_cells, radius_cells+1):
                cell = (cx+dx, cy+dy)
                if cell in self.grid:
                    results.extend(self.grid[cell])
        return results

# ---------------------------------------------------------------------------
# Phase 1: Key-based matching
# ---------------------------------------------------------------------------

def phase1(ref_by_key, files_with_keys):
    print("\n=== PHASE 1: Key-based matching ===")
    for label, path in files_with_keys:
        data = load_geojson(path)
        updated = 0
        for feat in data['features']:
            key = feat['properties'].get('SL_STR_NAME_KEY')
            if key is not None:
                key_int = int(float(key))
                if key_int in ref_by_key:
                    correct = ref_by_key[key_int]
                    if feat['properties'].get('street_name') != correct:
                        updated += 1
                    feat['properties']['street_name'] = correct
                else:
                    feat['properties'].setdefault('street_name',
                                                    feat['properties'].get('STR_NAME', ''))
            else:
                feat['properties'].setdefault('street_name',
                                                feat['properties'].get('STR_NAME', ''))
        save_geojson(data, path)
        print(f"  {label}: {updated} corrections")

# ---------------------------------------------------------------------------
# Phase 2: Direction-aware spatial matching
# ---------------------------------------------------------------------------

def phase2(ref_features, files_spatial):
    print("\n=== PHASE 2: Direction-aware spatial matching ===")

    # Build reference data
    ref_data = []  # [(coords, bearing, name), ...]
    grid = LineGrid(cell_size=0.002)

    for i, feat in enumerate(ref_features):
        coords = get_line_coords(feat)
        if len(coords) < 2:
            continue
        b = segment_bearing(coords)
        name = feat['properties'].get('STR_NAME', '')
        ref_data.append((coords, b, name))
        grid.add(i, coords)

    print(f"  Built index with {len(ref_data)} reference lines")

    for label, path, needs_reproject in files_spatial:
        data = load_geojson(path)
        updated = 0
        matched = 0
        unmatched = 0

        for feat in data['features']:
            coords = get_line_coords(feat)
            if len(coords) < 2:
                unmatched += 1
                continue

            # Reproject 3857 -> 4326 for matching only
            if needs_reproject:
                match_coords = []
                for x, y in coords:
                    lon = x * 180 / 20037508.342789244
                    lat = math.degrees(2 * math.atan(math.exp(y * math.pi / 20037508.342789244)) - math.pi / 2)
                    match_coords.append((lon, lat))
            else:
                match_coords = coords

            target_bearing = segment_bearing(match_coords)
            samples = sample_points(match_coords, n=20)

            # Score each candidate reference line
            ref_scores = defaultdict(list)  # ref_idx -> [score, ...]
            ref_dists = defaultdict(list)   # ref_idx -> [dist, ...]

            for px, py in samples:
                nearby = grid.nearby(px, py, radius_cells=1)
                # Group by ref_idx, find min segment distance for each ref
                ref_min_dist = {}
                for ref_idx, (ax, ay, bx, by) in nearby:
                    d = point_to_segment_dist(px, py, ax, ay, bx, by)
                    if ref_idx not in ref_min_dist or d < ref_min_dist[ref_idx]:
                        ref_min_dist[ref_idx] = d

                for ref_idx, dist in ref_min_dist.items():
                    ref_dists[ref_idx].append(dist)

            # Now score: average distance + angular penalty
            best_ref = None
            best_score = float('inf')

            for ref_idx, dists in ref_dists.items():
                if len(dists) < len(samples) * 0.3:
                    # Reference line only near < 30% of sample points — skip
                    continue

                avg_dist = sum(dists) / len(dists)
                _, ref_b, _ = ref_data[ref_idx]
                ang_diff = angular_diff(target_bearing, ref_b)

                # Score: distance + penalty for angular mismatch
                # Angular penalty: lines >45° off are heavily penalised
                # cos(ang_diff) = 1 for parallel, 0 for perpendicular
                if ang_diff > 60:
                    ang_factor = 5.0  # heavy penalty for cross streets
                elif ang_diff > 30:
                    ang_factor = 2.0  # moderate penalty
                else:
                    ang_factor = 1.0  # minimal penalty

                score = avg_dist * ang_factor
                if score < best_score:
                    best_score = score
                    best_ref = ref_idx

            if best_ref is not None:
                correct_name = ref_data[best_ref][2]
                old_name = feat['properties'].get('street_name', '')
                if old_name != correct_name:
                    updated += 1
                feat['properties']['street_name'] = correct_name
                matched += 1
            else:
                # Fallback: keep existing or empty
                feat['properties'].setdefault('street_name', '')
                unmatched += 1

        save_geojson(data, path)
        print(f"  {label}: {matched} matched, {updated} changed, {unmatched} unmatched")

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(BASE)

    # Load reference
    ref = load_geojson('data/roads/roads_correct_names.geojson')
    print(f"Reference: {len(ref['features'])} features")

    # Build key->name lookup
    ref_by_key = {}
    for feat in ref['features']:
        key = feat['properties'].get('SL_STR_NAME_KEY')
        name = feat['properties'].get('STR_NAME', '')
        if key is not None and name:
            ref_by_key[int(key)] = name

    print(f"Key lookup: {len(ref_by_key)} entries")

    # Phase 1 — key-based files
    files_with_keys = [
        ("Lighting KPIs", "data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson"),
        ("Walking times", "data/walkabilty/roads_with_walking_times.geojson"),
        ("Processed lighting", "data/processed/lighting/road_segments_lighting_kpis.geojson"),
    ]
    phase1(ref_by_key, files_with_keys)

    # Phase 2 — spatial files
    files_spatial = [
        ("Temperature", "data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson", False),
        ("Pedestrian", "data/walkabilty/processed/pedestrian_month_all.geojson", False),
        ("Cycling", "data/walkabilty/processed/cycling_month_all.geojson", False),
        ("Network", "data/walkabilty/processed/network_connectivity.geojson", True),  # EPSG:3857
        ("Greenery", "data/greenery/greenryandSkyview.geojson", False),
    ]
    phase2(ref['features'], files_spatial)

    print("\n✓ All files updated.")

if __name__ == '__main__':
    main()
