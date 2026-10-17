export type RiskLevel = 'TRUSTED' | 'MONITOR' | 'VERIFY' | 'REVIEW'
export type RecommendedAction = 'ALLOW' | 'MONITOR' | 'REQUEST_VERIFICATION' | 'HUMAN_REVIEW'
export type AnomalySeverity = 'low' | 'medium' | 'high'
export type SignalGroup = 'schedule' | 'performance' | 'engagement' | 'identity' | 'location'

export interface RiderSession {
  sessionId: string
  riderId: string
  timestamp: string
  loginTimeMinutes: number
  averageDeliveryDurationMinutes: number
  acceptanceRate: number
  averageBreakDurationMinutes: number
  shiftDurationMinutes: number
  deviceId: string
  city: string
  deliveryZone: string
}

export interface RiderProfile {
  riderId: string
  name: string
  registeredCity: string
  primaryDeliveryZone: string
  registeredDeviceId: string
  typicalLoginTimeMinutes: number
  averageDeliveryDurationMinutes: number
  orderAcceptanceRate: number
  averageBreakDurationMinutes: number
  typicalShiftDurationMinutes: number
  historicalSessions: RiderSession[]
}

export interface NumericBaseline {
  mean: number
  median: number
  standardDeviation: number
  robustSpread: number
  typicalRange: [number, number]
}

export interface BehavioralFingerprint {
  riderId: string
  sampleSize: number
  loginTime: NumericBaseline
  deliveryDuration: NumericBaseline
  acceptanceRate: NumericBaseline
  breakDuration: NumericBaseline
  shiftDuration: NumericBaseline
  knownDevices: Record<string, number>
  knownCities: Record<string, number>
  knownZones: Record<string, number>
  primaryDeviceId: string
  primaryCity: string
  primaryZone: string
  generatedAt: string
}

export type AnomalySignal =
  | 'login_time'
  | 'delivery_duration'
  | 'acceptance_rate'
  | 'break_duration'
  | 'shift_duration'
  | 'device'
  | 'city'
  | 'delivery_zone'

export interface DetectedAnomaly {
  signal: AnomalySignal
  group: SignalGroup
  severity: AnomalySeverity
  strength: number
  observed: number | string
  expected: string
  explanation: string
  trendAdjusted?: boolean
}

export interface AnomalyAssessment {
  anomalies: DetectedAnomaly[]
  overall: 'consistent' | 'minor_deviation' | 'significant_deviation' | 'insufficient_data'
  independentSignificantGroups: SignalGroup[]
  correlationExplanation?: string
}

export interface TrustScoreConfig {
  minimumHistory: number
  insufficientDataScore: number
  zScoreMedium: number
  zScoreHigh: number
  weights: Record<SignalGroup, number>
  trustedThreshold: number
  monitorThreshold: number
  verifyThreshold: number
  multiSignalPenalty: number
  trendTolerance: number
}

export interface TrustAssessment {
  trustScore: number
  riskLevel: RiskLevel
  contributingSignals: DetectedAnomaly[]
  explanation: string
  recommendedAction: RecommendedAction
}

export type SignatureConfidence = 'inconclusive' | 'low' | 'moderate' | 'high'

export interface SecondSignatureResult {
  status: 'DETECTED' | 'NOT_DETECTED' | 'INCONCLUSIVE'
  secondSignatureDetected: boolean
  patternCount: 1 | 2
  distinguishingFeatures: string[]
  confidenceLevel: SignatureConfidence
  observations: number
  explanation: string
}

export interface SessionAnalysis {
  riderId: string
  sessionId: string
  trustScore: number
  riskLevel: RiskLevel
  anomalies: DetectedAnomaly[]
  overallAssessment: AnomalyAssessment['overall']
  independentSignalGroups: SignalGroup[]
  explanations: string[]
  secondSignature: SecondSignatureResult
  recommendedAction: RecommendedAction
  timestamp: string
}

export type ScenarioLabel =
  | 'NORMAL_ACTIVITY'
  | 'LEGITIMATE_PHONE_CHANGE'
  | 'LEGITIMATE_CITY_RELOCATION'
  | 'SUSPICIOUS_ACCOUNT_HANDOFF'
  | 'GRADUAL_BEHAVIORAL_CHANGE'
  | 'TWO_PERSISTENT_PATTERNS'
  | 'INSUFFICIENT_HISTORY'

export interface LabeledScenario {
  label: ScenarioLabel
  rider: RiderProfile
  history: RiderSession[]
  session: RiderSession
  notes: string
}
