import React, { useRef, useEffect } from 'react';
import { hexToRgba, shiftColor } from '../../lib/canvasUtils';
import { THEME_GRADIENTS, DEFAULT_GRADIENT } from '../../lib/themeGradients';
import './Charts.css';

const BLUR_PASSES = [
  { blur: 28, alpha: 0.12, scale: 1.15, tempShift: -0.5 },
  { blur: 22, alpha: 0.18, scale: 1.08, tempShift: -0.4 },
  { blur: 14, alpha: 0.25, scale: 1.0,  tempShift: -0.2 },
  { blur: 8,  alpha: 0.35, scale: 0.92, tempShift:  0.1 },
  { blur: 3,  alpha: 0.5,  scale: 0.85, tempShift:  0.25 },
];

export default function GlowCircle({ themeKey = 'walkability', score = 0.5 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);

  useEffect(() => {
    startRef.current = performance.now();

    function render(time) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      if (cw === 0 || ch === 0) { rafRef.current = requestAnimationFrame(render); return; }

      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cw, ch);

      const gradient = THEME_GRADIENTS[themeKey] ?? DEFAULT_GRADIENT;
      const intensity = Math.max(0.15, score);

      const elapsed = (time - startRef.current) / 1000;
      const pulse = Math.sin(elapsed * 1.2) * 0.04 + Math.sin(elapsed * 0.7) * 0.03;
      const wobble = Math.sin(elapsed * 0.9 + 1.5) * 0.02;

      const cx = cw / 2;
      const cy = ch / 2;
      const r = Math.min(cw, ch) / 2;
      const orbScale = r * 0.9;
      const pad = 50;

      for (const pass of BLUR_PASSES) {
        const offW = cw + pad * 2;
        const offH = ch + pad * 2;
        const off = document.createElement('canvas');
        off.width = offW * dpr;
        off.height = offH * dpr;
        const oc = off.getContext('2d');
        oc.scale(dpr, dpr);

        const passScale = pass.scale + pulse;

        for (const orb of gradient.orbs) {
          oc.save();
          oc.beginPath();
          oc.arc(cx + pad, cy + pad, r * passScale, 0, Math.PI * 2);
          oc.clip();

          const orbCx = cx + pad + (orb.x + wobble) * orbScale;
          const orbCy = cy + pad + (orb.y - wobble * 0.7) * orbScale;
          const orbR = orb.radius * orbScale * 2.2;

          const shifted = shiftColor(orb.color, pass.tempShift);
          const a = orb.alpha * intensity;
          const grad = oc.createRadialGradient(orbCx, orbCy, 0, orbCx, orbCy, orbR);
          grad.addColorStop(0, hexToRgba(shifted, a));
          grad.addColorStop(0.1, hexToRgba(shifted, a * 0.85));
          grad.addColorStop(0.25, hexToRgba(shifted, a * 0.55));
          grad.addColorStop(0.45, hexToRgba(shifted, a * 0.25));
          grad.addColorStop(0.7, hexToRgba(shifted, a * 0.08));
          grad.addColorStop(1, hexToRgba(shifted, 0));

          oc.fillStyle = grad;
          oc.fillRect(0, 0, offW, offH);
          oc.restore();
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = `blur(${pass.blur}px)`;
        ctx.globalAlpha = (pass.alpha + pulse * 0.5) * intensity;
        ctx.drawImage(off, -pad, -pad, offW, offH);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [themeKey, score]);

  return <canvas ref={canvasRef} className="glow-circle" />;
}
