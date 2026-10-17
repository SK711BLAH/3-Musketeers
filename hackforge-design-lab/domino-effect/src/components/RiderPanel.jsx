import { X, ShieldCheck, Smartphone, Activity } from 'lucide-react';

export default function RiderPanel({ rider, onClose, closing = false }) {
  if (!rider) return null;
  return <aside className={`rider-panel ${closing ? 'closing' : ''}`} aria-label={`${rider.name} identity profile`}>
    <button className="panel-close" onClick={onClose} aria-label="Close rider profile"><X /></button>
    <span>LIVE IDENTITY PROFILE / {rider.currentSession}</span>
    <h2>{rider.name}</h2>
    <p className="rider-location">{rider.id} · {rider.city}</p>
    <div className={`confidence-block ${rider.riskLevel.toLowerCase().replace(' ', '-')}`}>
      <b>{rider.identityConfidence}</b><small>% IDENTITY CONFIDENCE</small><strong>{rider.riskLevel}</strong>
    </div>
    <dl className="profile-facts">
      <div><dt><Smartphone /> DEVICE STATUS</dt><dd>{rider.device}</dd></div>
      <div><dt><Activity /> BEHAVIOURAL MATCH</dt><dd>{rider.behavioralMatch}%</dd></div>
      <div><dt>CURRENT SESSION</dt><dd>{rider.currentSession}</dd></div>
      <div><dt>LAST EVENT</dt><dd>{rider.lastEvent}</dd></div>
      <div><dt>AUTOMATED RESPONSE</dt><dd>{rider.automatedAction}</dd></div>
      <div><dt><ShieldCheck /> VERIFICATION</dt><dd>{rider.verificationStatus}</dd></div>
    </dl>
    <h3>DETECTED CHANGES</h3>
    {rider.anomalies.length
      ? rider.anomalies.map(item => <p className="finding" key={item}>{item}</p>)
      : <p className="finding normal">No material deviation from the established baseline.</p>}
    <h3>RECENT TIMELINE</h3>
    <ol className="profile-timeline">{rider.eventHistory.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}</ol>
    <h3>SYSTEM NOTES</h3>
    <p className="prototype-note">Prototype confidence is a configurable consistency score, not a validated fraud probability.</p>
  </aside>;
}
