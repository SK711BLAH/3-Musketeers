import type { DetectionConfig } from '../types/detection';

export const defaultDetectionConfig: DetectionConfig = {
  minimumBaselineSessions: 5,
  establishedBaselineSessions: 15,
  zScoreMedium: 2.25,
  zScoreHigh: 3.5,
  contextPenalty: 5,
  weights: {
    loginTime: 13,
    deliveryDuration: 17,
    acceptanceRate: 17,
    breakDuration: 10,
    shiftDuration: 12,
    device: 5,
    location: 5,
    dataQuality: 0,
    multiSignal: 16,
  },
  riskThresholds: {
    monitorBelow: 80,
    verifyBelow: 55,
    reviewBelow: 30,
  },
  signature: {
    minimumSessions: 12,
    minimumClusterSize: 4,
    minimumSseImprovement: 0.38,
    minimumCentroidDistance: 2.2,
  },
};
