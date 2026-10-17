export type RiskLevel = 'TRUSTED' | 'MONITOR' | 'VERIFY' | 'REVIEW';
export type RecommendedAction =
  | 'ALLOW'
  | 'MONITOR'
  | 'REQUEST_VERIFICATION'
  | 'HUMAN_REVIEW';
export type Severity = 'low' | 'medium' | 'high';

export interface SessionRecord {
  id: string;
  riderId: string;
  timestamp: string;
  loginMinute: number;
  averageDeliveryMinutes: number;
  acceptanceRate: number;
  averageBreakMinutes: number;
  shiftDurationHours: number;
  deviceId: string;
  city: string;
  zone: string;
}

export interface RiderProfile {
  id: string;
  name: string;
  registeredCity: string;
  primaryZone: string;
  registeredDeviceId: string;
  typicalLoginMinute: number;
  averageDeliveryMinutes: number;
  acceptanceRate: number;
  averageBreakMinutes: number;
  typicalShiftDurationHours: number;
  history: SessionRecord[];
}

export interface NumericBaseline {
  mean: number;
  median: number;
  standardDeviation: number;
  robustSpread: number;
  typicalLow: number;
  typicalHigh: number;
}

export interface BehavioralFingerprint {
  riderId: string;
  sampleSize: number;
  maturity: 'insufficient' | 'developing' | 'established';
  loginTime: NumericBaseline;
  deliveryDuration: NumericBaseline;
  acceptanceRate: NumericBaseline;
  breakDuration: NumericBaseline;
  shiftDuration: NumericBaseline;
  deviceFrequencies: Record<string, number>;
  cityFrequencies: Record<string, number>;
  zoneFrequencies: Record<string, number>;
}

export type Signal =
  | 'loginTime'
  | 'deliveryDuration'
  | 'acceptanceRate'
  | 'breakDuration'
  | 'shiftDuration'
  | 'device'
  | 'location'
  | 'dataQuality'
  | 'multiSignal';

export interface Anomaly {
  signal: Signal;
  category: 'schedule' | 'pace' | 'engagement' | 'context' | 'quality' | 'correlation';
  severity: Severity;
  deviation: number;
  explanation: string;
}

export interface AnomalyAssessment {
  anomalies: Anomaly[];
  overall: 'consistent' | 'uncertain' | 'unusual' | 'highly_unusual';
  independentDeviationCount: number;
  explanations: string[];
}

export interface ContributingSignal {
  signal: Signal;
  impact: number;
  explanation: string;
}

export interface TrustScoreResult {
  trustScore: number;
  riskLevel: RiskLevel;
  contributingSignals: ContributingSignal[];
  explanation: string;
}

export interface SecondSignatureResult {
  status: 'DETECTED' | 'NOT_DETECTED' | 'INCONCLUSIVE';
  secondSignatureDetected: boolean;
  patternCount: 1 | 2;
  distinguishingFeatures: string[];
  confidenceLevel: 'low' | 'moderate' | 'high';
  explanation: string;
}

export interface DetectionConfig {
  minimumBaselineSessions: number;
  establishedBaselineSessions: number;
  zScoreMedium: number;
  zScoreHigh: number;
  contextPenalty: number;
  weights: Record<Signal, number>;
  riskThresholds: {
    monitorBelow: number;
    verifyBelow: number;
    reviewBelow: number;
  };
  signature: {
    minimumSessions: number;
    minimumClusterSize: number;
    minimumSseImprovement: number;
    minimumCentroidDistance: number;
  };
}

export interface SessionAnalysis {
  riderId: string;
  sessionId: string;
  trustScore: number;
  riskLevel: RiskLevel;
  anomalies: Anomaly[];
  explanations: string[];
  secondSignature: SecondSignatureResult;
  recommendedAction: RecommendedAction;
  contributingSignals: ContributingSignal[];
  timestamp: string;
}

export type ScenarioLabel =
  | 'normal'
  | 'legitimate_phone_change'
  | 'legitimate_city_relocation'
  | 'suspicious_account_handoff'
  | 'gradual_behavioral_change';

export interface LabeledTestScenario {
  id: string;
  riderId: string;
  label: ScenarioLabel;
  sessions: SessionRecord[];
  note: string;
}
