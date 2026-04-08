import React, { useRef, useEffect, useCallback } from 'react';
import {
  easeOutQuart,
  hexToRgba,
  lerp,
  lerpGradient,
  resolveGradient,
  shiftColor,
} from '../../lib/canvasUtils';
import { DEFAULT_GRADIENT } from '../../lib/themeGradients';
import './Charts.css';

const CHART_PADDING = { top: 72, right: 8, bottom: 22, left: 32 };

export default function GlowDistributionChart({
  distribution = null,
  themeKey = '',
  title = '',
  quartiles = null,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    currentData: new Array(10).fill(0),
    targetData: new Array(10).fill(0),
    currentGradient: DEFAULT_GRADIENT,
    targetGradient: DEFAULT_GRADIENT,
    currentQ: [0.5, 0.5, 0.5],
    targetQ: [0.5, 0.5, 0.5],
    hasQ: false,
    animProgress: 1,
    animationFrame: 0,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const s = stateRef.current;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    const ease = easeOutQuart(Math.min(s.animProgress, 1));
    const data = s.currentData.map((c, i) => lerp(c, s.targetData[i] ?? c, ease));
    const gradient = lerpGradient(s.currentGradient, s.targetGradient, ease);
    const maxVal = Math.max(...data, 0.01);

    const padLeft = CHART_PADDING.left;
    const padRight = CHART_PADDING.right;
    const padTop = CHART_PADDING.top;
    const padBottom = CHART_PADDING.bottom;
    const plotW = cw - padLeft - padRight;
    const plotH = ch - padTop - padBottom;
    const binCount = data.length;
    const binW = plotW / binCount;

    // Build smooth curve points
    const points = [];
    const firstNorm = data[0] / maxVal;
    points.push({ x: padLeft, y: padTop + plotH * (1 - firstNorm) });
    for (let i = 0; i < binCount; i++) {
      const normVal = data[i] / maxVal;
      const x = padLeft + binW * (i + 0.5);
      const y = padTop + plotH * (1 - normVal);
      points.push({ x, y });
    }
    const lastNorm = data[binCount - 1] / maxVal;
    points.push({ x: padLeft + plotW, y: padTop + plotH * (1 - lastNorm) });

    const baseY = padTop + plotH;

    function tracePath(oc, offX, offY, scale) {
      oc.beginPath();
      oc.moveTo(points[0].x + offX, baseY + offY);
      const firstY = baseY - (baseY - points[0].y) * scale;
      oc.lineTo(points[0].x + offX, firstY + offY);
      for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i];
        const next = points[i + 1];
        const currY = baseY - (baseY - curr.y) * scale;
        const nextY = baseY - (baseY - next.y) * scale;
        const cpx = (curr.x + next.x) / 2 + offX;
        oc.quadraticCurveTo(curr.x + offX, currY + offY, cpx, (currY + nextY) / 2 + offY);
      }
      const last = points[points.length - 1];
      const lastY2 = baseY - (baseY - last.y) * scale;
      oc.lineTo(last.x + offX, lastY2 + offY);
      oc.lineTo(last.x + offX, baseY + offY);
      oc.closePath();
    }

    // Glow rendering
    const plotCx = padLeft + plotW / 2;
    const plotCy = padTop + plotH / 2;
    const orbScale = Math.max(plotW, plotH) * 0.7;

    const blurPasses = [
      { blur: 52, alpha: 0.2, scale: 1.1, tempShift: -0.5 },
      { blur: 60, alpha: 0.3, scale: 1.0, tempShift: -0.55 },
      { blur: 20, alpha: 0.52, scale: 0.9, tempShift: 0.1 },
      { blur: 12, alpha: 0.68, scale: 0.8, tempShift: 0.25 },
    ];

    const pad = 140;

    for (const pass of blurPasses) {
      const offW = cw + pad * 2;
      const offH = ch + pad * 2;
      const off = document.createElement('canvas');
      off.width = offW * dpr;
      off.height = offH * dpr;
      const oc = off.getContext('2d');
      oc.scale(dpr, dpr);

      for (const orb of gradient.orbs) {
        tracePath(oc, pad, pad, pass.scale);
        oc.save();
        oc.clip();
        const orbCx = plotCx + pad + orb.x * orbScale;
        const orbCy = plotCy + pad + orb.y * orbScale;
        const orbR = orb.radius * orbScale * 1.8;
        const shifted = shiftColor(orb.color, pass.tempShift);
        const grad = oc.createRadialGradient(orbCx, orbCy, 0, orbCx, orbCy, orbR);
        grad.addColorStop(0, hexToRgba(shifted, orb.alpha));
        grad.addColorStop(0.15, hexToRgba(shifted, orb.alpha * 0.75));
        grad.addColorStop(0.35, hexToRgba(shifted, orb.alpha * 0.4));
        grad.addColorStop(0.6, hexToRgba(shifted, orb.alpha * 0.1));
        grad.addColorStop(1, hexToRgba(shifted, 0));
        oc.fillStyle = grad;
        oc.fill();
        oc.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = `blur(${pass.blur}px)`;
      ctx.globalAlpha = pass.alpha;
      ctx.drawImage(off, -pad, -pad, offW, offH);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Chart borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, baseY);
    ctx.lineTo(padLeft + plotW, baseY);
    ctx.stroke();

    // Title
    if (title) {
      ctx.save();
      ctx.fillStyle = '#f6f6f6';
      ctx.font = '600 16px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, padLeft, 4);
      ctx.restore();
    }

    // Y-axis ticks
    const yTicks = 4;
    ctx.save();
    ctx.fillStyle = '#999997';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.font = '400 8px "Inter", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= yTicks; i++) {
      const frac = i / yTicks;
      const yPos = baseY - frac * plotH;
      const label = Math.round(frac * maxVal);
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(padLeft, yPos);
        ctx.lineTo(padLeft + plotW, yPos);
        ctx.stroke();
      }
      ctx.fillText(String(label), padLeft - 4, yPos);
    }
    ctx.restore();

    // X-axis threshold line at 50%
    const threshX = padLeft + 0.5 * plotW;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(threshX, padTop);
    ctx.lineTo(threshX, baseY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#999997';
    ctx.font = '400 8px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('threshold', threshX, baseY + 6);
    ctx.restore();

    // IQR quartile lines
    if (s.hasQ) {
      const animQ = [
        lerp(s.currentQ[0], s.targetQ[0], ease),
        lerp(s.currentQ[1], s.targetQ[1], ease),
        lerp(s.currentQ[2], s.targetQ[2], ease),
      ];
      const labelY = 38;
      const barY = 44;
      const lineTop = 48;
      const q1x = padLeft + animQ[0] * plotW;
      const q2x = padLeft + animQ[1] * plotW;
      const q3x = padLeft + animQ[2] * plotW;

      ctx.save();
      for (const qi of [
        { val: animQ[0], alpha: 0.7 },
        { val: animQ[1], alpha: 0.85 },
        { val: animQ[2], alpha: 0.7 },
      ]) {
        const qx = padLeft + qi.val * plotW;
        ctx.strokeStyle = `rgba(255, 255, 255, ${qi.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(qx, lineTop);
        ctx.lineTo(qx, baseY);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(q1x, barY);
      ctx.lineTo(q3x, barY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = '600 7px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText('P25', q1x, labelY);
      ctx.fillText('P50', q2x, labelY);
      ctx.fillText('P75', q3x, labelY);
      ctx.restore();
    }
  }, [title]);

  useEffect(() => {
    const s = stateRef.current;

    if (distribution && distribution.length > 0) {
      if (s.currentData.every(v => v === 0)) {
        s.currentData = new Array(distribution.length).fill(0);
      }
      s.targetData = [...distribution];
    }

    s.targetGradient = resolveGradient(themeKey);

    if (quartiles) {
      if (!s.hasQ) s.currentQ = [0.5, 0.5, 0.5];
      s.targetQ = [...quartiles];
      s.hasQ = true;
    }

    s.animProgress = 0;
    cancelAnimationFrame(s.animationFrame);

    function animate() {
      if (s.animProgress < 1) {
        s.animProgress += 0.012;
        draw();
        s.animationFrame = requestAnimationFrame(animate);
      } else {
        s.currentData = [...s.targetData];
        s.currentGradient = s.targetGradient;
        s.currentQ = [...s.targetQ];
        draw();
      }
    }

    s.animationFrame = requestAnimationFrame(animate);

    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(s.animationFrame);
      window.removeEventListener('resize', handleResize);
    };
  }, [distribution, themeKey, quartiles, draw]);

  return (
    <div className="glow-chart-wrapper">
      <canvas ref={canvasRef} className="glow-chart-canvas" />
    </div>
  );
}
