import type { RecommendedAction, RiskLevel, SecondSignatureResult } from '../types/detection';

export function recommendAction(
  riskLevel: RiskLevel,
  secondSignature: SecondSignatureResult,
): RecommendedAction {
  if (riskLevel === 'REVIEW') return 'HUMAN_REVIEW';
  if (riskLevel === 'VERIFY' || secondSignature.status === 'DETECTED') return 'REQUEST_VERIFICATION';
  if (riskLevel === 'MONITOR' || secondSignature.status === 'INCONCLUSIVE') return 'MONITOR';
  return 'ALLOW';
}
