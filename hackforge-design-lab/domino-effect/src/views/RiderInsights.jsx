import { Activity, MapPin, Network, ShieldCheck, Smartphone } from 'lucide-react';
import SelectMenu from '../components/SelectMenu';

const formatMinute = minute => `${String(Math.floor((minute ?? 720) / 60)).padStart(2, '0')}:${String((minute ?? 720) % 60).padStart(2, '0')}`;

const RIDER_DUMMY_TRAJECTORIES = {
  'R-1042': [
    { shift: 'Shift 1', score: 94, note: 'Normal routine' },
    { shift: 'Shift 2', score: 92, note: 'Consistent route' },
    { shift: 'Shift 3', score: 90, note: 'Standard delivery' },
    { shift: 'Shift 4', score: 85, note: 'Minor schedule shift' },
    { shift: 'Shift 5', score: 64, note: 'Unseen device logged' },
    { shift: 'Shift 6', score: 48, note: 'Multivariate anomaly' },
    { shift: 'Shift 7 (Now)', score: 28, note: 'Verification required' },
  ],
  'R-2187': [
    { shift: 'Shift 1', score: 94, note: 'Indiranagar baseline' },
    { shift: 'Shift 2', score: 95, note: 'Prompt deliveries' },
    { shift: 'Shift 3', score: 92, note: 'Normal acceptance' },
    { shift: 'Shift 4', score: 88, note: 'Stable pattern' },
    { shift: 'Shift 5', score: 84, note: 'Route change' },
    { shift: 'Shift 6', score: 80, note: 'Location drift' },
    { shift: 'Shift 7 (Now)', score: 75, note: 'Observation active' },
  ],
  'R-3091': [
    { shift: 'Shift 1', score: 92, note: 'CP Central route' },
    { shift: 'Shift 2', score: 90, note: 'Normal timing' },
    { shift: 'Shift 3', score: 88, note: 'Steady completion' },
    { shift: 'Shift 4', score: 82, note: 'Device shift detected' },
    { shift: 'Shift 5', score: 76, note: 'Telemetry variance' },
    { shift: 'Shift 6', score: 70, note: 'Monitoring flag' },
    { shift: 'Shift 7 (Now)', score: 67, note: 'Observing state' },
  ],
  'R-4470': [
    { shift: 'Shift 1', score: 95, note: 'Normal baseline' },
    { shift: 'Shift 2', score: 91, note: 'High acceptance' },
    { shift: 'Shift 3', score: 86, note: 'Standard shift' },
    { shift: 'Shift 4', score: 72, note: 'Multiple devices' },
    { shift: 'Shift 5', score: 54, note: 'Re-verification call' },
    { shift: 'Shift 6', score: 38, note: 'Face check failed' },
    { shift: 'Shift 7 (Now)', score: 24, note: 'Human review required' },
  ],
  'R-5108': [
    { shift: 'Shift 1', score: 92, note: 'Hitec City shifts' },
    { shift: 'Shift 2', score: 89, note: 'Normal acceptance' },
    { shift: 'Shift 3', score: 84, note: 'Route adherence' },
    { shift: 'Shift 4', score: 68, note: 'Start time moved +5h' },
    { shift: 'Shift 5', score: 52, note: 'Acceptance dropped' },
    { shift: 'Shift 6', score: 35, note: 'Policy escalation' },
    { shift: 'Shift 7 (Now)', score: 24, note: 'Human review active' },
  ],
  'R-6284': [
    { shift: 'Shift 1', score: 94, note: 'Established route' },
    { shift: 'Shift 2', score: 96, note: '100% acceptance' },
    { shift: 'Shift 3', score: 95, note: 'Consistent timing' },
    { shift: 'Shift 4', score: 98, note: 'Smooth shift' },
    { shift: 'Shift 5', score: 95, note: 'Recognised device' },
    { shift: 'Shift 6', score: 97, note: 'Clean telemetry' },
    { shift: 'Shift 7 (Now)', score: 96, note: 'High assurance' },
  ],
  'R-7315': [
    { shift: 'Shift 1', score: 93, note: 'Salt Lake deliveries' },
    { shift: 'Shift 2', score: 95, note: 'On-time completions' },
    { shift: 'Shift 3', score: 97, note: 'Consistent baseline' },
    { shift: 'Shift 4', score: 94, note: 'Normal shift length' },
    { shift: 'Shift 5', score: 96, note: 'Standard device' },
    { shift: 'Shift 6', score: 98, note: 'Expected timing' },
    { shift: 'Shift 7 (Now)', score: 96, note: 'Trusted rider' },
  ],
  'R-8462': [
    { shift: 'Shift 1', score: 86, note: 'Initial observation' },
    { shift: 'Shift 2', score: 88, note: 'T. Nagar routine' },
    { shift: 'Shift 3', score: 85, note: 'Device authenticated' },
    { shift: 'Shift 4', score: 89, note: 'Steady completion' },
    { shift: 'Shift 5', score: 87, note: 'Normal shift length' },
    { shift: 'Shift 6', score: 90, note: 'Score recovered' },
    { shift: 'Shift 7 (Now)', score: 88, note: 'Trusted status' },
  ],
  'R-9001': [
    { shift: 'Shift 1', score: 95, note: 'Seeded baseline' },
    { shift: 'Shift 2', score: 96, note: 'High acceptance' },
    { shift: 'Shift 3', score: 94, note: 'Normal route' },
    { shift: 'Shift 4', score: 98, note: 'Smooth delivery' },
    { shift: 'Shift 5', score: 95, note: 'Verified session' },
    { shift: 'Shift 6', score: 99, note: 'Optimal performance' },
    { shift: 'Shift 7 (Now)', score: 100, note: 'Live interactive status' },
  ],
};

