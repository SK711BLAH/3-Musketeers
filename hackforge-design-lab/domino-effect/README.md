# StillYou?

A continuous identity verification and trust automation prototype for delivery riders. All riders, sessions, cases, scenarios, scores, and policy evaluations are deterministic synthetic demo data.

```bash
npm install
npm run dev     # http://localhost:5175
npm run build
```

Explore the command center, Behavioral DNA, six Intelligence Lab scenarios including Ghostshift, the TrustBalance policy simulator, stateful investigations, and the rider portal.

## Detection engine

The reusable TypeScript engine is exported from `src/engine/index.ts`. It builds a rider-specific statistical baseline, correlates independent behavioral anomalies, calculates a dynamic 0–100 trust score, looks for a recurring second signature with deterministic two-cluster analysis, and recommends proportionate action without automatic bans.

```ts
import { analyzeSession, generateRiders } from './src/engine';

const [rider] = generateRiders();
const assessment = analyzeSession(rider, currentSession, rider.history);
```

Synthetic generation is deterministic: 50 riders × 30 historical shifts produces 1,500 sessions. Labeled scenarios are kept in the test-data layer and labels are never supplied to `analyzeSession`.

```bash
npm test
npm run typecheck
```
