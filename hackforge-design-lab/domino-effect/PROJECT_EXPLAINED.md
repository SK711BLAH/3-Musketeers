# StillYou? — Project Explained

## 1. What problem StillYou? solves

Delivery platforms normally verify a rider when the account is created or when the rider signs in. That proves who was present at one moment, but it does not prove that the same person continues using the account during the whole shift.

StillYou? is a hackathon prototype for continuous identity assurance. It watches consented session signals such as device familiarity, shift timing, route consistency, delivery activity, location changes and concurrent sessions. It compares the current session with that rider's behavioural baseline, adjusts an identity-confidence score, and requests verification only when the evidence becomes strong enough.

The system is designed to answer three questions:

1. Does this session still resemble the registered rider?
2. What evidence caused the system to become uncertain?
3. What proportionate action should happen next?

An anomaly is treated as evidence, not proof of fraud. Serious outcomes remain explainable and can be reviewed by a human.

## 2. How the complete system works

The implemented loop is:

`Rider action → persisted event → behavioural analysis → trust reassessment → dashboard update → verification when required → continued monitoring`

The rider signs in through the Rider Portal. The backend creates an authenticated session tied to that rider and device. Actions such as starting a shift, accepting an order, sharing location or changing device context are sent to FastAPI and written to SQLite.

Relevant security signals are evaluated by a rider-specific Isolation Forest model and by policy rules. The policy changes the rider state, records its decision, and may create an incident and verification challenge. Server-Sent Events notify the React dashboard, which refreshes its statistics, domino colours, active-rider table, activity feed and intelligence views from the same backend snapshot.

## 3. The three administrator tabs

### Live Monitor

Live Monitor is the command-centre view. It contains:

- Four live statistics: Active Riders, Average Trust Score, Elevated Risk and Pending Verifications.
- Needs Attention, which appears only for unresolved human-review cases.
- The interactive 3D Continuity Map.
- A lowest-trust-first Active Riders table.
- A single Live Activity feed containing meaningful backend events.

Clicking a rider in the table, feed or domino focuses the corresponding domino and opens the same rider profile panel.

### Intelligence Lab

Intelligence Lab explains the current automated decision for one selected rider. It shows:

- Rider name and ID.
- Identity confidence and current status.
- What the model and policy detected.
- Why the evidence was considered unusual.
- The automated action that was taken.
- A compact list of recent automation activity.

Technical data still exists in the backend, but this view deliberately presents the evidence in understandable language.

### Rider Insights

Rider Insights is the deeper individual history view. It shows actual recorded trust changes, baseline-versus-current behaviour, device and location context, deliveries, account relationships, handoff assessment and the rider-specific event timeline.

## 4. How the interactive domino grid works

`src/components/DominoGrid.jsx` chooses a representative set of up to eight riders. It intentionally includes trusted, suspicious and high-risk examples when those states exist.

Positions are generated once from a deterministic seeded function. This keeps the dominos scattered without moving them on every React render. Each card is positioned on a perspective-transformed graph-paper floor.

The colour mapping is:

- Blue: trusted or normal.
- Yellow: suspicious, observing or verification-related uncertainty.
- Red: high risk or escalated.

GSAP animates camera focus, reset and zoom transformations. Pointer handling supports dragging and zooming. Selecting a rider calculates the card's position inside the viewport, moves the scene toward that card, and then opens the rider profile.

## 5. How the Rider Portal works

The Rider Portal has Google authentication and password authentication. The local demonstration account is:

`demo@stillyou.dev` / `StillYou123!`

Passwords are stored as PBKDF2 hashes with random salts. Session tokens are random, stored as hashes in SQLite, and kept in browser `sessionStorage` on the client. A session expires after seven days or when it is revoked.

On a first login, the backend creates a rider-specific session, records the first device, starts the shift and displays `BASELINE LEARNING`. It does not copy risk, orders, device history or verification state from another rider.

The portal supports:

- Going online or offline.
- Pausing and resuming a shift with persisted pause duration.
- Accepting, declining, picking up and completing deliveries.
- Viewing the current order and its real update time.
- Browser GPS updates and accuracy.
- A clearly labelled alternate-device demo signal.
- A clearly labelled conflicting-session demo signal.
- Face and demonstration-OTP verification when requested.

## 6. What data is collected and why

The prototype stores only data needed for the demonstration workflow:

