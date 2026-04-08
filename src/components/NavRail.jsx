import React, { useState, useRef, useCallback } from 'react';
import './NavRail.css';

const RAIL_DURATION = 200;
const LABEL_DURATION = 120;

const NAV_ITEMS = [
  { id: 'districts',    label: 'Districts',    icon: 'grid',      mode: 'narrative', tab: 'districts' },
  { id: 'walkability',  label: 'Walkability',  icon: 'walk',      mode: 'narrative', tab: 'walkability' },
  { id: 'explorer',     label: 'Explorer',     icon: 'chart',     mode: 'explorer' },
];

// Minimal SVG icons (24x24 viewBox)
const ICONS = {
  grid: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  walk: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.5" r="2" /><path d="M14 9l-2 7-2.5 4M10 9l-3.5 5M14 9l3 4-2 4" />
    </svg>
  ),
  chart: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="M7 16l4-6 4 3 5-7" />
    </svg>
  ),
  sidebar: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" />
    </svg>
  ),
  home: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l9-8 9 8" /><path d="M5 10v10a1 1 0 001 1h3v-5h6v5h3a1 1 0 001-1V10" />
    </svg>
  ),
};

export default function NavRail({
  mode,
  narrativeTab,
  onModeChange,
  onNarrativeTab,
  onReturnToLanding,
  onExpandedChange,
}) {
  const [expanded, setExpanded] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const labelTimer = useRef(null);

  const toggleExpanded = useCallback(() => {
    if (labelTimer.current) { clearTimeout(labelTimer.current); labelTimer.current = null; }

    if (!expanded) {
      setExpanded(true);
      onExpandedChange?.(true);
      labelTimer.current = setTimeout(() => setShowLabels(true), RAIL_DURATION);
    } else {
      setShowLabels(false);
      labelTimer.current = setTimeout(() => {
        setExpanded(false);
        onExpandedChange?.(false);
      }, LABEL_DURATION);
    }
  }, [expanded, onExpandedChange]);

  const handleNavClick = useCallback((item) => {
    if (item.mode === 'explorer') {
      onModeChange('explorer');
    } else {
      onModeChange('narrative');
      if (item.tab) onNarrativeTab(item.tab);
    }
  }, [onModeChange, onNarrativeTab]);

  const isActive = useCallback((item) => {
    if (item.mode === 'explorer') return mode === 'explorer';
    return mode === 'narrative' && narrativeTab === item.tab;
  }, [mode, narrativeTab]);

  return (
    <nav className={`nav-rail ${expanded ? '' : 'nav-rail-collapsed'}`}>
      {/* Spacer */}
      <div className="nav-rail-spacer" />

      {/* Collapse toggle */}
      <div className="nav-section">
        <button className="nav-item" title="Toggle sidebar" onClick={toggleExpanded}>
          <span className={`nav-icon ${expanded ? '' : 'sidebar-icon-collapsed'}`}>
            {ICONS.sidebar}
          </span>
        </button>
      </div>

      <div className="nav-divider" />

      {/* Page nav items */}
      <div className="nav-section">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${isActive(item) ? 'nav-item-active' : ''}`}
            title={item.label}
            onClick={() => !isActive(item) && handleNavClick(item)}
          >
            <span className="nav-icon">{ICONS[item.icon]}</span>
            <span className={`nav-label ${showLabels ? 'labels-visible' : ''}`}>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="nav-divider" />

      {/* Bottom: home */}
      <div className="nav-section">
        <button
          className="nav-item"
          title="Ward Explorer"
          onClick={onReturnToLanding}
        >
          <span className="nav-icon">{ICONS.home}</span>
          <span className={`nav-label ${showLabels ? 'labels-visible' : ''}`}>Home</span>
        </button>
      </div>
    </nav>
  );
}
