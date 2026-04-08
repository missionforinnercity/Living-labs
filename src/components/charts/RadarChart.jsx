import React, { useRef, useEffect, useCallback } from 'react';
import {
  easeOutQuart,
  easeInOutCubic,
  hexToRgb,
  hexToRgba,
  lerp,
  lerpColor,
  lerpGradient,
  resolveGradient,
  rgbToHex,
  shiftColor,
} from '../../lib/canvasUtils';
import { DEFAULT_GRADIENT } from '../../lib/themeGradients';
import './Charts.css';

export default function RadarChart({
  scores = [],
  labels = [],
  compareScores,
  comparing = false,
  primaryColor = '#5076FF',
  selectedIndex = -1,
  themeKey = '',
  onSelect,
}) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    currentScores: [],
    targetScores: [],
    currentCompareScores: [],
    targetCompareScores: [],
    currentGradient: DEFAULT_GRADIENT,
    targetGradient: DEFAULT_GRADIENT,
    currentBadgeColor: { r: 80, g: 118, b: 255 },
    targetBadgeColor: { r: 80, g: 118, b: 255 },
    currentSelectedIndex: -1,
    targetSelectedIndex: -1,
    currentRotation: 0,
    targetRotation: 0,
    animProgress: 1,
    animationFrame: 0,
    badgePositions: [],
    badgeHitRadius: 11,
  });

  const rotationForIndex = useCallback((idx, count) => {
    if (idx < 0 || count <= 0) return 0;
    return -(2 * Math.PI * idx) / count;
  }, []);

  const shortestArc = useCallback((from, to) => {
    const TAU = 2 * Math.PI;
    let delta = ((to - from) % TAU + TAU + Math.PI) % TAU - Math.PI;
    return from + delta;
  }, []);

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

    const cx = cw / 2;
    const cy = ch / 2;
    const badgeRadius = 11;
    const radius = Math.min(cw, ch) / 2 - badgeRadius - 1;
    const n = labels.length || 10;

    const ease = easeOutQuart(Math.min(s.animProgress, 1));
    const displayScores = s.currentScores.map((c, i) => lerp(c, s.targetScores[i] ?? c, ease));
    const displayGradient = lerpGradient(s.currentGradient, s.targetGradient, ease);
    const displayBadge = lerpColor(s.currentBadgeColor, s.targetBadgeColor, ease);
    const badgeHex = rgbToHex(displayBadge.r, displayBadge.g, displayBadge.b);

    ctx.clearRect(0, 0, cw, ch);

    const rotationEase = easeInOutCubic(Math.min(s.animProgress, 1));
    const displayRotation = lerp(s.currentRotation, s.targetRotation, rotationEase);
    const angleOffset = -Math.PI / 2 + displayRotation;

    // Spokes
    ctx.strokeStyle = hexToRgba('#f6f6f6', 0.25);
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const angle = angleOffset + (2 * Math.PI * i) / n;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }

    // Circular border
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba('#f6f6f6', 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Scale labels
    const scaleSteps = [25, 50, 75];
    ctx.save();
    ctx.fillStyle = '#999997';
    ctx.font = '400 8px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const topAngle = -Math.PI / 2;
    for (const step of scaleSteps) {
      const r2 = (step / 100) * radius;
      const sx = cx + Math.cos(topAngle) * r2;
      const sy = cy + Math.sin(topAngle) * r2;
      ctx.fillText(`${step}%`, sx + 4, sy);
    }
    ctx.restore();

    // Data glow
    function drawDataGlow(scores2, gradient) {
      if (scores2.length < n) return;
      const points = [];
      for (let i = 0; i < n; i++) {
        const angle = angleOffset + (2 * Math.PI * i) / n;
        const val = Math.max(0, Math.min(1, scores2[i] / 100));
        const r2 = val * radius;
        points.push({ x: cx + Math.cos(angle) * r2, y: cy + Math.sin(angle) * r2, r: r2 });
      }

      let maxR = 0;
      for (const p of points) { if (p.r > maxR) maxR = p.r; }
      if (maxR < 1) maxR = radius * 0.5;

      const pad = 140;
      function tracePoly(oc, scale) {
        oc.beginPath();
        for (let i = 0; i < points.length; i++) {
          const px = cx + (points[i].x - cx) * scale + pad;
          const py = cy + (points[i].y - cy) * scale + pad;
          if (i === 0) oc.moveTo(px, py); else oc.lineTo(px, py);
        }
        oc.closePath();
      }

      const ocx = cx + pad;
      const ocy = cy + pad;
      const blurPasses = [
        { blur: 52, alpha: 0.18, scale: 1.3, tempShift: -0.5 },
        { blur: 34, alpha: 0.28, scale: 1.15, tempShift: -0.3 },
        { blur: 20, alpha: 0.48, scale: 1.05, tempShift: 0.1 },
        { blur: 12, alpha: 0.62, scale: 0.95, tempShift: 0.25 },
      ];

      for (const pass of blurPasses) {
        const offW = cw + pad * 2;
        const offH = ch + pad * 2;
        const off = document.createElement('canvas');
        off.width = offW * dpr;
        off.height = offH * dpr;
        const oc = off.getContext('2d');
        oc.scale(dpr, dpr);

        for (const orb of gradient.orbs) {
          tracePoly(oc, pass.scale);
          oc.save();
          oc.clip();
          const orbCx = ocx + orb.x * maxR;
          const orbCy = ocy + orb.y * maxR;
          const orbR = orb.radius * maxR * 1.6;
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
    }

    const displayCompareScores = s.currentCompareScores.map((c, i) => lerp(c, s.targetCompareScores[i] ?? c, ease));
    const hasCompare = comparing && s.targetCompareScores.length >= n;

    if (!hasCompare) {
      drawDataGlow(displayScores, displayGradient);
    }

    // Badges
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    s.badgePositions = [];
    s.badgeHitRadius = badgeRadius;

    const fromIdx = s.currentSelectedIndex;
    const toIdx = s.targetSelectedIndex;

    for (let i = 0; i < n; i++) {
      const angle = angleOffset + (2 * Math.PI * i) / n;
      const bx = cx + Math.cos(angle) * radius;
      const by = cy + Math.sin(angle) * radius;
      s.badgePositions.push({ x: bx, y: by });
      const label = labels[i] ?? String(i + 1);

      let selStrength = 0;
      if (i === toIdx && i === fromIdx) selStrength = 1;
      else if (i === toIdx) selStrength = ease;
      else if (i === fromIdx) selStrength = 1 - ease;

      const defBg = hexToRgb('#1F1F1F');
      const selBg = { r: displayBadge.r, g: displayBadge.g, b: displayBadge.b };
      const bg = lerpColor(defBg, selBg, selStrength);
      const bgHex = rgbToHex(bg.r, bg.g, bg.b);

      ctx.beginPath();
      ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = bgHex;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba('#f6f6f6', 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#f6f6f6';
      ctx.font = `600 ${label.length > 1 ? 9 : 10}px "Inter", sans-serif`;
      ctx.fillText(label, bx, by + 0.5);
    }
  }, [labels, comparing]);

  useEffect(() => {
    const s = stateRef.current;

    const snapshotState = () => {
      const ease = easeOutQuart(Math.min(s.animProgress, 1));
      s.currentScores = s.currentScores.map((c, i) => lerp(c, s.targetScores[i] ?? c, ease));
      s.currentCompareScores = s.currentCompareScores.map((c, i) => lerp(c, s.targetCompareScores[i] ?? c, ease));
      s.currentGradient = lerpGradient(s.currentGradient, s.targetGradient, ease);
      s.currentBadgeColor = lerpColor(s.currentBadgeColor, s.targetBadgeColor, ease);
      s.currentSelectedIndex = s.targetSelectedIndex;
      const rotEase = easeInOutCubic(Math.min(s.animProgress, 1));
      s.currentRotation = lerp(s.currentRotation, s.targetRotation, rotEase);
    };

    if (s.currentScores.length === 0) {
      s.currentScores = new Array(scores.length).fill(0);
    } else {
      snapshotState();
    }

    s.targetScores = [...scores];
    s.targetGradient = resolveGradient(themeKey);
    s.targetBadgeColor = hexToRgb(primaryColor);
    s.targetSelectedIndex = selectedIndex;

    const n = labels.length || 10;
    const rawTarget = rotationForIndex(selectedIndex, n);
    s.targetRotation = shortestArc(s.currentRotation, rawTarget);

    if (compareScores && compareScores.length > 0) {
      if (s.currentCompareScores.length === 0) {
        s.currentCompareScores = new Array(compareScores.length).fill(0);
      }
      s.targetCompareScores = [...compareScores];
    } else {
      s.targetCompareScores = s.currentCompareScores.map(() => 0);
    }

    s.animProgress = 0;
    cancelAnimationFrame(s.animationFrame);

    function animate() {
      if (s.animProgress < 1) {
        s.animProgress += 0.02;
        draw();
        s.animationFrame = requestAnimationFrame(animate);
      } else {
        s.currentScores = [...s.targetScores];
        s.currentCompareScores = [...s.targetCompareScores];
        s.currentGradient = s.targetGradient;
        s.currentBadgeColor = { ...s.targetBadgeColor };
        s.currentSelectedIndex = s.targetSelectedIndex;
        s.currentRotation = s.targetRotation;
        draw();
      }
    }

    s.animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(s.animationFrame);
  }, [scores, compareScores, comparing, primaryColor, selectedIndex, themeKey, labels, draw, rotationForIndex, shortestArc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleClick(e) {
      if (!onSelect) return;
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hitR = s.badgeHitRadius + 4;
      for (let i = 0; i < s.badgePositions.length; i++) {
        const dx = mx - s.badgePositions[i].x;
        const dy = my - s.badgePositions[i].y;
        if (dx * dx + dy * dy <= hitR * hitR) { onSelect(i); return; }
      }
    }

    function handleMouseMove(e) {
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hitR = s.badgeHitRadius + 4;
      let hit = false;
      for (let i = 0; i < s.badgePositions.length; i++) {
        const dx = mx - s.badgePositions[i].x;
        const dy = my - s.badgePositions[i].y;
        if (dx * dx + dy * dy <= hitR * hitR) { hit = true; break; }
      }
      canvas.style.cursor = hit ? 'pointer' : '';
    }

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);
    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [onSelect]);

  return (
    <div className="radar-wrapper">
      <canvas ref={canvasRef} className="radar-canvas" />
    </div>
  );
}