- Rider account: name, contact identifier, primary area and preferred hours.
- Authentication: password hash, salt, Google subject when used, session-token hash and expiry.
- Device context: a browser-generated device ID, label and browser profile.
- Shift activity: online status, shift start, pause duration and delivery counts.
- Delivery activity: order assignment, acceptance, pickup, decline and completion timestamps.
- Consented location: latitude, longitude, browser-reported accuracy, source and recording time.
- Behavioural features: login minute, shift duration, acceptance rate, route consistency and device familiarity.
- Automation data: evidence, model score, decisions, incidents and verification challenges.
- Verification metadata: result, method, descriptor distance and completed movement checks where applicable.

Reference photographs are private backend files. Live camera frames and face descriptors are not sent to the administrator dashboard or stored in SQLite.

## 7. How behavioural baselines are established

Each model uses five normalized features:

1. Login time within the day.
2. Shift duration.
3. Delivery acceptance rate.
4. Route consistency.
5. Whether the device is known.

Established demonstration riders have 30 seeded baseline sessions. A newly registered or Google-created rider receives a provisional synthetic baseline so the hackathon model can operate immediately, but the interface correctly labels that rider as `BASELINE LEARNING`. In a production system, those provisional rows would be replaced by verified real shifts over time.

Each rider gets a separate Isolation Forest model trained only on that rider's baseline rows. No rider inherits another rider's event or risk history.

## 8. How anomalies are detected

The Isolation Forest in `backend/main.py` evaluates the combined feature vector. It returns an anomaly decision and a decision-function score. That score is a model output, not a fraud probability.

The backend also builds understandable evidence:

- An unseen device is low-weight context.
- A shift more than 90 minutes outside the baseline adds schedule evidence.
- A route-consistency drop above 0.16 adds high-weight route evidence.
- An acceptance-rate drop above 0.12 adds high-weight activity evidence.
- An unusual multivariate combination adds supporting Isolation Forest evidence.
- An isolated schedule change receives mitigating context because it may have a legitimate explanation.

The policy considers repeated and independent evidence rather than escalating every isolated anomaly.

## 9. How trust scores are calculated

Trust is an explainable consistency score from 0 to 100. It is not a validated probability that a rider is genuine.

The current prototype rules are:

- Normal behaviour can restore up to 3 points, capped at 96.
- A device or schedule change removes 10 points and starts observation.
- A route change removes 16 points and starts observation.
- Early account-sharing evidence removes 12 points and remains under observation.
- Repeated account-sharing evidence moves the score toward the configured verification range and requests verification.
- A passed face verification can restore up to 45 points, capped at 86, but strong accumulated evidence may leave the rider under observation.
- A failed face verification sets trust to 24 and requires human review.

Policy hysteresis prevents ordinary later activity from silently clearing an unresolved verification or human-review state.

## 10. What triggers yellow versus red alerts

The default thresholds are configurable through environment variables:

- Trusted threshold: 80.
- High-risk threshold: 50.

Blue means the rider is trusted and has at least the trusted threshold. Yellow means the rider is being observed or requires verification but has not been escalated to human review. Red means the score is below the high-risk threshold or the state is `HUMAN_REVIEW`.

A red result is not created merely because a new rider has no history. New riders begin in baseline learning. Existing unresolved alerts remain attached only to their original rider.

## 11. How identity verification works

### Face verification

The browser dynamically loads `@vladmandic/face-api`. It detects a face in the registered reference photograph and the live camera, creates descriptors, and compares their Euclidean distance with a prototype threshold of 0.48.

The rider must also complete a randomized sequence containing a blink and left/right head movements. Only a descriptor match plus all movement checks reports a face pass. Capturing a photograph alone never counts as a match.

The movement sequence is a basic active check, not production-grade spoof-resistant liveness detection.

### Demonstration OTP

The backend generates a fresh six-digit code, stores only its SHA-256 hash, expires it after five minutes and limits failed attempts. The code is displayed because this is explicitly a local demo mode; no SMS or email provider is configured.

OTP demonstrates a workflow and channel possession only. If the incident has strong identity-handoff evidence, a correct OTP does not clear the face-verification requirement.

## 12. How automation works without constant human intervention

Most events are handled automatically:

1. The backend stores the action.
2. The model evaluates relevant behavioural features.
3. Policy logic decides whether to continue, observe or request verification.
4. The decision and explanation are persisted.
5. The rider and administrator screens update over SSE.
6. Successful verification reassesses the incident automatically.

Humans are brought in when a face check fails or when an unresolved case reaches human-review state. Review actions are recorded instead of silently changing the account.

