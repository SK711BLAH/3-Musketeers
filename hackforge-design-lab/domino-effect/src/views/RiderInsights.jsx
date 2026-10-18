import { Activity, MapPin, Network, ShieldCheck, Smartphone } from 'lucide-react';
import SelectMenu from '../components/SelectMenu';

const formatMinute = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function TrustSparkline({ history, score }) {
  const points = history?.length ? history : [{ score }];
  const coords = points.map((item, index) => `${10 + index * 280 / Math.max(1, points.length - 1)},${8 + (100 - item.score) * .65}`).join(' ');
  return <svg className="insight-sparkline" viewBox="0 0 300 82" role="img" aria-label="Recorded trust score over time">
    <line x1="8" x2="292" y1="21" y2="21" /><line x1="8" x2="292" y1="53" y2="53" />
    {points.length > 1 && <polyline points={coords} />}
    {points.map((item, index) => <circle key={`${item.timestamp}-${index}`} cx={10 + index * 280 / Math.max(1, points.length - 1)} cy={8 + (100 - item.score) * .65} r="4"><title>{item.score}</title></circle>)}
  </svg>;
}

export default function RiderInsights({ riders, events, selectedId, onSelect }) {
  const rider = riders.find(item => item.id === selectedId) ?? riders[0];
  const riderEvents = events.filter(event => event.riderId === rider.id).slice().reverse();
  const baseline = rider.baselineProfile;
  const relationship = rider.relationships ?? {};
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
      <article><header><Activity /><span>TRUST SCORE OVER TIME</span></header><TrustSparkline history={rider.trustHistory} score={rider.trustScore} /><small>Recorded decisions only; not interpolated.</small></article>
      <article><header><ShieldCheck /><span>BEHAVIOURAL BASELINE</span></header><dl>
        <div><dt>USUAL START</dt><dd>{formatMinute(baseline.normalStartMinute)}</dd></div>
        <div><dt>SHIFT LENGTH</dt><dd>{baseline.shiftHours.toFixed(1)} hours</dd></div>
        <div><dt>ACCEPTANCE</dt><dd>{Math.round(baseline.acceptanceRate * 100)}%</dd></div>
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
        {['SHIFT TIMING', 'ACCEPTANCE', 'ROUTE', 'SHIFT LENGTH', 'DEVICE'].map((label, index) => <div className="divergence-row" key={label}><b>{label}</b><span><i style={{ width: `${rider.baseline[index]}%` }} /></span><span><i className="current" style={{ width: `${rider.observed[index]}%` }} /></span></div>)}
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
