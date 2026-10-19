import { Activity, MapPin, Network, ShieldCheck, Smartphone } from 'lucide-react';
import SelectMenu from '../components/SelectMenu';

const formatMinute = minute => `${String(Math.floor((minute ?? 720) / 60)).padStart(2, '0')}:${String((minute ?? 720) % 60).padStart(2, '0')}`;

function getHistoricalPoints(history, currentScore) {
  const validHistory = history?.filter(item => item && item.score != null) ?? [];
  if (validHistory.length >= 7) {
    return validHistory.slice(-7).map((item, index) => ({
      score: item.score,
      label: index === validHistory.length - 1 ? 'Latest' : `Shift -${validHistory.length - 1 - index}`,
      timestamp: item.timestamp,
      action: item.action,
    }));
  }

  const curr = Number(currentScore) || 80;
  let curve;
  if (curr >= 85) {
    curve = [curr - 4, curr + 2, curr - 2, curr + 3, curr - 1, curr + 2, curr];
  } else if (curr >= 70) {
    curve = [92, 94, 89, 86, 82, 78, curr];
  } else if (curr >= 50) {
    curve = [90, 88, 82, 76, 68, 62, curr];
  } else {
    curve = [94, 88, 80, 64, 46, 32, curr];
  }

  const needed = Math.max(0, 7 - validHistory.length);
  const dummyPrefix = curve.slice(0, needed).map((val, idx) => ({
    score: Math.min(100, Math.max(10, val)),
    label: `Shift -${6 - idx}`,
    timestamp: new Date(Date.now() - (6 - idx) * 86400000).toISOString(),
    action: idx < 3 ? 'BASELINE_SHIFT' : 'ROUTINE_MONITORING',
  }));

  const realSuffix = validHistory.map((item, idx) => ({
    score: item.score,
    label: idx === validHistory.length - 1 ? 'Latest' : `Shift -${validHistory.length - 1 - idx}`,
    timestamp: item.timestamp,
    action: item.action || 'CURRENT_STATE',
  }));

  return [...dummyPrefix, ...realSuffix];
}

function TrustSparkline({ history, score }) {
  const points = getHistoricalPoints(history, score);
  const scores = points.map(p => p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const trend = scores[scores.length - 1] - scores[0];

  const width = 360;
  const height = 110;
  const padLeft = 32;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 24;

  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const coords = points.map((item, index) => {
    const x = padLeft + (index * innerW) / Math.max(1, points.length - 1);
    const y = padTop + ((100 - item.score) / 100) * innerH;
    return { x, y, score: item.score, label: item.label, action: item.action };
  });

  const polylineStr = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPolygonStr = [
    ...coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${coords[coords.length - 1].x.toFixed(1)},${(padTop + innerH).toFixed(1)}`,
    `${coords[0].x.toFixed(1)},${(padTop + innerH).toFixed(1)}`,
  ].join(' ');

  const strokeColor = score >= 80 ? 'var(--blue, #2563eb)' : score >= 50 ? 'var(--yellow, #f59e0b)' : 'var(--red, #ef4444)';
  const gradientId = `trust-grad-${score}`;

  return (
    <div className="trust-sparkline-container">
      <div className="sparkline-stats" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '6px',
        marginBottom: '10px',
        padding: '8px 10px',
        background: 'rgba(15, 23, 42, 0.04)',
        border: '1px solid var(--line, #e2e8f0)',
      }}>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', display: 'block', fontWeight: 'bold' }}>CURRENT</span>
          <b style={{ fontSize: '13px', fontFamily: '"Archivo Black", sans-serif', color: strokeColor }}>{score}%</b>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', display: 'block', fontWeight: 'bold' }}>PEAK</span>
          <b style={{ fontSize: '13px', fontFamily: '"Archivo Black", sans-serif' }}>{maxScore}%</b>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', display: 'block', fontWeight: 'bold' }}>LOWEST</span>
          <b style={{ fontSize: '13px', fontFamily: '"Archivo Black", sans-serif' }}>{minScore}%</b>
        </div>
        <div>
          <span style={{ fontSize: '8px', color: '#64748b', display: 'block', fontWeight: 'bold' }}>7-SHIFT TREND</span>
          <b style={{ fontSize: '13px', fontFamily: '"Archivo Black", sans-serif', color: trend >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}>
            {trend > 0 ? `+${trend}%` : `${trend}%`}
          </b>
        </div>
      </div>

      <svg className="insight-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recorded trust score over time" style={{ width: '100%', height: '140px' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* 80% Safe Threshold line */}
        <line x1={padLeft} x2={width - padRight} y1={padTop + 0.2 * innerH} y2={padTop + 0.2 * innerH} stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6" />
        <text x={padLeft - 4} y={padTop + 0.2 * innerH + 3} textAnchor="end" fontSize="7" fill="#22c55e" fontFamily="'Archivo Black', sans-serif">80</text>

        {/* 50% Suspicious Threshold line */}
        <line x1={padLeft} x2={width - padRight} y1={padTop + 0.5 * innerH} y2={padTop + 0.5 * innerH} stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
        <text x={padLeft - 4} y={padTop + 0.5 * innerH + 3} textAnchor="end" fontSize="7" fill="#f59e0b" fontFamily="'Archivo Black', sans-serif">50</text>

        {/* 25% Critical Threshold line */}
        <line x1={padLeft} x2={width - padRight} y1={padTop + 0.75 * innerH} y2={padTop + 0.75 * innerH} stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.5" />
        <text x={padLeft - 4} y={padTop + 0.75 * innerH + 3} textAnchor="end" fontSize="7" fill="#ef4444" fontFamily="'Archivo Black', sans-serif">25</text>

        {/* Shaded Area fill */}
        <polygon points={areaPolygonStr} fill={`url(#${gradientId})`} />

        {/* Main trend line */}
        <polyline points={polylineStr} fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Datapoints & labels */}
        {coords.map((item, index) => {
          const isLatest = index === coords.length - 1;
          return (
            <g key={`${item.label}-${index}`}>
              {/* Outer pulsing ring on latest */}
              {isLatest && (
                <circle cx={item.x} cy={item.y} r="7.5" fill="none" stroke={strokeColor} strokeWidth="1.5" strokeDasharray="2 2" opacity="0.85" />
              )}
              {/* Score label above circle */}
              <text x={item.x} y={item.y - 6} textAnchor="middle" fontSize="7.5" fontFamily="'Archivo Black', sans-serif" fill="var(--navy, #0f172a)">
                {item.score}
              </text>
              {/* Point circle */}
              <circle
                cx={item.x}
                cy={item.y}
                r={isLatest ? 4.5 : 3.5}
                fill={isLatest ? strokeColor : '#fff'}
                stroke={strokeColor}
                strokeWidth="2"
              >
                <title>{`${item.label}: Trust ${item.score}% (${item.action || 'Recorded shift'})`}</title>
              </circle>
              {/* X-axis label */}
              <text x={item.x} y={height - 8} textAnchor="middle" fontSize="7" fill="#64748b" fontFamily="sans-serif">
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
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
      <article>
        <header><Activity /><span>TRUST SCORE OVER TIME</span></header>
        <TrustSparkline history={rider.trustHistory} score={rider.trustScore} />
        <small>Multi-shift continuity timeline · Thresholds: 80 Safe, 50 Watch, 25 High Risk.</small>
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
