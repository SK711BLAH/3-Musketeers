import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import Header from './components/Header';
import Metrics from './components/Metrics';
import DominoGrid from './components/DominoGrid';
import SessionTable from './components/SessionTable';
import ActivityLog from './components/ActivityLog';
import RiderPanel from './components/RiderPanel';
import IntelligenceLab from './views/IntelligenceLab';
import Investigations from './views/Investigations';
import RiderPortal from './views/RiderPortal';
import { api } from './services/api';

const riskFor = confidence => confidence >= 80 ? 'TRUSTED' : confidence >= 50 ? 'SUSPICIOUS' : 'HIGH RISK';
const now = () => new Date().toLocaleTimeString('en-GB', { hour12: false });

function LiveMonitor({ riders, events, selectedId, focusId, onFocus, onFocusComplete, onSelect, reviewCount, demo, onRun, onRestart }) {
  return <main className="overview live-monitor">
    <div className="continuity-bar"><span><i /> SYSTEM ACTIVE</span><p>Monitoring <b>→</b> Comparing <b>→</b> Evaluating <b>→</b> Responding</p></div>
    <Metrics riders={riders} actionCount={events.length} reviewCount={reviewCount} />
    <section className="demo-control">
      <div><span>END-TO-END AUTOMATION / SIMULATION</span><b>{demo.running ? `LIVE DEMO · STAGE ${demo.stage}/4` : 'READY TO DEMONSTRATE IDENTITY RECOVERY'}</b></div>
      <div><button onClick={onRun} disabled={demo.running}><Play /> {demo.running ? 'DEMO RUNNING' : 'RUN LIVE DEMO'}</button><button onClick={onRestart}><RefreshCw /> RESTART</button></div>
    </section>
    <DominoGrid riders={riders} focusId={focusId} selectedId={selectedId} onFocus={onFocus} onFocusComplete={onFocusComplete} />
    <SessionTable riders={riders} onSelect={onSelect} />
    <ActivityLog events={events} />
  </main>;
}

