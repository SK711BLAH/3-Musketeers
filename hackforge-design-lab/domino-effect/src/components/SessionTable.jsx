import { useMemo } from 'react';
import { Activity, Radio } from 'lucide-react';

const riskMeta = rider => {
  if (rider.state === 'HUMAN_REVIEW' || rider.riskLevel === 'HIGH RISK') return { label: 'ESCALATED', tone: 'risk' };
  if (rider.verificationRequired || rider.riskLevel === 'SUSPICIOUS') return { label: 'VERIFICATION', tone: 'watch' };
  return { label: 'NORMAL', tone: 'normal' };
};

const relativeTime = timestamp => {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(timestamp));
};

const eventIsMeaningful = event => event.riderId !== 'SYSTEM'
  && !event.event_key?.startsWith('scenario-')
  && !event.payload?.method?.startsWith('SIMULATED');

export default function SessionTable({ riders, events, onSelect }) {
  const activeRiders = useMemo(() => riders
    .filter(rider => rider.online)
    .sort((a, b) => a.trustScore - b.trustScore || a.name.localeCompare(b.name)), [riders]);
  const feed = useMemo(() => events.filter(eventIsMeaningful).slice(-12).reverse(), [events]);

  return <section className="dashboard-streams" aria-label="Active riders and live activity">
    <section className="active-riders-card">
      <header><div><span>LIVE IDENTITIES</span><h2>ACTIVE RIDERS</h2></div><strong>LOWEST TRUST FIRST</strong></header>
      <div className="active-riders-table">
        <div className="active-rider-row table-head"><span>RIDER</span><span>LOCATION</span><span>TRUST SCORE</span><span>LAST SEEN</span><span>STATUS</span></div>
        {activeRiders.length ? activeRiders.map(rider => {
          const status = riskMeta(rider);
          return <button className="active-rider-row" onClick={() => onSelect(rider.id)} key={rider.id}>
            <strong>{rider.name}<small>{rider.id}</small></strong>
            <span>{rider.currentLocation || rider.city}</span>
            <span className={`trust-meter ${status.tone}`}><b>{rider.trustScore}</b><i><em style={{ width: `${rider.trustScore}%` }} /></i></span>
            <time dateTime={rider.lastUpdated}>{relativeTime(rider.lastUpdated)}</time>
            <span className={`rider-status ${status.tone}`}>{status.label}</span>
          </button>;
        }) : <p className="empty-dashboard-state">No riders are currently online.</p>}
      </div>
    </section>

    <section className="live-activity-card">
      <header><div><span>BACKEND EVENTS</span><h2>LIVE ACTIVITY</h2></div><Radio /></header>
      <div className="live-event-list" aria-live="polite">
        {feed.length ? feed.map(event => <button key={event.id} className={`live-event ${event.tone}`} onClick={() => onSelect(event.riderId)}>
          <i aria-hidden="true" />
          <div><strong>{event.riderId}</strong><p>{event.message}</p></div>
          <time dateTime={event.created_at}>{relativeTime(event.created_at)}</time>
          {event.payload?.trustScore != null && <small>TRUST {event.payload.trustScore}</small>}
        </button>) : <p className="empty-dashboard-state"><Activity /> Meaningful rider activity will appear here.</p>}
      </div>
    </section>
  </section>;
}
