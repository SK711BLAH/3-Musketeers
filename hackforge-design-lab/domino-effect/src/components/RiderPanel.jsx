import { X, ShieldCheck, Smartphone, Activity } from 'lucide-react';

function TrustHistory({ history = [], current }) {
  const points = history.length ? history : [{ score: current, timestamp: new Date().toISOString() }];
  const previous = points.length > 1 ? points[points.length - 2].score : null;
  const delta = previous == null ? null : current - previous;
  const width = 330;
  const height = 112;
  const x = index => 24 + index * (width - 48) / Math.max(1, points.length - 1);
  const y = score => 10 + (100 - score) * .82;
  const polyline = points.map((item, index) => `${x(index)},${y(item.score)}`).join(' ');
  const tone = current >= 80 ? 'blue' : current >= 50 ? 'yellow' : 'red';
  const label = timestamp => new Date(timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  return <section className={`trust-history ${tone}`} aria-label="Recorded trust score history">
    <header><div><span>CURRENT TRUST</span><b>{current}</b></div><div><span>PREVIOUS</span><b>{previous ?? '—'}</b></div><strong>{delta == null ? 'FIRST RECORDED SCORE' : delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : 'NO CHANGE'}</strong></header>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trust history with ${points.length} recorded score${points.length === 1 ? '' : 's'}`}>
      <line className="threshold trusted" x1="20" x2={width - 12} y1={y(80)} y2={y(80)} />
      <line className="threshold critical" x1="20" x2={width - 12} y1={y(50)} y2={y(50)} />
      <text x="22" y={y(80) - 4}>80 / TRUSTED</text><text x="22" y={y(50) - 4}>50 / CRITICAL</text>
      {points.length > 1 && <polyline points={polyline} />}
      {points.map((item, index) => <g key={`${item.timestamp}-${index}`}><circle cx={x(index)} cy={y(item.score)} r="4"><title>{label(item.timestamp)}: {item.score}</title></circle><text className="score-label" x={x(index)} y={Math.max(9, y(item.score) - 7)} textAnchor="middle">{item.score}</text></g>)}
    </svg>
    <small>UP TO 7 ACTUAL RECORDED CHANGES · NO SYNTHETIC HISTORY</small>
  </section>;
}

export default function RiderPanel({ rider, events = [], incidents = [], onClose, closing = false }) {
  if (!rider) return null;
  const riderEvents = events.filter(event => event.riderId === rider.id).slice(-6).reverse();
  const activeIncident = incidents.find(incident => incident.rider_id === rider.id && incident.status !== 'RESOLVED');
  return <aside className={`rider-panel ${closing ? 'closing' : ''}`} aria-label={`${rider.name} identity profile`}>
    <button className="panel-close" onClick={onClose} aria-label="Close rider profile"><X /></button>
    <span>LIVE IDENTITY PROFILE / {rider.currentSession}</span>
    <h2>{rider.name}</h2>
    <p className="rider-location">{rider.id} · {rider.city}</p>
    <div className={`confidence-block ${rider.riskLevel.toLowerCase().replace(' ', '-')}`}>
      <b>{rider.identityConfidence}</b><small>% IDENTITY CONFIDENCE</small><strong>{rider.riskLevel}</strong>
    </div>
    <TrustHistory history={rider.trustHistory} current={rider.trustScore} />
    <dl className="profile-facts">
      <div><dt><Smartphone /> DEVICE STATUS</dt><dd>{rider.device}</dd></div>
      <div><dt>SHIFT STATUS</dt><dd>{rider.online ? rider.paused ? 'PAUSED' : 'ONLINE' : 'OFFLINE'}</dd></div>
      <div><dt>LOCATION</dt><dd>{rider.currentLocation} <small>usual: {rider.usualLocation}</small></dd></div>
      <div><dt><Activity /> BEHAVIOURAL MATCH</dt><dd>{rider.behavioralMatch}%</dd></div>
      <div><dt>CURRENT SESSION</dt><dd>{rider.currentSession}</dd></div>
      <div><dt>LAST EVENT</dt><dd>{rider.lastEvent}</dd></div>
      <div><dt>AUTOMATED RESPONSE</dt><dd>{rider.automatedAction}</dd></div>
      <div><dt><ShieldCheck /> VERIFICATION</dt><dd>{rider.verificationStatus}</dd></div>
      <div><dt>DELIVERIES</dt><dd>{rider.deliveriesCompleted} completed / {rider.deliveriesAccepted} accepted</dd></div>
    </dl>
    <h3>DETECTED CHANGES</h3>
    {rider.anomalies.length
      ? rider.anomalies.map(item => <p className="finding" key={item}>{item}</p>)
      : <p className="finding normal">No material deviation from the established baseline.</p>}
    <h3>INCIDENT TIMELINE {activeIncident ? `· ${activeIncident.status}` : ''}</h3>
    <ol className="profile-timeline incident-timeline">{riderEvents.length ? riderEvents.map(event => <li key={event.id}><time>{event.time}</time><span>{event.message}</span>{event.payload?.trustScore != null && <small>TRUST {event.payload.trustScore} · {event.payload.riskSeverity} · {event.payload.verificationStatus}</small>}</li>) : <li>No recorded incident activity for this rider.</li>}</ol>
    <h3>SYSTEM NOTES</h3>
    <p className="prototype-note">Related accounts: {rider.relationships?.relatedAccounts ?? 0} · Shared devices: {rider.relationships?.sharedDevices ?? 0}. Relationships are evidence for investigation, not proof.</p>
    <p className="prototype-note">Prototype confidence is a configurable consistency score, not a validated fraud probability.</p>
  </aside>;
}
