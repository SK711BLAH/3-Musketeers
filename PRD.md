# StillYou? Product Requirements Document

| Field | Value |
| --- | --- |
| Product | StillYou? Continuous Rider Identity Assurance |
| Tagline | Every shift leaves a signature. |
| Document status | Implemented hackathon MVP specification |
| Version | 1.0 |
| Last updated | 18 October 2026 |

## 1. Product summary

StillYou? helps a delivery platform answer a question that a one-time login cannot: **is the person continuing this shift still behaving like the verified rider?**

The product records meaningful rider and session events, compares them with an established behavioural baseline, calculates an explainable trust state, and initiates proportionate verification or human review when multiple signals indicate uncertainty. An operator sees the same state that the rider portal produces, updated live through the backend.

This PRD describes the working prototype in this repository. Requirements marked **Implemented** exist in the current code. Items under Future scope are not represented as completed functionality.

## 2. Problem statement

Delivery accounts can be shared or taken over after login. A traditional authentication check proves access at one moment but does not evaluate identity continuity throughout a shift. Platforms need a way to surface meaningful deviations without treating every harmless change as fraud, while riders need a clear and appealable verification path.

## 3. Product goals

1. Maintain one consistent rider identity and state across portal and operator views.
2. Turn real rider actions into persisted, explainable events.
3. Compare current behaviour with rider-specific baseline signals.
4. Escalate gradually: observe, request verification, then involve human review.
5. Update the command center immediately when backend state changes.
6. Clearly distinguish real model processing from simulated demo inputs.
7. Avoid fabricated activity, especially for newly registered riders.
8. Keep the demonstration understandable, responsive, and reliable.

## 4. Non-goals for the MVP

- Making autonomous accusations or irreversible fraud decisions.
- Claiming that an anomaly score is a probability of fraud.
- Production-grade biometric liveness, anti-spoofing, or identity-provider certification.
- Real SMS or email delivery for OTP codes.
- Fleet-scale deployment, multi-tenancy, or production compliance certification.
- Continuous background surveillance unrelated to explicit application events.

## 5. Users

### Operations analyst

Monitors the rider fleet, reviews elevated-risk riders, inspects evidence, requests reverification, and resolves a case after human review.

### Rider

Authenticates, starts and manages a shift, accepts and completes deliveries, shares location only with permission, and responds to a verification request.

### Hackathon evaluator

Needs to understand the complete flow quickly and distinguish functional integrations from simulated demonstration behaviour.

## 6. Core user journeys

### 6.1 Normal delivery journey

1. Rider signs in and goes online.
2. Rider accepts an available delivery.
3. Rider confirms pickup and completes delivery.
4. Each action is saved as an activity event.
5. The backend reassesses current evidence and state.
6. The Live Monitor updates through SSE.
7. The rider remains normal when evidence does not meet escalation policy.

### 6.2 Suspicious session journey

1. Rider activates an explicitly labelled alternate-device demo signal.
2. The event is persisted and scored through the normal analysis path.
3. A conflicting-session signal adds independent evidence.
4. Trust and state are reassessed; repeated or severe evidence can request verification.
5. Dashboard metrics, domino colour, Active Riders row, profile, and activity feed show the same state.

### 6.3 Verification and resolution journey

1. Rider sees a quick identity-check request in Rider Portal.
2. Rider chooses browser-based face verification or demo OTP.
3. The result is persisted and combined with accumulated behavioural evidence.
4. A pass can restore confidence; a failed face match escalates the case.
5. An operator can request verification again or resolve the incident.
6. The review action is recorded in the audit trail.

## 7. Functional requirements

### 7.1 Live Monitor — Implemented

