import { useEffect, useState } from 'react';
import { ClipboardCheck, UserCheck } from 'lucide-react';

export default function Investigations({ riders, audit, onAction }) {
  const queue = riders.filter(rider => rider.automatedAction === 'HUMAN REVIEW' || rider.verificationStatus === 'Failed');
  const [selected, setSelected] = useState(queue[0]?.id);
  useEffect(() => { if (!queue.some(item => item.id === selected)) setSelected(queue[0]?.id); }, [queue, selected]);
  const rider = queue.find(item => item.id === selected) ?? queue[0];
  const actions = ['APPROVE CONTINUATION', 'REQUEST VERIFICATION', 'RESTRICT SESSION', 'DISMISS FALSE POSITIVE'];
  return <main className="page review-page">
    <section className="page-hero"><div><span>EXCEPTIONS ONLY / HUMAN OVERSIGHT</span><h1>REVIEW <i>QUEUE.</i></h1><p>Automation handles routine and recoverable changes. Only unresolved identity cases reach this queue.</p></div><ClipboardCheck /></section>
    <section className="queue-summary"><b>{queue.length}</b><span>CASES NEED HUMAN REVIEW</span><p>Suspicion is not proof. Every administrator decision is recorded.</p></section>
    {queue.length === 0 ? <section className="empty-queue"><UserCheck /><h2>QUEUE CLEAR</h2><p>No rider currently requires human intervention.</p></section> : <section className="review-layout">
      <div className="review-list">
        <div className="review-row head"><span>RIDER</span><span>REASON</span><span>RISK</span><span>STATUS</span></div>
        {queue.map(item => <button className={`review-row ${item.id === rider.id ? 'selected' : ''}`} onClick={() => setSelected(item.id)} key={item.id}>
          <b>{item.id}</b><span>{item.anomalies[0] ?? 'Unresolved mismatch'}</span><strong>{item.riskLevel}</strong><em>NEEDS REVIEW</em>
        </button>)}
      </div>
      <article className="review-detail">
        <span>CASE / {rider.currentSession}</span><h2>{rider.name}</h2><p>{rider.id} · {rider.city} · Confidence {rider.identityConfidence}%</p>
        <div className="review-columns"><div><h3>DETECTED ANOMALIES</h3>{rider.anomalies.map(item => <p className="finding" key={item}>{item}</p>)}</div>
          <div><h3>AUTOMATED ACTION</h3><strong>{rider.automatedAction}</strong><p>Verification: {rider.verificationStatus}</p><h3>EVENT HISTORY</h3>{rider.eventHistory.map((item, index) => <p key={`${item}-${index}`}>{item}</p>)}</div></div>
        <div className="review-actions">{actions.map(action => <button onClick={() => onAction(rider.id, action)} key={action}>{action}</button>)}</div>
        <div className="audit"><h3>COMPLETE AUDIT TRAIL</h3>{audit.filter(item => item.riderId === rider.id).map(item => <p key={item.id}>{item.time} · {item.message}</p>)}</div>
      </article>
    </section>}
  </main>;
}
