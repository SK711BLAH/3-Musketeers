# Hackathon adaptation guide

## The first hour after reveal

1. Translate the problem statement into **events, facts, decisions, and actions**.
2. Rename Automation Lab and update the design tokens—do not rewrite the shell.
3. Replace the three objects in `src/data/demo.ts` with domain-specific workflows.
4. Map judge-visible evidence into simulator inputs and approval evidence.
5. Keep the pure rule evaluator; add operators only when the domain genuinely needs them.
6. Decide which actions remain simulated and label them. Connect a backend through the service interface only after the full local loop works.

## Domain mappings

| Domain | Reusable trigger / rule / action | Domain-specific work |
|---|---|---|
| Healthcare | vital event → threshold/boolean checks → alert or approval | clinical thresholds, consent, medical-device integration, protected-data handling |
| Cybersecurity | auth/telemetry event → risk checks → containment approval | identity provider, threat enrichment, server authorization, tamper-proof logs |
| Smart cities | sensor event → range/status checks → warning | device protocols, geospatial context, public-infrastructure fail-safes |
| Finance | transaction event → amount/location checks → review | regulated KYC/AML logic, ledger integration, explainability review |
| Education | deadline/progress event → status checks → reminder | student information system, privacy controls, educator-defined policies |
| Industrial automation | machine telemetry → safety checks → stop/alert approval | PLC/SCADA adapters, hardware interlocks, deterministic safety validation |

## What stays reusable

- Responsive command shell, theme, search, notifications, and role display
- Typed workflow, condition, execution, trace, approval, activity, and audit models
- Pure condition evaluator and AND/OR composition
- Simulator preview/execute split
- Decision replay controls and workflow visualizer
- Analytics, filtering, pagination, CSV export, empty states, and confirmation patterns
- Local adapter contract, error boundary, LocalStorage persistence, and tests

## What must become domain-specific

- Event schemas and validation
- Legal or safety policies
- Real action adapters and retry behavior
- Backend identity, roles, authorization, secrets, durable storage, and idempotency
- Verified thresholds, measured comparison timings, and domain language
- Any claim shown to judges as factual evidence

## Demo narrative

Use one end-to-end story: adjust an input in Preview, explain why the condition changed, switch to Execute, show the activity and notification update, decide an approval if created, then open Decision Replay and Audit Logs. This proves the features are connected rather than a collection of static screens.

## Backend checklist

Implement the `AutomationService` interface, validate payloads with shared schemas, and make the server authoritative for role checks, approval transitions, idempotency keys, timestamps, and audit append operations. Never move API secrets into Vite environment variables: browser-delivered variables are public.
