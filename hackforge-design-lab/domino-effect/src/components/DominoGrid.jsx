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
  const targetCount = Math.min(8, riders.length);
  // Guarantee the assigned demo rider R-9001 is always placed on the Domino Continuity Map
  const hasDemo = riders.some(r => r.id === 'R-9001');
  const chosen = new Set(hasDemo ? ['R-9001'] : []);
  const highRisk = riders.filter(rider => rider.riskLevel === 'HIGH RISK' && !chosen.has(rider.id)).slice(0, 1);
  highRisk.forEach(r => chosen.add(r.id));
  const suspicious = riders.filter(rider => rider.riskLevel === 'SUSPICIOUS' && !chosen.has(rider.id)).slice(0, 2);
  suspicious.forEach(r => chosen.add(r.id));
  const trusted = riders.filter(rider => rider.riskLevel === 'TRUSTED' && !chosen.has(rider.id))
    .slice(0, targetCount - chosen.size);
  trusted.forEach(rider => chosen.add(rider.id));
  const remaining = riders.filter(rider => !chosen.has(rider.id)).slice(0, targetCount - chosen.size);
  const selected = [...riders.filter(r => chosen.has(r.id)), ...remaining];
  const random = seededValue(20261018);
  return selected.sort(() => random() - .5).map(rider => rider.id);
}

function createWorldPositions(ids) {
  const seed = ids.join('').split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const random = seededValue(seed);
  // Perspective-safe lanes prevent projected cards from obscuring one another.
  // Small seeded offsets retain the intentionally scattered command-centre feel.
  const slots = [
    { x: 16, depth: 15 }, { x: 60, depth: 14 }, { x: 81, depth: 18 },
    { x: 29, depth: 43 }, { x: 70, depth: 46 }, { x: 84, depth: 40 },
    { x: 41, depth: 73 }, { x: 50, depth: 68 },
  ];

  return Object.fromEntries(ids.map((id, index) => {
    const slot = slots[index % slots.length];
    return [id, {
      x: slot.x + (random() - .5) * 1.2,
      depth: slot.depth + (random() - .5) * 2,
    }];
  }));
}

export default function DominoGrid({ riders, focusId, selectedId, onFocus, onFocusComplete }) {
  const viewport = useRef(null);
  const dragRig = useRef(null);
  const world = useRef(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const view = useRef({ x: 0, y: 0, rotateX: 0, rotateY: 0, scale: 1 });
  const onFocusCompleteRef = useRef(onFocusComplete);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [viewMoved, setViewMoved] = useState(false);
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

  const moveView = next => {
    view.current = next;
    gsap.to(dragRig.current, { ...next, duration: .28, ease: 'power2.out', force3D: true, overwrite: 'auto' });
  };

  const pointerDown = event => {
    if (focusId || event.button > 0) return;
    drag.current = { active: true, moved: false, startX: event.clientX, startY: event.clientY, baseX: view.current.x, baseY: view.current.y };
  };

  const pointerMove = event => {
    if (!drag.current.active || focusId) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (!drag.current.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.current.moved) viewport.current?.setPointerCapture?.(event.pointerId);
    drag.current.moved = true;
    const x = Math.max(-70, Math.min(70, drag.current.baseX + dx * .18));
    const y = Math.max(-32, Math.min(32, drag.current.baseY + dy * .12));
    moveView({ x, y, rotateX: Math.max(-1.4, Math.min(1.4, -dy * .012)), rotateY: Math.max(-3, Math.min(3, dx * .018)) });
  };

  const pointerUp = event => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (drag.current.moved) {
      setViewMoved(true);
      viewport.current?.releasePointerCapture?.(event.pointerId);
    }
  };

  const resetView = () => {
    moveView({ x: 0, y: 0, rotateX: 0, rotateY: 0, scale: 1 });
    setViewMoved(false);
  };

  const zoomView = direction => {
    const scale = Math.max(.88, Math.min(1.15, (view.current.scale ?? 1) + direction * .07));
    moveView({ ...view.current, scale });
    setViewMoved(Math.abs(scale - 1) > .01 || view.current.x !== 0 || view.current.y !== 0);
  };

  return <section className={`domino-scene ${focusId ? 'has-selection' : ''}`} aria-label="Live rider identity map">
    <div className="scene-heading">
      <div><span>REPRESENTATIVE ACTIVE IDENTITIES / 3D LIVE SIMULATION</span><h2>CONTINUITY MAP</h2></div>
      <div className="domino-legend"><span className="blue">TRUSTED</span><span className="yellow">SUSPICIOUS</span><span className="red">HIGH RISK</span></div>
    </div>
    <div className={`domino-viewport ${focusId ? 'camera-locked' : ''}`} ref={viewport} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
      <div className="scene-atmosphere" aria-hidden="true" />
      <div className="drag-rig" ref={dragRig}><div className="scene-world" ref={world}>
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
                onPointerDown={event => { event.stopPropagation(); onFocus(rider.id); }}
                onClick={() => onFocus(rider.id)}
                aria-label={`${rider.id}, ${rider.riskLevel}, ${rider.identityConfidence}% identity confidence`}
              >
                <span>{rider.id}</span><b>{rider.identityConfidence}</b><small>{rider.riskLevel}</small>
              </button>
            </div>;
          })}
        </div>
      </div></div>
      <div className="view-controls" onPointerDown={event => event.stopPropagation()}>
        <span>DRAG / ZOOM VIEW</span>
        <button type="button" aria-label="Zoom out" onClick={() => zoomView(-1)} disabled={Boolean(focusId)}>−</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomView(1)} disabled={Boolean(focusId)}>+</button>
        {viewMoved && !focusId && <button type="button" onClick={resetView}>RESET VIEW</button>}
      </div>
      <div className={`identity-lock ${focusId ? 'visible' : ''}`} aria-live="polite">
        <span>{isTransitioning ? 'CAMERA ACQUIRING' : selectedId ? 'IDENTITY LOCKED' : 'CAMERA READY'}</span><b>{focusId}</b>
      </div>
    </div>
  </section>;
}
