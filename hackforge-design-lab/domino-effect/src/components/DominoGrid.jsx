import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

const FLOOR_TILT = 64;

function seededValue(seed) {
  let value = seed || 1;
  return () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function selectDemoRiders(riders) {
  const highRisk = riders.filter(rider => rider.riskLevel === 'HIGH RISK').slice(0, 1);
  const suspicious = riders.filter(rider => rider.riskLevel === 'SUSPICIOUS').slice(0, 1);
  const chosen = new Set([...highRisk, ...suspicious].map(rider => rider.id));
  const trusted = riders.filter(rider => rider.riskLevel === 'TRUSTED' && !chosen.has(rider.id))
    .slice(0, 7 - chosen.size);
  const selected = [...trusted, ...suspicious, ...highRisk];
  const random = seededValue(20261018);
  return selected.sort(() => random() - .5).map(rider => rider.id);
}

function createWorldPositions(ids) {
  const seed = ids.join('').split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const random = seededValue(seed);
  const placed = [];

  ids.forEach(id => {
    let best = null;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < 260; attempt += 1) {
      const depth = 12 + random() * 70;
      const horizontalSpan = 35 - depth * .2;
      const candidate = { x: 50 + (random() * 2 - 1) * horizontalSpan, depth };
      const distances = placed.map(point => Math.hypot(candidate.x - point.x, (candidate.depth - point.depth) * 1.35));
      const nearest = distances.length ? Math.min(...distances) : 100;
      const alignmentPenalty = placed.reduce((penalty, point) => {
        if (Math.abs(candidate.x - point.x) < 8) return penalty + 12;
        if (Math.abs(candidate.depth - point.depth) < 7) return penalty + 10;
        return penalty;
      }, 0);
      const edgePenalty = candidate.depth < 20 && (candidate.x < 20 || candidate.x > 80) ? 9 : 0;
      const score = nearest - alignmentPenalty - edgePenalty + random() * 3;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    placed.push({ id, ...best });
  });

  return Object.fromEntries(placed.map(({ id, x, depth }) => [id, { x, depth }]));
}

export default function DominoGrid({ riders, focusId, selectedId, onFocus, onFocusComplete }) {
  const viewport = useRef(null);
  const world = useRef(null);
  const onFocusCompleteRef = useRef(onFocusComplete);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridIds] = useState(() => selectDemoRiders(riders));
  const [positions] = useState(() => createWorldPositions(gridIds));
  const visibleRiders = gridIds.map(id => riders.find(rider => rider.id === id)).filter(Boolean);
  onFocusCompleteRef.current = onFocusComplete;

  useEffect(() => {
    if (!world.current) return undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    gsap.killTweensOf(world.current);

    if (!focusId) {
      setIsTransitioning(true);
      gsap.to(world.current, {
        x: 0, y: 0, z: 0, scale: 1, rotateY: 0,
        duration: reducedMotion ? 0 : 1,
        ease: 'power3.inOut',
        force3D: true,
        onComplete: () => setIsTransitioning(false),
      });
      return undefined;
    }

    const target = world.current.querySelector(`[data-rider-id="${focusId}"]`);
    if (!target || !viewport.current) return undefined;
    const viewportRect = viewport.current.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const currentX = Number(gsap.getProperty(world.current, 'x')) || 0;
    const currentY = Number(gsap.getProperty(world.current, 'y')) || 0;
    const desiredX = viewportRect.left + viewportRect.width * .32;
    const desiredY = viewportRect.top + viewportRect.height * .54;
    const targetX = currentX + desiredX - (targetRect.left + targetRect.width / 2);
    const targetY = currentY + desiredY - (targetRect.top + targetRect.height / 2);
    const worldPoint = positions[focusId];

    setIsTransitioning(true);
    gsap.to(world.current, {
      x: targetX,
      y: targetY,
      z: 190,
      scale: 1.08,
      rotateY: (50 - worldPoint.x) * .08,
      duration: reducedMotion ? 0 : 1.08,
      ease: 'power3.inOut',
      force3D: true,
      onComplete: () => {
        setIsTransitioning(false);
        onFocusCompleteRef.current(focusId);
      },
    });

    return () => gsap.killTweensOf(world.current);
  }, [focusId, positions]);

  return <section className={`domino-scene ${focusId ? 'has-selection' : ''}`} aria-label="Live rider identity map">
    <div className="scene-heading">
      <div><span>REPRESENTATIVE ACTIVE IDENTITIES / 3D LIVE SIMULATION</span><h2>CONTINUITY MAP</h2></div>
      <div className="domino-legend"><span className="blue">TRUSTED</span><span className="yellow">SUSPICIOUS</span><span className="red">HIGH RISK</span></div>
    </div>
    <div className="domino-viewport" ref={viewport}>
      <div className="scene-atmosphere" aria-hidden="true" />
      <div className="scene-world" ref={world}>
        <div className="ground-plane" style={{ '--floor-tilt': `${FLOOR_TILT}deg` }}>
          <div className="grid-surface" aria-hidden="true" />
          {visibleRiders.map(rider => {
            const tone = rider.riskLevel === 'TRUSTED' ? 'blue' : rider.riskLevel === 'SUSPICIOUS' ? 'yellow' : 'red';
            const position = positions[rider.id];
            return <div
              className="domino-anchor"
              style={{ left: `${position.x}%`, top: `${position.depth}%`, zIndex: Math.round(position.depth) }}
              key={rider.id}
            >
              <i className="domino-ground-shadow" aria-hidden="true" />
              <button
                className={`rider-domino domino-piece ${tone} ${focusId === rider.id ? 'selected' : ''}`}
                data-rider-id={rider.id}
                onClick={() => onFocus(rider.id)}
                aria-label={`${rider.id}, ${rider.riskLevel}, ${rider.identityConfidence}% identity confidence`}
              >
                <span>{rider.id}</span><b>{rider.identityConfidence}</b><small>{rider.riskLevel}</small>
              </button>
            </div>;
          })}
        </div>
      </div>
      <div className={`identity-lock ${focusId ? 'visible' : ''}`} aria-live="polite">
        <span>{isTransitioning ? 'CAMERA ACQUIRING' : selectedId ? 'IDENTITY LOCKED' : 'CAMERA READY'}</span><b>{focusId}</b>
      </div>
    </div>
  </section>;
}
