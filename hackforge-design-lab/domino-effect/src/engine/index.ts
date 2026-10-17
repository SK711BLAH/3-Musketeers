import type { DetectionConfig, RiderProfile, SessionAnalysis, SessionRecord } from '../types/detection';
import { detectAnomalies } from './anomalyDetector';
import { buildBehavioralFingerprint } from './baseline';
import { defaultDetectionConfig } from './config';
import { recommendAction } from './decisionEngine';
import { detectSecondSignature } from './signatureDetector';
import { calculateTrustScore } from './trustScore';

export function analyzeSession(
  rider: RiderProfile,
  session: SessionRecord,
  history: SessionRecord[],
  config: DetectionConfig = defaultDetectionConfig,
): SessionAnalysis {
  if (session.riderId !== rider.id) throw new Error('Session and rider IDs must match.');
  const riderHistory = history.filter((item) => item.riderId === rider.id);
  const fingerprint = buildBehavioralFingerprint(rider.id, riderHistory);
  const anomalyAssessment = detectAnomalies(fingerprint, session, config);
  const trust = calculateTrustScore(anomalyAssessment, config);
  const secondSignature = detectSecondSignature([...riderHistory, session], config);
  const recommendedAction = recommendAction(trust.riskLevel, secondSignature);
  const explanations = [
    trust.explanation,
    ...anomalyAssessment.explanations,
    ...(secondSignature.status === 'DETECTED' ? [secondSignature.explanation] : []),
  ];

  return {
    riderId: rider.id,
    sessionId: session.id,
    trustScore: trust.trustScore,
    riskLevel: trust.riskLevel,
    anomalies: anomalyAssessment.anomalies,
    explanations,
    secondSignature,
    recommendedAction,
    contributingSignals: trust.contributingSignals,
    timestamp: session.timestamp,
  };
}

export { buildBehavioralFingerprint } from './baseline';
export { detectAnomalies } from './anomalyDetector';
export { calculateTrustScore, riskLevelForScore } from './trustScore';
export { detectSecondSignature } from './signatureDetector';
export { recommendAction } from './decisionEngine';
export { defaultDetectionConfig } from './config';
export { generateRiders, generateHistoricalSessions, SeededRandom } from '../data/generateRiders';
export { generateLabeledTestScenarios } from '../data/generateScenarios';
export type * from '../types/detection';
