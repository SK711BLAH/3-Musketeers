import { useState } from 'react';
import { CheckCircle2, ChevronRight, FlaskConical, ShieldAlert } from 'lucide-react';

const signalLabels = ['SHIFT TIMING', 'DEVICE FAMILIARITY', 'TAP CADENCE', 'DELIVERY SEQUENCE', 'SESSION ACTIVITY'];

export default function IntelligenceLab({ riders, selectedId, onSelect, onVerified }) {
  const rider = riders.find(item => item.id === selectedId) ?? riders[0];
  const [point, setPoint] = useState(rider.confidenceTimeline.length - 1);
  const timeline = rider.confidenceTimeline;
  const points = timeline.map((value, index) => ({
    value,
    x: timeline.length === 1 ? 50 : 7 + index * (86 / (timeline.length - 1)),
    y: 92 - value * .72,
    event: rider.eventHistory[index] ?? rider.lastEvent,
  }));
  const path = points.map((item, index) => `${index ? 'L' : 'M'} ${item.x} ${item.y}`).join(' ');
  const consistency = rider.behavioralMatch;
  return <main className="page intelligence-page">
    <section className="page-hero lab-hero">
      <div><span>EXPLAINABLE IDENTITY AUTOMATION</span><h1>INTELLIGENCE <i>LAB.</i></h1><p>See why StillYou? changed an identity confidence score—and what it did next.</p></div>
      <label className="rider-selector">SELECT RIDER<select value={rider.id} onChange={event => { onSelect(event.target.value); setPoint(0); }}>{riders.map(item => <option value={item.id} key={item.id}>{item.id} / {item.name}</option>)}</select></label>
    </section>

    <section className="lab-summary">
      <div><span>RIDER</span><b>{rider.id}</b></div><div><span>IDENTITY CONFIDENCE</span><b>{rider.identityConfidence}%</b></div>
      <div><span>BASELINE</span><b>{rider.baselineMaturity}</b></div><div><span>DEVICE</span><b>{rider.device}</b></div><div><span>CLASSIFICATION</span><b>{rider.riskLevel}</b></div>
    </section>

    <section className="lab-grid">
      <article className="fingerprint-card">
        <header><span>BEHAVIOURAL FINGERPRINT</span><h2>BASELINE VS CURRENT</h2></header>
        <div className="comparison-head"><span>SIGNAL</span><span>BASELINE</span><span>CURRENT</span></div>
        {signalLabels.map((label, index) => <div className="signal-row" key={label}>
          <b>{label}</b><div><i style={{ width: `${rider.baseline[index]}%` }} /><small>{rider.baseline[index]}%</small></div>
          <div><i className="current" style={{ width: `${rider.observed[index]}%` }} /><small>{rider.observed[index]}%</small></div>
        </div>)}
        <strong className="consistency-score">BEHAVIOURAL CONSISTENCY <b>{consistency}%</b></strong>
      </article>

      <article className="insight-card">
        <FlaskConical /><span>STILLYOU? INSIGHT</span><h2>{rider.riskLevel === 'TRUSTED' ? 'CONTINUITY CONFIRMED.' : 'IDENTITY CHANGE DETECTED.'}</h2>
        <p>{rider.riskLevel === 'TRUSTED'
          ? `${rider.id} is behaving consistently with the established baseline. The session can continue without interruption.`
          : `${rider.id} is showing ${rider.anomalies.length} explainable deviation signal${rider.anomalies.length === 1 ? '' : 's'}. Identity confidence is now ${rider.identityConfidence}%.`}</p>
        <dl><div><dt>AUTOMATIC RESPONSE</dt><dd>{rider.automatedAction}</dd></div><div><dt>CURRENT STATUS</dt><dd>{rider.verificationStatus}</dd></div></dl>
        <small>Deterministic rules · No AI model or fraud probability claim</small>
      </article>
    </section>

    <section className="timeline-card">
      <header><div><span>SESSION EVENTS / TRACEABLE SCORE</span><h2>IDENTITY CONFIDENCE TIMELINE</h2></div><b>{timeline.join(' → ')}</b></header>
      <svg viewBox="0 0 100 100" role="img" aria-label="Identity confidence timeline">
        <path d={path} />
        {points.map((item, index) => <g key={index} onClick={() => setPoint(index)} role="button" tabIndex="0">
          <circle className={point === index ? 'selected' : ''} cx={item.x} cy={item.y} r="2.8" /><text x={item.x} y={item.y - 6}>{item.value}</text>
        </g>)}
      </svg>
      <div className="timeline-detail"><b>EVENT {String(point + 1).padStart(2, '0')}</b><p>{points[point]?.event}</p><strong>{point ? `${timeline[point] - timeline[point - 1]} confidence points` : 'Starting confidence'}</strong></div>
    </section>

    <section className="recovery-card">
      <div><CheckCircle2 /><span>TRUST RECOVERY</span><h2>VERIFICATION RESTORES CONFIDENCE—NOT CERTAINTY.</h2><p>A successful simulated check adds 50 points from a high-risk state, capped at 88 until subsequent behaviour confirms continuity.</p></div>
      <div className="recovery-flow"><b>96</b><ChevronRight /><b>74</b><ChevronRight /><b className="danger">38</b><ChevronRight /><b className="restored">88</b></div>
      {rider.verificationStatus === 'Requested' && <button onClick={() => onVerified(rider.id)}><ShieldAlert /> COMPLETE SIMULATED VERIFICATION</button>}
    </section>
    <section className="decision-engine-card">
      <header><span>AUTOMATED DECISION ENGINE / CONFIGURABLE PROTOTYPE POLICY</span><h2>THE SYSTEM INVESTIGATES. HUMANS INTERVENE ONLY WHEN NECESSARY.</h2></header>
      <div className="decision-bands">
        <article className="trusted"><b>80–100</b><strong>TRUSTED</strong><p>Continue the session normally.</p></article>
        <article className="watch"><b>50–79</b><strong>SUSPICIOUS</strong><p>Increase monitoring without blocking.</p></article>
        <article className="risk"><b>0–49</b><strong>HIGH RISK</strong><p>Trigger verification; review unresolved cases.</p></article>
      </div>
      <p>Current decision: <b>{rider.identityConfidence}% → {rider.automatedAction}</b>. These bands demonstrate policy mechanics and are not validated fraud probabilities.</p>
    </section>
  </main>;
}
