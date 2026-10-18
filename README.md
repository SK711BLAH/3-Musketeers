# StillYou?

**Every shift leaves a signature.**

StillYou? is a hackathon prototype for continuous rider identity assurance. Instead of trusting a single login for an entire delivery shift, it observes meaningful session events, compares them with a rider's behavioural baseline, updates a shared trust score, and requests verification when evidence becomes concerning.

The project is intentionally transparent about its boundaries: the behavioural anomaly model is real, while some demo risk inputs and the OTP delivery channel are simulated.

## What is included

- A **Live Monitor** with four state-driven metrics, a scattered interactive domino map, an Active Riders table, and one chronological Live Activity feed.
- An **Intelligence Lab** that explains behavioural signals and model evidence.
- **Rider Insights** with rider history, baseline comparisons, deviations, devices, locations, and verification activity.
- A **Rider Portal** with password or Google authentication, shift and delivery actions, permission-based browser GPS, explicit demo risk signals, face verification, and a demo OTP fallback.
- A **FastAPI + SQLite** backend with persistent events, riders, sessions, incidents, decisions, deliveries, and verification challenges.
- A seeded **scikit-learn Isolation Forest** plus deterministic policy rules, repeated-evidence checks, and state hysteresis.
- **Server-Sent Events (SSE)** so portal actions update the admin dashboard without a page refresh.

## Product flow

```text
Rider signs in
      ↓
Rider starts a shift or performs a delivery action
      ↓
Backend records the event and session context
      ↓
Behavioural engine compares the event with the rider baseline
      ↓
Trust score and state are reassessed
      ↓
SSE updates the Live Monitor, domino, metrics, table, and feed
      ↓
Verification is requested only when policy thresholds are met
```

The main navigation contains three admin tabs—Live Monitor, Intelligence Lab, and Rider Insights—with Rider Portal available as a separate action in the header.

## Technology

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, Vite, CSS, GSAP, Lucide React |
| API | FastAPI, Uvicorn |
| Persistence | SQLite |
| Behavioural model | scikit-learn Isolation Forest |
| Live updates | Server-Sent Events |
| Face prototype | `@vladmandic/face-api`, processed in the browser |
| Authentication | PBKDF2 password hashes, bearer sessions, optional Google Identity Services |

## Project structure

```text
.
├── backend/
│   ├── main.py              # API, persistence, policy engine, auth and SSE
│   ├── requirements.txt
│   └── test_engine.py       # Backend integration and policy tests
├── public/models/           # Browser face-model assets
├── src/
│   ├── components/          # Monitor, domino map, rider panel and verification UI
│   ├── engine/              # Frontend statistical/decision helpers and tests
│   ├── services/api.js      # API client and SSE connection
│   ├── styles/              # Existing visual system and responsive layout
│   ├── views/               # Intelligence Lab, Rider Insights and Rider Portal
│   └── App.jsx              # Shared state and navigation composition
├── PRD.md                   # Product requirements and acceptance criteria
└── PROJECT_EXPLAINED.md     # Beginner-friendly implementation walkthrough
```

## Run locally

### Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer
- A modern browser; Chrome is recommended for the camera and geolocation demo

### 1. Start the backend

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The backend creates and reuses `backend/stillyou.db`.

### 2. Start the frontend

In a second terminal:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5175`. Vite proxies `/api` and `/api/stream` to the backend on port `8000`.

### Demo rider account

```text
Email:    demo@stillyou.dev
Password: StillYou123!
```

Passwords are PBKDF2-hashed in SQLite and rider bearer tokens are kept in `sessionStorage`.

## Optional Google authentication

Create a Google Web OAuth client that permits `http://127.0.0.1:5175`, then provide the same client ID to both processes:

```bash
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" \
  .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000

VITE_GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com" npm run dev
```

The backend validates the Google credential and expected audience. A Google profile image is never used as the biometric reference; riders separately consent to a JPEG or PNG reference photograph.

## Recommended hackathon demo

1. Open **Rider Portal** and sign in with the demo account.
2. Go online, allow browser location if desired, accept a delivery, confirm pickup, and complete it.
3. Return to **Live Monitor** and show the real events, metrics, rider row, and domino updating from the shared backend state.
4. In Rider Portal, activate **Alternate Device** and then **Conflicting Session**. Both controls are explicitly labelled demo signals and use the normal event-analysis pipeline.
5. Show the rider moving into suspicious or verification-required state across the monitor and profile.
6. Complete face verification with a consenting reference photo, or use the clearly labelled demonstration OTP.
7. If a verification fails, show the human-review item under **Needs Attention** and resolve or request verification again.

New rider accounts begin in baseline-learning mode. The system does not invent warnings or activity on a new rider's first login.

## State and risk conventions

- **Blue / Normal:** trusted state with no active elevated-risk requirement.
- **Yellow / Verification:** observing or verification-required state.
- **Red / Escalated:** high-risk state awaiting human review.

Default thresholds are configurable:

```text
STILLYOU_TRUSTED_THRESHOLD=80
STILLYOU_HIGH_RISK_THRESHOLD=50
STILLYOU_DEMO_MODE=1
STILLYOU_BACKGROUND_SIMULATOR=0
```

The background simulator is disabled by default so the feed reflects rider interactions, verification outcomes, and review actions instead of random notifications.

## Verification and privacy notes

- Camera access and location access are optional and browser-permission gated.
- Face descriptors remain in the active browser tab; they are not sent to the admin dashboard.
- The backend stores the verification result and limited structured metadata, not the live camera stream.
- Reference photographs are served only to the authenticated rider session.
- Blink and head-turn checks demonstrate active movement; they are not production-grade liveness or spoof detection.
- Isolation Forest outputs are anomaly scores, not probabilities of fraud.

## Tests and quality checks

```bash
npm run typecheck
npm test
npm run build
.venv/bin/python -m unittest backend.test_engine -v
```

## Current limitations

- This is a single-machine prototype, not a production multi-tenant deployment.
- The face model is uncalibrated for consequential identity decisions and is not spoof-proof.
- OTP delivery is simulated locally; there is no SMS or email provider.
- Google sign-in requires developer-provided OAuth credentials and network access.
- Geolocation accuracy depends on the browser, device, permission, and environment.
- Thresholds and seeded model data are demonstration defaults and require real-world validation.

For a product-level specification, see [PRD.md](./PRD.md). For a complete beginner-friendly code and system explanation, see [PROJECT_EXPLAINED.md](./PROJECT_EXPLAINED.md).
