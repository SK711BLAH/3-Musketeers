import type { BehavioralFingerprint, SessionRecord } from '../types/detection';
import { circularMeanMinutes, frequencyMap, numericBaseline, signedCircularDifferenceMinutes } from './statistics';

export function buildBehavioralFingerprint(
  riderId: string,
  history: SessionRecord[],
): BehavioralFingerprint {
  const sessions = history.filter((session) => session.riderId === riderId);
  const loginCenter = circularMeanMinutes(sessions.map((session) => session.loginMinute));
  const unwrappedLoginMinutes = sessions.map(
    (session) => loginCenter + signedCircularDifferenceMinutes(session.loginMinute, loginCenter),
  );

  return {
    riderId,
    sampleSize: sessions.length,
    maturity: sessions.length < 5 ? 'insufficient' : sessions.length < 15 ? 'developing' : 'established',
    loginTime: numericBaseline(unwrappedLoginMinutes),
    deliveryDuration: numericBaseline(sessions.map((session) => session.averageDeliveryMinutes)),
    acceptanceRate: numericBaseline(sessions.map((session) => session.acceptanceRate)),
    breakDuration: numericBaseline(sessions.map((session) => session.averageBreakMinutes)),
    shiftDuration: numericBaseline(sessions.map((session) => session.shiftDurationHours)),
    deviceFrequencies: frequencyMap(sessions.map((session) => session.deviceId)),
    cityFrequencies: frequencyMap(sessions.map((session) => session.city)),
    zoneFrequencies: frequencyMap(sessions.map((session) => session.zone)),
  };
}
