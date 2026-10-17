import type { LabeledScenario, RiderProfile, RiderSession, ScenarioLabel } from '../types/detection'
import { generateRiders } from './generateRiders'

const clone = <T>(value: T): T => structuredClone(value)
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

function typicalSession(rider: RiderProfile, id: string, timestamp: string): RiderSession {
  return {
    sessionId: id,
    riderId: rider.riderId,
    timestamp,
    loginTimeMinutes: rider.typicalLoginTimeMinutes + 12,
    averageDeliveryDurationMinutes: rider.averageDeliveryDurationMinutes + 0.6,
    acceptanceRate: clamp(rider.orderAcceptanceRate - 0.01, 0, 1),
    averageBreakDurationMinutes: rider.averageBreakDurationMinutes + 0.5,
    shiftDurationMinutes: rider.typicalShiftDurationMinutes + 8,
    deviceId: rider.registeredDeviceId,
    city: rider.registeredCity,
    deliveryZone: rider.primaryDeliveryZone,
  }
}

const make = (label: ScenarioLabel, rider: RiderProfile, history: RiderSession[], session: RiderSession, notes: string): LabeledScenario =>
  ({ label, rider: { ...rider, historicalSessions: history }, history, session, notes })

export function generateScenarios(seed = 20261017): LabeledScenario[] {
  const riders = generateRiders(seed)
  const base = clone(riders[0])
  const timestamp = new Date(Date.parse(base.historicalSessions.at(-1)!.timestamp) + 86_400_000).toISOString()
  const normal = typicalSession(base, `${base.riderId}-NORMAL`, timestamp)

  const phone = { ...normal, sessionId: `${base.riderId}-PHONE`, deviceId: 'DEV-REPLACEMENT-01' }
  const relocation = { ...normal, sessionId: `${base.riderId}-RELOCATION`, city: 'Chennai', deliveryZone: 'Adyar' }
  const handoff = {
    ...normal,
    sessionId: `${base.riderId}-HANDOFF`,
    loginTimeMinutes: (base.typicalLoginTimeMinutes + 5 * 60) % 1440,
    averageDeliveryDurationMinutes: base.averageDeliveryDurationMinutes + 16,
    acceptanceRate: clamp(base.orderAcceptanceRate - 0.34, 0.2, 1),
    averageBreakDurationMinutes: base.averageBreakDurationMinutes + 18,
  }

  const gradualRider = clone(riders[1])
  const gradualHistory = gradualRider.historicalSessions.map((session, index, all) => {
    const progress = Math.max(0, index - (all.length - 12))
    return {
      ...session,
      averageDeliveryDurationMinutes: session.averageDeliveryDurationMinutes + progress * 0.55,
      acceptanceRate: clamp(session.acceptanceRate - progress * 0.008, 0, 1),
      averageBreakDurationMinutes: session.averageBreakDurationMinutes + progress * 0.35,
    }
  })
  const gradualSession = {
    ...typicalSession(gradualRider, `${gradualRider.riderId}-GRADUAL`, timestamp),
    averageDeliveryDurationMinutes: gradualRider.averageDeliveryDurationMinutes + 12 * 0.55,
    acceptanceRate: gradualRider.orderAcceptanceRate - 12 * 0.008,
    averageBreakDurationMinutes: gradualRider.averageBreakDurationMinutes + 12 * 0.35,
  }

  const dualRider = clone(riders[2])
  const dualHistory = dualRider.historicalSessions.map((session, index) => index % 3 === 1 ? {
    ...session,
    loginTimeMinutes: (session.loginTimeMinutes + 5 * 60) % 1440,
    averageDeliveryDurationMinutes: session.averageDeliveryDurationMinutes + 15,
    acceptanceRate: clamp(session.acceptanceRate - 0.3, 0.25, 1),
    averageBreakDurationMinutes: session.averageBreakDurationMinutes + 14,
  } : session)
  const dualSession = { ...dualHistory[28], sessionId: `${dualRider.riderId}-DUAL`, timestamp }

  const sparseRider = clone(riders[3])
  const sparseHistory = sparseRider.historicalSessions.slice(0, 4)
  const sparseSession = typicalSession(sparseRider, `${sparseRider.riderId}-SPARSE`, timestamp)

  return [
    make('NORMAL_ACTIVITY', base, base.historicalSessions, normal, 'Ordinary variation around the established fingerprint.'),
    make('LEGITIMATE_PHONE_CHANGE', base, base.historicalSessions, phone, 'New phone with otherwise consistent behavior.'),
    make('LEGITIMATE_CITY_RELOCATION', base, base.historicalSessions, relocation, 'New city and zone with established behavioral characteristics.'),
    make('SUSPICIOUS_ACCOUNT_HANDOFF', base, base.historicalSessions, handoff, 'Same registered device and city, with several independent behavioral changes.'),
    make('GRADUAL_BEHAVIORAL_CHANGE', gradualRider, gradualHistory, gradualSession, 'Slow, predictable change across recent sessions.'),
    make('TWO_PERSISTENT_PATTERNS', dualRider, dualHistory, dualSession, 'Two interleaved, recurring multi-feature patterns.'),
    make('INSUFFICIENT_HISTORY', sparseRider, sparseHistory, sparseSession, 'Only four historical sessions are available.'),
  ]
}

export const labeledScenarios = generateScenarios()
