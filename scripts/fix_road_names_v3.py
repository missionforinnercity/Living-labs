#!/usr/bin/env python3
"""
Road name correction v3 — Majority-vote closest-segment matching.

For each target segment:
  1. Densely sample N points along it.
  2. For EACH sample point, find the absolute closest reference line-segment
     across ALL reference features (using a fine-grained spatial index).
  3. Vote for that reference feature's street name.
  4. The name with the most votes wins.

This handles junctions correctly: even if one endpoint of a target segment
is near a BREE junction, the rest of the segment's points will be closest
to SHORTMARKET → SHORTMARKET wins the vote.

Also applies to key-matched files (lighting KPIs), since the original
keys are wrong for some junction-straddling segments.
"""

import json, math, os
from collections import defaultdict, Counter

# -----------------------------------------------------------------------
# Geometry helpers
# -----------------------------------------------------------------------

def get_line_coords(feat):
    """Return flat list of (lon, lat) from Line/MultiLine geometry."""
    g = feat['geometry']
    if g['type'] == 'MultiLineString':
        pts = []
        for part in g['coordinates']:
            pts.extend([(c[0], c[1]) for c in part])
        return pts
    elif g['type'] == 'LineString':
        return [(c[0], c[1]) for c in g['coordinates']]
    return []

def point_to_segment_dist_sq(px, py, ax, ay, bx, by):
    """Squared distance from point to line segment (coord units)."""
    dx, dy = bx - ax, by - ay
    len_sq = dx*dx + dy*dy
    if len_sq < 1e-30:
        return (px - ax)**2 + (py - ay)**2
    t = max(0.0, min(1.0, ((px - ax)*dx + (py - ay)*dy) / len_sq))
    nx = ax + t * dx
    ny = ay + t * dy
    return (px - nx)**2 + (py - ny)**2

def sample_points_along(coords, n=30):
    """Sample n evenly-spaced points along a polyline."""
    if len(coords) < 2:
        return list(coords)
    # cumulative arc length
    cum = [0.0]
    for i in range(1, len(coords)):
        d = math.hypot(coords[i][0] - coords[i-1][0], coords[i][1] - coords[i-1][1])
        cum.append(cum[-1] + d)
    total = cum[-1]
    if total < 1e-15:
        return [coords[0]]
    pts = []
    for k in range(n):
        target = total * k / (n - 1) if n > 1 else 0
        for i in range(len(cum) - 1):
            if cum[i+1] >= target - 1e-15:
                seg_len = cum[i+1] - cum[i]
                if seg_len < 1e-15:
                    pts.append(coords[i])
                else:
                    frac = (target - cum[i]) / seg_len
                    x = coords[i][0] + frac * (coords[i+1][0] - coords[i][0])
                    y = coords[i][1] + frac * (coords[i+1][1] - coords[i][1])
                    pts.append((x, y))
                break
    return pts

# -----------------------------------------------------------------------
# Spatial index — maps grid cells to (ref_feature_index, seg_ax, seg_ay,
#                                      seg_bx, seg_by)
# -----------------------------------------------------------------------

class SegmentGrid:
    """Fine-grained grid that stores every individual reference line-segment."""

    def __init__(self, cell_size=0.0005):
        # ~55 m cells
        self.cs = cell_size
        self.grid = defaultdict(list)
        self.names = []  # ref_idx -> street name

    def _cell(self, lon, lat):
        return (int(math.floor(lon / self.cs)), int(math.floor(lat / self.cs)))

    def add_feature(self, ref_idx, name, coords):
        self.names.append(name)
        for i in range(len(coords) - 1):
            ax, ay = coords[i]
            bx, by = coords[i+1]
            # Register segment in cells covering both endpoints + midpoint
            for px, py in [(ax, ay), (bx, by),
                           ((ax+bx)/2, (ay+by)/2)]:
                cell = self._cell(px, py)
                self.grid[cell].append((ref_idx, ax, ay, bx, by))

    def find_closest_name(self, px, py, search_radius=2):
        """Find the street name of the reference segment closest to (px,py).
        
        search_radius: number of cells to search around the point.
        Returns (name, dist_sq) or (None, inf).
        """
        cx, cy = self._cell(px, py)
        best_dist_sq = float('inf')
        best_ref = None

        for dx in range(-search_radius, search_radius + 1):
            for dy in range(-search_radius, search_radius + 1):
                cell = (cx + dx, cy + dy)
                for ref_idx, ax, ay, bx, by in self.grid.get(cell, []):
                    d_sq = point_to_segment_dist_sq(px, py, ax, ay, bx, by)
                    if d_sq < best_dist_sq:
                        best_dist_sq = d_sq
                        best_ref = ref_idx

        if best_ref is not None:
            return self.names[best_ref], best_dist_sq
        return None, float('inf')