## 13. Where AI/ML is actually implemented

Real machine learning is implemented with scikit-learn's `IsolationForest` in `backend/main.py`. There is one model per rider, trained on that rider's baseline vectors with 120 estimators and a fixed random seed for reproducibility.

The trust adjustments, thresholds, state transitions, verification requests and human-review escalation are rule-based policy code. This combination is intentional: the model identifies unusual patterns, while explicit policy decides what the product is allowed to do.

Face descriptor extraction and comparison are also real local model operations supplied by `@vladmandic/face-api`, though they are uncalibrated prototype biometrics.

## 14. How data travels between frontend and backend

The flow is:

1. React calls functions in `src/services/api.js`.
2. Vite proxies `/api` requests from port 5175 to FastAPI on port 8000.
3. FastAPI validates the session and writes to SQLite.
4. Relevant events run through the model and policy engine.
5. FastAPI publishes a lightweight Server-Sent Event.
6. `App.jsx` receives the notification and reloads the authoritative snapshot.
7. All views render the same rider, event, incident and statistics records.

A five-second snapshot refresh is retained as a connection fallback. Pages do not maintain separate hardcoded risk values.

## 15. Major technologies and libraries

- React: components, state and interactive views.
- Vite: local development server, production build and API proxy.
- GSAP: smooth 3D continuity-map camera movement.
- Lucide React: interface icons.
- FastAPI: authenticated backend endpoints, validation and SSE streaming.
- SQLite: durable prototype storage.
- scikit-learn: Isolation Forest anomaly detection.
- NumPy: model feature arrays.
- `@vladmandic/face-api`: browser-side face detection, landmarks and descriptors.
- Vitest: frontend detection-engine tests.
- Python `unittest`: backend integration and policy tests.

## 16. Hackathon demonstration

1. Start FastAPI on port 8000 and Vite on port 5175.
2. Show Live Monitor: four live statistics, 3D dominos, Active Riders and Live Activity.
3. Open Rider Portal and sign in with the demonstration account.
4. Explain the clean `BASELINE LEARNING` state and allow browser location.
5. Accept a delivery, confirm pickup and complete it. Return to Live Monitor to show the recorded events and counters.
6. Use Alternate Device. Explain that one unusual signal normally increases observation rather than proving fraud.
7. Use Conflicting Session. The accumulated evidence requests verification, updates the statistics and changes the rider's domino.
8. Click Verify Identity and demonstrate OTP, or upload a consenting reference image and use face verification.
9. Show the same rider in Intelligence Lab and Rider Insights to explain the evidence, decision and history.
10. If demonstrating failure, submit a failed face match and show the human-review case in Needs Attention.

## 17. Fully functional versus simulated

### Functional

- Password registration and authentication.
- Google credential verification when matching client IDs are configured.
- Hashed passwords and hashed session tokens.
- Rider-specific persistent sessions and device records.
- Shift, pause and delivery lifecycle actions.
- Consented browser geolocation with coordinates and accuracy.
- SQLite events, decisions, incidents and verification challenges.
- Isolation Forest inference.
- Real-time SSE dashboard synchronization.
- Domino focus, drag and zoom interactions.
- Local face detection, descriptor comparison and movement checks.
- Expiring, hashed OTP validation logic.

### Explicitly simulated or prototype-only

- Seeded behavioural baselines and delivery inventory.
- Alternate-device and conflicting-session demo buttons.
- OTP delivery: the code is displayed locally instead of sent through SMS or email.
- Any button labelled as a simulated verification fallback.
- The face threshold and movement check are prototype mechanisms, not certified biometric verification.

## 18. Limitations and future improvements

- Replace provisional synthetic baselines with verified production telemetry and controlled model retraining.
- Calibrate trust scores and thresholds against representative labelled data.
- Add production administrator authentication and role-based access control.
- Use a production identity-verification provider with spoof-resistant liveness detection.
- Connect OTP to an authenticated SMS or email provider.
- Add a configured reverse-geocoding service for human-readable GPS areas.
- Encrypt especially sensitive data at rest and define formal retention/deletion policies.
- Add device attestation; the current browser-generated identifier is not a hardware fingerprint.
- Add production monitoring, rate limiting, CSRF protections and stronger audit export controls.
- Validate fairness, false-positive rates and appeal procedures before real-world use.

StillYou? is a functioning hackathon prototype that demonstrates the complete continuous-assurance loop. It is not a production fraud verdict system, and its confidence score should not be treated as proof of identity or wrongdoing.
