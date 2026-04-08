/**
 * Master color palette — neutrals, accent, and 10 linear gradient ramps.
 *
 * Every gradient starts from the shared accent blue (#5076FF) and ramps
 * toward one or more distinctive endpoint colors. Each analytics category
 * is assigned exactly one gradient ramp.
 *
 * Ported from CityPulse Spain UI design system.
 */

// ---------------------------------------------------------------------------
// Neutrals
// ---------------------------------------------------------------------------

export const NEUTRALS = {
  darkest: '#141414',
  dark:    '#1F1F1F',
  grey:    '#484847',
  light:   '#999997',
  white:   '#F6F6F6',
};

// ---------------------------------------------------------------------------
// Accent
// ---------------------------------------------------------------------------

/** Shared starting color for every gradient ramp. */
export const ACCENT = '#5076FF';

// ---------------------------------------------------------------------------
// Gradient ramp definitions
// ---------------------------------------------------------------------------

function buildCss(stops) {
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

export const GRADIENT_RAMPS = [
  {
    id: 1,
    name: 'deep-blue',
    stops: ['#5076FF', '#120DB3'],
    css: buildCss(['#5076FF', '#120DB3']),
    identity: '#120DB3',
  },
  {
    id: 2,
    name: 'aurora',
    stops: ['#5076FF', '#E344A3', '#E2FF93'],
    css: buildCss(['#5076FF', '#E344A3', '#E2FF93']),
    identity: '#E344A3',
  },
  {
    id: 3,
    name: 'earth',
    stops: ['#5076FF', '#86370D'],
    css: buildCss(['#5076FF', '#86370D']),
    identity: '#86370D',
  },
  {
    id: 4,
    name: 'forest',
    stops: ['#5076FF', '#7CC715'],
    css: buildCss(['#5076FF', '#7CC715']),
    identity: '#7CC715',
  },
  {
    id: 5,
    name: 'ember',
    stops: ['#5076FF', '#FF5820'],
    css: buildCss(['#5076FF', '#FF5820']),
    identity: '#FF5820',
  },
  {
    id: 6,
    name: 'emerald',
    stops: ['#5076FF', '#3CB28D'],
    css: buildCss(['#5076FF', '#3CB28D']),
    identity: '#3CB28D',
  },
  {
    id: 7,
    name: 'amethyst',
    stops: ['#5076FF', '#6C52FF', '#E344A3'],
    css: buildCss(['#5076FF', '#6C52FF', '#E344A3']),
    identity: '#E344A3',
  },
  {
    id: 8,
    name: 'sunset',
    stops: ['#5076FF', '#D6DFFF', '#ECE89A', '#ED6353'],
    css: buildCss(['#5076FF', '#D6DFFF', '#ECE89A', '#ED6353']),
    identity: '#ED6353',
  },
  {
    id: 9,
    name: 'solar',
    stops: ['#5076FF', '#FAFF44'],
    css: buildCss(['#5076FF', '#FAFF44']),
    identity: '#FAFF44',
  },
  {
    id: 10,
    name: 'ice',
    stops: ['#5076FF', '#D6DFFF'],
    css: buildCss(['#5076FF', '#D6DFFF']),
    identity: '#D6DFFF',
  },
];

// Fast lookup map
const BY_ID = new Map(GRADIENT_RAMPS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// Analytics category -> gradient ramp mapping (Cape Town domain)
// ---------------------------------------------------------------------------

export const THEME_GRADIENT_MAP = {
  districts:    1,  // deep-blue — analytical, structural
  overview:     2,  // aurora — multi-dimensional
  temperature:  3,  // earth — warmth
  greenery:     4,  // forest — green nature
  business:     5,  // ember — warm energy, commerce
  environment:  6,  // emerald — ecological calm
  ecology:      7,  // amethyst — art, richness
  traffic:      8,  // sunset — urban intensity
  lighting:     9,  // solar — bright signal yellow
  walkability: 10,  // ice — movement, pedestrian
};

const FALLBACK_RAMP = GRADIENT_RAMPS[9]; // ice

/** Get the gradient ramp assigned to a theme key. */
export function getThemeGradient(themeKey) {
  const id = THEME_GRADIENT_MAP[themeKey];
  return (id !== undefined ? BY_ID.get(id) : undefined) ?? FALLBACK_RAMP;
}

/** Get the primary (high-end) colour for a theme. */
export function getThemePrimaryColor(themeKey) {
  return getThemeGradient(themeKey).identity;
}

// ---------------------------------------------------------------------------
// CSS custom-property injection
// ---------------------------------------------------------------------------

export function applyGradientCssVars() {
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;

  style.setProperty('--color-accent', ACCENT);

  for (const ramp of GRADIENT_RAMPS) {
    style.setProperty(`--gradient-${ramp.name}`, ramp.css);
    style.setProperty(`--gradient-${ramp.name}-identity`, ramp.identity);
    ramp.stops.forEach((stop, i) => {
      style.setProperty(`--gradient-${ramp.name}-stop-${i}`, stop);
    });
  }

  for (const [themeKey, gradId] of Object.entries(THEME_GRADIENT_MAP)) {
    const ramp = BY_ID.get(gradId);
    if (ramp) {
      style.setProperty(`--theme-${themeKey}-gradient`, ramp.css);
      style.setProperty(`--theme-${themeKey}-identity`, ramp.identity);
    }
  }
}