- Preserve the StillYou? brand and three-tab admin navigation.
- Display four compact, backend-derived statistics: Active Riders, Average Trust Score, Elevated Risk, and Pending Verifications.
- Present the Continuity Map as the primary visual with a graph-paper background.
- Show a representative subset of rider dominos without deleting other rider records.
- Use stable percentage positions generated for the mounted grid, with no card overlap at supported breakpoints.
- Use blue for normal, yellow for verification/suspicious, and red for escalated/high risk.
- Focus and enlarge a clicked domino before opening its profile panel.
- Allow the panel to close and return smoothly to the complete map.
- Show unresolved human-review cases only in Needs Attention.

### 7.2 Active Riders — Implemented

- Place the section directly below the Continuity Map.
- Show active riders in ascending trust-score order by default.
- Include rider name and ID, current location, trust score and meter, last seen, and status.
- Keep status colours consistent with domino colours.
- On click, focus the corresponding domino and open the existing rider profile.
- Provide baseline, current deviation, activity, device/location, history, and verification evidence through the profile.

### 7.3 Live Activity — Implemented

- Share the row with Active Riders on wide screens and stack responsively on smaller screens.
- Display one chronological, newest-first source of meaningful backend events.
- Include rider identity, event description, relative timestamp, and severity.
- Exclude system bootstrap records, scenario-seed records, and simulated-method noise from the operator feed.
- Do not generate random feed entries when the background simulator is disabled.

### 7.4 Intelligence Lab — Implemented

- Explain the model, baseline comparison, evidence, and resulting decision in plain language.
- Make clear that anomaly scores are not fraud probabilities.
- Use the same selected rider and backend records as the Live Monitor.

### 7.5 Rider Insights — Implemented

- Let an operator inspect an individual rider.
- Show behavioural baseline versus current observations.
- Show recorded trust changes without synthesizing missing history.
- Show devices, location context, anomalies, verification status, and rider-specific activity.

### 7.6 Rider Portal — Implemented

- Require authentication before exposing shift controls.
- Support local registration and password login.
- Support Google Identity Services when both client IDs are configured.
- Provide a seeded offline demo account.
- Allow go online/offline, pause/resume, accept/decline, pickup, and delivery completion.
- Request current GPS only after browser permission and identify its source as GPS.
- Provide explicit Alternate Device and Conflicting Session demo signals.
- Never present simulated coordinates as real GPS.
- Show verification only when the shared rider state requires it.
- Avoid fabricated alerts on a new rider's first login.

### 7.7 Verification — Implemented prototype

- Keep camera access explicit and optional.
- Require a separately consented reference photograph for face comparison.
- Compare browser-side face descriptors and request blink plus randomized head movement.
- Record structured outcome metadata, not the live camera stream.
- Offer a six-digit local demonstration OTP with expiry and retry behaviour.
- Clearly label OTP as a demonstration rather than real phone ownership proof.
- Route failed face verification to human review.

### 7.8 Backend and live state — Implemented

- Persist riders, accounts, sessions, recognized devices, deliveries, events, decisions, incidents, verification challenges, and OTP challenges in SQLite.
- Treat the backend as the authoritative state source.
- Reuse the same rider ID across portal actions, analysis, dashboard, and review.
- Publish state-change notifications over SSE.
- Reconnect the frontend stream and use periodic snapshot refresh as a fallback.
- Retain existing data across normal backend restarts.

## 8. Behavioural analysis and decision policy

The implemented engine uses a seeded Isolation Forest to produce a multivariate anomaly score from session evidence. Policy rules then combine score, signal type, persistence, baseline maturity, previous state, and verification outcome.

Default state interpretation:

| State | Operator presentation | Expected action |
| --- | --- | --- |
| Trusted | Blue / Normal | Continue monitoring |
| Observing | Yellow / Verification | Gather additional evidence |
| Verification required | Yellow / Verification | Ask rider to verify |
| Human review | Red / Escalated | Operator review required |

Default trust thresholds are 80 for trusted and 50 for high risk, and are environment-configurable. State is not determined by score alone; policy and prior evidence also matter.

## 9. Data requirements

### Rider data

- Stable rider ID and display name
- Authentication account and session records
- Current trust score, state, verification status, and baseline maturity
- Device and location context
- Shift and delivery counters
- Optional private reference photograph