function getRiderTrajectory(rider) {
  const curr = Number(rider?.trustScore) ?? 80;
  const canned = RIDER_DUMMY_TRAJECTORIES[rider?.id];
  if (canned) {
    return canned.map((item, index) => ({
      ...item,
      score: index === canned.length - 1 ? curr : item.score,
    }));
  }

  const base = Math.min(96, Math.max(88, curr + 8));
  return [
    { shift: 'Shift 1', score: base, note: 'Baseline shift' },
    { shift: 'Shift 2', score: Math.min(100, base + 2), note: 'Route match' },
    { shift: 'Shift 3', score: Math.max(10, base - 2), note: 'Consistent shift' },
    { shift: 'Shift 4', score: Math.round((base + curr) / 2 + 3), note: 'Shift activity' },
    { shift: 'Shift 5', score: Math.round((base + curr) / 2), note: 'Observation flag' },
    { shift: 'Shift 6', score: Math.round((base + curr * 3) / 4), note: 'Recent telemetry' },
    { shift: 'Shift 7 (Now)', score: curr, note: 'Current status' },
  ];
}

function TrustScoreGraph({ rider }) {
  const points = getRiderTrajectory(rider);
  const scores = points.map(p => p.score);
  const currentScore = scores[scores.length - 1];
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const trend = currentScore - scores[0];

  const themeColor = currentScore >= 80 ? '#2563eb' : currentScore >= 50 ? '#d97706' : '#dc2626';
  const badgeBg = currentScore >= 80 ? 'rgba(37,99,235,0.12)' : currentScore >= 50 ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.12)';
  const statusLabel = currentScore >= 80 ? 'TRUSTED' : currentScore >= 50 ? 'SUSPICIOUS' : 'HIGH RISK';

  const svgWidth = 560;
  const svgHeight = 220;
  const padLeft = 44;
  const padRight = 30;
  const padTop = 26;
  const padBottom = 42;

  const innerW = svgWidth - padLeft - padRight;
  const innerH = svgHeight - padTop - padBottom;

  const coords = points.map((item, index) => {
    const x = padLeft + (index * innerW) / Math.max(1, points.length - 1);
    const y = padTop + ((100 - item.score) / 100) * innerH;
    return { x, y, score: item.score, shift: item.shift, note: item.note };
  });

  const polylineStr = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPolygonStr = [
    ...coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${coords[coords.length - 1].x.toFixed(1)},${(padTop + innerH).toFixed(1)}`,
    `${coords[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)}`,
  ].join(' ');

  const gradId = `trust-grad-${rider?.id || 'default'}-${currentScore}`;

  // Threshold Y positions
  const y80 = padTop + ((100 - 80) / 100) * innerH;
  const y50 = padTop + ((100 - 50) / 100) * innerH;
  const y25 = padTop + ((100 - 25) / 100) * innerH;
  const y0 = padTop + innerH;
  const y100 = padTop;

  return (
    <div className="trust-score-graph-card" style={{ width: '100%', minWidth: 0 }}>
      {/* 4-Column KPI Bar */}
      <div className="trust-kpi-bar" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '8px',
        marginBottom: '12px',
        padding: '10px 14px',
        background: '#ffffff',
        border: '1px solid var(--navy, #0f172a)',
      }}>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, letterSpacing: '0.8px', display: 'block' }}>CURRENT TRUST</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
            <b style={{ fontSize: '18px', fontFamily: '"Archivo Black", sans-serif', color: themeColor }}>{currentScore}%</b>
            <span style={{ fontSize: '8px', fontWeight: 800, padding: '2px 5px', borderRadius: '2px', background: badgeBg, color: themeColor, fontFamily: '"Archivo Black", sans-serif' }}>{statusLabel}</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, letterSpacing: '0.8px', display: 'block' }}>BASELINE TARGET</span>
          <b style={{ fontSize: '18px', fontFamily: '"Archivo Black", sans-serif', color: 'var(--navy, #0f172a)', display: 'block', marginTop: '2px' }}>80%</b>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, letterSpacing: '0.8px', display: 'block' }}>7-SHIFT PEAK</span>
          <b style={{ fontSize: '18px', fontFamily: '"Archivo Black", sans-serif', color: 'var(--navy, #0f172a)', display: 'block', marginTop: '2px' }}>{maxScore}%</b>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', fontWeight: 700, letterSpacing: '0.8px', display: 'block' }}>7-SHIFT NET TREND</span>
          <b style={{ fontSize: '18px', fontFamily: '"Archivo Black", sans-serif', color: trend >= 0 ? '#16a34a' : '#ef4444', display: 'block', marginTop: '2px' }}>
            {trend > 0 ? `+${trend}%` : `${trend}%`}
          </b>
        </div>
      </div>

      {/* Primary SVG Chart */}
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--navy, #0f172a)',
        padding: '12px 10px 8px',
        overflow: 'hidden',
      }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          role="img"
          aria-label={`Recorded trust score graph for ${rider?.name}: current score ${currentScore}%`}
          style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '230px' }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={themeColor} stopOpacity="0.38" />
              <stop offset="85%" stopColor={themeColor} stopOpacity="0.04" />
              <stop offset="100%" stopColor={themeColor} stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {/* Background Zone Tints */}
          <rect x={padLeft} y={y100} width={innerW} height={y80 - y100} fill="#22c55e" fillOpacity="0.05" />
          <rect x={padLeft} y={y80} width={innerW} height={y50 - y80} fill="#f59e0b" fillOpacity="0.04" />
          <rect x={padLeft} y={y50} width={innerW} height={y0 - y50} fill="#ef4444" fillOpacity="0.05" />

          {/* Horizontal Grid & Threshold Lines */}
          <line x1={padLeft} x2={svgWidth - padRight} y1={y100} y2={y100} stroke="#e2e8f0" strokeWidth="1" />
          <text x={padLeft - 6} y={y100 + 3} textAnchor="end" fontSize="7.5" fill="#94a3b8" fontFamily="'Archivo Black', sans-serif">100</text>

          {/* 80% Safe Baseline */}
          <line x1={padLeft} x2={svgWidth - padRight} y1={y80} y2={y80} stroke="#22c55e" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.85" />
          <text x={padLeft - 6} y={y80 + 3} textAnchor="end" fontSize="7.5" fill="#16a34a" fontFamily="'Archivo Black', sans-serif" fontWeight="bold">80</text>
          <text x={svgWidth - padRight - 4} y={y80 - 4} textAnchor="end" fontSize="6.5" fill="#16a34a" fontFamily="'Archivo Black', sans-serif">SAFE (80)</text>

          {/* 50% Watch Threshold */}
          <line x1={padLeft} x2={svgWidth - padRight} y1={y50} y2={y50} stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.85" />
          <text x={padLeft - 6} y={y50 + 3} textAnchor="end" fontSize="7.5" fill="#d97706" fontFamily="'Archivo Black', sans-serif" fontWeight="bold">50</text>
          <text x={svgWidth - padRight - 4} y={y50 - 4} textAnchor="end" fontSize="6.5" fill="#d97706" fontFamily="'Archivo Black', sans-serif">WATCH (50)</text>

          {/* 25% Critical Line */}
          <line x1={padLeft} x2={svgWidth - padRight} y1={y25} y2={y25} stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
          <text x={padLeft - 6} y={y25 + 3} textAnchor="end" fontSize="7.5" fill="#dc2626" fontFamily="'Archivo Black', sans-serif">25</text>

          {/* 0% Axis Line */}
          <line x1={padLeft} x2={svgWidth - padRight} y1={y0} y2={y0} stroke="var(--navy, #0f172a)" strokeWidth="1.2" />
          <text x={padLeft - 6} y={y0 + 3} textAnchor="end" fontSize="7.5" fill="#94a3b8" fontFamily="'Archivo Black', sans-serif">0</text>

          {/* Vertical Grid Columns */}
          {coords.map((c, i) => (
            <line
              key={`grid-vert-${i}`}
              x1={c.x}
              x2={c.x}
              y1={y100}
              y2={y0}
              stroke="#e2e8f0"
              strokeWidth="0.8"
              strokeDasharray="2 3"
            />
          ))}

          {/* Shaded Area fill */}
          <polygon points={areaPolygonStr} fill={`url(#${gradId})`} />

          {/* Main Trend Line */}
          <polyline
            points={polylineStr}
            fill="none"
            stroke={themeColor}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points, Score Badges, and X-Axis Labels */}
          {coords.map((item, index) => {
            const isLatest = index === coords.length - 1;
            const ptColor = item.score >= 80 ? '#2563eb' : item.score >= 50 ? '#d97706' : '#dc2626';

            return (
              <g key={`point-${item.shift}-${index}`}>
                {/* Outer ring on current point */}
                {isLatest && (
                  <circle
                    cx={item.x}
                    cy={item.y}
                    r="8.5"
                    fill="none"
                    stroke={themeColor}
                    strokeWidth="1.6"
                    strokeDasharray="2.5 2.5"
                    opacity="0.9"
                  />
                )}

                {/* Score badge floating above point */}
                <g>
                  <rect
                    x={item.x - 14}
                    y={Math.max(4, item.y - 19)}
                    width="28"
                    height="13"
                    rx="2"
                    fill={isLatest ? themeColor : '#0f172a'}
                  />
                  <text
                    x={item.x}
                    y={Math.max(4, item.y - 19) + 9.5}
                    textAnchor="middle"
                    fontSize="7.5"
                    fontFamily="'Archivo Black', sans-serif"
                    fill="#ffffff"
                    fontWeight="bold"
                  >
                    {item.score}%
                  </text>
                </g>

                {/* Main Data Point Circle */}
                <circle
                  cx={item.x}
                  cy={item.y}
                  r={isLatest ? 5 : 4}
                  fill="#ffffff"
                  stroke={isLatest ? themeColor : ptColor}
                  strokeWidth="2.5"
                >
                  <title>{`${item.shift}: Trust ${item.score}% — ${item.note}`}</title>
                </circle>

                {/* X-axis shift name */}
                <text
                  x={item.x}
                  y={y0 + 13}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontFamily="'Archivo Black', sans-serif"
                  fill={isLatest ? themeColor : 'var(--navy, #0f172a)'}
                  fontWeight={isLatest ? 'bold' : 'normal'}
                >
                  {item.shift}
                </text>

                {/* Shift status / event note below */}
                <text
                  x={item.x}
                  y={y0 + 23}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontFamily="sans-serif"
                  fill="#64748b"
                >
                  {item.note}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend & Explanation Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        marginTop: '8px',
        paddingTop: '6px',
        fontSize: '8px',
        color: '#64748b',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            <b style={{ color: 'var(--navy, #0f172a)' }}>Safe Zone (≥80)</b>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <b style={{ color: 'var(--navy, #0f172a)' }}>Review (50–79)</b>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <b style={{ color: 'var(--navy, #0f172a)' }}>High Risk (&lt;50)</b>
          </span>
        </div>
        <span style={{ fontStyle: 'italic' }}>
          Continuous 7-shift timeline dynamically synced with live verification
        </span>
      </div>
    </div>
  );
}

export default function RiderInsights({ riders, events, selectedId, onSelect }) {
  const rider = riders.find(item => item.id === selectedId) ?? riders[0];
  const riderEvents = events.filter(event => event.riderId === rider.id).slice().reverse();
  const baseline = rider.baselineProfile ?? { normalStartMinute: 720, shiftHours: 8, acceptanceRate: 0.95 };
  const relationship = rider.relationships ?? {};
  const baselineArray = rider.baseline ?? [80, 85, 90, 75, 95];
  const observedArray = rider.observed ?? baselineArray;

  return <main className="page rider-insights-page">
    <section className="lab-titlebar">
      <div><span>INDIVIDUAL CONTINUITY RECORD</span><h1>RIDER <i>INSIGHTS.</i></h1></div>
      <SelectMenu label="SELECT RIDER" value={rider.id} onChange={onSelect} options={riders.map(item => ({ value: item.id, label: `${item.id} / ${item.name}` }))} />
    </section>

    <section className="insights-identity">
      <div><span>RIDER</span><h2>{rider.name}</h2><p>{rider.id} · {rider.online ? rider.paused ? 'SHIFT PAUSED' : 'ONLINE' : 'OFFLINE'}</p></div>
      <div className={rider.riskLevel.toLowerCase().replace(' ', '-')}><span>TRUST</span><b>{rider.trustScore}</b><strong>{rider.riskLevel}</strong></div>
      <div><span>AUTOMATED ACTION</span><strong>{rider.automatedAction}</strong><p>{rider.lastEvent}</p></div>
    </section>

    <section className="insights-grid">
      <article className="trust-graph-article">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity />
            <span>TRUST SCORE OVER TIME</span>
          </div>
          <span style={{ fontSize: '8px', padding: '3px 7px', background: 'var(--navy, #0f172a)', color: '#ffffff', fontFamily: '"Archivo Black", sans-serif', letterSpacing: '1px' }}>
            DUMMY TELEMETRY · 7 SHIFTS
          </span>
        </header>
        <TrustScoreGraph rider={rider} />
      </article>
      <article><header><ShieldCheck /><span>BEHAVIOURAL BASELINE</span></header><dl>
        <div><dt>USUAL START</dt><dd>{formatMinute(baseline.normalStartMinute)}</dd></div>
        <div><dt>SHIFT LENGTH</dt><dd>{(baseline.shiftHours ?? 8).toFixed(1)} hours</dd></div>
        <div><dt>ACCEPTANCE</dt><dd>{Math.round((baseline.acceptanceRate ?? 0.95) * 100)}%</dd></div>
        <div><dt>BASELINE</dt><dd>{rider.baselineMaturity}</dd></div>
      </dl></article>
      <article><header><MapPin /><span>LOCATION CONTEXT</span></header><dl>
        <div><dt>USUAL AREA</dt><dd>{rider.usualLocation}</dd></div>
        <div><dt>CURRENT</dt><dd>{rider.currentLocation}</dd></div>
        <div><dt>ASSESSMENT</dt><dd>{rider.currentLocation === rider.usualLocation ? 'Consistent' : 'Deviation recorded'}</dd></div>
      </dl><small>Location contributes to risk; it does not prove account sharing.</small></article>
      <article><header><Smartphone /><span>DEVICE + DELIVERY</span></header><dl>
        <div><dt>CURRENT DEVICE</dt><dd>{rider.deviceInformation?.label ?? rider.device}</dd></div>
        <div><dt>RECOGNISED</dt><dd>{rider.deviceInformation?.known ? 'Yes' : 'No'}</dd></div>
        <div><dt>ACCEPTED</dt><dd>{rider.deliveriesAccepted}</dd></div>
        <div><dt>COMPLETED</dt><dd>{rider.deliveriesCompleted}</dd></div>
      </dl></article>
      <article className="relationship-card"><header><Network /><span>RELATIONSHIP CHECK</span></header><dl>
        <div><dt>HANDOFF RISK</dt><dd>{rider.handoffAssessment?.riskScore ?? 0}/100 · {rider.handoffAssessment?.dataSufficiency ?? 'LIMITED'}</dd></div>
        <div><dt>RELATED ACCOUNTS</dt><dd>{relationship.relatedAccounts ?? 0}</dd></div>
        <div><dt>SHARED DEVICES</dt><dd>{relationship.sharedDevices ?? 0}</dd></div>
        <div><dt>ASSESSMENT</dt><dd>{relationship.assessment ?? 'NO MATERIAL CONNECTION'}</dd></div>
      </dl><small>A shared device is contextual evidence, never automatic proof of fraud.</small></article>
      <article className="divergence-card"><header><Activity /><span>NORMAL VS CURRENT</span></header>
        {['SHIFT TIMING', 'ACCEPTANCE', 'ROUTE', 'SHIFT LENGTH', 'DEVICE'].map((label, index) => <div className="divergence-row" key={label}><b>{label}</b><span><i style={{ width: `${baselineArray[index]}%` }} /></span><span><i className="current" style={{ width: `${observedArray[index]}%` }} /></span></div>)}
        <small>Blue is established baseline · red is the latest observed session.</small>
      </article>
    </section>

    <section className="insight-timeline"><header><span>IDENTITY ASSURANCE TIMELINE</span><h2>WHAT HAPPENED, AND WHY?</h2></header>
      {riderEvents.slice(0, 5).map(event => <article key={event.id}><time>{event.time}</time><div><b>{event.kind?.replaceAll('_', ' ')}</b><p>{event.message}</p><small>{event.payload?.action?.replaceAll('_', ' ')}{event.payload?.trustScore != null ? ` · TRUST ${event.payload.trustScore}` : ''}</small></div></article>)}
      {riderEvents.length > 5 && <details><summary>VIEW FULL HISTORY ({riderEvents.length - 5} MORE)</summary>{riderEvents.slice(5).map(event => <article key={event.id}><time>{event.time}</time><p>{event.message}</p></article>)}</details>}
      {!riderEvents.length && <p>No meaningful events recorded for this rider yet.</p>}
    </section>
  </main>;
}
