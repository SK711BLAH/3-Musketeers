import type { LabeledTestScenario, RiderProfile, ScenarioLabel, SessionRecord } from '../types/detection';
import { clamp } from '../engine/statistics';

function sessionFrom(
  rider: RiderProfile,
  id: string,
  offsetDays: number,
  changes: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id,
    riderId: rider.id,
    timestamp: new Date(Date.UTC(2026, 9, 1 + offsetDays)).toISOString(),
    loginMinute: rider.typicalLoginMinute,
    averageDeliveryMinutes: rider.averageDeliveryMinutes,
    acceptanceRate: rider.acceptanceRate,
    averageBreakMinutes: rider.averageBreakMinutes,
    shiftDurationHours: rider.typicalShiftDurationHours,
    deviceId: rider.registeredDeviceId,
    city: rider.registeredCity,
    zone: rider.primaryZone,
    ...changes,
  };
}

function scenario(
  rider: RiderProfile,
  label: ScenarioLabel,
  sessions: SessionRecord[],
  note: string,
): LabeledTestScenario {
  return { id: `SC-${label}`, riderId: rider.id, label, sessions, note };
}

export function generateLabeledTestScenarios(riders: RiderProfile[]): LabeledTestScenario[] {
  if (riders.length < 5) throw new Error('At least five riders are required to generate the scenario set.');
  const [normalRider, phoneRider, relocationRider, handoffRider, gradualRider] = riders;
  const handoffSessions = Array.from({ length: 8 }, (_, index) => sessionFrom(
    handoffRider,
    `SC-HANDOFF-${index + 1}`,
    index,
    {
      loginMinute: (handoffRider.typicalLoginMinute + 285 + (index % 2) * 8) % 1440,
      averageDeliveryMinutes: handoffRider.averageDeliveryMinutes + 14 + (index % 3),
      acceptanceRate: clamp(handoffRider.acceptanceRate - 0.31 + (index % 2) * 0.01, 0.25, 1),
      averageBreakMinutes: handoffRider.averageBreakMinutes + 11 + (index % 2),
      shiftDurationHours: clamp(handoffRider.typicalShiftDurationHours - 1.6, 2, 12),
    },
  ));
  const gradualSessions = Array.from({ length: 8 }, (_, index) => {
    const progress = (index + 1) / 8;
    return sessionFrom(gradualRider, `SC-GRADUAL-${index + 1}`, index, {
      loginMinute: (gradualRider.typicalLoginMinute + 70 * progress) % 1440,
      averageDeliveryMinutes: gradualRider.averageDeliveryMinutes + 3.5 * progress,
      acceptanceRate: clamp(gradualRider.acceptanceRate - 0.06 * progress, 0.3, 1),
      averageBreakMinutes: gradualRider.averageBreakMinutes + 2.5 * progress,
    });
  });

  return [
    scenario(normalRider, 'normal', [sessionFrom(normalRider, 'SC-NORMAL', 0, {
      loginMinute: (normalRider.typicalLoginMinute + 18) % 1440,
      averageDeliveryMinutes: normalRider.averageDeliveryMinutes + 0.8,
      acceptanceRate: normalRider.acceptanceRate - 0.01,
    })], 'Routine variation within the established behavioral range.'),
    scenario(phoneRider, 'legitimate_phone_change', [sessionFrom(phoneRider, 'SC-PHONE', 0, {
      deviceId: 'DEV-REPLACEMENT-01',
    })], 'A new phone with otherwise consistent behavior.'),
    scenario(relocationRider, 'legitimate_city_relocation', [sessionFrom(relocationRider, 'SC-RELOCATION', 0, {
      city: 'Chennai', zone: 'Anna Nagar',
    })], 'A city relocation with otherwise consistent behavior.'),
    scenario(handoffRider, 'suspicious_account_handoff', handoffSessions,
      'Repeated, simultaneous schedule, pace, and engagement changes.'),
    scenario(gradualRider, 'gradual_behavioral_change', gradualSessions,
      'Small, continuous changes rather than an abrupt second pattern.'),
  ];
}
