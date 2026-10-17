import {
  analyzeSession,
  generateLabeledTestScenarios,
  generateRiders,
} from '../engine';
import {
  riders,
  sessions,
  initialCases,
  metrics,
  scenarios,
  evaluationSessions,
} from '../data/scenarios';

const actionLabel = {
  ALLOW: 'ALLOW',
  MONITOR: 'OBSERVE',
  REQUEST_VERIFICATION: 'STEP-UP VERIFY',
  HUMAN_REVIEW: 'HUMAN REVIEW',
};

const confidenceRisk = confidence => confidence >= 80 ? 'TRUSTED' : confidence >= 50 ? 'SUSPICIOUS' : 'HIGH RISK';
const confidenceStatus = confidence => confidence >= 80 ? 'Normal' : confidence >= 50 ? 'Observed' : 'Elevated';

function createEngineDemo() {
  const generatedRiders = generateRiders();
  const labeledScenarios = generateLabeledTestScenarios(generatedRiders);
  const labeledByName = Object.fromEntries(labeledScenarios.map((item) => [item.label, item]));
  const evaluate = (label, sessionIndex = 0, includeEarlierScenarioSessions = false) => {
    const testScenario = labeledByName[label];
    const rider = generatedRiders.find((item) => item.id === testScenario.riderId);
    const history = includeEarlierScenarioSessions
      ? [...rider.history, ...testScenario.sessions.slice(0, sessionIndex)]
      : rider.history;
    return analyzeSession(rider, testScenario.sessions[sessionIndex], history);
  };

  const normal = evaluate('normal');
  const ghostshift = evaluate('suspicious_account_handoff');
  const device = evaluate('legitimate_phone_change');
  const location = evaluate('legitimate_city_relocation');
  const gradualScenario = labeledByName.gradual_behavioral_change;
  const gradual = evaluate('gradual_behavioral_change', gradualScenario.sessions.length - 1, true);
  const limitedRider = generatedRiders[5];
  const limited = analyzeSession(limitedRider, limitedRider.history[2], limitedRider.history.slice(0, 2));
  return { generatedRiders, analyses: { normal, ghostshift, device, location, gradual, limited } };
}

function analysisSignals(analysis) {
  const signals = analysis.anomalies
    .filter((item) => item.signal !== 'dataQuality')
    .map((item) => item.explanation);
  return signals.length ? signals.slice(0, 4) : ['Behavior remains within the established baseline'];
}

function mergeEngineAssessment(visualScenario, analysis) {
  return {
    ...visualScenario,
    // The UI presents risk (higher is worse); the engine API intentionally returns trust (higher is better).
    risk: 100 - analysis.trustScore,
    signals: analysisSignals(analysis),
    intervention: actionLabel[analysis.recommendedAction],
    outcome: analysis.explanations[0],
    engineAssessment: analysis,
  };
}

export class StillYouApi {
  async getRiders() { throw new Error('FastAPI adapter not configured'); }
  async getSessions() { throw new Error('FastAPI adapter not configured'); }
  async getBaseline() { throw new Error('FastAPI adapter not configured'); }
  async getRiskAssessment() { throw new Error('FastAPI adapter not configured'); }
  async getCases() { throw new Error('FastAPI adapter not configured'); }
  async createVerification() { throw new Error('FastAPI adapter not configured'); }
  async runSimulation() { throw new Error('FastAPI adapter not configured'); }
  async evaluatePolicy() { throw new Error('FastAPI adapter not configured'); }
  connectLiveEvents() { throw new Error('WebSocket adapter not configured'); }
}

export class DeterministicDemoAdapter {
  mode = 'DETERMINISTIC ENGINE DATA';

