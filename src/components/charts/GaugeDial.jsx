import React, { useRef, useEffect } from 'react';
import { hexToRgba } from '../../lib/canvasUtils';
import { getThemePrimaryColor } from '../../lib/colorPalette';
import './Charts.css';

export default function GaugeDial({ themeKey = 'walkability', score = 0, delta = null, active = false, color: colorOverride }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    function render() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      if (cw === 0 || ch === 0) return;

      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cw, ch);

      const color = colorOverride || getThemePrimaryColor(themeKey);
      const cx = cw / 2;
      const cy = ch * 0.6;
      const r = Math.min(cw, ch) * 0.38;

      const startAngle = Math.PI;
      const endAngle = 2 * Math.PI;

      // Background arc (dark track)
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.lineWidth = r * 0.25;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.stroke();

      if (delta != null) {
        const deltaClamped = Math.max(-100, Math.min(100, delta));
        const centerAngle = Math.PI * 1.5;
        const deltaAngle = centerAngle + (deltaClamped / 100) * (Math.PI / 2);

        ctx.beginPath();
        if (deltaClamped >= 0) {
          ctx.arc(cx, cy, r, centerAngle, deltaAngle);
        } else {
          ctx.arc(cx, cy, r, deltaAngle, centerAngle);
        }
        ctx.lineWidth = r * 0.25;
        ctx.lineCap = 'round';
        ctx.strokeStyle = active
          ? color
          : deltaClamped >= 0
            ? 'rgba(246, 246, 246, 0.5)'
            : 'rgba(153, 153, 151, 0.3)';
        ctx.stroke();

        const dotX = cx + r * Math.cos(deltaAngle);
        const dotY = cy + r * Math.sin(deltaAngle);
        ctx.beginPath();
        ctx.arc(dotX, dotY, r * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = active ? color : 'rgba(246, 246, 246, 0.6)';
        ctx.fill();
      } else {
        const scoreAngle = startAngle + score * Math.PI;
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, scoreAngle);
        ctx.lineWidth = r * 0.25;
        ctx.lineCap = 'round';
        ctx.strokeStyle = active ? color : hexToRgba(color, 0.4);
        ctx.stroke();
      }

      // Center text
      const label = delta != null
        ? (delta > 0 ? `+${delta}` : delta === 0 ? '0' : `${delta}`)
        : `${(score * 100) | 0}`;

      const fontSize = Math.max(9, r * 0.45);
      ctx.font = `800 ${fontSize}px "Inter", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = active
        ? '#F6F6F6'
        : delta != null && delta < 0
          ? '#999997'
          : '#F6F6F6';
      ctx.globalAlpha = delta != null && !active
        ? 0.3 + Math.min(Math.abs(delta) / 50, 1) * 0.7
        : 1;
      ctx.fillText(label, cx, cy - r * 0.05);
      ctx.globalAlpha = 1;
    }

    render();

    const observer = new ResizeObserver(render);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [themeKey, score, delta, active]);

  return <canvas ref={canvasRef} className="gauge-dial" />;
}
