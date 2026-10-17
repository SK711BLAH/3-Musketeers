import type { AnomalyAssessment, RecommendedAction, RiskLevel } from '../types/detection'

export function recommendAction(riskLevel: RiskLevel, assessment: AnomalyAssessment): RecommendedAction {
  if (assessment.overall === 'insufficient_data') return 'MONITOR'
  if (riskLevel === 'TRUSTED') return 'ALLOW'
  if (riskLevel === 'MONITOR') return 'MONITOR'
  if (riskLevel === 'VERIFY') return 'REQUEST_VERIFICATION'
  return 'HUMAN_REVIEW'
}
