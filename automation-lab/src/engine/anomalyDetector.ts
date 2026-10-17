import type {
  AnomalyAssessment,
  AnomalySeverity,
  AnomalySignal,
  BehavioralFingerprint,
  DetectedAnomaly,
  NumericBaseline,
  RiderProfile,
  RiderSession,
  SignalGroup,
  TrustScoreConfig,
} from '../types/detection'
import { circularDifferenceMinutes } from './baseline'
import { defaultTrustScoreConfig } from './config'

type NumericDefinition = {
  signal: AnomalySignal
  group: SignalGroup
  label: string
  value: (session: RiderSession) => number
  baseline: (fingerprint: BehavioralFingerprint) => NumericBaseline
  floor: number
  format: (value: number) => string
  circular?: boolean
}

const numericSignals: NumericDefinition[] = [
  { signal: 'login_time', group: 'schedule', label: 'Login time', value: s => s.loginTimeMinutes, baseline: f => f.loginTime, floor: 35, format: formatTime, circular: true },
  { signal: 'delivery_duration', group: 'performance', label: 'Delivery duration', value: s => s.averageDeliveryDurationMinutes, baseline: f => f.deliveryDuration, floor: 2.5, format: v => `${v.toFixed(1)} min` },
  { signal: 'acceptance_rate', group: 'engagement', label: 'Acceptance rate', value: s => s.acceptanceRate, baseline: f => f.acceptanceRate, floor: 0.04, format: v => `${Math.round(v * 100)}%` },
  { signal: 'break_duration', group: 'performance', label: 'Break duration', value: s => s.averageBreakDurationMinutes, baseline: f => f.breakDuration, floor: 3, format: v => `${v.toFixed(1)} min` },
  { signal: 'shift_duration', group: 'schedule', label: 'Shift duration', value: s => s.shiftDurationMinutes, baseline: f => f.shiftDuration, floor: 35, format: v => `${(v / 60).toFixed(1)} hr` },
]

function formatTime(minutes: number): string {
  const normalized = Math.round(minutes + 1440) % 1440
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

const severityFor = (zScore: number, config: TrustScoreConfig): AnomalySeverity =>
  zScore >= config.zScoreHigh ? 'high' : zScore >= config.zScoreMedium ? 'medium' : 'low'

const linearTrendPrediction = (history: RiderSession[], definition: NumericDefinition): { prediction: number; fit: number } | null => {
  const recent = history.slice(-10)
  if (recent.length < 6 || definition.circular) return null
  const values = recent.map(definition.value)
  const xMean = (values.length - 1) / 2
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length
  const covariance = values.reduce((sum, value, index) => sum + (index - xMean) * (value - yMean), 0)
  const xVariance = values.reduce((sum, _, index) => sum + (index - xMean) ** 2, 0)
  const slope = covariance / xVariance
  const residual = values.reduce((sum, value, index) => sum + (value - (yMean + slope * (index - xMean))) ** 2, 0)
  const total = values.reduce((sum, value) => sum + (value - yMean) ** 2, 0)
  return { prediction: yMean + slope * (values.length - xMean), fit: total === 0 ? 0 : Math.max(0, 1 - residual / total) }
}

function numericAnomaly(
  definition: NumericDefinition,
  fingerprint: BehavioralFingerprint,
  session: RiderSession,
  history: RiderSession[],
  config: TrustScoreConfig,
): DetectedAnomaly | null {
  const observed = definition.value(session)
  const baseline = definition.baseline(fingerprint)
  const difference = definition.circular
    ? circularDifferenceMinutes(observed, baseline.mean)
    : Math.abs(observed - baseline.median)
  const spread = Math.max(baseline.standardDeviation, baseline.robustSpread, definition.floor)
  const zScore = difference / spread
  if (zScore < config.zScoreMedium) return null

  let strength = Math.min(1, zScore / (config.zScoreHigh + 1))
  let trendAdjusted = false
  const trend = linearTrendPrediction(history, definition)
  if (trend && trend.fit >= config.trendTolerance && Math.abs(observed - trend.prediction) <= spread * 1.5) {
    strength *= 0.4
    trendAdjusted = true
  }
  const severity = trendAdjusted && strength < 0.5 ? 'low' : severityFor(zScore, config)
  const trendText = trendAdjusted ? ' This continues a stable recent trend, so its impact was reduced.' : ''
  return {
    signal: definition.signal,
    group: definition.group,
    severity,
    strength,
    observed,
    expected: `typically ${definition.format(baseline.median)}`,
    explanation: `${definition.label} was ${definition.format(observed)} versus ${definition.format(baseline.median)} typically (${zScore.toFixed(1)}× normal spread).${trendText}`,
    trendAdjusted,
  }
}

const categoricalAnomaly = (
  signal: AnomalySignal,
  group: SignalGroup,
  observed: string,
  known: Record<string, number>,
  expected: string,
  explanation: string,
  strength: number,
): DetectedAnomaly | null => known[observed] ? null : ({ signal, group, severity: 'low', strength, observed, expected, explanation })

export function detectAnomalies(
  rider: RiderProfile,
  fingerprint: BehavioralFingerprint,
  session: RiderSession,
  history: RiderSession[],
  config: TrustScoreConfig = defaultTrustScoreConfig,
): AnomalyAssessment {
  if (fingerprint.sampleSize < config.minimumHistory) {
    return { anomalies: [], overall: 'insufficient_data', independentSignificantGroups: [] }
  }

  const anomalies = numericSignals
    .map(definition => numericAnomaly(definition, fingerprint, session, history, config))
    .filter((anomaly): anomaly is DetectedAnomaly => anomaly !== null)

  const device = categoricalAnomaly('device', 'identity', session.deviceId, fingerprint.knownDevices, fingerprint.primaryDeviceId, 'A new device was observed; behavior remains the stronger identity signal.', 0.25)
  const city = categoricalAnomaly('city', 'location', session.city, fingerprint.knownCities, fingerprint.primaryCity || rider.registeredCity, 'The session is in a new city. Relocation or travel may explain this change.', 0.35)
  const zone = categoricalAnomaly('delivery_zone', 'location', session.deliveryZone, fingerprint.knownZones, fingerprint.primaryZone || rider.primaryDeliveryZone, 'The delivery zone is outside the established history.', session.city === fingerprint.primaryCity ? 0.35 : 0.2)
  if (device) anomalies.push(device)
  if (city) anomalies.push(city)
  if (zone) anomalies.push(zone)

  const independentSignificantGroups = [...new Set(
    anomalies.filter(anomaly => anomaly.severity !== 'low' && !anomaly.trendAdjusted).map(anomaly => anomaly.group),
  )]
  const correlationExplanation = independentSignificantGroups.length >= 2
    ? `${independentSignificantGroups.length} independent signal groups changed together; related alerts within a group were counted once.`
    : undefined
  const severe = anomalies.some(anomaly => anomaly.severity === 'high' && !anomaly.trendAdjusted)
  const overall = independentSignificantGroups.length >= 2 || severe
    ? 'significant_deviation'
    : anomalies.length ? 'minor_deviation' : 'consistent'
  return { anomalies, overall, independentSignificantGroups, correlationExplanation }
}