# -----------------------------------------------------------------------
# Matching
# -----------------------------------------------------------------------

def match_features(target_data, grid, needs_reproject=False, n_samples=30):
    """Assign street_name to each feature via majority-vote matching."""
    updated = 0
    matched = 0
    unmatched = 0

    for feat in target_data['features']:
        coords = get_line_coords(feat)
        if len(coords) < 2:
            feat['properties'].setdefault('street_name', '')
            unmatched += 1
            continue

        # Reproject 3857 → 4326 for matching
        if needs_reproject:
            match_coords = []
            for x, y in coords:
                lon = x * 180.0 / 20037508.342789244
                lat = math.degrees(
                    2 * math.atan(math.exp(y * math.pi / 20037508.342789244)) - math.pi / 2
                )
                match_coords.append((lon, lat))
        else:
            match_coords = coords

        samples = sample_points_along(match_coords, n=n_samples)
        votes = Counter()

        for px, py in samples:
            name, _ = grid.find_closest_name(px, py, search_radius=2)
            if name:
                votes[name] += 1

        if votes:
            best_name = votes.most_common(1)[0][0]
            old_name = feat['properties'].get('street_name', '')
            if old_name != best_name:
                updated += 1
            feat['properties']['street_name'] = best_name
            matched += 1
        else:
            feat['properties'].setdefault('street_name', '')
            unmatched += 1

    return matched, updated, unmatched

# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------

def main():
    BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(BASE)

    # Load reference
    ref = json.load(open('data/roads/roads_correct_names.geojson'))
    print(f"Reference: {len(ref['features'])} features")

    # Build spatial index
    print("Building segment grid...")
    grid = SegmentGrid(cell_size=0.0005)  # ~55 m cells
    for i, feat in enumerate(ref['features']):
        name = feat['properties'].get('STR_NAME', '')
        coords = get_line_coords(feat)
        if len(coords) >= 2 and name:
            grid.add_feature(i, name, coords)
    print(f"  {len(grid.names)} reference lines indexed, {sum(len(v) for v in grid.grid.values())} segment entries")

    # All files to process — ALL use spatial matching now
    files = [
        # (label, path, needs_reproject)
        ("Lighting KPIs",        "data/lighting/new_Lights/road_segments_lighting_kpis_all.geojson", False),
        ("Walking times",        "data/walkabilty/roads_with_walking_times.geojson",                  False),
        ("Processed lighting",   "data/processed/lighting/road_segments_lighting_kpis.geojson",       False),
        ("Temperature",          "data/surfaceTemp/annual_surface_temperature_timeseries_20260211_1332.geojson", False),
        ("Pedestrian",           "data/walkabilty/processed/pedestrian_month_all.geojson",            False),
        ("Cycling",              "data/walkabilty/processed/cycling_month_all.geojson",               False),
        ("Network",              "data/walkabilty/processed/network_connectivity.geojson",            True),
        ("Greenery",             "data/greenery/greenryandSkyview.geojson",                           False),
    ]

    for label, path, reproject in files:
        print(f"\n--- {label} ---")
        data = json.load(open(path))
        m, u, un = match_features(data, grid, needs_reproject=reproject, n_samples=30)
        with open(path, 'w') as f:
            json.dump(data, f)
        print(f"  {m} matched, {u} changed, {un} unmatched")

    print("\n✓ All files updated with majority-vote matching.")

if __name__ == '__main__':
    main()
