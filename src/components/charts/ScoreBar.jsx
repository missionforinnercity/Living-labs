import React, { useState, useEffect, useRef } from 'react';
import { getThemePrimaryColor } from '../../lib/colorPalette';
import './Charts.css';

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function ScoreBar({ themeKey = 'walkability', score = 0, delta = null, active = false, color: colorOverride }) {
  const color = colorOverride || getThemePrimaryColor(themeKey);
  const DURATION = 500;
  const rafRef = useRef(0);
  const [animPct, setAnimPct] = useState(0);
  const [animDelta, setAnimDelta] = useState(0);

  useEffect(() => {
    const targetPct = Math.round(score * 100);
    const targetDelta = delta ?? 0;
    const startTime = performance.now();

    function animate(time) {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      const eased = easeOutCubic(progress);
      setAnimPct(eased * targetPct);
      setAnimDelta(eased * targetDelta);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    }

    setAnimPct(0);
    setAnimDelta(0);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [score, delta, active]);

  const isDelta = delta != null;
  const label = !isDelta
    ? `${Math.round(animPct)}`
    : (() => { const d = Math.round(animDelta); return d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`; })();

  const fillStyle = !isDelta
    ? {
        left: '0%',
        width: `${animPct}%`,
        background: active ? color : 'rgba(246, 246, 246, 0.5)',
      }
    : {
        left: animDelta >= 0 ? '50%' : `${50 - Math.min(Math.abs(animDelta), 100) / 2}%`,
        width: `${Math.min(Math.abs(animDelta), 100) / 2}%`,
        background: 'rgba(246, 246, 246, 0.4)',
      };

  const pct = isDelta ? 50 + (animDelta / 100) * 50 : animPct;
  const t = isDelta ? Math.abs(animDelta) / 100 : animPct / 100;
  const dotSize = 4 + t * 6;
  const glowSpread = 2 + t * 8;
  const glowAlpha = 0.2 + t * 0.6;
  const dotColor = active ? color : '#F6F6F6';

  const dotStyle = {
    left: `${pct}%`,
    width: `${dotSize}px`,
    height: `${dotSize}px`,
    background: dotColor,
    boxShadow: `0 0 ${glowSpread}px ${dotColor}${Math.round(glowAlpha * 255).toString(16).padStart(2, '0')}`,
  };

  const labelAlpha = isDelta && !active
    ? 0.3 + Math.min(Math.abs(delta ?? 0) / 50, 1) * 0.7
    : 1;

  return (
    <div className="score-bar">
      <span className="score-bar-label" style={{ color: `rgba(246, 246, 246, ${labelAlpha})` }}>{label}</span>
      <div className="score-bar-track">
        {isDelta && <span className="score-bar-center" />}
        <span className="score-bar-fill" style={fillStyle} />
        <span className="score-bar-dot" style={dotStyle} />
      </div>
    </div>
  );
}