### Evidence and audit data

- Activity events with type, time, rider, severity, message, and structured payload
- Model and decision records with state transition and explanation
- Incident and review status
- Verification challenge, attempt count, result, method, and safe metadata
- Recent recorded trust-score history

### Data handling constraints

- Passwords must be salted and PBKDF2-hashed.
- Rider tokens must not be stored in persistent browser storage.
- Reference photographs must require an authenticated rider session.
- Browser face descriptors must not be exposed to the admin interface.
- UI copy must label demo-generated signals and codes accurately.

## 10. Non-functional requirements

### Usability

- The Live Monitor must be the first useful screen, without a large introductory hero.
- Information must remain readable on laptop and smaller layouts.
- Interactive controls must have clear labels and visible states.
- Motion must support orientation, not distract from monitoring.

### Performance

- A portal action should appear on the Live Monitor through SSE without a manual refresh.
- The grid should render a representative subset to prevent visual crowding.
- Reconnection should use bounded retry delays and a snapshot fallback.

### Reliability

- Backend state must survive process restarts through SQLite.
- Duplicate UI activity logs must not exist.
- Verification and review actions must be auditable.
- Demo mode must remain usable without Google credentials or external messaging services.

### Accessibility

- Navigation, rows, cards, modal controls, and forms must be keyboard-operable native controls where practical.
- Icons must not be the only carrier of status meaning.
- Risk colours must be paired with text labels.

## 11. Acceptance criteria

The MVP is accepted when all of the following are true:

1. A portal delivery action produces a persisted event visible in the single Live Activity feed.
2. The four Live Monitor metrics derive from the current backend snapshot.
3. Active Riders shows active riders ordered from lowest to highest trust.
4. Selecting a table row focuses its domino and opens the correct profile.
5. Device, location, delivery, verification, and review events retain the same rider identity across views.
6. An alternate-device plus conflicting-session demonstration can produce elevated risk through the normal engine.
7. A required verification is visible to both rider and operator.
8. A verification outcome changes the shared backend state and is recorded.
9. New registration does not create fabricated risk notifications.
10. Frontend type checking, unit tests, production build, and backend tests pass.

## 12. Success measures for a future pilot

The MVP does not yet collect production metrics. A controlled pilot should evaluate:

- Time from meaningful event to operator display
- Verification completion and abandonment rates
- False-positive and false-negative review rates
- Percentage of elevated cases supported by multiple independent signals
- Human-review resolution time
- Rider appeal and successful recovery rates
- Model performance segmented for device, geography, and operating conditions

These measures must be assessed with representative, consented data before production claims are made.

## 13. Current implementation boundaries

- Seeded model training data and demo signals are synthetic.
- OTP delivery is local and does not verify a real communication channel.
- Face matching and active movement checks are a browser prototype, not certified liveness.
- The app has no role-based operator authentication or production authorization layer.
- SQLite and the in-process SSE broadcaster are suitable for a demo, not horizontal scaling.
- Geolocation is only as accurate and available as the rider's browser environment.
- Policy thresholds have not been calibrated against a real fraud dataset.

## 14. Future scope

1. Calibrate the model and thresholds with consented, representative operational data.
2. Add production identity providers, SMS/email OTP, and secure account recovery.
3. Add operator authentication, roles, audit exports, retention rules, and appeal workflows.
4. Replace prototype face checks with an independently evaluated verification provider where legally appropriate.
5. Move persistence and event delivery to production-grade shared infrastructure.
6. Add drift monitoring, fairness evaluation, model version governance, and rollback controls.
7. Add privacy controls for data deletion, retention, export, and regional compliance.
8. Conduct accessibility, security, load, and adversarial testing.

## 15. Related documentation

- [README.md](./README.md) — setup, architecture, commands, and demonstration steps
- [PROJECT_EXPLAINED.md](./PROJECT_EXPLAINED.md) — complete beginner-friendly walkthrough of the implemented code
