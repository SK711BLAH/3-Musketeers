# Automation Lab

Automation Lab is a local-first, frontend-focused command centre for practising smart automation projects. It provides a reusable rules engine, simulator, approval loop, activity stream, notification centre, analytics, audit log, workflow visualizer, and decision replay. All visible metrics and charts are derived from shared Zustand state; demo data is clearly simulated.

## Tech stack

React 19, Vite 7, TypeScript, Tailwind CSS, Radix/shadcn-style primitives, Lucide React, React Router, Recharts, Zustand, Motion, React Hook Form-compatible architecture, Zod, Vitest, and LocalStorage.

## Run locally

Requires Node.js 20.19+ (Node 22 recommended).

```bash
cd automation-lab
npm install
npm run dev
```

Then open the local URL printed by Vite. Validation commands:

```bash
npm run typecheck
npm test
npm run build
```

## Folder structure

```text
src/
  app/          routing and error boundary
  components/   layout and reusable UI
  data/         scenario configuration
  engine/       pure evaluator and execution trace builder
  features/     route-level feature modules
  services/     backend-ready interfaces and API config
  stores/       persistent connected application state
  styles/       design tokens and Tailwind layers
  types/        shared domain models
  utils/        formatting and UI helpers
```

## How rules work

Rules are structured JSON objects containing a trigger, AND/OR condition group, and typed action. `evaluateCondition` handles numeric comparisons, equality, contains, and booleans without `eval()`. `evaluateWorkflow` is pure and used by both preview mode and execution. `makeExecution` records the real trace. The store commits that record to executions, activity, notifications, approvals, and audit history.

Immediate identical runs are rejected for 800 ms as basic duplicate protection. Approval actions remain pending until an ADMIN or OPERATOR decides them. Frontend roles are demonstrations only; production authorization must be enforced by a backend.

## Add a scenario

1. Add a `Workflow` and defaults to `src/data/demo.ts`.
2. Use existing operators and action types, or extend the unions in `src/types/index.ts`.
3. If adding an operator, implement it once in `src/engine/evaluator.ts` and add tests.
4. The simulator, automations list, visualizer, analytics, and dashboard pick up the scenario automatically.

## Add a dashboard widget

Create a focused component in `src/components/dashboard/`. Select primitive or stable state from `useLabStore`; derive display values rather than storing duplicate metrics. Render it from `OverviewPage.tsx`.

## Connect a backend

`src/services/automationService.ts` defines the adapter contract and example `VITE_API_URL`. Implement a remote adapter, validate all responses, then inject it behind store actions. Keep optimistic UI and authorization separate: the backend must own permissions, secrets, idempotency, and durable audit records.

## Customize branding

Change the name in `index.html` and `AppShell.tsx`. Color, type, surface, and spacing tokens live in `tailwind.config.js` and `src/styles/index.css`. The temporary `AL` mark is plain text, so no asset replacement is required.

## Remove features

Delete the feature folder, remove its route from `src/app/App.tsx`, and remove its navigation tuple from `AppShell.tsx`. The pure engine and central state do not import route components, so features can be removed independently.

## Known limitations

- LocalStorage is browser-local and unsuitable for secrets or multi-user production data.
- The demo action executor changes local state; it does not contact real devices or services.
- Duplicate protection is a short client-side guard, not distributed idempotency.
- Analytics are intentionally based only on locally recorded runs.
- Role restrictions are UI demonstrations and do not provide security boundaries.
- Google Fonts are optional; system fallbacks preserve the layout when offline.

