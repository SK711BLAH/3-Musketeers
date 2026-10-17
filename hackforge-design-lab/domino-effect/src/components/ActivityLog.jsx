import { Radio } from 'lucide-react';

export default function ActivityLog({ events }) {
  return <section className="activity-log">
    <header><div><span>AUTOMATED AUDIT TRAIL / SIMULATION</span><h2>ACTIVITY LOG</h2></div><Radio /></header>
    <div className="log-stream" aria-live="polite">
      {events.slice(-8).reverse().map(event => <article className={event.tone} key={event.id}>
        <time>{event.time}</time><b>{event.riderId}</b><p>{event.message}</p>
      </article>)}
    </div>
  </section>;
}
