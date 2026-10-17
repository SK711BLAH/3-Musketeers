import type { AnomalyAssessment, RiskLevel, TrustAssessment, TrustScoreConfig } from '../types/detection'
import { defaultTrustScoreConfig } from './config'
import { recommendAction } from './decisionEngine'

const riskFor = (score: number, config: TrustScoreConfig): RiskLevel => {
  if (score >= config.trustedThreshold) return 'TRUSTED'
  if (score >= config.monitorThreshold) return 'MONITOR'
  if (score >= config.verifyThreshold) return 'VERIFY'
  return 'REVIEW'
}

export function calculateTrustScore(
  assessment: AnomalyAssessment,
  config: TrustScoreConfig = defaultTrustScoreConfig,
): TrustAssessment {
  if (assessment.overall === 'insufficient_data') {
    return {
      trustScore: config.insufficientDataScore,
      riskLevel: 'MONITOR',
      contributingSignals: [],
      explanation: 'There is not enough history for a reliable behavioral comparison. Continue monitoring without assuming misuse.',
      recommendedAction: 'MONITOR',
    }
  }

  const strongestByGroup = new Map<string, number>()
  for (const anomaly of assessment.anomalies) {
    strongestByGroup.set(anomaly.group, Math.max(strongestByGroup.get(anomaly.group) ?? 0, anomaly.strength))
  }
  let deduction = [...strongestByGroup.entries()].reduce(
    (sum, [group, strength]) => sum + config.weights[group as keyof typeof config.weights] * strength,
    0,
  )
  const independentCount = assessment.independentSignificantGroups.length
  if (independentCount >= 2) deduction += (independentCount - 1) * config.multiSignalPenalty
  const trustScore = Math.max(0, Math.min(100, Math.round(100 - deduction)))
  const riskLevel = riskFor(trustScore, config)
  const explanation = assessment.anomalies.length === 0
    ? 'Current behavior is consistent with the rider’s established fingerprint.'
    : `${assessment.anomalies.length} change${assessment.anomalies.length === 1 ? '' : 's'} detected. ${assessment.correlationExplanation ?? 'No strong multi-signal correlation was found.'}`
  return {
    trustScore,
    riskLevel,
    contributingSignals: assessment.anomalies,
    explanation,
    recommendedAction: recommendAction(riskLevel, assessment),
  }
}
