import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import Metrics from './components/Metrics';
import DominoGrid from './components/DominoGrid';
import SessionTable from './components/SessionTable';
import RiderPanel from './components/RiderPanel';
import IntelligenceLab from './views/IntelligenceLab';
import RiderPortal from './views/RiderPortal';
import RiderInsights from './views/RiderInsights';
import { api } from './services/api';

function NeedsAttention({ riders, incidents, onAction, onSelect }) {
  const queue = incidents.filter(item => item.status === 'HUMAN_REVIEW');
  if (!queue.length) return null;
  return <section className="needs-attention"><header><div><span>UNRESOLVED ONLY</span><h2>NEEDS ATTENTION</h2></div><b>{queue.length}</b></header>{queue.slice(0, 3).map(incident => {
    const rider = riders.find(item => item.id === incident.rider_id);
    return <article key={incident.id}><button onClick={() => onSelect(incident.rider_id)}><strong>{rider?.name}</strong><span>{incident.reason}</span></button><div><button onClick={() => onAction(incident.rider_id, 'REQUEST_VERIFICATION_AGAIN')}>RE-VERIFY</button><button onClick={() => onAction(incident.rider_id, 'RESOLVE_CASE')}>RESOLVE</button></div></article>;
  })}</section>;
}

function LiveMonitor({ riders, events, incidents, stats, connectionStatus, selectedId, focusId, onFocus, onFocusComplete, onSelect, onReview }) {
  return <main className="overview live-monitor">
    <Metrics stats={stats} connectionStatus={connectionStatus} />
    <NeedsAttention riders={riders} incidents={incidents} onAction={onReview} onSelect={onSelect} />
    <DominoGrid riders={riders} focusId={focusId} selectedId={selectedId} onFocus={onFocus} onFocusComplete={onFocusComplete} />
    <SessionTable riders={riders} events={events} onSelect={onSelect} />
  </main>;
}

export default function App() {
  const [view, setView] = useState('LIVE MONITOR');
  const [riders, setRiders] = useState([]);
  const [events, setEvents] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [stats, setStats] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [selectedId, setSelectedId] = useState(null);
  const [mapFocusId, setMapFocusId] = useState(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const [error, setError] = useState('');
  const panelTimer = useRef(null);
  const refreshTimer = useRef(null);

  const refresh = useCallback(async () => {
    const data = await api.loadSnapshot();
    setRiders(data.liveRiders);
    setEvents(data.automationLog);
    setIncidents(data.incidents);
    setStats(data.stats);
    setError('');
  }, []);

  useEffect(() => {
    let live = true;
    refresh().catch(cause => { if (live) { setError(cause.message); setConnectionStatus('OFFLINE'); } });
    const disconnect = api.connectLiveEvents(() => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refresh().catch(() => setConnectionStatus('RECONNECTING')), 90);
    }, status => setConnectionStatus(status));
    const healthFallback = window.setInterval(() => {
      refresh()
        .then(() => setConnectionStatus('CONNECTED'))
        .catch(() => setConnectionStatus('RECONNECTING'));
    }, 5000);
    return () => {
      live = false;
      disconnect();
      window.clearInterval(healthFallback);
      clearTimeout(panelTimer.current);
      clearTimeout(refreshTimer.current);
    };
  }, [refresh]);

  const focusMapRider = id => {
    clearTimeout(panelTimer.current);
    if (selectedId) {
      setPanelClosing(true);
      panelTimer.current = setTimeout(() => setSelectedId(null), 220);
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

  const completeVerification = async (id, result = 'PASSED', details = {}) => {
    const rider = riders.find(item => item.id === id);
    await api.completeVerification(rider?.pendingVerificationId ?? id, result, details);
    await refresh();
  };
  const reviewAction = async (riderId, action) => {
    const incident = incidents.find(item => item.rider_id === riderId && item.status === 'HUMAN_REVIEW');
    if (incident) await api.reviewIncident(incident.id, action);
    await refresh();
  };
  const selectedRider = riders.find(rider => rider.id === selectedId);
  const content = useMemo(() => {
    if (!riders.length) return null;
    if (view === 'INTELLIGENCE LAB') return <IntelligenceLab riders={riders} events={events} selectedId={selectedId} onSelect={setSelectedId} />;
    if (view === 'RIDER INSIGHTS') return <RiderInsights riders={riders} events={events} selectedId={selectedId} onSelect={setSelectedId} />;
    if (view === 'RIDER PORTAL') return <RiderPortal riders={riders} onComplete={completeVerification} onRefresh={refresh} onBack={() => setView('LIVE MONITOR')} />;
    return <LiveMonitor riders={riders} events={events} incidents={incidents} stats={stats} connectionStatus={connectionStatus} selectedId={selectedId} focusId={mapFocusId} onFocus={focusMapRider} onFocusComplete={revealFocusedRider} onSelect={focusMapRider} onReview={reviewAction} />;
  }, [riders, events, incidents, stats, connectionStatus, selectedId, mapFocusId, view]);

  if (error && !riders.length) return <div className="load-state offline"><h1>STILL ENGINE OFFLINE</h1><p>{error}</p><code>.venv/bin/uvicorn backend.main:app --port 8000</code></div>;
  if (!riders.length) return <div className="load-state"><div className="loader" /><h1>CONNECTING TO STILL ENGINE</h1></div>;
  return <div className="app">
    <Header view={view} onNavigate={setView} onRiderDemo={() => setView('RIDER PORTAL')} mode={api.mode} />
    {content}
    {view === 'LIVE MONITOR' && selectedRider && <RiderPanel rider={selectedRider} events={events} incidents={incidents} closing={panelClosing} onClose={closeRiderPanel} />}
    <footer><span>STILLYOU? / CONTINUOUS IDENTITY</span><b>SYNTHETIC BEHAVIOUR · REAL ML · OPTIONAL LOCAL FACE MATCH</b><span>EXPLAINABLE / APPEALABLE / HUMAN REVIEW</span></footer>
  </div>;
}
