import { describe, expect, it } from 'vitest';
import {
  analyzeSession,
  buildBehavioralFingerprint,
  detectSecondSignature,
  generateHistoricalSessions,
  generateLabeledTestScenarios,
  generateRiders,
} from '../src/engine';

const riders = generateRiders();
const scenarios = generateLabeledTestScenarios(riders);
const byLabel = Object.fromEntries(scenarios.map((scenario) => [scenario.label, scenario]));

describe('synthetic data and behavioral baseline', () => {
  it('generates 50 riders and exactly 1,500 reproducible historical shifts', () => {
    const again = generateRiders();
    expect(riders).toHaveLength(50);
    expect(generateHistoricalSessions()).toHaveLength(1500);
    expect(riders).toEqual(again);
    expect(new Set(riders.map((rider) => rider.averageDeliveryMinutes)).size).toBeGreaterThan(10);
  });

  it('handles login times around midnight as neighboring observations', () => {
    const rider = riders[0];
    const history = rider.history.slice(0, 10).map((session, index) => ({
      ...session,
      loginMinute: index % 2 ? 10 : 1430,
    }));
    const baseline = buildBehavioralFingerprint(rider.id, history);
    expect(baseline.loginTime.robustSpread).toBeLessThan(30);
  });
});

describe('session assessment', () => {
  it('keeps normal rider behavior highly trusted', () => {
    const scenario = byLabel.normal;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const result = analyzeSession(rider, scenario.sessions[0], rider.history);
    expect(result.trustScore).toBeGreaterThanOrEqual(80);
    expect(result.riskLevel).toBe('TRUSTED');
    expect(result.recommendedAction).toBe('ALLOW');
  });

  it('does not severely escalate a new phone on its own', () => {
    const scenario = byLabel.legitimate_phone_change;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const result = analyzeSession(rider, scenario.sessions[0], rider.history);
    expect(result.trustScore).toBeGreaterThanOrEqual(80);
    expect(result.anomalies.map((item) => item.signal)).toContain('device');
    expect(result.recommendedAction).toBe('ALLOW');
  });

  it('treats a city relocation as context rather than proof', () => {
    const scenario = byLabel.legitimate_city_relocation;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const result = analyzeSession(rider, scenario.sessions[0], rider.history);
    expect(result.trustScore).toBeGreaterThanOrEqual(80);
    expect(result.anomalies.map((item) => item.signal)).toContain('location');
    expect(result.recommendedAction).toBe('ALLOW');
  });

  it('elevates multiple behavioral changes even on the same phone and in the same city', () => {
    const scenario = byLabel.suspicious_account_handoff;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const result = analyzeSession(rider, scenario.sessions[0], rider.history);
    expect(result.anomalies.map((item) => item.signal)).toContain('multiSignal');
    expect(['VERIFY', 'REVIEW']).toContain(result.riskLevel);
    expect(['REQUEST_VERIFICATION', 'HUMAN_REVIEW']).toContain(result.recommendedAction);
  });

  it('detects two persistent patterns when repeated evidence is sufficient', () => {
    const scenario = byLabel.suspicious_account_handoff;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const result = detectSecondSignature([...rider.history, ...scenario.sessions]);
    expect(result.status).toBe('DETECTED');
    expect(result.patternCount).toBe(2);
    expect(result.distinguishingFeatures).toEqual(expect.arrayContaining(['delivery duration', 'acceptance rate']));
  });

  it('returns a conservative, inconclusive result for sparse history', () => {
    const rider = riders[0];
    const result = analyzeSession(rider, rider.history[2], rider.history.slice(0, 2));
    expect(result.riskLevel).toBe('MONITOR');
    expect(result.secondSignature.status).toBe('INCONCLUSIVE');
    expect(result.recommendedAction).toBe('MONITOR');
  });

  it('does not mistake gradual legitimate drift for a second signature', () => {
    const scenario = byLabel.gradual_behavioral_change;
    const rider = riders.find((item) => item.id === scenario.riderId)!;
    const history = [...rider.history, ...scenario.sessions.slice(0, -1)];
    const result = analyzeSession(rider, scenario.sessions.at(-1)!, history);
    expect(result.secondSignature.secondSignatureDetected).toBe(false);
    expect(['ALLOW', 'MONITOR']).toContain(result.recommendedAction);
  });
});
