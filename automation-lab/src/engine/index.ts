import type { RiderProfile, RiderSession, SessionAnalysis, TrustScoreConfig } from '../types/detection'
import { buildBehavioralFingerprint } from './baseline'
import { defaultTrustScoreConfig } from './config'
import { detectAnomalies } from './anomalyDetector'
import { detectSecondSignature } from './signatureDetector'
import { calculateTrustScore } from './trustScore'

export { buildBehavioralFingerprint, circularDifferenceMinutes } from './baseline'
export { detectAnomalies } from './anomalyDetector'
export { calculateTrustScore } from './trustScore'
export { detectSecondSignature } from './signatureDetector'
export { recommendAction } from './decisionEngine'
export { defaultTrustScoreConfig } from './config'
export type * from '../types/detection'

export function analyzeSession(
  rider: RiderProfile,
  session: RiderSession,
  history: RiderSession[] = rider.historicalSessions,
  overrides: Partial<TrustScoreConfig> = {},
): SessionAnalysis {
  const config: TrustScoreConfig = {
    ...defaultTrustScoreConfig,
    ...overrides,
    weights: { ...defaultTrustScoreConfig.weights, ...overrides.weights },
  }
  const fingerprint = buildBehavioralFingerprint(rider.riderId, history)
  const anomalyAssessment = detectAnomalies(rider, fingerprint, session, history, config)
  const trust = calculateTrustScore(anomalyAssessment, config)
  const secondSignature = detectSecondSignature([...history, session])
  const explanations = [
    ...anomalyAssessment.anomalies.map(anomaly => anomaly.explanation),
    ...(anomalyAssessment.correlationExplanation ? [anomalyAssessment.correlationExplanation] : []),
    trust.explanation,
    secondSignature.explanation,
  ]
  return {
    riderId: rider.riderId,
    sessionId: session.sessionId,
    trustScore: trust.trustScore,
    riskLevel: trust.riskLevel,
    anomalies: anomalyAssessment.anomalies,
    overallAssessment: anomalyAssessment.overall,
    independentSignalGroups: anomalyAssessment.independentSignificantGroups,
    explanations,
    secondSignature,
    recommendedAction: secondSignature.secondSignatureDetected && trust.recommendedAction === 'ALLOW' ? 'MONITOR' : trust.recommendedAction,
    timestamp: session.timestamp,
  }
}
