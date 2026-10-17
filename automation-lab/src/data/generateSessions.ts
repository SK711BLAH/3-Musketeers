import type { RiderSession } from '../types/detection'

export interface RiderTemplate {
  riderId: string
  city: string
  zone: string
  deviceId: string
  loginTimeMinutes: number
  deliveryDurationMinutes: number
  acceptanceRate: number
  breakDurationMinutes: number
  shiftDurationMinutes: number
}

export interface RandomSource {
  next: () => number
  normal: (mean?: number, standardDeviation?: number) => number
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  const next = () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
  const normal = (mean = 0, standardDeviation = 1) => {
    const u = Math.max(next(), Number.EPSILON)
    const v = next()
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * standardDeviation
  }
  return { next, normal }
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))
const round = (value: number, places = 1) => Number(value.toFixed(places))

export function generateHistoricalSessions(template: RiderTemplate, count: number, random: RandomSource): RiderSession[] {
  const start = Date.UTC(2026, 0, 1)
  return Array.from({ length: count }, (_, index) => {
    const dayVariation = Math.sin(index / 4) * 4
    return {
      sessionId: `${template.riderId}-S${String(index + 1).padStart(3, '0')}`,
      riderId: template.riderId,
      timestamp: new Date(start + index * 24 * 60 * 60 * 1000).toISOString(),
      loginTimeMinutes: Math.round((template.loginTimeMinutes + random.normal(0, 22) + 1440) % 1440),
      averageDeliveryDurationMinutes: round(clamp(template.deliveryDurationMinutes + dayVariation * 0.15 + random.normal(0, 1.7), 10, 55)),
      acceptanceRate: round(clamp(template.acceptanceRate + random.normal(0, 0.025), 0.35, 1), 3),
      averageBreakDurationMinutes: round(clamp(template.breakDurationMinutes + random.normal(0, 2.2), 2, 45)),
      shiftDurationMinutes: Math.round(clamp(template.shiftDurationMinutes + random.normal(0, 25), 180, 720)),
      deviceId: template.deviceId,
      city: template.city,
      deliveryZone: template.zone,
    }
  })
}
