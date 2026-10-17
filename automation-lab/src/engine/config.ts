import type { TrustScoreConfig } from '../types/detection'

export const defaultTrustScoreConfig: TrustScoreConfig = {
  minimumHistory: 8,
  insufficientDataScore: 75,
  zScoreMedium: 2.5,
  zScoreHigh: 4,
  weights: { schedule: 16, performance: 25, engagement: 21, identity: 8, location: 10 },
  trustedThreshold: 82,
  monitorThreshold: 62,
  verifyThreshold: 38,
  multiSignalPenalty: 8,
  trendTolerance: 0.7,
}
