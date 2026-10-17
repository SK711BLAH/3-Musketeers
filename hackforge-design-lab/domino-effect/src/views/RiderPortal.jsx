import { useState } from 'react';
import { ArrowLeft, Bike, CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';

export default function RiderPortal({ rider, onComplete, onBack }) {
  const [progress, setProgress] = useState(0);
  const pending = rider?.verificationStatus === 'Requested';
  const complete = () => {
    setProgress(2);
    onComplete(rider.id);
  };
  return <main className="page rider-experience">
    <button className="back-link" onClick={onBack}><ArrowLeft /> BACK TO LIVE MONITOR</button>
    <section className="rider-welcome">
      <div><span>RIDER EXPERIENCE / SIMULATED VERIFICATION</span><h1>SAME ACCOUNT.<br/>SAME RIDER.<br/><i>STILL YOU?</i></h1><p>Security steps appear only when a meaningful identity change needs resolution.</p></div>
      <div className={`security-stamp ${pending ? 'pending' : ''}`}><ShieldCheck /><b>SHIFT STATUS</b><strong>{pending ? 'CHECK NEEDED' : 'READY'}</strong><span>{pending ? 'Verification requested' : 'Session can continue'}</span></div>
    </section>
    <section className="rider-verification-card">
      <header><Smartphone /><div><span>IDENTITY CHECK / DEMO ONLY</span><h2>{pending ? 'CONFIRM IT’S YOU' : 'NO INTERRUPTION NEEDED'}</h2></div></header>
      <p>{pending ? `StillYou? detected a significant change on ${rider.id}. Complete this simulated check to continue the shift.` : 'Your current activity is consistent. You do not need to complete a check.'}</p>
      {pending && <div className="verification-steps">
        <button className={progress >= 1 ? 'complete' : ''} onClick={() => setProgress(1)}><Bike /><b>1. REVIEW REQUEST</b><span>See why the check was requested</span></button>
        <button disabled={progress < 1} className={progress >= 2 ? 'complete' : ''} onClick={complete}><CheckCircle2 /><b>2. COMPLETE SIMULATED CHECK</b><span>No real biometric matching is performed</span></button>
      </div>}
      {progress === 2 && <div className="verification-success"><CheckCircle2 /><div><b>VERIFICATION SUCCESSFUL</b><p>Identity confidence restored to 88%. The shift may continue while behaviour is monitored.</p></div></div>}
    </section>
    <p className="prototype-note">This prototype simulates a verification outcome. It does not access a camera or perform biometric identity matching.</p>
  </main>;
}