export default function App() {
  const [view, setView] = useState('LIVE MONITOR');
  const [riders, setRiders] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [mapFocusId, setMapFocusId] = useState(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState({ running: false, paused: false, stage: 0 });
  const timers = useRef([]);
  const eventId = useRef(100);
  const panelTimer = useRef(null);

  useEffect(() => {
    let live = true;
    api.loadSnapshot().then(data => {
      if (!live) return;
      setRiders(data.liveRiders);
      setEvents(data.automationLog);
      setSelectedId(null);
      setMapFocusId(null);
    }).catch(cause => setError(cause.message));
    return () => { live = false; timers.current.forEach(clearTimeout); clearTimeout(panelTimer.current); };
  }, []);

  const focusMapRider = id => {
    clearTimeout(panelTimer.current);
    if (selectedId) {
      setPanelClosing(true);
      panelTimer.current = setTimeout(() => setSelectedId(null), 220);
    } else {
      setSelectedId(null);
    }
    setMapFocusId(id);
  };

  const revealFocusedRider = id => {
    setPanelClosing(false);
    setSelectedId(id);
  };

  const closeRiderPanel = () => {
    clearTimeout(panelTimer.current);
    setPanelClosing(true);
    panelTimer.current = setTimeout(() => {
      setSelectedId(null);
      setPanelClosing(false);
      setMapFocusId(null);
    }, 280);
  };

  const addEvent = (riderId, message, tone = 'trusted') => setEvents(items => [...items, {
    id: ++eventId.current, time: now(), riderId, message, tone,
  }]);

  const updateRider = (id, updates, event) => {
    setRiders(items => items.map(rider => rider.id !== id ? rider : {
      ...rider,
      ...updates,
      riskLevel: updates.identityConfidence == null ? rider.riskLevel : riskFor(updates.identityConfidence),
      eventHistory: event ? [...rider.eventHistory, event] : rider.eventHistory,
      confidenceTimeline: updates.identityConfidence == null ? rider.confidenceTimeline : [...rider.confidenceTimeline, updates.identityConfidence],
      automatedActions: updates.automatedAction ? [...rider.automatedActions, updates.automatedAction] : rider.automatedActions,
    }));
  };

  const clearDemo = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const scheduleDemo = (delay, action) => { timers.current.push(setTimeout(action, delay)); };
  const runDemo = () => {
    clearDemo();
    const id = 'R-1042';
    setView('LIVE MONITOR');
    focusMapRider(id);
    setDemo({ running: true, paused: false, stage: 1 });
    updateRider(id, {
      identityConfidence: 96, device: 'Known', behavioralMatch: 95, lastEvent: 'Session authenticated',
      automatedAction: 'CONTINUE', verificationStatus: 'Not required', anomalies: [], confidenceTimeline: [],
    }, 'Verified rider started the shift');
    addEvent(id, 'Verified rider started shift at 96% identity confidence.', 'trusted');
    scheduleDemo(1400, () => {
      updateRider(id, {
        identityConfidence: 72, device: 'Unknown', behavioralMatch: 84, lastEvent: 'Unfamiliar device detected',
        automatedAction: 'MONITOR', anomalies: ['Unfamiliar device detected; behaviour is still being evaluated.'],
      }, 'Unknown device lowered confidence to 72%');
      setDemo({ running: true, paused: false, stage: 2 });
      addEvent(id, 'Unfamiliar device detected; identity confidence recalculated to 72%.', 'watch');
    });
    scheduleDemo(2900, () => {
      updateRider(id, {
        identityConfidence: 38, behavioralMatch: 34, lastEvent: 'Multiple behavioural deviations detected',
        automatedAction: 'STEP-UP VERIFY', anomalies: ['Shift timing moved outside the established range.', 'Tap cadence and delivery sequence changed together.'],
      }, 'Correlated behavioural changes lowered confidence to 38%');
      setDemo({ running: true, paused: false, stage: 3 });
      addEvent(id, 'Multiple behavioural deviations detected; high-risk threshold crossed.', 'risk');
    });
    scheduleDemo(4200, () => {
      updateRider(id, { verificationStatus: 'Requested', lastEvent: 'Identity verification triggered automatically' }, 'Step-up verification initiated automatically');
      setDemo({ running: false, paused: false, stage: 4 });
      addEvent(id, 'Step-up verification initiated automatically. Open Rider Demo to complete it.', 'risk');
    });
  };

  const restartDemo = () => { clearDemo(); runDemo(); };
  const completeVerification = id => {
    updateRider(id, {
      identityConfidence: 88, device: 'Known · newly verified', behavioralMatch: 76,
      lastEvent: 'Verification successful; trust recovering', automatedAction: 'CONTINUE + MONITOR',
      verificationStatus: 'Passed · simulated', anomalies: [],
    }, 'Simulated verification passed; confidence restored to 88%');
    addEvent(id, 'Verification successful; identity confidence restored to 88%.', 'trusted');
    setDemo({ running: false, paused: false, stage: 4 });
  };

  const reviewAction = (id, action) => {
    const changes = action === 'APPROVE CONTINUATION' || action === 'DISMISS FALSE POSITIVE'
      ? { identityConfidence: 86, automatedAction: 'CONTINUE + MONITOR', verificationStatus: 'Resolved by reviewer', anomalies: [] }
      : action === 'REQUEST VERIFICATION'
        ? { automatedAction: 'STEP-UP VERIFY', verificationStatus: 'Requested', lastEvent: 'Reviewer requested another verification' }
        : { automatedAction: 'HUMAN REVIEW', verificationStatus: 'Session restricted', lastEvent: 'Session restricted by reviewer' };
    updateRider(id, changes, `Administrator action: ${action}`);
    addEvent(id, `Administrator action recorded: ${action}.`, action.includes('RESTRICT') ? 'risk' : 'watch');
  };

  const reviewCount = riders.filter(rider => rider.automatedAction === 'HUMAN REVIEW' || rider.verificationStatus === 'Failed').length;
  const selectedRider = riders.find(rider => rider.id === selectedId);
  const pendingRider = riders.find(rider => rider.verificationStatus === 'Requested') ?? selectedRider ?? riders[0];
  const content = useMemo(() => {
    if (!riders.length) return null;
    if (view === 'INTELLIGENCE LAB') return <IntelligenceLab riders={riders} selectedId={selectedId} onSelect={setSelectedId} onVerified={completeVerification} />;
    if (view === 'REVIEW QUEUE') return <Investigations riders={riders} audit={events} onAction={reviewAction} />;
    if (view === 'RIDER DEMO') return <RiderPortal rider={pendingRider} onComplete={completeVerification} onBack={() => setView('LIVE MONITOR')} />;
    return <LiveMonitor riders={riders} events={events} selectedId={selectedId} focusId={mapFocusId} onFocus={focusMapRider} onFocusComplete={revealFocusedRider} onSelect={focusMapRider} reviewCount={reviewCount} demo={demo} onRun={runDemo} onRestart={restartDemo} />;
  }, [riders, events, selectedId, mapFocusId, view, reviewCount, demo]);

  if (error) return <div className="load-state"><h1>DEMO DATA UNAVAILABLE</h1><p>{error}</p></div>;
  if (!riders.length) return <div className="load-state"><div className="loader" /><h1>ASSEMBLING STILLYOU?</h1></div>;
  return <div className="app">
    <Header view={view} onNavigate={setView} onRiderDemo={() => setView('RIDER DEMO')} mode={api.mode} />
    {content}
    {view === 'LIVE MONITOR' && selectedRider && <RiderPanel rider={selectedRider} closing={panelClosing} onClose={closeRiderPanel} />}
    <footer><span>STILLYOU? / CONTINUOUS IDENTITY</span><b>SIMULATED DATA · NO REAL BIOMETRICS</b><span>EXPLAINABLE / APPEALABLE / HUMAN REVIEW</span></footer>
  </div>;
}
