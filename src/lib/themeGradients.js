/**
 * Multi-orb gradient definitions for each analytics theme.
 *
 * Each theme has 2-3 coloured "orbs" - radial blobs positioned at offsets
 * from centre. When composited and blurred they create the aurora-like glow
 * seen in charts and UI elements.
 *
 * Ported from CityPulse Spain UI.
 */

import { ACCENT, getThemeGradient } from './colorPalette';

/**
 * Build a 3-orb definition from a gradient ramp's stops.
 * - Orb 0 (inner/warm): the endpoint / identity color
 * - Orb 1 (mid): a secondary stop, or a tinted version of the endpoint
 * - Orb 2 (outer/cool): the accent blue
 */
function orbsFromStops(stops) {
  const endpoint = stops[stops.length - 1];
  const mid = stops.length >= 3 ? stops[Math.floor(stops.length / 2)] : endpoint;
  return [
    { color: endpoint, x: -0.1, y: -0.1, radius: 1.0, alpha: 0.8 },
    { color: mid,      x:  0.3, y:  0.25, radius: 0.7, alpha: 0.5 },
    { color: ACCENT,   x: -0.3, y:  0.3, radius: 0.55, alpha: 0.4 },
  ];
}

const THEME_KEYS = [
  'districts',
  'overview',
  'temperature',
  'greenery',
  'business',
  'environment',
  'ecology',
  'traffic',
  'lighting',
  'walkability',
];

export const THEME_GRADIENTS = Object.fromEntries(
  THEME_KEYS.map((key) => {
    const ramp = getThemeGradient(key);
    return [key, { orbs: orbsFromStops(ramp.stops) }];
  }),
);

/** Fallback: accent blue orb if theme key not found. */
export const DEFAULT_GRADIENT = {
  orbs: [{ color: ACCENT, x: 0.0, y: 0.0, radius: 1.0, alpha: 0.8 }],
};
