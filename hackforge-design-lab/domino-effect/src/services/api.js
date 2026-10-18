const getToken = () => localStorage.getItem('stillyou_rider_token') || sessionStorage.getItem('stillyou_rider_token');
const setToken = token => {
  if (token) {
    try { localStorage.setItem('stillyou_rider_token', token); } catch {}
    try { sessionStorage.setItem('stillyou_rider_token', token); } catch {}
  }
};
const clearToken = () => {
  try { localStorage.removeItem('stillyou_rider_token'); } catch {}
  try { sessionStorage.removeItem('stillyou_rider_token'); } catch {}
};

const request = async (path, options = {}) => {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 401 && token) {
      if (path === '/auth/logout') {
        clearToken();
      } else if (path !== '/portal/me' && path !== '/snapshot') {
        console.warn('Received 401 on API request:', path, detail.detail);
      }
    }
    throw new Error(detail.detail ?? `Backend request failed (${response.status})`);
  }
  return response.json();
};

const activityEvent = event => ({
  ...event,
  time: new Date(event.created_at).toLocaleTimeString('en-GB', { hour12: false }),
  riderId: event.rider_id,
  incidentId: event.incident_id,
});

class LiveBackendApi {
  mode = 'LIVE FASTAPI · SQLITE · ISOLATION FOREST';

  async loadSnapshot() {
    const data = await request('/snapshot');
    return {
      liveRiders: data.riders,
      automationLog: data.events.slice().reverse().map(activityEvent),
      incidents: data.incidents,
      stats: data.stats,
      modelVersion: data.modelVersion,
    };
  }

  connectLiveEvents(onUpdate, onStatus) {
    let source;
    let retryTimer;
    let failures = 0;
    let disposed = false;

    const open = () => {
      if (disposed) return;
      source = new EventSource('/api/stream');
      source.addEventListener('connected', () => {
        failures = 0;
        onStatus('CONNECTED');
      });
      source.addEventListener('update', event => {
        failures = 0;
        onStatus('CONNECTED');
        onUpdate(JSON.parse(event.data));
      });
      source.onerror = () => {
        source.close();
        failures += 1;
        onStatus(failures >= 3 ? 'OFFLINE' : 'RECONNECTING');
        retryTimer = window.setTimeout(open, Math.min(5000, 900 * failures));
      };
    };

    open();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      source?.close();
    };
  }

  runScenario(scenario, riderId) {
    return request('/scenarios/run', { method: 'POST', body: JSON.stringify({ scenario, rider_id: riderId }) });
  }

  startDemo() { return request('/demo/start', { method: 'POST' }); }
  resetDemo() { return request('/demo/reset', { method: 'POST' }); }
  completeVerification(identifier, result = 'PASSED', details = {}) {
    return request(`/verification/${identifier}/complete`, { method: 'POST', body: JSON.stringify({ result, source: details.source ?? 'SIMULATED', metadata: details.metadata ?? {} }) });
  }
  reviewIncident(id, action) {
    return request(`/incidents/${id}/review`, { method: 'POST', body: JSON.stringify({ action: action.replaceAll(' ', '_') }) });
  }

  deviceContext(profile = 'recognised') {
    const key = `stillyou_device_${profile}`;
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
      deviceId = `${profile}-${crypto.randomUUID()}`;
      localStorage.setItem(key, deviceId);
    }
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    return {
      device_id: deviceId,
      label: profile === 'alternate' ? 'Demo alternate browser' : `${mobile ? 'Mobile' : 'Desktop'} browser`,
      browser_profile: `${navigator.userAgentData?.brands?.map(item => item.brand).join(', ') || navigator.userAgent.split(' ').slice(-2).join(' ')} · ${navigator.platform || 'Unknown platform'}`,
    };
  }

  rememberSession(data) {
    if (data?.token) setToken(data.token);
    return data;
  }

  login(identifier, password) {
    return request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password, device: this.deviceContext() }) }).then(data => this.rememberSession(data));
  }

  googleLogin(credential) {
    return request('/auth/google', { method: 'POST', body: JSON.stringify({ credential, device: this.deviceContext() }) }).then(data => this.rememberSession(data));
  }

  register(input) {
    return request('/auth/register', { method: 'POST', body: JSON.stringify({ ...input, device: this.deviceContext() }) }).then(data => this.rememberSession(data));
  }

  portalMe() { return request('/portal/me'); }
  portalAction(action, details = {}) { return request('/portal/action', { method: 'POST', body: JSON.stringify({ action, ...details }) }); }
  requestOtp() { return request('/portal/otp/request', { method: 'POST' }); }
  verifyOtp(challengeId, code) { return request('/portal/otp/verify', { method: 'POST', body: JSON.stringify({ challenge_id: challengeId, code }) }); }
  updateReferencePhoto(photoData) { return request('/portal/reference-photo', { method: 'POST', body: JSON.stringify({ photo_data: photoData }) }); }
  async referencePhotoUrl() {
    const token = getToken();
    const response = await fetch('/api/portal/reference-photo', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson.detail ?? 'Reference photograph unavailable');
    }
    return URL.createObjectURL(await response.blob());
  }
  async logout() {
    try { await request('/auth/logout', { method: 'POST' }); } finally { clearToken(); }
  }
  hasRiderSession() { return Boolean(getToken()); }
}

export const api = new LiveBackendApi();