  constructor() {
    const { generatedRiders, analyses } = createEngineDemo();
    this.generatedRiders = generatedRiders;
    this.analyses = analyses;
    this.engineScenarios = Object.fromEntries(
      Object.entries(scenarios).map(([id, visualScenario]) => [
        id,
        mergeEngineAssessment(visualScenario, analyses[id]),
      ]),
    );
    this.engineSessions = sessions.map((session) => {
      const analysis = analyses[session.scenario];
      return {
        ...session,
        risk: 100 - analysis.trustScore,
        confidence: analysis.trustScore,
        riskLevel: confidenceRisk(analysis.trustScore),
        status: confidenceStatus(analysis.trustScore),
        decision: actionLabel[analysis.recommendedAction],
        deviations: analysisSignals(analysis),
        engineAssessment: analysis,
      };
    });
    const featuredSessions = this.engineSessions.filter((session, index, all) =>
      all.findIndex(item => item.riderId === session.riderId) === index);
    const featuredRiders = featuredSessions.map((session, index) => {
      const profile = riders.find(item => item.id === session.riderId) ?? riders[index % riders.length];
      return {
        id: session.riderId,
        name: session.rider,
        city: session.city,
        device: session.device,
        identityConfidence: session.confidence,
        riskLevel: session.riskLevel,
        baselineMaturity: profile.maturity,
        currentSession: session.id,
        lastEvent: session.last,
        automatedAction: session.decision,
        verificationStatus: session.decision.includes('VERIFY') ? 'Requested' : 'Not required',
        behavioralMatch: Math.max(12, session.confidence - 6),
        anomalies: session.deviations,
        verificationHistory: profile.verification,
        baseline: profile.baseline,
        observed: profile.observed,
        confidenceTimeline: [96, Math.max(session.confidence + 18, 70), Math.max(session.confidence + 7, 48), session.confidence],
        eventHistory: [
          `Session ${session.id} authenticated`,
          session.last,
          `${session.decision} selected automatically`,
        ],
        automatedActions: [session.decision],
      };
    });
    const generatedLiveRiders = generatedRiders.slice(4, 24).map((profile, index) => {
      const current = profile.history.at(-1);
      const analysis = analyzeSession(profile, current, profile.history.slice(0, -1));
      const confidence = analysis.trustScore;
      return {
        id: profile.id,
        name: profile.name,
        city: profile.registeredCity,
        device: 'Known',
        identityConfidence: confidence,
        riskLevel: confidenceRisk(confidence),
        baselineMaturity: 'Established · 29 shifts',
        currentSession: `LIVE-${String(index + 1).padStart(3, '0')}`,
        lastEvent: 'Delivery activity matched baseline',
        automatedAction: actionLabel[analysis.recommendedAction],
        verificationStatus: 'Not required',
        behavioralMatch: Math.max(0, confidence - 2),
        anomalies: analysis.anomalies.map(item => item.explanation),
        verificationHistory: [],
        baseline: [74, 69, 78, 65, 81],
        observed: [72, 70, 77, 66, 80],
        confidenceTimeline: [96, 95, 97, confidence],
        eventHistory: ['Session authenticated', 'Baseline comparison completed', 'Session continuing normally'],
        automatedActions: [actionLabel[analysis.recommendedAction]],
      };
    });
    this.liveRiders = [...featuredRiders, ...generatedLiveRiders];
  }

  async loadSnapshot() {
    return {
      riders,
      sessions: this.engineSessions,
      cases: structuredClone(initialCases),
      metrics,
      scenarios: this.engineScenarios,
      evaluationSessions,
      detectionDataset: this.generatedRiders,
      liveRiders: this.liveRiders,
      automationLog: [
        { id: 1, time: '10:21:04', tone: 'trusted', riderId: 'RD-1010', message: 'Session authenticated automatically.' },
        { id: 2, time: '10:22:18', tone: 'trusted', riderId: 'RD-1014', message: 'Behaviour matched established baseline.' },
        { id: 3, time: '10:24:16', tone: 'watch', riderId: 'R-2187', message: 'Unfamiliar device detected; monitoring increased.' },
        { id: 4, time: '10:26:31', tone: 'risk', riderId: 'R-1042', message: 'Deviation cluster detected; verification requested.' },
      ],
    };
  }

  async runSimulation(id) { return structuredClone(this.engineScenarios[id]); }

  evaluatePolicy(threshold) {
    const flagged = evaluationSessions.filter((item) => item.score >= threshold);
    const takeovers = evaluationSessions.filter((item) => item.label === 'takeover');
    const genuine = evaluationSessions.filter((item) => item.label === 'genuine');
    const takeoverFlagged = flagged.filter((item) => item.label === 'takeover').length;
    const genuineEscalated = flagged.filter((item) => item.label === 'genuine').length;
    return {
      size: evaluationSessions.length,
      takeoverFlagged,
      takeoverMissed: takeovers.length - takeoverFlagged,
      genuineEscalated,
      verificationRequests: flagged.length,
      falsePositiveRate: genuineEscalated / genuine.length * 100,
    };
  }
}

export const api = new DeterministicDemoAdapter();
