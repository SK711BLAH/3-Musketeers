import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bike, CalendarDays, CheckCircle2, Clock3, KeyRound, LogOut, MapPin, Navigation, PackageCheck, Pause, Play, ScanFace, ShieldAlert, ShieldCheck, Smartphone, Upload, X } from 'lucide-react';
import FaceVerification from '../components/FaceVerification';
import { api } from '../services/api';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const compressImage = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      const maxDim = 1024;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Could not parse photograph format'));
    img.src = e.target.result;
  };
  reader.onerror = () => reject(new Error('Could not read the selected photograph'));
  reader.readAsDataURL(file);
});

function GoogleButton({ onCredential, onError }) {
  const host = useRef(null);
  useEffect(() => {
    if (!googleClientId) return undefined;
    const render = () => {
      if (!window.google?.accounts?.id || !host.current) return;
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: response => onCredential(response.credential) });
      window.google.accounts.id.renderButton(host.current, { type: 'standard', theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
    };
    if (window.google?.accounts?.id) { render(); return undefined; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => onError('Google Identity Services could not load. Use the local demo login.');
    document.head.appendChild(script);
    return () => script.remove();
  }, [onCredential, onError]);
  return <div className="google-auth-button" ref={host}>{!googleClientId && <p>Google sign-in becomes active when <code>VITE_GOOGLE_CLIENT_ID</code> is configured.</p>}</div>;
}

function AuthPage({ onAuthenticated, onBack, initialError = '' }) {
  const [mode, setMode] = useState('login');
  const [identifier, setIdentifier] = useState('demo@stillyou.dev');
  const [password, setPassword] = useState('StillYou123!');
  const [registration, setRegistration] = useState({ full_name: '', contact: '', password: '', primary_area: 'Set after location permission', preferred_hours: '', photo_data: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(mode === 'login' ? await api.login(identifier, password) : await api.register(registration)); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const google = async credential => {
    setBusy(true); setError('');
    try { onAuthenticated(await api.googleLogin(credential)); }
    catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  const photo = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { const photoData = await compressImage(file); setRegistration(current => ({ ...current, photo_data: photoData })); }
    catch (cause) { setError(cause.message); }
  };

  const handleDemoLogin = async () => {
    setIdentifier('demo@stillyou.dev');
    setPassword('StillYou123!');
    setBusy(true);
    setError('');
    try {
      onAuthenticated(await api.login('demo@stillyou.dev', 'StillYou123!'));
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };

  return <main className="rider-auth-page">
    <button className="back-link" onClick={onBack}><ArrowLeft /> ADMIN DASHBOARD</button>
    <section className="rider-auth-brand">
      <span>CONTINUOUS IDENTITY ASSURANCE</span>
      <h1>STILL<i>YOU?</i></h1>
      <p>Sign in before starting your delivery shift. Identity checks appear only when the shared risk engine finds meaningful evidence.</p>
    </section>
    <section className="rider-auth-card">
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>SIGN IN</button>
        <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>REGISTER</button>
      </div>
      <div className="google-auth">
        <b>CONTINUE WITH GOOGLE</b>
        <GoogleButton onCredential={google} onError={setError} />
        <small>Google authenticates the account. Your separate registration photograph remains the identity reference.</small>
      </div>
      <div className="auth-divider"><span>OR USE RIDER CREDENTIALS</span></div>
      <form onSubmit={submit}>
        {mode === 'register' && <>
          <label>FULL NAME<input required value={registration.full_name} onChange={event => setRegistration({ ...registration, full_name: event.target.value })} /></label>
          <label>PRIMARY DELIVERY AREA<input required value={registration.primary_area} onChange={event => setRegistration({ ...registration, primary_area: event.target.value })} /></label>
          <label>PREFERRED WORKING HOURS<input value={registration.preferred_hours} onChange={event => setRegistration({ ...registration, preferred_hours: event.target.value })} /></label>
          <label className="photo-input">REFERENCE PHOTOGRAPH<input required type="file" accept="image/jpeg,image/png" onChange={photo} /><span><Upload />{registration.photo_data ? 'PHOTOGRAPH READY' : 'CHOOSE JPEG OR PNG'}</span></label>
        </>}
        <label>EMAIL, PHONE, OR RIDER ID<input required value={mode === 'login' ? identifier : registration.contact} onChange={event => mode === 'login' ? setIdentifier(event.target.value) : setRegistration({ ...registration, contact: event.target.value })} /></label>
        <label>PASSWORD<input required type="password" minLength="8" value={mode === 'login' ? password : registration.password} onChange={event => mode === 'login' ? setPassword(event.target.value) : setRegistration({ ...registration, password: event.target.value })} /></label>
        <button className="auth-submit" disabled={busy}>{busy ? 'CONNECTING…' : mode === 'login' ? 'SIGN IN TO SHIFT' : 'CREATE RIDER ACCOUNT'}</button>
      </form>
      {mode === 'login' && (
        <button type="button" className="demo-credential" onClick={handleDemoLogin} disabled={busy}>
          DEMO 1-CLICK LOGIN · demo@stillyou.dev / StillYou123!
        </button>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  </main>;
}

export default function RiderPortal({ onComplete, onRefresh, onBack }) {
  const [portal, setPortal] = useState(null);
  const [loading, setLoading] = useState(api.hasRiderSession());
  const [error, setError] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [portalLoadedAt, setPortalLoadedAt] = useState(() => Date.now());
  const [locationState, setLocationState] = useState({ status: 'idle', message: '' });
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState('face');
  const [otp, setOtp] = useState({ challengeId: '', code: '', demoCode: '', expiresAt: '', message: '' });
  const rider = portal?.rider;

  useEffect(() => {
    const expired = event => {
      setPortal(null);
      setVerificationOpen(false);
      setError(event.detail || 'Your rider session ended. Please sign in again. Your rider history is preserved.');
    };
    window.addEventListener('stillyou:session-expired', expired);
    return () => window.removeEventListener('stillyou:session-expired', expired);
  }, []);

  useEffect(() => {
    if (!api.hasRiderSession()) return;
    api.portalMe().then(setPortal).catch(cause => {
      sessionStorage.removeItem('stillyou_rider_token');
      localStorage.removeItem('stillyou_rider_token');
      setError(`${cause.message}. Please sign in again; your rider data is preserved.`);
    }).finally(() => setLoading(false));
  }, []);

  // Poll state every 3.5s so two phones stay in sync during live account-sharing demo
  useEffect(() => {
    if (!api.hasRiderSession()) return undefined;
    const pollTimer = setInterval(() => {
      api.portalMe().then(next => {
        setPortal(current => {
          if (!current) return next;
          const cRider = current.rider;
          const nRider = next.rider;
          if (
            cRider?.trustScore !== nRider?.trustScore ||
            cRider?.verificationRequired !== nRider?.verificationRequired ||
            cRider?.state !== nRider?.state ||
            cRider?.verificationStatus !== nRider?.verificationStatus ||
            current.deliveries?.length !== next.deliveries?.length
          ) {
            return next;
          }
          return current;
        });
      }).catch(() => {});
    }, 3500);
    return () => clearInterval(pollTimer);
  }, []);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => { if (referenceUrl) URL.revokeObjectURL(referenceUrl); }, [referenceUrl]);

  // Load reference photo URL whenever rider has one enrolled
  useEffect(() => {
    if (!rider?.hasReferencePhoto) return;
    api.referencePhotoUrl().then(setReferenceUrl).catch(cause => console.warn('Reference photo load:', cause.message));
  }, [rider?.hasReferencePhoto]);

  const acceptPortal = next => { setPortal(next); setPortalLoadedAt(Date.now()); return next; };

  const act = async (action, details = {}) => {
    setBusyAction(action); setError('');
    try {
      const next = await api.portalAction(action, details);
      acceptPortal(next);
      await onRefresh();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyAction('');
    }
  };

  const complete = async (id, result, details) => {
    await onComplete(id, result, details);
    acceptPortal(await api.portalMe());
    setVerificationOpen(false);
  };

  const currentOrder = rider?.currentDelivery ?? portal?.deliveries?.find(order => ['ACCEPTED', 'PICKED_UP'].includes(order.status));
  const available = portal?.deliveries?.find(order => order.status === 'AVAILABLE');

  const shiftDuration = useMemo(() => {
    if (!rider?.shiftStartedAt) return 0;
    const liveSeconds = rider.online && !rider.paused ? Math.floor((now - portalLoadedAt) / 1000) : 0;
    return Math.max(0, Math.floor(((rider.shiftElapsedSeconds ?? 0) + liveSeconds) / 60));
  }, [rider?.shiftStartedAt, rider?.shiftElapsedSeconds, rider?.online, rider?.paused, now, portalLoadedAt]);

  const sendLocation = async position => {
    const location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, source: 'GPS' };
    setLocationState({ status: 'ready', message: 'Live browser location active' });
    try { acceptPortal(await api.portalAction('UPDATE_LOCATION', { location })); await onRefresh(); }
    catch (cause) { setError(cause.message); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setLocationState({ status: 'error', message: 'Location is unavailable in this browser.' }); return; }
    setLocationState({ status: 'requesting', message: 'Requesting browser location…' });
    navigator.geolocation.getCurrentPosition(
      sendLocation,
      cause => setLocationState({ status: 'error', message: cause.code === 1 ? 'Location permission required' : `Location unavailable: ${cause.message}` }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  };

  useEffect(() => {
    if (!rider?.online || !navigator.geolocation) return undefined;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(position => {
      if (Date.now() - lastSent < 20000) return;
      lastSent = Date.now();
      sendLocation(position);
    }, cause => setLocationState({ status: 'error', message: cause.code === 1 ? 'Location permission required' : `Location unavailable: ${cause.message}` }), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [rider?.online]);

  const requestOtp = async () => {
    try {
      const result = await api.requestOtp();
      setOtp({ challengeId: result.challengeId, code: '', demoCode: result.demoCode ?? '', expiresAt: result.expiresAt, message: 'A fresh six-digit demonstration code was generated.' });
    } catch (cause) {
      setError(cause.message);
    }
  };

  const verifyOtp = async event => {
    event.preventDefault();
    try {
      const result = await api.verifyOtp(otp.challengeId, otp.code);
      acceptPortal(result);
      setOtp(current => ({ ...current, message: result.message }));
      await onRefresh();
      if (!result.rider?.verificationRequired && result.rider?.state !== 'HUMAN_REVIEW') {
        setVerificationOpen(false);
      }
    } catch (cause) {
      setOtp(current => ({ ...current, message: cause.message }));
    }
  };

  const uploadReference = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const photoData = await compressImage(file);
      await api.updateReferencePhoto(photoData);
      acceptPortal(await api.portalMe());
      const url = await api.referencePhotoUrl();
      setReferenceUrl(url);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const openVerification = method => {
    setVerificationMethod(method);
    setVerificationOpen(true);
    setError('');
  };

  const logout = async () => {
    await api.logout();
    setPortal(null);
    setReferenceUrl('');
    await onRefresh();
  };

  if (loading) return <div className="load-state"><div className="loader" /><h1>RESTORING RIDER SESSION</h1></div>;
  if (!portal) return <AuthPage initialError={error} onAuthenticated={data => { setPortal(data); setError(''); setLoading(false); onRefresh(); }} onBack={onBack} />;

  const isFailed = rider.state === 'HUMAN_REVIEW' || rider.verificationStatus === 'FAILED';
  const isRequired = rider.verificationRequired || rider.verificationStatus === 'REQUESTED';

  return <main className="page driver-portal">
    <header className="driver-topbar">
      <button className="back-link" onClick={onBack}><ArrowLeft /> ADMIN DASHBOARD</button>
      <div><span>{rider.id}</span><b>{rider.name}</b></div>
      <button onClick={logout}><LogOut /> LOG OUT</button>
    </header>

    <section className="driver-status-card">
      <div>
        <span>DELIVERY PARTNER</span>
        <h1>{rider.online ? rider.paused ? 'SHIFT PAUSED' : 'YOU’RE ONLINE' : 'READY TO RIDE?'}</h1>
        <p>{rider.baselineMaturity === 'Baseline learning' ? 'Identity monitoring is active. Your behavioural baseline is being established.' : `${rider.currentLocation} · ${rider.deviceInformation?.label}`}</p>
      </div>
      <div className={`driver-trust ${rider.baselineMaturity === 'Baseline learning' ? 'learning' : rider.riskLevel.toLowerCase().replace(' ', '-')}`}>
        <ShieldCheck />
        <span>IDENTITY ASSURANCE</span>
        <b>{rider.baselineMaturity === 'Baseline learning' ? '—' : rider.trustScore}</b>
        <strong>{rider.baselineMaturity === 'Baseline learning' ? 'BASELINE LEARNING' : rider.riskLevel}</strong>
      </div>
      <button className={rider.online ? 'offline-action' : 'online-action'} onClick={() => act(rider.online ? 'GO_OFFLINE' : 'GO_ONLINE')} disabled={Boolean(busyAction)}>
        <Bike />{rider.online ? 'GO OFFLINE' : 'GO ONLINE'}
      </button>
    </section>

    {/* Stage 3 Automatic Verification Notice on suspicious activity */}
    {(isRequired || isFailed) && (
      <section className="verification-notice" role="alert">
        <ShieldAlert />
        <div>
          <span>{isFailed ? 'IDENTITY MISMATCH ESCALATED' : 'UNUSUAL ACCOUNT ACTIVITY DETECTED'}</span>
          <h2>{isFailed ? 'Identity verification failed. Account flagged for review.' : 'Identity re-verification required across devices.'}</h2>
          <p>{isFailed ? 'The biometric scan did not match the registered identity reference. Sensitive delivery operations are restricted.' : 'Overlapping account activity or new device detected during active shift. Verify your identity to continue.'}</p>
        </div>
        <button onClick={() => openVerification('face')}>
          {isFailed ? 'RETRY FACE SCAN' : 'VERIFY WITH FACE'}
        </button>
      </section>
    )}

    {/* Identity Verification Section - Always visible and active */}
    <section className={`identity-verification-card ${isFailed ? 'failed' : isRequired ? 'required' : ''}`}>
      <header>
        <ShieldCheck />
        <div>
          <span>IDENTITY VERIFICATION</span>
          <h2>
            STATUS: {isFailed ? 'FAILED · REVIEW REQUIRED' : isRequired ? 'VERIFICATION REQUIRED' : 'VERIFIED · SAFE'}
            <span className={`identity-status-badge ${isFailed ? 'failed' : isRequired ? 'required' : 'verified'}`}>
              {isFailed ? 'FAILED' : isRequired ? 'REQUIRED' : 'VERIFIED'}
            </span>
          </h2>
        </div>
      </header>
      <p>
        {isFailed
          ? 'Biometric mismatch recorded. Trust score reduced to 35 (RED). Escalate for review or re-scan.'
          : isRequired
          ? 'Unusual account activity detected across devices. Please complete Face or OTP Verification to restore safe status.'
          : 'Identity baseline established and verified. You can test Face Verification, OTP, or update your registered photograph anytime.'}
      </p>
      <div className="identity-verification-actions">
        <button type="button" onClick={() => openVerification('face')}><ScanFace /> FACE VERIFICATION</button>
        <button type="button" onClick={() => openVerification('otp')}><KeyRound /> OTP VERIFICATION</button>
        <label>
          <input type="file" accept="image/jpeg,image/png" capture="user" onChange={uploadReference} />
          <Upload /> {rider.hasReferencePhoto ? 'UPDATE REFERENCE PHOTO' : 'ENROLL REFERENCE PHOTO'}
        </label>
      </div>
      <small>
        Face matching runs locally in your browser against your privately stored reference photo. The enrolled photograph is never exposed in localStorage.
      </small>
    </section>

    <section className="driver-grid">
      <article className="current-delivery">
        <header><PackageCheck /><span>CURRENT DELIVERY</span></header>
        {currentOrder ? <>
          <h2>{currentOrder.id}</h2>
          <div className="route"><b>{currentOrder.pickup}</b><i /><b>{currentOrder.dropoff}</b></div>
          <p>{currentOrder.distance_km} km · about {currentOrder.eta_minutes} min · {currentOrder.status}</p>
          <small>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(currentOrder.updated_at))}</small>
          {currentOrder.status === 'ACCEPTED' && (
            <button disabled={isRequired || isFailed} onClick={() => act('PICKED_UP', { order_id: currentOrder.id })}>
              CONFIRM PICKUP
            </button>
          )}
          {currentOrder.status === 'PICKED_UP' && (
            <button disabled={isRequired || isFailed} onClick={() => act('COMPLETE_DELIVERY', { order_id: currentOrder.id })}>
              COMPLETE DELIVERY
            </button>
          )}
          {(isRequired || isFailed) && (
            <small style={{ color: 'var(--red, #ef4444)', display: 'block', marginTop: '8px' }}>
              Delivery actions paused: identity verification required.
            </small>
          )}
        </> : available ? <>
          <h2>{available.id}</h2>
          <div className="route"><b>{available.pickup}</b><i /><b>{available.dropoff}</b></div>
          <p>{available.distance_km} km · about {available.eta_minutes} min</p>
          <div className="order-actions">
            <button disabled={!rider.online || rider.paused || isRequired || isFailed} onClick={() => act('ACCEPT_DELIVERY', { order_id: available.id })}>
              ACCEPT DELIVERY
            </button>
            <button onClick={() => act('DECLINE_DELIVERY', { order_id: available.id })}>DECLINE</button>
          </div>
          {(isRequired || isFailed) && (
            <small style={{ color: 'var(--red, #ef4444)', display: 'block', marginTop: '8px' }}>
              Accepting orders paused: identity verification required.
            </small>
          )}
        </> : <p>No delivery is waiting right now.</p>}
      </article>

      <article className="shift-controls">
        <header><Clock3 /><span>SHIFT CONTROLS</span></header>
        <div className="current-clock"><CalendarDays /><span>{new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' }).format(now)}</span></div>
        <div className="shift-number"><b>{shiftDuration}</b><span>MINUTES ACTIVE</span></div>
        <dl>
          <div><dt>SHIFT START</dt><dd>{rider.shiftStartedAt ? new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(rider.shiftStartedAt)) : 'NOT STARTED'}</dd></div>
          <div><dt>ACCEPTED</dt><dd>{rider.deliveriesAccepted}</dd></div>
          <div><dt>COMPLETED</dt><dd>{rider.deliveriesCompleted}</dd></div>
          <div><dt>VERIFICATION</dt><dd>{rider.verificationStatus}</dd></div>
        </dl>
        {rider.online && <button onClick={() => act(rider.paused ? 'RESUME_SHIFT' : 'PAUSE_SHIFT')}>{rider.paused ? <Play /> : <Pause />}{rider.paused ? 'RESUME SHIFT' : 'PAUSE SHIFT'}</button>}
      </article>

      <article className="session-context">
        <header><Navigation /><span>LOCATION + DEVICE</span></header>
        <div className="location-reading">
          <strong>{rider.location?.area || (rider.location?.latitude != null ? 'Current browser location' : 'Location not shared')}</strong>
          {rider.location?.latitude != null && <>
            <span>Coordinates: {Number(rider.location.latitude).toFixed(6)}, {Number(rider.location.longitude).toFixed(6)}</span>
            <span>Accuracy: ±{Math.round(rider.location.accuracy || 0)} metres</span>
          </>}
          <small>{locationState.message || 'Browser GPS is used only with your permission.'}</small>
        </div>
        <button onClick={locate}><MapPin /> {locationState.status === 'error' ? 'RETRY LOCATION' : 'UPDATE CURRENT LOCATION'}</button>
        <div className="demo-inputs">
          <span>EXPLICIT DEMO SIGNALS</span>
          <button onClick={() => act('SWITCH_DEVICE_PROFILE', { device_profile: 'alternate' })}><Smartphone /> ALTERNATE DEVICE</button>
          <button onClick={() => act('CONCURRENT_SESSION')}>CONFLICTING SESSION</button>
        </div>
        <small>Demo signals are clearly labelled. No simulated coordinates are shown as GPS.</small>
      </article>

      <article className="driver-activity">
        <header><CheckCircle2 /><span>RECENT ACTIVITY</span></header>
        {portal.activity.slice(0, 6).map(item => (
          <p key={item.id}>
            <time>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            {item.message}
          </p>
        ))}
      </article>
    </section>

    {verificationOpen && (
      <div className="verification-modal" role="dialog" aria-modal="true" aria-labelledby="verification-title">
        <section>
          <button className="modal-close" onClick={() => setVerificationOpen(false)} aria-label="Close verification"><X /></button>
          <header>
            <ShieldCheck />
            <div>
              <span>SECURE IDENTITY CHECK</span>
              <h2 id="verification-title">VERIFY IDENTITY</h2>
            </div>
          </header>
          <div className="verification-methods">
            <button className={verificationMethod === 'face' ? 'active' : ''} onClick={() => setVerificationMethod('face')}>FACE VERIFICATION</button>
            <button className={verificationMethod === 'otp' ? 'active' : ''} onClick={() => setVerificationMethod('otp')}>OTP VERIFICATION</button>
          </div>
          {verificationMethod === 'face' ? (
            rider.hasReferencePhoto ? (
              <FaceVerification rider={rider} referencePhotoUrl={referenceUrl} onComplete={complete} />
            ) : (
              <div className="enrol-within-verification">
                <Upload />
                <h3>ENROL YOUR IDENTITY REFERENCE</h3>
                <p>A reference image is required for biometric comparison. Please upload a clear photograph of yourself.</p>
                <label>
                  <input type="file" accept="image/jpeg,image/png" capture="user" onChange={uploadReference} />
                  UPLOAD REFERENCE PHOTO
                </label>
              </div>
            )
          ) : (
            <form className="otp-verification" onSubmit={verifyOtp}>
              <KeyRound />
              <h3>DEMONSTRATION OTP</h3>
              <p>Generates a verifiable one-time passcode for live channel verification.</p>
              {!otp.challengeId ? (
                <button type="button" onClick={requestOtp}>REQUEST OTP</button>
              ) : (
                <>
                  <label>
                    SIX-DIGIT CODE
                    <input
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength="6"
                      value={otp.code}
                      placeholder="Enter 6-digit code"
                      onChange={event => setOtp({ ...otp, code: event.target.value.replace(/\D/g, '') })}
                    />
                  </label>
                  {otp.demoCode && (
                    <div className="demo-code">DEMO CODE <b>{otp.demoCode}</b></div>
                  )}
                  <small>Expires {new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(new Date(otp.expiresAt))}</small>
                  <button>SUBMIT OTP</button>
                  <button type="button" className="secondary" onClick={requestOtp}>RESEND CODE</button>
                </>
              )}
              {otp.message && <p className="otp-message">{otp.message}</p>}
            </form>
          )}
        </section>
      </div>
    )}
    {error && <p className="portal-error" role="alert">{error}</p>}
  </main>;
}
