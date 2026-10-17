import { describe, expect, it } from 'vitest'
import { generateRiders } from '../data/generateRiders'
import { generateScenarios } from '../data/scenarios'
import { analyzeSession, buildBehavioralFingerprint, circularDifferenceMinutes, detectSecondSignature } from './index'

const scenarios = Object.fromEntries(generateScenarios().map(scenario => [scenario.label, scenario]))
const analyze = (label: keyof typeof scenarios) => {
  const fixture = scenarios[label]
  return analyzeSession(fixture.rider, fixture.session, fixture.history)
}

describe('synthetic rider data', () => {
  it('reproducibly generates 50 distinct riders and 1,500 varied shifts', () => {
    const first = generateRiders(42)
    const second = generateRiders(42)
    expect(first).toEqual(second)
    expect(first).toHaveLength(50)
    expect(first.flatMap(rider => rider.historicalSessions)).toHaveLength(1500)
    expect(new Set(first.map(rider => rider.riderId)).size).toBe(50)
    expect(new Set(first.map(rider => rider.typicalLoginTimeMinutes)).size).toBeGreaterThan(35)
  })

  it('handles login-time baselines across midnight', () => {
    const rider = generateRiders(8, 1, 2)[0]
    const history = rider.historicalSessions.map((session, index) => ({ ...session, loginTimeMinutes: index ? 10 : 1430 }))
    const fingerprint = buildBehavioralFingerprint(rider.riderId, history)
    expect(circularDifferenceMinutes(fingerprint.loginTime.mean, 0)).toBeLessThan(5)
  })
})

describe('SHIFTPRINT session analysis', () => {
  it('allows normal rider behavior with high trust', () => {
    const result = analyze('NORMAL_ACTIVITY')
    expect(result.trustScore).toBeGreaterThanOrEqual(82)
    expect(result.riskLevel).toBe('TRUSTED')
    expect(result.recommendedAction).toBe('ALLOW')
  })

  it('does not severely escalate a new phone by itself', () => {
    const result = analyze('LEGITIMATE_PHONE_CHANGE')
    expect(result.anomalies.map(anomaly => anomaly.signal)).toContain('device')
    expect(result.trustScore).toBeGreaterThanOrEqual(82)
    expect(['ALLOW', 'MONITOR']).toContain(result.recommendedAction)
  })

  it('treats a city relocation as context, not proof of sharing', () => {
    const result = analyze('LEGITIMATE_CITY_RELOCATION')
    expect(result.anomalies.map(anomaly => anomaly.signal)).toEqual(expect.arrayContaining(['city', 'delivery_zone']))
    expect(result.trustScore).toBeGreaterThanOrEqual(80)
    expect(result.recommendedAction).not.toBe('REQUEST_VERIFICATION')
    expect(result.recommendedAction).not.toBe('HUMAN_REVIEW')
  })

  it('elevates multiple behavioral changes even on the same phone and in the same city', () => {
    const fixture = scenarios.SUSPICIOUS_ACCOUNT_HANDOFF
    const result = analyze('SUSPICIOUS_ACCOUNT_HANDOFF')
    expect(result.anomalies.map(anomaly => anomaly.signal)).not.toContain('device')
    expect(result.anomalies.map(anomaly => anomaly.signal)).not.toContain('city')
    expect(result.trustScore).toBeLessThan(62)
    expect(['REQUEST_VERIFICATION', 'HUMAN_REVIEW']).toContain(result.recommendedAction)
    expect(result.riderId).toBe(fixture.rider.riderId)
  })

  it('identifies two persistent, recurring multi-feature signatures', () => {
    const fixture = scenarios.TWO_PERSISTENT_PATTERNS
    const signature = detectSecondSignature(fixture.history)
    expect(signature.secondSignatureDetected).toBe(true)
    expect(signature.patternCount).toBe(2)
    expect(signature.distinguishingFeatures).toEqual(expect.arrayContaining(['delivery duration', 'acceptance rate']))
    expect(['moderate', 'high']).toContain(signature.confidenceLevel)
  })

  it('returns a conservative result with insufficient history', () => {
    const result = analyze('INSUFFICIENT_HISTORY')
    expect(result.trustScore).toBe(75)
    expect(result.overallAssessment).toBe('insufficient_data')
    expect(result.riskLevel).toBe('MONITOR')
    expect(result.secondSignature.status).toBe('INCONCLUSIVE')
    expect(result.recommendedAction).toBe('MONITOR')
  })

  it('discounts a gradual, predictable behavioral trend', () => {
    const result = analyze('GRADUAL_BEHAVIORAL_CHANGE')
    expect(result.riskLevel).not.toBe('REVIEW')
    expect(result.recommendedAction).not.toBe('HUMAN_REVIEW')
    expect(result.anomalies.every(anomaly => anomaly.trendAdjusted || anomaly.severity === 'low')).toBe(true)
    expect(result.secondSignature.secondSignatureDetected).toBe(false)
  })
})
