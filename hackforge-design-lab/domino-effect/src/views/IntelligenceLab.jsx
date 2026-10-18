import { useMemo } from 'react';
import { Activity, BrainCircuit } from 'lucide-react';
import SelectMenu from '../components/SelectMenu';

const statusLabel = rider => ({
  HUMAN_REVIEW: 'REVIEW REQUIRED',
  VERIFICATION_REQUIRED: 'VERIFYING',
  OBSERVING: 'OBSERVING',
  TRUSTED: 'TRUSTED',
}[rider.state] ?? rider.state);

function decisionFor(rider) {
  if (rider.state === 'HUMAN_REVIEW') return { title: 'POSSIBLE ACCOUNT SHARING', tone: 'risk', action: 'Escalate for human review.', outcome: 'Case added to Needs Attention.' };
  if (rider.handoffAssessment?.riskScore >= 50 && rider.verificationRequired) return { title: 'POSSIBLE IDENTITY HANDOFF', tone: 'risk', action: 'Request face verification.', outcome: 'Independent session, device, location, and behaviour evidence is being reassessed.' };
  if (rider.state === 'VERIFICATION_REQUIRED') return { title: 'IDENTITY UNCERTAIN', tone: 'watch', action: 'Request face verification.', outcome: 'Verification initiated automatically.' };
  if (rider.verificationStatus === 'PASSED') return { title: 'VERIFICATION CONFIRMED', tone: 'good', action: 'Resume monitored activity.', outcome: 'Verification resolved automatically; monitoring remains active.' };
  if (rider.state === 'OBSERVING') return { title: 'CHANGE UNDER OBSERVATION', tone: 'watch', action: 'Increase observation.', outcome: 'No human intervention required at this stage.' };
  return { title: 'CONTINUITY CONFIRMED', tone: 'good', action: 'Continue monitoring.', outcome: 'No intervention required.' };
}

export default function IntelligenceLab({ riders, events, selectedId, onSelect }) {
  const rider = riders.find(item => item.id === selectedId) ?? riders[0];
  const decision = decisionFor(rider);
  const detection = rider.evidence.length
    ? rider.evidence.slice(0, 3).map(item => item.change).join('. ')
    : 'Recent behaviour and device signals remain within the established rider baseline.';
  const riderEvents = useMemo(() => events.filter(event => event.riderId === rider.id).slice(-5).reverse(), [events, rider.id]);
  return <main className="page intelligence-page simplified-lab">
    <section className="lab-titlebar">
      <div><span>EXPLAINABLE IDENTITY AUTOMATION</span><h1>INTELLIGENCE <i>LAB.</i></h1></div>
      <SelectMenu label="SELECT RIDER" value={rider.id} onChange={onSelect} options={riders.map(item => ({ value: item.id, label: `${item.id} / ${item.name}` }))} />
    </section>

    <section className={`driver-intelligence ${decision.tone}`} aria-label="Driver intelligence">
      <div><span>RIDER IDENTITY</span><b>{rider.name}</b><small>{rider.id}</small></div>
      <div><span>IDENTITY CONFIDENCE</span><b>{rider.identityConfidence}% <small>CONFIDENCE</small></b></div>
      <div><span>CURRENT STATUS</span><strong>{statusLabel(rider)}</strong></div>
    </section>

    <section className={`ai-decision ${decision.tone}`}>
      <header><BrainCircuit /><div><span>AI + POLICY DECISION</span><h2>{decision.title}</h2></div></header>
      <div className="decision-explanation"><span>WHAT DID THE AI DETECT?</span><p>{detection}</p><span>WHY WAS IT SUSPICIOUS?</span><p>{rider.evidence.length ? rider.evidence.slice(0, 2).map(item => item.unusual || item.change).join(' ') : 'No meaningful deviation from this rider’s established pattern was found.'}</p></div>
      <div className="decision-result"><span>WHAT ACTION DID THE SYSTEM TAKE?</span><strong>{decision.action}</strong><p>{decision.outcome}</p>{rider.handoffAssessment && <small>HANDOFF RISK {rider.handoffAssessment.riskScore}/100 · DATA {rider.handoffAssessment.dataSufficiency}</small>}</div>
      <small>Isolation Forest supplies anomaly evidence. The policy engine executes the displayed action and records it in the audit history.</small>
    </section>

    <details className="automation-activity" open>
      <summary><Activity /><span>AUTOMATION ACTIVITY</span><small>{riderEvents.length} RECENT ACTIONS</small></summary>
      <div>{riderEvents.length ? riderEvents.map(event => {
        const simulated = event.event_key?.startsWith('scenario-') || event.event_key?.startsWith('demo-') || event.payload?.method?.startsWith('SIMULATED');
        return <article key={event.id}><time>{event.time}</time><p>{event.message}</p>{simulated && <b>SIMULATION</b>}</article>;
      }) : <p className="empty-activity">No meaningful actions recorded for this rider yet.</p>}</div>
    </details>

  </main>;
}
