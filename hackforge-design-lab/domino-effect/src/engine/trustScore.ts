import type { AnomalyAssessment, DetectionConfig, RiskLevel, TrustScoreResult } from '../types/detection';
import { defaultDetectionConfig } from './config';
import { clamp } from './statistics';

const severityMultiplier = { low: 0.45, medium: 0.72, high: 1 } as const;

export function riskLevelForScore(score: number, config: DetectionConfig = defaultDetectionConfig): RiskLevel {
  if (score < config.riskThresholds.reviewBelow) return 'REVIEW';
  if (score < config.riskThresholds.verifyBelow) return 'VERIFY';
  if (score < config.riskThresholds.monitorBelow) return 'MONITOR';
  return 'TRUSTED';
}

export function calculateTrustScore(
  assessment: AnomalyAssessment,
  config: DetectionConfig = defaultDetectionConfig,
): TrustScoreResult {
  const contributingSignals = assessment.anomalies
    .filter((anomaly) => anomaly.signal !== 'dataQuality')
    .map((anomaly) => ({
      signal: anomaly.signal,
      impact: config.weights[anomaly.signal] * severityMultiplier[anomaly.severity],
      explanation: anomaly.explanation,
    }));

  // Sparse history lowers confidence and leads to monitoring, not an accusation.
  const uncertaintyAdjustment = assessment.overall === 'uncertain' ? 25 : 0;
  const totalImpact = contributingSignals.reduce((sum, signal) => sum + signal.impact, 0);
  const trustScore = Math.round(clamp(100 - totalImpact - uncertaintyAdjustment, 0, 100));
  const riskLevel = riskLevelForScore(trustScore, config);
  const explanation = assessment.overall === 'uncertain'
    ? 'Trust is provisional because there is not enough history to make a reliable behavioral comparison.'
    : contributingSignals.length
      ? `Trust decreased based on ${contributingSignals.length} observed signal${contributingSignals.length === 1 ? '' : 's'} relative to this rider's own history.`
      : 'Current behavior is consistent with the rider’s established range.';

  return { trustScore, riskLevel, contributingSignals, explanation };
}
