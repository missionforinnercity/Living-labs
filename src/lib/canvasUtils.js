/**
 * Canvas rendering utilities — color math, easing, gradient interpolation.
 * Ported from CityPulse Spain UI.
 */

import { THEME_GRADIENTS, DEFAULT_GRADIENT } from './themeGradients';

export function hexToRgb(hex) {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean;
  const num = Number.parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

export function rgbToHex(r, g, b) {
  return `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;
}

export function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerpColor(a, b, t) {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

export function lerpGradient(from, to, t) {
  const maxOrbs = Math.max(from.orbs.length, to.orbs.length);
  const orbs = [];

  for (let i = 0; i < maxOrbs; i++) {
    const a = from.orbs[i] ?? { color: '#000000', x: 0, y: 0, radius: 0.5, alpha: 0 };
    const b = to.orbs[i] ?? { color: '#000000', x: 0, y: 0, radius: 0.5, alpha: 0 };
    const ac = hexToRgb(a.color);
    const bc = hexToRgb(b.color);
    const mc = lerpColor(ac, bc, t);
    orbs.push({
      color: rgbToHex(mc.r, mc.g, mc.b),
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      radius: lerp(a.radius, b.radius, t),
      alpha: lerp(a.alpha, b.alpha, t),
    });
  }

  return { orbs };
}

export function resolveGradient(key) {
  return (key && THEME_GRADIENTS[key]) || DEFAULT_GRADIENT;
}

export function shiftColor(hex, shift) {
  const c = hexToRgb(hex);
  const r = Math.min(255, Math.max(0, c.r + shift * 120));
  const g = Math.min(255, Math.max(0, c.g - Math.abs(shift) * 20));
  const b = Math.min(255, Math.max(0, c.b - shift * 120));
  return rgbToHex(r, g, b);
}
