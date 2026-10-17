import type {
  Anomaly,
  AnomalyAssessment,
  BehavioralFingerprint,
  DetectionConfig,
  NumericBaseline,
  SessionRecord,
  Severity,
  Signal,
} from '../types/detection';
import { defaultDetectionConfig } from './config';
import { circularDifferenceMinutes } from './statistics';

const minimumSpread: Record<Exclude<Signal, 'device' | 'location' | 'dataQuality' | 'multiSignal'>, number> = {
  loginTime: 20,
  deliveryDuration: 2,
  acceptanceRate: 0.035,
  breakDuration: 2,
  shiftDuration: 0.4,
};

function deviation(value: number, baseline: NumericBaseline, floor: number): number {
  return Math.abs(value - baseline.median) / Math.max(baseline.robustSpread, floor);
}

function severityFor(score: number, config: DetectionConfig): Severity {
  return score >= config.zScoreHigh ? 'high' : score >= config.zScoreMedium ? 'medium' : 'low';
}

function numericalAnomaly(
  signal: Exclude<Signal, 'device' | 'location' | 'dataQuality' | 'multiSignal'>,
  category: Anomaly['category'],
  score: number,
  description: string,
  config: DetectionConfig,
): Anomaly | undefined {
  if (score < config.zScoreMedium) return undefined;
  return {
    signal,
    category,
    severity: severityFor(score, config),
    deviation: score,
    explanation: `${description} (${score.toFixed(1)} robust deviations from this rider's baseline).`,
  };
}

export function detectAnomalies(
  fingerprint: BehavioralFingerprint,
  session: SessionRecord,
  config: DetectionConfig = defaultDetectionConfig,
): AnomalyAssessment {
  if (fingerprint.sampleSize < config.minimumBaselineSessions) {
    const explanation = `Only ${fingerprint.sampleSize} historical sessions are available; the baseline is inconclusive.`;
    return {
      anomalies: [{ signal: 'dataQuality', category: 'quality', severity: 'medium', deviation: 1, explanation }],
      overall: 'uncertain',
      independentDeviationCount: 0,
      explanations: [explanation],
    };
  }

  const anomalies: Anomaly[] = [];
  const loginDeviation = circularDifferenceMinutes(session.loginMinute, fingerprint.loginTime.median)
    / Math.max(fingerprint.loginTime.robustSpread, minimumSpread.loginTime);
  const candidates = [
    numericalAnomaly('loginTime', 'schedule', loginDeviation, 'Login time is unusually different', config),
    numericalAnomaly(
      'deliveryDuration',
      'pace',
      deviation(session.averageDeliveryMinutes, fingerprint.deliveryDuration, minimumSpread.deliveryDuration),
      'Delivery duration is unusually different',
      config,
    ),
    numericalAnomaly(
      'acceptanceRate',
      'engagement',
      deviation(session.acceptanceRate, fingerprint.acceptanceRate, minimumSpread.acceptanceRate),
      'Order acceptance behavior is unusually different',
      config,
    ),
    numericalAnomaly(
      'breakDuration',
      'pace',
      deviation(session.averageBreakMinutes, fingerprint.breakDuration, minimumSpread.breakDuration),
      'Break duration is unusually different',
      config,
    ),
    numericalAnomaly(
      'shiftDuration',
      'schedule',
      deviation(session.shiftDurationHours, fingerprint.shiftDuration, minimumSpread.shiftDuration),
      'Shift duration is unusually different',
      config,
    ),
  ];
  anomalies.push(...candidates.filter((item): item is Anomaly => Boolean(item)));

  if (!fingerprint.deviceFrequencies[session.deviceId]) {
    anomalies.push({
      signal: 'device',
      category: 'context',
      severity: 'low',
      deviation: 1,
      explanation: 'A previously unseen device was used; this is context, not identity proof.',
    });
  }
  const cityChanged = !fingerprint.cityFrequencies[session.city];
  const zoneChanged = !fingerprint.zoneFrequencies[session.zone];
  if (cityChanged || zoneChanged) {
    anomalies.push({
      signal: 'location',
      category: 'context',
      severity: 'low',
      deviation: cityChanged ? 1 : 0.6,
      explanation: cityChanged
        ? 'The city is new for this account; relocation is possible and behavior must provide the stronger evidence.'
        : 'The delivery zone is new, but remains within a previously observed city.',
    });
  }

  // Count distinct behavioral families so related timing or pace alerts do not masquerade as independent proof.
  const behavioralCategories = new Set(
    anomalies.filter((item) => item.category !== 'context').map((item) => item.category),
  );
  const independentDeviationCount = behavioralCategories.size;
  if (independentDeviationCount >= 2) {
    const severity: Severity = independentDeviationCount >= 3 ? 'high' : 'medium';
    anomalies.push({
      signal: 'multiSignal',
      category: 'correlation',
      severity,
      deviation: independentDeviationCount,
      explanation: `${independentDeviationCount} independent behavioral families changed together; correlated alerts were counted only once.`,
    });
  }

  const highCount = anomalies.filter((item) => item.severity === 'high' && item.category !== 'context').length;
  const overall = independentDeviationCount >= 3 && highCount >= 2
    ? 'highly_unusual'
    : independentDeviationCount >= 2 || highCount > 0
      ? 'unusual'
      : 'consistent';
  return { anomalies, overall, independentDeviationCount, explanations: anomalies.map((item) => item.explanation) };
}
